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

const router = Router();

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
    if (friendshipStatus === 'ACCEPTED') {
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

    res.json({
      id: user.id,
      username: user.username || user.userProfile?.username || '',
      fullName: user.fullName || '',
      avatarUrl: user.userProfile?.avatarUrl || null,
      city: user.userProfile?.city || null,
      bio: user.userProfile?.bio || null,
      interests: user.userProfile?.interests ?? [],
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

const profileUpdateSchema = z.object({
  username: z.string().max(100).optional().nullable(),
  full_name: z.string().max(200).optional().nullable(),
  bio: z.string().max(2000).optional().nullable(),
  city: z.string().max(100).optional().nullable(),
  avatar_url: z.string().url().optional().nullable(),
  favorite_drink: z.string().max(100).optional().nullable(),
  date_of_birth: z.string().max(20).optional().nullable(),
  id_document_url: z.string().url().optional().nullable(),
  age_verified: z.boolean().optional().nullable(),
  verification_status: z.enum(['pending', 'submitted', 'verified', 'rejected']).optional().nullable(),
  payment_setup_complete: z.boolean().optional().nullable(),
  interests: z.array(z.string()).optional().nullable(),
  music_preferences: z.array(z.string()).optional().nullable(),
  friends: z.array(z.string()).optional().nullable(),
  followed_venues: z.array(z.string()).optional().nullable(),
  onboarding_complete: z.boolean().optional().nullable()
});

router.get('/profile', authenticateToken, async (req, res, next) => {
  try {
    let profile = null;
    try {
      profile = await prisma.userProfile.findUnique({
        where: { userId: req.userId }
      });
    } catch { profile = null; }
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
      date_of_birth: profile?.dateOfBirth,
      id_document_url: profile?.idDocumentUrl,
      age_verified: profile?.ageVerified ?? false,
      verification_status: profile?.verificationStatus ?? 'pending',
      payment_setup_complete: profile?.paymentSetupComplete ?? false,
      is_verified_promoter: profile?.isVerifiedPromoter ?? false,
      interests: profile?.interests ?? [],
      music_preferences: profile?.musicPreferences ?? [],
      friends: profile?.friends ?? [],
      followed_venues: profile?.followedVenues ?? [],
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
    } catch { profile = null; }
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
      date_of_birth: profile?.dateOfBirth,
      id_document_url: profile?.idDocumentUrl,
      age_verified: profile?.ageVerified ?? false,
      verification_status: profile?.verificationStatus ?? 'pending',
      payment_setup_complete: profile?.paymentSetupComplete ?? false,
      is_verified_promoter: profile?.isVerifiedPromoter ?? false,
      interests: profile?.interests ?? [],
      music_preferences: profile?.musicPreferences ?? [],
      friends: profile?.friends ?? [],
      followed_venues: profile?.followedVenues ?? [],
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

    const profiles = await prisma.userProfile.findMany({
      where: {
        userId: { in: users.map(u => u.id) },
        ...(city ? { city: { contains: String(city), mode: 'insensitive' } } : {})
      }
    });

    const results = users.map(u => {
      const p = profiles.find(pr => pr.userId === u.id);
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
      const u = await prisma.user.findFirst({ where: { email: created_by } });
      where.id = u ? u.id : 'none';
    }
    if (id) where.id = id;
    const users = await prisma.user.findMany({ where });

    let profiles = [];
    try {
      profiles = await prisma.userProfile.findMany({
        where: { userId: { in: users.map(u => u.id) } }
      });
    } catch {
      profiles = [];
    }

    let results = users.map(u => {
      const p = profiles.find(pr => pr.userId === u.id);
      return {
        id: p?.id || u.id,
        created_by: u.email,
        username: p?.username,
        full_name: u.fullName || p?.username,
        bio: p?.bio,
        city: p?.city,
        avatar_url: p?.avatarUrl,
        favorite_drink: p?.favoriteDrink,
        date_of_birth: p?.dateOfBirth,
        id_document_url: p?.idDocumentUrl,
        age_verified: p?.ageVerified ?? false,
        verification_status: p?.verificationStatus ?? 'pending',
        payment_setup_complete: p?.paymentSetupComplete ?? false,
        is_verified_promoter: p?.isVerifiedPromoter ?? false,
        interests: p?.interests ?? [],
        music_preferences: p?.musicPreferences ?? [],
        friends: p?.friends ?? [],
        followed_venues: p?.followedVenues ?? [],
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
    const profileData = {
      ...(canonicalUsername != null && { username: canonicalUsername }),
      ...(data.bio != null && { bio: data.bio }),
      ...(data.city != null && { city: data.city }),
      ...(data.avatar_url != null && { avatarUrl: data.avatar_url }),
      ...(data.favorite_drink != null && { favoriteDrink: data.favorite_drink }),
      ...(data.date_of_birth != null && { dateOfBirth: data.date_of_birth }),
      ...(data.id_document_url != null && { idDocumentUrl: data.id_document_url }),
      ...(data.age_verified != null && { ageVerified: data.age_verified }),
      ...(data.verification_status != null && { verificationStatus: data.verification_status }),
      ...(data.payment_setup_complete != null && { paymentSetupComplete: data.payment_setup_complete }),
      ...(data.onboarding_complete != null && { onboardingComplete: data.onboarding_complete }),
      ...(data.interests != null && { interests: data.interests }),
      ...(data.music_preferences != null && { musicPreferences: data.music_preferences }),
      ...(data.friends != null && { friends: data.friends }),
      ...(data.followed_venues != null && { followedVenues: data.followed_venues })
    };
    const profile = await prisma.userProfile.upsert({
      where: { userId: req.userId },
      create: { userId: req.userId, ...profileData },
      update: profileData
    });
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
      date_of_birth: profile.dateOfBirth,
      verification_status: profile.verificationStatus,
      payment_setup_complete: profile.paymentSetupComplete,
      interests: profile.interests,
      music_preferences: profile.musicPreferences,
      friends: profile.friends ?? [],
      followed_venues: profile.followedVenues ?? [],
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
    const profileData = {
      ...(canonicalUsername != null && { username: canonicalUsername }),
      ...(data.bio != null && { bio: data.bio }),
      ...(data.city != null && { city: data.city }),
      ...(data.avatar_url !== undefined && { avatarUrl: data.avatar_url }),
      ...(data.favorite_drink != null && { favoriteDrink: data.favorite_drink }),
      ...(data.date_of_birth != null && { dateOfBirth: data.date_of_birth }),
      ...(data.id_document_url !== undefined && { idDocumentUrl: data.id_document_url }),
      ...(data.age_verified != null && { ageVerified: data.age_verified }),
      ...(data.verification_status != null && { verificationStatus: data.verification_status }),
      ...(data.payment_setup_complete != null && { paymentSetupComplete: data.payment_setup_complete }),
      ...(data.onboarding_complete != null && { onboardingComplete: data.onboarding_complete }),
      ...(data.interests != null && { interests: data.interests }),
      ...(data.music_preferences != null && { musicPreferences: data.music_preferences }),
      ...(data.friends != null && { friends: data.friends }),
      ...(data.followed_venues != null && { followedVenues: data.followed_venues })
    };
    const profile = await prisma.userProfile.upsert({
      where: { userId: req.userId },
      create: { userId: req.userId, ...profileData },
      update: profileData
    });
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
      date_of_birth: profile.dateOfBirth,
      verification_status: profile.verificationStatus,
      payment_setup_complete: profile.paymentSetupComplete,
      interests: profile.interests,
      music_preferences: profile.musicPreferences,
      friends: profile.friends ?? [],
      followed_venues: profile.followedVenues ?? [],
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
    const data = parsed.data;
    const profile = await prisma.userProfile.findFirst({
      where: { OR: [{ userId: id }, { id }] }
    });
    const targetUserId = profile?.userId || id;
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
    if (data.date_of_birth != null) updates.dateOfBirth = data.date_of_birth;
    if (data.id_document_url !== undefined) updates.idDocumentUrl = data.id_document_url;
    if (data.age_verified != null) updates.ageVerified = data.age_verified;
    if (data.verification_status != null) updates.verificationStatus = data.verification_status;
    if (data.payment_setup_complete != null) updates.paymentSetupComplete = data.payment_setup_complete;
    if (data.interests != null) updates.interests = data.interests;
    if (data.music_preferences != null) updates.musicPreferences = data.music_preferences;
    if (data.friends != null) updates.friends = data.friends;
    if (data.followed_venues != null) updates.followedVenues = data.followed_venues;
    if (data.onboarding_complete != null) updates.onboardingComplete = data.onboarding_complete;
    const updated = await prisma.userProfile.upsert({
      where: { userId: targetUserId },
      create: { userId: targetUserId, ...updates },
      update: updates
    });
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
      date_of_birth: updated.dateOfBirth,
      verification_status: updated.verificationStatus,
      payment_setup_complete: updated.paymentSetupComplete,
      interests: updated.interests,
      music_preferences: updated.musicPreferences,
      friends: updated.friends ?? [],
      followed_venues: updated.followedVenues ?? [],
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
