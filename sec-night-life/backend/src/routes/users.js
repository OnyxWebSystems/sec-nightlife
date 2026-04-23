import { Router } from 'express';
import { z } from 'zod';
import rateLimit from 'express-rate-limit';
import { prisma } from '../lib/prisma.js';
import { authenticateToken, optionalAuth } from '../middleware/auth.js';
import { isStaff } from '../lib/access.js';
import { requirePremium } from '../middleware/premium.js';
import { requireVerified } from '../middleware/requireVerified.js';
import { auditFromReq } from '../lib/audit.js';
import { validateUsernameFormat } from '../lib/username.js';
import { orderedParticipants } from '../lib/conversationHelpers.js';
import { isIdentityVerifiedStatus } from '../middleware/requireIdentityVerified.js';

const router = Router();
const PROFILE_GENDER_VALUES = ['male', 'female', 'other'];

const usernameCheckLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
});

async function syncUserUsername(userId, rawUsername) {
  const v = validateUsernameFormat(rawUsername);
  if (!v.ok) {
    const err = new Error(v.message);
    err.status = 400;
    throw err;
  }
  const taken = await prisma.user.findFirst({
    where: { username: v.username, deletedAt: null, NOT: { id: userId } },
    select: { id: true },
  });
  if (taken) {
    const err = new Error('This username is already taken. Please choose a different one.');
    err.status = 409;
    err.field = 'username';
    throw err;
  }
  await prisma.user.update({ where: { id: userId }, data: { username: v.username } });
  return v.username;
}

/** event_id may live on Paystack root or nested metadata (initialize vs verify payload). */
function collectEventIdsFromPaymentMetadata(meta) {
  const ids = new Set();
  if (!meta || typeof meta !== 'object') return ids;
  const add = (v) => {
    if (typeof v === 'string' && v.length > 0 && v.length <= 64) ids.add(v);
  };
  add(meta.event_id);
  add(meta.eventId);
  const inner = meta.metadata;
  if (inner && typeof inner === 'object') {
    add(inner.event_id);
    add(inner.eventId);
  }
  return ids;
}

/** Venue event UUIDs the user saved as interested (max 50, deduped). */
function normalizeInterestedEvents(input) {
  if (input == null) return undefined;
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of input) {
    if (typeof raw !== 'string') continue;
    const t = raw.trim();
    if (!/^[0-9a-f-]{36}$/i.test(t)) continue;
    const k = t.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(t);
    if (out.length >= 50) break;
  }
  return out;
}

/** When user removes event ids from interested_events, drop T-3h reminder dedupe rows so toggling off/on behaves predictably. */
async function removeInterestReminderDedupes(userId, previousInterested, nextInterested) {
  const prev = previousInterested ?? [];
  const next = nextInterested ?? [];
  const removed = prev.filter((id) => !next.includes(id));
  if (removed.length === 0) return;
  await prisma.eventInterestReminderSent.deleteMany({
    where: { userId, eventId: { in: removed } },
  });
}

/** Max 10 items, each max 30 chars, trim, dedupe case-insensitively */
function normalizeInterestList(input) {
  if (input == null) return [];
  if (!Array.isArray(input)) return [];
  const seen = new Set();
  const out = [];
  for (const raw of input) {
    if (typeof raw !== 'string') continue;
    const t = raw.trim().slice(0, 30);
    if (!t) continue;
    const key = t.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
    if (out.length >= 10) break;
  }
  return out;
}

function isMissingLeaderboardColumnsError(err) {
  return err?.code === 'P2022' && String(err?.message || '').includes('leaderboard_hidden');
}

/** Identity review finished — do not re-queue on later profile saves. */
function isProfileVerificationSettled(status) {
  return status === 'verified' || status === 'approved' || status === 'rejected';
}

/** Single source of truth for API `age_verified`: status wins over a stale boolean column. */
function deriveAgeVerifiedForApi(profile) {
  const st = profile?.verificationStatus;
  if (st === 'rejected') return false;
  if (isIdentityVerifiedStatus(st)) return true;
  return Boolean(profile?.ageVerified);
}

async function readExistingProfileForPatch(userId) {
  try {
    const p = await prisma.userProfile.findUnique({
      where: { userId },
      select: { verificationStatus: true, interestedEvents: true, idDocumentUrl: true },
    });
    if (p) return p;
  } catch {
    // fall through to compat read
  }
  try {
    const raw = await readUserProfileCompat(userId);
    if (!raw) return null;
    return {
      verificationStatus: raw.verificationStatus,
      interestedEvents: raw.interestedEvents,
      idDocumentUrl: raw.idDocumentUrl,
    };
  } catch {
    return null;
  }
}

/**
 * Raw SELECT for user_profiles when Prisma findMany/findFirst fails (schema drift / P2022).
 * Keeps verification_status, promoter flag, etc. — avoids empty profile rows in GET /filter.
 */
const USER_PROFILE_COMPAT_SELECT_LIST = `
      id,
      user_id AS "userId",
      username,
      bio,
      city,
      avatar_url AS "avatarUrl",
      favorite_drink AS "favoriteDrink",
      gender,
      date_of_birth AS "dateOfBirth",
      id_document_url AS "idDocumentUrl",
      age_verified AS "ageVerified",
      verification_status AS "verificationStatus",
      verification_rejection_note AS "verificationRejectionNote",
      payment_setup_complete AS "paymentSetupComplete",
      promoter_jobs_accepted AS "promoterJobsAccepted",
      is_promoter_standard AS "isPromoterStandard",
      interests,
      music_preferences AS "musicPreferences",
      friends,
      followed_venues AS "followedVenues",
      interested_events AS "interestedEvents",
      onboarding_complete AS "onboardingComplete"`;

async function readUserProfileCompat(userId) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT ${USER_PROFILE_COMPAT_SELECT_LIST}
     FROM user_profiles
     WHERE user_id = $1
     LIMIT 1`,
    userId
  );
  return rows?.[0] || null;
}

/** Batch compat read for GET /users/filter when prisma.userProfile.findMany throws. */
async function readUserProfilesCompatByUserIds(userIds) {
  const ids = [...new Set((userIds || []).filter(Boolean))];
  if (ids.length === 0) return [];
  const placeholders = ids.map((_, i) => `$${i + 1}`).join(', ');
  const rows = await prisma.$queryRawUnsafe(
    `SELECT ${USER_PROFILE_COMPAT_SELECT_LIST}
     FROM user_profiles
     WHERE user_id IN (${placeholders})`,
    ...ids
  );
  return Array.isArray(rows) ? rows : [];
}

async function readUserProfileCompatByProfileRowId(profileRowId) {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT ${USER_PROFILE_COMPAT_SELECT_LIST}
     FROM user_profiles
     WHERE id = $1
     LIMIT 1`,
    profileRowId
  );
  return rows?.[0] || null;
}

async function upsertUserProfileCompat(userId, data) {
  const existing = await readUserProfileCompat(userId);
  const payload = {
    username: data.username ?? existing?.username ?? null,
    bio: data.bio ?? existing?.bio ?? null,
    city: data.city ?? existing?.city ?? null,
    avatarUrl: data.avatarUrl ?? existing?.avatarUrl ?? null,
    favoriteDrink: data.favoriteDrink ?? existing?.favoriteDrink ?? null,
    gender: data.gender ?? existing?.gender ?? null,
    dateOfBirth: data.dateOfBirth ?? existing?.dateOfBirth ?? null,
    idDocumentUrl: data.idDocumentUrl ?? existing?.idDocumentUrl ?? null,
    ageVerified: data.ageVerified ?? existing?.ageVerified ?? false,
    verificationStatus: data.verificationStatus ?? existing?.verificationStatus ?? 'pending',
    paymentSetupComplete: data.paymentSetupComplete ?? existing?.paymentSetupComplete ?? false,
    interests: data.interests ?? existing?.interests ?? [],
    musicPreferences: data.musicPreferences ?? existing?.musicPreferences ?? [],
    friends: data.friends ?? existing?.friends ?? [],
    followedVenues: data.followedVenues ?? existing?.followedVenues ?? [],
    interestedEvents: data.interestedEvents ?? existing?.interestedEvents ?? [],
    onboardingComplete: data.onboardingComplete ?? existing?.onboardingComplete ?? false,
  };

  if (existing) {
    await prisma.$executeRawUnsafe(
      `UPDATE user_profiles
       SET username = $2,
           bio = $3,
           city = $4,
           avatar_url = $5,
           favorite_drink = $6,
           gender = $7,
           date_of_birth = $8,
           id_document_url = $9,
           age_verified = $10,
           verification_status = $11,
           payment_setup_complete = $12,
           interests = $13,
           music_preferences = $14,
           friends = $15,
           followed_venues = $16,
           interested_events = $17::text[],
           onboarding_complete = $18,
           updated_at = NOW()
       WHERE user_id = $1`,
      userId,
      payload.username,
      payload.bio,
      payload.city,
      payload.avatarUrl,
      payload.favoriteDrink,
      payload.gender,
      payload.dateOfBirth,
      payload.idDocumentUrl,
      payload.ageVerified,
      payload.verificationStatus,
      payload.paymentSetupComplete,
      payload.interests,
      payload.musicPreferences,
      payload.friends,
      payload.followedVenues,
      payload.interestedEvents,
      payload.onboardingComplete
    );
  } else {
    await prisma.$executeRawUnsafe(
      `INSERT INTO user_profiles
       (id, user_id, username, bio, city, avatar_url, favorite_drink, gender, date_of_birth, id_document_url,
        age_verified, verification_status, payment_setup_complete, interests, music_preferences, friends,
        followed_venues, interested_events, onboarding_complete, created_at, updated_at)
       VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17::text[], $18, NOW(), NOW())`,
      userId,
      payload.username,
      payload.bio,
      payload.city,
      payload.avatarUrl,
      payload.favoriteDrink,
      payload.gender,
      payload.dateOfBirth,
      payload.idDocumentUrl,
      payload.ageVerified,
      payload.verificationStatus,
      payload.paymentSetupComplete,
      payload.interests,
      payload.musicPreferences,
      payload.friends,
      payload.followedVenues,
      payload.interestedEvents,
      payload.onboardingComplete
    );
  }

  return readUserProfileCompat(userId);
}

/** GET /check-username/:username — public, rate-limited; with Bearer token, current user's handle counts as available */
router.get('/check-username/:username', usernameCheckLimiter, optionalAuth, async (req, res, next) => {
  try {
    const raw = req.params.username || '';
    const v = validateUsernameFormat(raw);
    if (!v.ok) return res.json({ available: false });
    const where = {
      username: v.username,
      deletedAt: null,
      ...(req.userId ? { NOT: { id: req.userId } } : {}),
    };
    const existing = await prisma.user.findFirst({
      where,
      select: { id: true },
    });
    res.json({ available: !existing });
  } catch (err) {
    next(err);
  }
});

/** GET /:userId/profile — viewer-relative friendship + mutual friends */
/** Authenticated: friend + table counts for any user (used by Profile stats). */
router.get('/stats/social/:targetUserId([0-9a-f-]{36})', authenticateToken, async (req, res, next) => {
  try {
    const targetUserId = req.params.targetUserId;

    const friendCount = await prisma.friendship.count({
      where: {
        status: 'ACCEPTED',
        OR: [{ requesterId: targetUserId }, { receiverId: targetUserId }],
      },
    });

    const tablesHosted = await prisma.table.count({
      where: {
        hostUserId: targetUserId,
        deletedAt: null,
        event: { deletedAt: null, status: 'published' },
      },
    });

    const joinCandidates = await prisma.table.findMany({
      where: {
        deletedAt: null,
        NOT: { hostUserId: targetUserId },
        event: { deletedAt: null, status: 'published' },
      },
      select: { members: true },
      take: 400,
    });
    let tablesJoined = 0;
    for (const t of joinCandidates) {
      const ids = [];
      const members = Array.isArray(t.members) ? t.members : [];
      for (const m of members) {
        const uid = typeof m === 'object' && m ? m.user_id || m.userId : m;
        if (typeof uid === 'string' && uid) ids.push(uid);
      }
      if (ids.includes(targetUserId)) tablesJoined += 1;
    }

    res.json({ friendCount, tablesHosted, tablesJoined });
  } catch (err) {
    next(err);
  }
});

router.get('/:userId([0-9a-f-]{36})/profile', authenticateToken, async (req, res, next) => {
  try {
    const targetId = req.params.userId;
    const viewerId = req.userId;

    const user = await prisma.user.findFirst({
      where: { id: targetId, deletedAt: null },
      select: {
        id: true,
        username: true,
        fullName: true,
        userProfile: {
          select: {
            username: true,
            bio: true,
            city: true,
            avatarUrl: true,
            gender: true,
            interests: true,
          },
        },
      },
    });
    if (!user) return res.status(404).json({ error: 'User not found' });

    const friendship = await prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId: viewerId, receiverId: targetId },
          { requesterId: targetId, receiverId: viewerId },
        ],
      },
    });

    let friendshipStatus = 'NONE';
    if (friendship) {
      if (friendship.status === 'BLOCKED') friendshipStatus = 'BLOCKED';
      else if (friendship.status === 'ACCEPTED') friendshipStatus = 'ACCEPTED';
      else if (friendship.status === 'PENDING') {
        friendshipStatus = friendship.requesterId === viewerId ? 'PENDING_SENT' : 'PENDING_RECEIVED';
      }
    }

    async function acceptedFriendIds(uid) {
      const rows = await prisma.friendship.findMany({
        where: {
          status: 'ACCEPTED',
          OR: [{ requesterId: uid }, { receiverId: uid }],
        },
        select: { requesterId: true, receiverId: true },
      });
      const s = new Set();
      for (const r of rows) {
        s.add(r.requesterId === uid ? r.receiverId : r.requesterId);
      }
      return s;
    }

    const a = await acceptedFriendIds(viewerId);
    const b = await acceptedFriendIds(targetId);
    let mutualFriendsCount = 0;
    for (const id of a) {
      if (b.has(id)) mutualFriendsCount += 1;
    }

    let recentActivity = [];
    if (friendshipStatus === 'ACCEPTED' || viewerId === targetId) {
      recentActivity = await prisma.friendActivity.findMany({
        where: { userId: targetId },
        orderBy: { createdAt: 'desc' },
        take: 5,
        select: {
          activityType: true,
          description: true,
          referenceId: true,
          referenceType: true,
          createdAt: true,
        },
      });
    }

    let conversationId = null;
    if (friendshipStatus === 'ACCEPTED') {
      const parts = orderedParticipants(viewerId, targetId);
      const conv = await prisma.conversation.findUnique({
        where: {
          participantAId_participantBId: {
            participantAId: parts.participantAId,
            participantBId: parts.participantBId,
          },
        },
        select: { id: true },
      });
      conversationId = conv?.id || null;
    }

    const blockedByThem =
      friendship?.status === 'BLOCKED' &&
      friendship.requesterId === targetId &&
      friendship.receiverId === viewerId;
    const canUnblock =
      friendship?.status === 'BLOCKED' && friendship.requesterId === viewerId;

    const now = new Date();
    const rawInterests = user.userProfile?.interests;
    const interests = Array.isArray(rawInterests) ? rawInterests : [];

    const attendedRows = await prisma.eventAttendance.findMany({
      where: {
        userId: targetId,
        event: {
          deletedAt: null,
          status: 'published',
          date: { lt: now },
        },
      },
      select: {
        event: {
          select: {
            id: true,
            title: true,
            date: true,
            city: true,
            coverImageUrl: true,
          },
        },
      },
      orderBy: { event: { date: 'desc' } },
      take: 25,
    });
    const pastEventsAttended = [];
    const seenAtt = new Set();
    for (const row of attendedRows) {
      const ev = row.event;
      if (!ev || seenAtt.has(ev.id)) continue;
      seenAtt.add(ev.id);
      pastEventsAttended.push(ev);
    }

    const extraEventIds = new Set();
    const purchaseRows = await prisma.payment.findMany({
      where: { userId: targetId, status: 'success' },
      select: { metadata: true },
      take: 200,
    });
    for (const row of purchaseRows) {
      for (const eid of collectEventIdsFromPaymentMetadata(row.metadata)) {
        if (!seenAtt.has(eid)) extraEventIds.add(eid);
      }
    }
    const txEventRows = await prisma.transaction.findMany({
      where: { userId: targetId, status: 'paid', eventId: { not: null } },
      select: { eventId: true },
      distinct: ['eventId'],
      take: 100,
    });
    for (const row of txEventRows) {
      if (row.eventId && !seenAtt.has(row.eventId)) extraEventIds.add(row.eventId);
    }
    if (extraEventIds.size > 0) {
      const extraEvents = await prisma.event.findMany({
        where: {
          id: { in: [...extraEventIds] },
          deletedAt: null,
          status: 'published',
          date: { lt: now },
        },
        select: {
          id: true,
          title: true,
          date: true,
          city: true,
          coverImageUrl: true,
        },
        orderBy: { date: 'desc' },
        take: 40,
      });
      for (const ev of extraEvents) {
        if (!ev || seenAtt.has(ev.id)) continue;
        seenAtt.add(ev.id);
        pastEventsAttended.push(ev);
      }
    }
    pastEventsAttended.sort((a, b) => new Date(b.date) - new Date(a.date));
    if (pastEventsAttended.length > 25) pastEventsAttended.length = 25;

    const hostedTables = await prisma.table.findMany({
      where: {
        hostUserId: targetId,
        deletedAt: null,
        event: { deletedAt: null, status: 'published' },
      },
      select: {
        name: true,
        event: {
          select: {
            id: true,
            title: true,
            date: true,
            city: true,
            coverImageUrl: true,
          },
        },
      },
      orderBy: { event: { date: 'desc' } },
      take: 40,
    });
    const hostedEvents = [];
    const seenHost = new Set();
    for (const t of hostedTables) {
      const ev = t.event;
      if (!ev || seenHost.has(ev.id)) continue;
      seenHost.add(ev.id);
      hostedEvents.push({
        id: ev.id,
        title: ev.title,
        date: ev.date,
        city: ev.city,
        coverImageUrl: ev.coverImageUrl,
        tableName: t.name,
      });
      if (hostedEvents.length >= 20) break;
    }

    res.json({
      id: user.id,
      username: user.username || user.userProfile?.username || '',
      fullName: user.fullName || '',
      avatarUrl: user.userProfile?.avatarUrl || null,
      city: user.userProfile?.city || null,
      gender: user.userProfile?.gender || null,
      bio: user.userProfile?.bio || null,
      interests,
      pastEventsAttended,
      hostedEvents,
      friendshipStatus,
      friendshipId: friendship?.id || null,
      mutualFriendsCount,
      recentActivity,
      conversationId,
      blockedByThem,
      canUnblock,
      isSelf: viewerId === targetId,
    });
  } catch (err) {
    next(err);
  }
});

/** HTTPS or data: URLs (dev uploads without Cloudinary) */
const optionalMediaUrl = z
  .string()
  .max(8000)
  .optional()
  .nullable()
  .refine((v) => v == null || v === '' || /^https?:\/\//i.test(v) || v.startsWith('data:'), {
    message: 'Invalid URL',
  });

const profileUpdateSchema = z.object({
  username: z.string().max(100).optional().nullable(),
  full_name: z.string().max(200).optional().nullable(),
  bio: z.string().max(2000).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  avatar_url: optionalMediaUrl,
  favorite_drink: z.string().max(100).optional().nullable(),
  gender: z.enum(PROFILE_GENDER_VALUES).optional().nullable(),
  date_of_birth: z.string().max(20).optional().nullable(),
  id_document_url: optionalMediaUrl,
  age_verified: z.boolean().optional().nullable(),
  verification_status: z
    .enum(['pending', 'submitted', 'verified', 'rejected', 'approved'])
    .optional()
    .nullable(),
  payment_setup_complete: z.boolean().optional().nullable(),
  interests: z.array(z.string().max(30)).max(10).optional().nullable(),
  music_preferences: z.array(z.string().max(30)).max(10).optional().nullable(),
  friends: z.array(z.string()).optional().nullable(),
  followed_venues: z.array(z.string()).optional().nullable(),
  interested_events: z.array(z.string().uuid()).max(50).optional().nullable(),
  onboarding_complete: z.boolean().optional().nullable()
});

router.get('/profile', authenticateToken, async (req, res, next) => {
  try {
    let profile = null;
    try {
      profile = await prisma.userProfile.findUnique({
        where: { userId: req.userId }
      });
    } catch {
      profile = await readUserProfileCompat(req.userId);
    }
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, email: true, fullName: true, role: true, username: true }
    });
    if (!user) return res.status(404).json({ error: 'User not found' });
    const result = {
      id: profile?.id || user.id,
      created_by: user.email,
      user_id: user.id,
      username: user.username || profile?.username,
      full_name: user.fullName || profile?.username,
      bio: profile?.bio,
      city: profile?.city,
      avatar_url: profile?.avatarUrl,
      favorite_drink: profile?.favoriteDrink,
      gender: profile?.gender ?? null,
      date_of_birth: profile?.dateOfBirth,
      id_document_url: profile?.idDocumentUrl,
      age_verified: deriveAgeVerifiedForApi(profile),
      verification_status: profile?.verificationStatus ?? 'pending',
      verification_rejection_note: profile?.verificationRejectionNote ?? null,
      payment_setup_complete: profile?.paymentSetupComplete ?? false,
      is_verified_promoter: profile?.isVerifiedPromoter ?? false,
      interests: profile?.interests ?? [],
      music_preferences: profile?.musicPreferences ?? [],
      friends: profile?.friends ?? [],
      followed_venues: profile?.followedVenues ?? [],
      interested_events: profile?.interestedEvents ?? [],
      onboarding_complete: profile?.onboardingComplete ?? false
    };
    res.json(Array.isArray(result) ? result : [result]);
  } catch (err) {
    next(err);
  }
});

router.get('/profile/:id', authenticateToken, async (req, res, next) => {
  try {
    const targetId = req.params.id;
    let profile = null;
    try {
      profile = await prisma.userProfile.findFirst({
        where: { OR: [{ userId: targetId }, { id: targetId }] }
      });
    } catch {
      profile = await readUserProfileCompat(targetId);
      if (!profile && targetId && targetId.length > 30) {
        profile = await readUserProfileCompatByProfileRowId(targetId);
      }
    }
    const user = await prisma.user.findFirst({
      where: { OR: [{ id: targetId }, { id: profile?.userId }], deletedAt: null },
      select: { id: true, email: true, fullName: true }
    });
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Track profile view (non-blocking) — only when viewing someone else's profile
    if (req.userId && req.userId !== user.id) {
      prisma.profileView.create({
        data: { viewerId: req.userId, viewedId: user.id }
      }).catch(() => {});
    }

    const isSelf = req.userId === user.id;
    const result = {
      id: profile?.id || user.id,
      created_by: user.email,
      user_id: user.id,
      username: profile?.username,
      full_name: user.fullName || profile?.username,
      bio: profile?.bio,
      city: profile?.city,
      avatar_url: profile?.avatarUrl,
      favorite_drink: profile?.favoriteDrink,
      gender: profile?.gender ?? null,
      date_of_birth: isSelf ? profile?.dateOfBirth : profile?.dateOfBirth,
      id_document_url: isSelf ? profile?.idDocumentUrl : null,
      age_verified: deriveAgeVerifiedForApi(profile),
      verification_status: profile?.verificationStatus ?? 'pending',
      verification_rejection_note: isSelf ? profile?.verificationRejectionNote ?? null : null,
      payment_setup_complete: profile?.paymentSetupComplete ?? false,
      is_verified_promoter: profile?.isVerifiedPromoter ?? false,
      interests: profile?.interests ?? [],
      music_preferences: profile?.musicPreferences ?? [],
      friends: profile?.friends ?? [],
      followed_venues: profile?.followedVenues ?? [],
      interested_events: isSelf ? profile?.interestedEvents ?? [] : [],
      onboarding_complete: profile?.onboardingComplete ?? false
    };
    res.json([result]);
  } catch (err) {
    next(err);
  }
});

// ── Premium: Who viewed my profile ───────────────────────────────────────
// SECURITY: email must be verified AND premium to access profile views
router.get('/profile-views', authenticateToken, requireVerified, requirePremium, async (req, res, next) => {
  try {
    const views = await prisma.profileView.findMany({
      where: { viewedId: req.userId },
      orderBy: { createdAt: 'desc' },
      take: 50
    });
    res.json({ views: views.map(v => ({ viewerId: v.viewerId, viewedAt: v.createdAt })) });
  } catch (err) {
    next(err);
  }
});

// ── Premium: Search profiles ──────────────────────────────────────────────
// SECURITY: email must be verified AND premium to search profiles
router.get('/search', authenticateToken, requireVerified, requirePremium, async (req, res, next) => {
  try {
    const { q, city, limit = 20 } = req.query;
    if (!q || String(q).length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }

    const users = await prisma.user.findMany({
      where: {
        deletedAt: null,
        suspendedAt: null,
        OR: [
          { fullName: { contains: String(q), mode: 'insensitive' } },
          { email: { contains: String(q), mode: 'insensitive' } }
        ]
      },
      select: { id: true, fullName: true },
      take: Math.min(parseInt(limit) || 20, 50)
    });

    const searchUserIds = users.map((u) => u.id);
    let searchProfiles = [];
    try {
      searchProfiles = await prisma.userProfile.findMany({
        where: {
          userId: { in: searchUserIds },
          ...(city ? { city: { contains: String(city), mode: 'insensitive' } } : {}),
        },
      });
    } catch (searchProfileErr) {
      try {
        searchProfiles = await readUserProfilesCompatByUserIds(searchUserIds);
        if (city) {
          const cl = String(city).toLowerCase();
          searchProfiles = searchProfiles.filter((p) =>
            String(p.city || '').toLowerCase().includes(cl)
          );
        }
      } catch {
        throw searchProfileErr;
      }
    }

    const results = users.map(u => {
      const p = searchProfiles.find(pr => pr.userId === u.id);
      return {
        user_id: u.id,
        full_name: u.fullName || p?.username,
        username: p?.username,
        city: p?.city,
        avatar_url: p?.avatarUrl,
        is_verified_promoter: p?.isVerifiedPromoter ?? false
      };
    }).filter(r => !city || r.city?.toLowerCase().includes(String(city).toLowerCase()));

    res.json(results);
  } catch (err) {
    next(err);
  }
});

router.get('/filter', authenticateToken, async (req, res, next) => {
  try {
    const { created_by, id, is_verified_promoter } = req.query;
    const where = { deletedAt: null };
    if (created_by) {
      const emailNorm = String(created_by).trim().toLowerCase();
      const self = await prisma.user.findUnique({
        where: { id: req.userId },
        select: { email: true },
      });
      const selfEmail = (self?.email || '').trim().toLowerCase();
      if (selfEmail && selfEmail === emailNorm) {
        where.id = req.userId;
      } else {
        const u = await prisma.user.findFirst({
          where: { deletedAt: null, email: { equals: emailNorm, mode: 'insensitive' } },
        });
        where.id = u ? u.id : 'none';
      }
    }
    if (id) where.id = id;
    const users = await prisma.user.findMany({ where });

    const filterUserIds = users.map((u) => u.id);
    let profiles = [];
    try {
      profiles = await prisma.userProfile.findMany({
        where: { userId: { in: filterUserIds } },
      });
    } catch (profileErr) {
      try {
        profiles = await readUserProfilesCompatByUserIds(filterUserIds);
      } catch {
        throw profileErr;
      }
    }

    let results = users.map(u => {
      const p = profiles.find(pr => pr.userId === u.id);
      return {
        id: p?.id || u.id,
        user_id: u.id,
        created_by: u.email,
        username: p?.username,
        full_name: u.fullName || p?.username,
        bio: p?.bio,
        city: p?.city,
        avatar_url: p?.avatarUrl,
        favorite_drink: p?.favoriteDrink,
        gender: p?.gender ?? null,
        date_of_birth: p?.dateOfBirth,
        id_document_url: p?.idDocumentUrl,
        age_verified: deriveAgeVerifiedForApi(p),
        verification_status: p?.verificationStatus ?? 'pending',
        payment_setup_complete: p?.paymentSetupComplete ?? false,
        is_verified_promoter: p?.isVerifiedPromoter ?? false,
        interests: p?.interests ?? [],
        music_preferences: p?.musicPreferences ?? [],
        friends: p?.friends ?? [],
        followed_venues: p?.followedVenues ?? [],
        interested_events: u.id === req.userId ? p?.interestedEvents ?? [] : [],
        onboarding_complete: p?.onboardingComplete ?? false
      };
    });
    if (is_verified_promoter === 'true') {
      results = results.filter(r => r.is_verified_promoter);
    }
    const limit = Math.min(parseInt(req.query.limit) || 100, 100);
    res.json(results.slice(0, limit));
  } catch (err) {
    next(err);
  }
});

router.post('/', authenticateToken, async (req, res, next) => {
  try {
    const parsed = profileUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });
    const data = parsed.data;
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (data.full_name !== undefined) {
      const fullName = data.full_name === null || data.full_name === '' ? null : data.full_name;
      await prisma.user.update({
        where: { id: req.userId },
        data: { fullName }
      });
    }
    let canonicalUsername = null;
    if (data.username != null) {
      try {
        canonicalUsername = await syncUserUsername(req.userId, data.username);
      } catch (e) {
        if (e.status) return res.status(e.status).json({ error: e.message, field: e.field });
        throw e;
      }
    }
    const beforePost = await prisma.userProfile.findUnique({
      where: { userId: req.userId },
      select: { interestedEvents: true },
    });
    const profileData = {
      ...(canonicalUsername != null && { username: canonicalUsername }),
      ...(data.bio != null && { bio: data.bio }),
      ...(data.city != null && { city: data.city }),
      ...(data.avatar_url != null && { avatarUrl: data.avatar_url }),
      ...(data.favorite_drink != null && { favoriteDrink: data.favorite_drink }),
      ...(data.gender !== undefined && { gender: data.gender }),
      ...(data.date_of_birth != null && { dateOfBirth: data.date_of_birth }),
      ...(data.id_document_url != null && { idDocumentUrl: data.id_document_url }),
      ...(data.age_verified != null && { ageVerified: data.age_verified }),
      ...(data.verification_status != null && { verificationStatus: data.verification_status }),
      ...(data.payment_setup_complete != null && { paymentSetupComplete: data.payment_setup_complete }),
      ...(data.onboarding_complete != null && { onboardingComplete: data.onboarding_complete }),
      ...(data.interests !== undefined && {
        interests: data.interests === null ? [] : normalizeInterestList(data.interests),
      }),
      ...(data.music_preferences !== undefined && {
        musicPreferences: data.music_preferences === null ? [] : normalizeInterestList(data.music_preferences),
      }),
      ...(data.friends != null && { friends: data.friends }),
      ...(data.followed_venues != null && { followedVenues: data.followed_venues }),
      ...(data.interested_events !== undefined && {
        interestedEvents:
          data.interested_events === null ? [] : normalizeInterestedEvents(data.interested_events),
      }),
    };
    let profile;
    try {
      profile = await prisma.userProfile.upsert({
        where: { userId: req.userId },
        create: { userId: req.userId, ...profileData },
        update: profileData
      });
    } catch (err) {
      if (!isMissingLeaderboardColumnsError(err)) throw err;
      profile = await upsertUserProfileCompat(req.userId, profileData);
    }
    if (data.interested_events !== undefined) {
      await removeInterestReminderDedupes(
        req.userId,
        beforePost?.interestedEvents ?? [],
        profile.interestedEvents ?? []
      );
    }
    const userFresh = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { email: true, fullName: true, username: true }
    });
    res.status(201).json({
      id: profile.id,
      created_by: userFresh.email,
      username: profile.username,
      full_name: userFresh.fullName || profile.username,
      bio: profile.bio,
      city: profile.city,
      avatar_url: profile.avatarUrl,
      favorite_drink: profile.favoriteDrink,
      gender: profile.gender ?? null,
      date_of_birth: profile.dateOfBirth,
      verification_status: profile.verificationStatus,
      payment_setup_complete: profile.paymentSetupComplete,
      interests: profile.interests ?? [],
      music_preferences: profile.musicPreferences ?? [],
      friends: profile.friends ?? [],
      followed_venues: profile.followedVenues ?? [],
      interested_events: profile.interestedEvents ?? [],
      onboarding_complete: profile.onboardingComplete
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/profile', authenticateToken, async (req, res, next) => {
  try {
    const parsed = profileUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });
    const data = { ...parsed.data };
    const staff = isStaff(req.userRole);
    const existingProfile = await readExistingProfileForPatch(req.userId);
    if (!staff) {
      if (data.verification_status === 'verified') {
        return res.status(403).json({ error: 'Identity verification is granted by administrators only.' });
      }
      if (data.age_verified === true) {
        delete data.age_verified;
      }
      const v = existingProfile?.verificationStatus;
      if (v === 'verified' || v === 'approved') {
        delete data.verification_status;
      }
    }
    const prevStatus = existingProfile?.verificationStatus;
    const prevId = String(existingProfile?.idDocumentUrl || '').trim();
    const nextId =
      data.id_document_url !== undefined && data.id_document_url != null
        ? String(data.id_document_url).trim()
        : '';
    let shouldQueueSubmitted = false;
    if (nextId !== '') {
      if (!isProfileVerificationSettled(prevStatus)) {
        shouldQueueSubmitted = true;
      } else if (isIdentityVerifiedStatus(prevStatus) && nextId !== prevId) {
        shouldQueueSubmitted = true;
      }
    }
    if (shouldQueueSubmitted) {
      data.verification_status = 'submitted';
    }
    const user = await prisma.user.findUnique({ where: { id: req.userId } });
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (data.full_name !== undefined) {
      const fullName = data.full_name === null || data.full_name === '' ? null : data.full_name;
      await prisma.user.update({
        where: { id: req.userId },
        data: { fullName }
      });
    }
    let canonicalUsername = null;
    if (data.username != null) {
      try {
        canonicalUsername = await syncUserUsername(req.userId, data.username);
      } catch (e) {
        if (e.status) return res.status(e.status).json({ error: e.message, field: e.field });
        throw e;
      }
    }
    const profileData = {
      ...(canonicalUsername != null && { username: canonicalUsername }),
      ...(data.bio != null && { bio: data.bio }),
      ...(data.city != null && { city: data.city }),
      ...(data.avatar_url !== undefined && { avatarUrl: data.avatar_url }),
      ...(data.favorite_drink != null && { favoriteDrink: data.favorite_drink }),
      ...(data.gender !== undefined && { gender: data.gender }),
      ...(data.date_of_birth != null && { dateOfBirth: data.date_of_birth }),
      ...(data.id_document_url !== undefined && { idDocumentUrl: data.id_document_url }),
      ...(data.age_verified != null && { ageVerified: data.age_verified }),
      ...(data.verification_status != null && { verificationStatus: data.verification_status }),
      ...(data.payment_setup_complete != null && { paymentSetupComplete: data.payment_setup_complete }),
      ...(data.onboarding_complete != null && { onboardingComplete: data.onboarding_complete }),
      ...(data.interests !== undefined && {
        interests: data.interests === null ? [] : normalizeInterestList(data.interests),
      }),
      ...(data.music_preferences !== undefined && {
        musicPreferences: data.music_preferences === null ? [] : normalizeInterestList(data.music_preferences),
      }),
      ...(data.friends != null && { friends: data.friends }),
      ...(data.followed_venues != null && { followedVenues: data.followed_venues }),
      ...(data.interested_events !== undefined && {
        interestedEvents:
          data.interested_events === null ? [] : normalizeInterestedEvents(data.interested_events),
      }),
    };
    let profile;
    try {
      profile = await prisma.userProfile.upsert({
        where: { userId: req.userId },
        create: { userId: req.userId, ...profileData },
        update: profileData
      });
    } catch (err) {
      if (!isMissingLeaderboardColumnsError(err)) throw err;
      profile = await upsertUserProfileCompat(req.userId, profileData);
    }
    if (data.interested_events !== undefined) {
      await removeInterestReminderDedupes(
        req.userId,
        existingProfile?.interestedEvents ?? [],
        profile.interestedEvents ?? []
      );
    }
    const userFresh = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { email: true, fullName: true, username: true }
    });
    res.json({
      id: profile.id,
      created_by: userFresh.email,
      username: profile.username,
      full_name: userFresh.fullName || profile.username,
      bio: profile.bio,
      city: profile.city,
      avatar_url: profile.avatarUrl,
      favorite_drink: profile.favoriteDrink,
      gender: profile.gender ?? null,
      date_of_birth: profile.dateOfBirth,
      id_document_url: profile.idDocumentUrl,
      age_verified: deriveAgeVerifiedForApi(profile),
      verification_status: profile.verificationStatus,
      verification_rejection_note: profile.verificationRejectionNote,
      payment_setup_complete: profile.paymentSetupComplete,
      interests: profile.interests ?? [],
      music_preferences: profile.musicPreferences ?? [],
      friends: profile.friends ?? [],
      followed_venues: profile.followedVenues ?? [],
      interested_events: profile.interestedEvents ?? [],
      onboarding_complete: profile.onboardingComplete
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', authenticateToken, async (req, res, next) => {
  try {
    const id = req.params.id;
    const parsed = profileUpdateSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });
    const data = { ...parsed.data };
    const staff = isStaff(req.userRole);
    let profile = null;
    try {
      profile = await prisma.userProfile.findFirst({
        where: { OR: [{ userId: id }, { id }] },
      });
    } catch {
      profile = null;
    }
    if (!profile) {
      try {
        profile = await readUserProfileCompat(id);
      } catch {
        profile = null;
      }
    }
    if (!profile && id && String(id).length > 30) {
      try {
        profile = await readUserProfileCompatByProfileRowId(id);
      } catch {
        profile = null;
      }
    }
    if (!staff) {
      if (data.verification_status === 'verified') {
        return res.status(403).json({ error: 'Identity verification is granted by administrators only.' });
      }
      if (data.age_verified === true) {
        delete data.age_verified;
      }
      const pv = profile?.verificationStatus;
      if (pv === 'verified' || pv === 'approved') {
        delete data.verification_status;
      }
    }
    const prevStatus = profile?.verificationStatus;
    const prevIdDoc = String(profile?.idDocumentUrl || '').trim();
    const nextIdDoc =
      data.id_document_url !== undefined && data.id_document_url != null
        ? String(data.id_document_url).trim()
        : '';
    let shouldQueueSubmittedPatch = false;
    if (nextIdDoc !== '') {
      if (!isProfileVerificationSettled(prevStatus)) {
        shouldQueueSubmittedPatch = true;
      } else if (isIdentityVerifiedStatus(prevStatus) && nextIdDoc !== prevIdDoc) {
        shouldQueueSubmittedPatch = true;
      }
    }
    if (shouldQueueSubmittedPatch) {
      data.verification_status = 'submitted';
    }
    const targetUserId = profile?.userId || id;
    const prevInterested =
      profile?.interestedEvents ?? (await readExistingProfileForPatch(targetUserId))?.interestedEvents ?? [];
    if (id !== req.userId && targetUserId !== req.userId && !isStaff(req.userRole)) {
      return res.status(403).json({ error: 'Cannot update another user' });
    }
    if (data.full_name !== undefined) {
      const fullName = data.full_name === null || data.full_name === '' ? null : data.full_name;
      await prisma.user.update({
        where: { id: targetUserId },
        data: { fullName }
      });
    }
    let canonicalUsername = null;
    if (data.username != null) {
      try {
        canonicalUsername = await syncUserUsername(targetUserId, data.username);
      } catch (e) {
        if (e.status) return res.status(e.status).json({ error: e.message, field: e.field });
        throw e;
      }
    }
    const updates = {};
    if (canonicalUsername != null) updates.username = canonicalUsername;
    if (data.bio != null) updates.bio = data.bio;
    if (data.city != null) updates.city = data.city;
    if (data.avatar_url !== undefined) updates.avatarUrl = data.avatar_url;
    if (data.favorite_drink != null) updates.favoriteDrink = data.favorite_drink;
    if (data.gender !== undefined) updates.gender = data.gender;
    if (data.date_of_birth != null) updates.dateOfBirth = data.date_of_birth;
    if (data.id_document_url !== undefined) updates.idDocumentUrl = data.id_document_url;
    if (data.age_verified != null) updates.ageVerified = data.age_verified;
    if (data.verification_status != null) updates.verificationStatus = data.verification_status;
    if (data.payment_setup_complete != null) updates.paymentSetupComplete = data.payment_setup_complete;
    if (data.interests !== undefined) {
      updates.interests = data.interests === null ? [] : normalizeInterestList(data.interests);
    }
    if (data.music_preferences !== undefined) {
      updates.musicPreferences = data.music_preferences === null ? [] : normalizeInterestList(data.music_preferences);
    }
    if (data.friends != null) updates.friends = data.friends;
    if (data.followed_venues != null) updates.followedVenues = data.followed_venues;
    if (data.interested_events !== undefined) {
      updates.interestedEvents =
        data.interested_events === null ? [] : normalizeInterestedEvents(data.interested_events);
    }
    if (data.onboarding_complete != null) updates.onboardingComplete = data.onboarding_complete;
    let updated;
    try {
      updated = await prisma.userProfile.upsert({
        where: { userId: targetUserId },
        create: { userId: targetUserId, ...updates },
        update: updates
      });
    } catch (err) {
      if (!isMissingLeaderboardColumnsError(err)) throw err;
      updated = await upsertUserProfileCompat(targetUserId, updates);
    }
    if (data.interested_events !== undefined) {
      await removeInterestReminderDedupes(targetUserId, prevInterested, updated.interestedEvents ?? []);
    }
    const user = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: { email: true, fullName: true, username: true }
    });
    res.json({
      id: updated.id,
      created_by: user.email,
      username: updated.username,
      full_name: user.fullName || updated.username,
      bio: updated.bio,
      city: updated.city,
      avatar_url: updated.avatarUrl,
      favorite_drink: updated.favoriteDrink,
      gender: updated.gender ?? null,
      date_of_birth: updated.dateOfBirth,
      id_document_url: updated.idDocumentUrl,
      age_verified: deriveAgeVerifiedForApi(updated),
      verification_status: updated.verificationStatus,
      verification_rejection_note: updated.verificationRejectionNote,
      payment_setup_complete: updated.paymentSetupComplete,
      interests: updated.interests ?? [],
      music_preferences: updated.musicPreferences ?? [],
      friends: updated.friends ?? [],
      followed_venues: updated.followedVenues ?? [],
      interested_events: updated.interestedEvents ?? [],
      onboarding_complete: updated.onboardingComplete
    });
  } catch (err) {
    next(err);
  }
});

// ── Account Deletion (STEP 6 — App Store requirement) ────────────────────
// Also available at DELETE /api/auth/account — this alias is for REST convention
// SECURITY: Atomic transaction — no orphaned sessions can remain after deletion
router.delete('/me', authenticateToken, async (req, res, next) => {
  try {
    const userId = req.userId;
    const now = new Date();

    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: {
          deletedAt: now,
          suspendedAt: now,
          suspendedReason: 'Account deleted by user'
        }
      }),
      prisma.refreshToken.deleteMany({ where: { userId } })
    ]);

    await auditFromReq(req, {
      userId,
      action: 'ACCOUNT_DELETED',
      entityType: 'user',
      entityId: userId
    });

    res.json({ success: true, message: 'Account deleted.' });
  } catch (err) {
    next(err);
  }
});

export default router;
