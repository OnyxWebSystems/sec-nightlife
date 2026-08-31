import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticateToken } from '../middleware/auth.js';
import { orderedParticipants } from '../lib/conversationHelpers.js';
import { createInAppNotification } from '../lib/inAppNotifications.js';
import { normalizeUsername } from '../lib/username.js';
import {
  buildConversationMap,
  buildFriendshipContext,
} from '../lib/friendshipBatch.js';
import { notifyAdmins } from '../lib/adminNotify.js';

const router = Router();

function publicUserSelect() {
  return {
    id: true,
    username: true,
    fullName: true,
    userProfile: { select: { avatarUrl: true, city: true, gender: true } },
  };
}

async function getLegacyBlockSet(userId) {
  const rows = await prisma.block.findMany({
    where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
    select: { blockerId: true, blockedId: true },
  });
  const blocked = new Set();
  for (const r of rows) {
    if (r.blockerId === userId) blocked.add(r.blockedId);
    if (r.blockedId === userId) blocked.add(r.blockerId);
  }
  return blocked;
}

/** Split legacy Block rows: people I blocked vs people who blocked me. */
async function getLegacyBlockDirections(userId) {
  const rows = await prisma.block.findMany({
    where: { OR: [{ blockerId: userId }, { blockedId: userId }] },
    select: { blockerId: true, blockedId: true },
  });
  const iBlockedThem = new Set();
  const theyBlockedMe = new Set();
  for (const r of rows) {
    if (r.blockerId === userId) iBlockedThem.add(r.blockedId);
    if (r.blockedId === userId) theyBlockedMe.add(r.blockerId);
  }
  return { iBlockedThem, theyBlockedMe };
}

async function isFriendshipBlockedBetween(a, b) {
  const f = await prisma.friendship.findFirst({
    where: {
      status: 'BLOCKED',
      OR: [
        { requesterId: a, receiverId: b },
        { requesterId: b, receiverId: a },
      ],
    },
    select: { requesterId: true },
  });
  return f;
}

async function computeFriendshipStatus(viewerId, targetId) {
  const f = await prisma.friendship.findFirst({
    where: {
      OR: [
        { requesterId: viewerId, receiverId: targetId },
        { requesterId: targetId, receiverId: viewerId },
      ],
    },
  });
  if (!f) return 'NONE';
  if (f.status === 'BLOCKED') return 'BLOCKED';
  if (f.status === 'ACCEPTED') return 'ACCEPTED';
  if (f.status === 'DECLINED') return 'NONE';
  if (f.status === 'PENDING') {
    return f.requesterId === viewerId ? 'PENDING_SENT' : 'PENDING_RECEIVED';
  }
  return 'NONE';
}

async function acceptedFriendIds(userId) {
  const rows = await prisma.friendship.findMany({
    where: {
      status: 'ACCEPTED',
      OR: [{ requesterId: userId }, { receiverId: userId }],
    },
    select: { requesterId: true, receiverId: true },
  });
  const ids = new Set();
  for (const r of rows) {
    ids.add(r.requesterId === userId ? r.receiverId : r.requesterId);
  }
  return ids;
}

/** GET /search — includes people YOU blocked (so you can unblock); hides people who blocked you. */
router.get('/search', authenticateToken, async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim().replace(/^@+/, '');
    if (q.length < 1) return res.json([]);
    const me = req.userId;
    const { iBlockedThem, theyBlockedMe } = await getLegacyBlockDirections(me);

    const users = await prisma.user.findMany({
      where: {
        deletedAt: null,
        id: { not: me },
        OR: [
          { username: { contains: q, mode: 'insensitive' } },
          { fullName: { contains: q, mode: 'insensitive' } },
          { userProfile: { username: { contains: q, mode: 'insensitive' } } },
        ],
      },
      select: {
        ...publicUserSelect(),
        suspendedAt: true,
      },
      take: 40,
    });

    const profileRows = await prisma.userProfile.findMany({
      where: { userId: { in: users.map((u) => u.id) } },
      select: { userId: true, privacySettings: true, username: true },
    });
    const privacyByUser = new Map(profileRows.map((p) => [p.userId, p.privacySettings]));
    const profileUsernameByUser = new Map(profileRows.map((p) => [p.userId, p.username]));

    const candidateIds = users.map((u) => u.id);
    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [
          { requesterId: me, receiverId: { in: candidateIds } },
          { requesterId: { in: candidateIds }, receiverId: me },
        ],
      },
      select: { requesterId: true, receiverId: true, status: true },
    });
    const { statusByTarget } = buildFriendshipContext(me, candidateIds, friendships);
    const friendshipByTarget = new Map();
    for (const f of friendships) {
      const other = f.requesterId === me ? f.receiverId : f.requesterId;
      friendshipByTarget.set(other, f);
    }

    const acceptedIds = candidateIds.filter((id) => statusByTarget.get(id) === 'ACCEPTED');
    const convPairs = acceptedIds.map((tid) => orderedParticipants(me, tid));
    const conversations =
      convPairs.length > 0
        ? await prisma.conversation.findMany({
            where: {
              OR: convPairs.map((p) => ({
                participantAId: p.participantAId,
                participantBId: p.participantBId,
              })),
            },
            select: { id: true, participantAId: true, participantBId: true },
          })
        : [];
    const conversationByTarget = buildConversationMap(me, acceptedIds, conversations);

    const out = [];
    for (const u of users) {
      const f = friendshipByTarget.get(u.id);
      const youBlockedThem =
        (f?.status === 'BLOCKED' && f.requesterId === me) || iBlockedThem.has(u.id);
      const blockedByThem =
        (f?.status === 'BLOCKED' && f.requesterId === u.id && f.receiverId === me) ||
        theyBlockedMe.has(u.id);

      // Hide accounts that blocked you (unless you also blocked them — then show Unblock)
      if (blockedByThem && !youBlockedThem) continue;
      // Suspended accounts stay hidden unless you blocked them (unblock / profile)
      if (u.suspendedAt && !youBlockedThem) continue;

      const priv = privacyByUser.get(u.id);
      // People you blocked should still appear so you can find/unblock them
      if (
        !youBlockedThem &&
        priv &&
        typeof priv === 'object' &&
        priv.searchVisible === false
      ) {
        continue;
      }

      let st = statusByTarget.get(u.id) || 'NONE';
      if (youBlockedThem) st = 'BLOCKED';

      const conversationId = st === 'ACCEPTED' ? conversationByTarget.get(u.id) || null : null;
      const username = u.username || profileUsernameByUser.get(u.id) || '';

      out.push({
        id: u.id,
        username,
        fullName: u.fullName || '',
        avatarUrl: u.userProfile?.avatarUrl || null,
        city: u.userProfile?.city || null,
        gender: u.userProfile?.gender || null,
        friendshipStatus: st,
        conversationId,
        youBlockedThem,
        canUnblock: youBlockedThem,
      });
      if (out.length >= 20) break;
    }
    res.json(out);
  } catch (err) {
    next(err);
  }
});

/** GET /suggestions */
router.get('/suggestions', authenticateToken, async (req, res, next) => {
  try {
    const me = req.userId;
    const myProfile = await prisma.userProfile.findUnique({ where: { userId: me } });
    const myCity = myProfile?.city?.trim() || '';
    const friendIds = await acceptedFriendIds(me);
    const blockSet = await getLegacyBlockSet(me);

    const pendingRows = await prisma.friendship.findMany({
      where: {
        status: 'PENDING',
        OR: [{ requesterId: me }, { receiverId: me }],
      },
    });
    const pendingIds = new Set();
    for (const p of pendingRows) {
      pendingIds.add(p.requesterId === me ? p.receiverId : p.requesterId);
    }

    const myEvents = await prisma.eventAttendance.findMany({
      where: { userId: me },
      select: { eventId: true },
    });
    const myEventIds = myEvents.map((e) => e.eventId);

    const tablesImOn = await prisma.table.findMany({
      where: { deletedAt: null, OR: [{ hostUserId: me }] },
      select: { id: true, eventId: true, hostUserId: true, members: true },
      take: 150,
    });
    const myTableEventIdsSet = new Set();
    for (const t of tablesImOn) {
      let onTable = t.hostUserId === me;
      if (!onTable && Array.isArray(t.members)) {
        for (const m of t.members) {
          const uid = typeof m === 'object' ? m?.user_id : m;
          if (uid === me) {
            onTable = true;
            break;
          }
        }
      }
      if (onTable) myTableEventIdsSet.add(t.eventId);
    }
    const myTableEventIds = [...myTableEventIdsSet];

    const candidates = new Map();

    if (myCity) {
      const cityUsers = await prisma.userProfile.findMany({
        where: {
          userId: { not: me },
          city: { equals: myCity, mode: 'insensitive' },
        },
        select: { userId: true },
        take: 80,
      });
      for (const c of cityUsers) candidates.set(c.userId, 3);
    }

    if (myEventIds.length) {
      const sameEvent = await prisma.eventAttendance.findMany({
        where: { eventId: { in: myEventIds }, userId: { not: me } },
        select: { userId: true },
        distinct: ['userId'],
        take: 80,
      });
      for (const s of sameEvent) {
        const prev = candidates.get(s.userId) || 0;
        candidates.set(s.userId, Math.max(prev, 2));
      }
    }

    if (myTableEventIds.length) {
      const tablePeers = await prisma.table.findMany({
        where: { deletedAt: null, eventId: { in: myTableEventIds } },
        select: { hostUserId: true, members: true },
        take: 200,
      });
      for (const t of tablePeers) {
        const ids = new Set();
        if (t.hostUserId && t.hostUserId !== me) ids.add(t.hostUserId);
        const members = Array.isArray(t.members) ? t.members : [];
        for (const m of members) {
          const uid = typeof m === 'object' ? m?.user_id : m;
          if (uid && uid !== me) ids.add(uid);
        }
        for (const uid of ids) {
          const prev = candidates.get(uid) || 0;
          candidates.set(uid, Math.max(prev, 1));
        }
      }
    }

    const sorted = [...candidates.entries()]
      .filter(([uid]) => !friendIds.has(uid) && !pendingIds.has(uid) && !blockSet.has(uid))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 30)
      .map(([uid]) => uid);

    const rows = await prisma.user.findMany({
      where: { id: { in: sorted }, deletedAt: null, suspendedAt: null },
      select: publicUserSelect(),
    });
    const byId = new Map(rows.map((r) => [r.id, r]));
    const suggestPrivacy = await prisma.userProfile.findMany({
      where: { userId: { in: sorted } },
      select: { userId: true, privacySettings: true },
    });
    const suggestPrivacyMap = new Map(suggestPrivacy.map((p) => [p.userId, p.privacySettings]));

    const friendships = await prisma.friendship.findMany({
      where: {
        OR: [
          { requesterId: me, receiverId: { in: sorted } },
          { requesterId: { in: sorted }, receiverId: me },
        ],
      },
      select: { requesterId: true, receiverId: true, status: true },
    });
    const { statusByTarget, blockedTargets } = buildFriendshipContext(me, sorted, friendships);

    const out = [];
    for (const uid of sorted) {
      const u = byId.get(uid);
      if (!u) continue;
      const priv = suggestPrivacyMap.get(u.id);
      if (priv && typeof priv === 'object' && priv.searchVisible === false) continue;
      if (blockedTargets.has(u.id)) continue;
      const st = statusByTarget.get(u.id) || 'NONE';
      if (st === 'BLOCKED') continue;
      out.push({
        id: u.id,
        username: u.username || '',
        fullName: u.fullName || '',
        avatarUrl: u.userProfile?.avatarUrl || null,
        city: u.userProfile?.city || null,
        gender: u.userProfile?.gender || null,
        friendshipStatus: st,
      });
      if (out.length >= 20) break;
    }
    res.json(out);
  } catch (err) {
    next(err);
  }
});

const receiverIdSchema = z.object({ receiverId: z.string().min(1) });

/** POST /request */
router.post('/request', authenticateToken, async (req, res, next) => {
  try {
    const parsed = receiverIdSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });
    const { receiverId } = parsed.data;
    if (receiverId === req.userId) return res.status(400).json({ error: 'Cannot send request to yourself' });

    const block = await isFriendshipBlockedBetween(req.userId, receiverId);
    if (block) {
      return res.status(403).json({ error: 'Cannot send friend request' });
    }

    const legacy = await getLegacyBlockSet(req.userId);
    if (legacy.has(receiverId)) return res.status(403).json({ error: 'Cannot send friend request' });

    const existing = await prisma.friendship.findFirst({
      where: {
        OR: [
          { requesterId: req.userId, receiverId },
          { requesterId: receiverId, receiverId: req.userId },
        ],
      },
    });
    if (existing) {
      return res.status(409).json({ error: 'Friendship already exists' });
    }

    const friendship = await prisma.friendship.create({
      data: {
        requesterId: req.userId,
        receiverId,
        status: 'PENDING',
      },
    });

    const requester = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { username: true, fullName: true },
    });
    const uname = normalizeUsername(requester?.username || '') || requester?.fullName || 'someone';

    await createInAppNotification({
      userId: receiverId,
      type: 'FRIEND_REQUEST',
      title: 'New Friend Request',
      body: `@${uname} sent you a friend request`,
      referenceId: friendship.id,
      referenceType: 'FRIENDSHIP',
    });

    res.status(201).json(friendship);
  } catch (err) {
    next(err);
  }
});

/** POST /request/:friendshipId/accept */
router.post('/request/:friendshipId/accept', authenticateToken, async (req, res, next) => {
  try {
    const f = await prisma.friendship.findUnique({ where: { id: req.params.friendshipId } });
    if (!f || f.receiverId !== req.userId) return res.status(403).json({ error: 'Forbidden' });
    if (f.status !== 'PENDING') return res.status(400).json({ error: 'Invalid state' });

    const parts = orderedParticipants(f.requesterId, f.receiverId);

    const updated = await prisma.$transaction(async (tx) => {
      const fr = await tx.friendship.update({
        where: { id: f.id },
        data: { status: 'ACCEPTED' },
      });
      await tx.conversation.upsert({
        where: {
          participantAId_participantBId: {
            participantAId: parts.participantAId,
            participantBId: parts.participantBId,
          },
        },
        create: { ...parts },
        update: {},
      });
      return fr;
    });

    const receiver = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { username: true, fullName: true },
    });
    const runame = normalizeUsername(receiver?.username || '') || receiver?.fullName || 'someone';

    await createInAppNotification({
      userId: f.requesterId,
      type: 'FRIEND_ACCEPTED',
      title: 'Friend Request Accepted',
      body: `@${runame} accepted your friend request`,
      referenceId: f.id,
      referenceType: 'FRIENDSHIP',
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
});

/** POST /request/:friendshipId/decline */
router.post('/request/:friendshipId/decline', authenticateToken, async (req, res, next) => {
  try {
    const f = await prisma.friendship.findUnique({ where: { id: req.params.friendshipId } });
    if (!f || f.receiverId !== req.userId) return res.status(403).json({ error: 'Forbidden' });
    if (f.status !== 'PENDING') return res.status(400).json({ error: 'Invalid state' });

    const updated = await prisma.friendship.update({
      where: { id: f.id },
      data: { status: 'DECLINED' },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
});

/** DELETE /:friendshipId — unfriend or cancel pending */
router.delete('/:friendshipId', authenticateToken, async (req, res, next) => {
  try {
    const fid = req.params.friendshipId;
    if (!/^[a-z0-9]{8,}$/i.test(fid)) return res.status(400).json({ error: 'Invalid id' });
    const f = await prisma.friendship.findUnique({ where: { id: fid } });
    if (!f) return res.status(404).json({ error: 'Not found' });
    if (f.requesterId !== req.userId && f.receiverId !== req.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (f.status === 'PENDING' && f.receiverId === req.userId) {
      return res.status(403).json({ error: 'Use decline to cancel incoming request' });
    }

    await prisma.friendship.delete({ where: { id: f.id } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

/** GET /blocked — accounts the current user has blocked (for Privacy / unblock) */
router.get('/blocked', authenticateToken, async (req, res, next) => {
  try {
    const me = req.userId;
    const [friendships, legacy] = await Promise.all([
      prisma.friendship.findMany({
        where: { status: 'BLOCKED', requesterId: me },
        select: { receiverId: true, createdAt: true },
      }),
      prisma.block.findMany({
        where: { blockerId: me },
        select: { blockedId: true, createdAt: true },
      }),
    ]);
    const byId = new Map();
    for (const f of friendships) {
      byId.set(f.receiverId, f.createdAt);
    }
    for (const b of legacy) {
      if (!byId.has(b.blockedId) || b.createdAt > byId.get(b.blockedId)) {
        byId.set(b.blockedId, b.createdAt);
      }
    }
    const ids = [...byId.keys()];
    if (!ids.length) return res.json({ items: [] });

    const users = await prisma.user.findMany({
      where: { id: { in: ids }, deletedAt: null },
      select: {
        id: true,
        username: true,
        fullName: true,
        userProfile: { select: { username: true, avatarUrl: true } },
      },
    });
    const items = users
      .map((u) => ({
        id: u.id,
        username: u.userProfile?.username || u.username || null,
        fullName: u.fullName || null,
        avatarUrl: u.userProfile?.avatarUrl || null,
        blockedAt: byId.get(u.id) || null,
      }))
      .sort((a, b) => String(b.blockedAt || '').localeCompare(String(a.blockedAt || '')));

    res.json({ items });
  } catch (err) {
    next(err);
  }
});

/** POST /block/:userId — body.reason optional (shown to admins on the auto-report) */
router.post('/block/:userId', authenticateToken, async (req, res, next) => {
  try {
    const targetId = req.params.userId;
    if (targetId === req.userId) return res.status(400).json({ error: 'Invalid' });

    const parsed = z
      .object({
        reason: z.string().trim().max(500).optional(),
      })
      .safeParse(req.body || {});
    const optionalReason =
      parsed.success && parsed.data.reason ? parsed.data.reason.trim() : '';

    const reportDetails = optionalReason
      ? `Blocker-provided reason:\n${optionalReason}`
      : 'Automatic report created when a user blocked another user. No additional reason was provided.';

    await prisma.$transaction(async (tx) => {
      await tx.friendship.deleteMany({
        where: {
          OR: [
            { requesterId: req.userId, receiverId: targetId },
            { requesterId: targetId, receiverId: req.userId },
          ],
        },
      });
      await tx.friendship.create({
        data: {
          requesterId: req.userId,
          receiverId: targetId,
          status: 'BLOCKED',
        },
      });
      await tx.block.upsert({
        where: {
          blockerId_blockedId: { blockerId: req.userId, blockedId: targetId },
        },
        create: { blockerId: req.userId, blockedId: targetId },
        update: {},
      });
      await tx.report.create({
        data: {
          reporterId: req.userId,
          targetType: 'user',
          targetId,
          category: 'hate_or_abuse',
          priority: 'medium',
          reason: optionalReason ? 'User blocked (reason provided)' : 'User blocked',
          details: reportDetails,
        },
      });
    });

    notifyAdmins({
      subject: 'User blocked — safety review',
      body: optionalReason
        ? `A user blocked another account and provided a reason.\n\nBlocker: ${req.userId}\nBlocked: ${targetId}\n\nReason:\n${optionalReason}`
        : `A user blocked another account.\n\nBlocker: ${req.userId}\nBlocked: ${targetId}\n\nAn automatic hate_or_abuse report was created for review.`,
      dashboardTab: 'reports',
      ctaLabel: 'Review reports',
    }).catch(() => {});

    res.json({ blocked: true });
  } catch (err) {
    next(err);
  }
});

/** DELETE /block/:userId — unblock */
router.delete('/block/:userId', authenticateToken, async (req, res, next) => {
  try {
    const targetId = req.params.userId;
    const f = await prisma.friendship.findFirst({
      where: {
        status: 'BLOCKED',
        requesterId: req.userId,
        receiverId: targetId,
      },
    });
    if (!f) {
      const legacy = await prisma.block.findFirst({
        where: { blockerId: req.userId, blockedId: targetId },
        select: { id: true },
      });
      if (!legacy) return res.status(404).json({ error: 'Not found' });
    }
    await prisma.$transaction(async (tx) => {
      if (f) await tx.friendship.delete({ where: { id: f.id } });
      await tx.block.deleteMany({
        where: { blockerId: req.userId, blockedId: targetId },
      });
    });
    res.json({ unblocked: true });
  } catch (err) {
    next(err);
  }
});

/** GET / — list friends; GET /?q= — search accepted friends by name (for share, etc.) */
router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const me = req.userId;
    const q = String(req.query.q || '').trim();

    if (q.length >= 1) {
      const ql = q.toLowerCase();
      const rows = await prisma.friendship.findMany({
        where: {
          status: 'ACCEPTED',
          OR: [{ requesterId: me }, { receiverId: me }],
        },
        include: {
          requester: { select: publicUserSelect() },
          receiver: { select: publicUserSelect() },
        },
      });

      const matches = [];
      for (const r of rows) {
        const friendUser = r.requesterId === me ? r.receiver : r.requester;
        const uname = (friendUser.username || '').toLowerCase();
        const fname = (friendUser.fullName || '').toLowerCase();
        if (!uname.includes(ql) && !fname.includes(ql)) continue;

        const parts = orderedParticipants(r.requesterId, r.receiverId);
        const conv = await prisma.conversation.findUnique({
          where: {
            participantAId_participantBId: {
              participantAId: parts.participantAId,
              participantBId: parts.participantBId,
            },
          },
          select: { id: true },
        });

        matches.push({
          id: friendUser.id,
          username: friendUser.username || '',
          fullName: friendUser.fullName || '',
          avatarUrl: friendUser.userProfile?.avatarUrl || null,
          city: friendUser.userProfile?.city || null,
          gender: friendUser.userProfile?.gender || null,
          conversationId: conv?.id || null,
          friendshipStatus: 'ACCEPTED',
        });
        if (matches.length >= 20) break;
      }

      matches.sort((a, b) => (a.fullName || a.username).localeCompare(b.fullName || b.username));
      return res.json(matches);
    }

    const rows = await prisma.friendship.findMany({
      where: {
        status: 'ACCEPTED',
        OR: [{ requesterId: me }, { receiverId: me }],
      },
      include: {
        requester: { select: publicUserSelect() },
        receiver: { select: publicUserSelect() },
      },
    });

    const list = [];
    for (const r of rows) {
      const friendUser = r.requesterId === me ? r.receiver : r.requester;
      const parts = orderedParticipants(r.requesterId, r.receiverId);
      const conv = await prisma.conversation.findUnique({
        where: {
          participantAId_participantBId: {
            participantAId: parts.participantAId,
            participantBId: parts.participantBId,
          },
        },
        select: { id: true },
      });

      const lastAct = await prisma.friendActivity.findFirst({
        where: { userId: friendUser.id },
        orderBy: { createdAt: 'desc' },
        select: { createdAt: true },
      });

      list.push({
        id: friendUser.id,
        username: friendUser.username || '',
        fullName: friendUser.fullName || '',
        avatarUrl: friendUser.userProfile?.avatarUrl || null,
        city: friendUser.userProfile?.city || null,
        gender: friendUser.userProfile?.gender || null,
        conversationId: conv?.id || null,
        lastActivity: lastAct?.createdAt || null,
      });
    }

    list.sort((a, b) => (a.fullName || a.username).localeCompare(b.fullName || b.username));
    res.json(list);
  } catch (err) {
    next(err);
  }
});

/** GET /requests/incoming — helper for UI */
router.get('/requests/incoming', authenticateToken, async (req, res, next) => {
  try {
    const rows = await prisma.friendship.findMany({
      where: { receiverId: req.userId, status: 'PENDING' },
      include: {
        requester: { select: publicUserSelect() },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(
      rows.map((r) => ({
        friendshipId: r.id,
        user: {
          id: r.requester.id,
          username: r.requester.username || '',
          fullName: r.requester.fullName || '',
          avatarUrl: r.requester.userProfile?.avatarUrl || null,
          city: r.requester.userProfile?.city || null,
          gender: r.requester.userProfile?.gender || null,
        },
      })),
    );
  } catch (err) {
    next(err);
  }
});

/** GET /requests/sent */
router.get('/requests/sent', authenticateToken, async (req, res, next) => {
  try {
    const rows = await prisma.friendship.findMany({
      where: { requesterId: req.userId, status: 'PENDING' },
      include: {
        receiver: { select: publicUserSelect() },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.json(
      rows.map((r) => ({
        friendshipId: r.id,
        user: {
          id: r.receiver.id,
          username: r.receiver.username || '',
          fullName: r.receiver.fullName || '',
          avatarUrl: r.receiver.userProfile?.avatarUrl || null,
          city: r.receiver.userProfile?.city || null,
          gender: r.receiver.userProfile?.gender || null,
        },
      })),
    );
  } catch (err) {
    next(err);
  }
});

/** GET /activity */
router.get('/activity', authenticateToken, async (req, res, next) => {
  try {
    const me = req.userId;
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const limit = 20;
    const friendIds = [...(await acceptedFriendIds(me))];
    if (friendIds.length === 0) return res.json({ items: [], page, hasMore: false });

    const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const [total, activities] = await Promise.all([
      prisma.friendActivity.count({
        where: { userId: { in: friendIds }, createdAt: { gte: since } },
      }),
      prisma.friendActivity.findMany({
        where: { userId: { in: friendIds }, createdAt: { gte: since } },
        include: {
          user: { select: { username: true, userProfile: { select: { avatarUrl: true } } } },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const items = [];
    for (const a of activities) {
      let referenceDetails = null;
      if (a.referenceType === 'EVENT') {
        const ev = await prisma.event.findFirst({
          where: { id: a.referenceId, deletedAt: null },
          include: { venue: { select: { name: true } } },
        });
        referenceDetails = ev
          ? {
              title: ev.title,
              date: ev.date,
              venueName: ev.venue?.name || null,
            }
          : null;
      } else if (a.referenceType === 'TABLE') {
        const t = await prisma.table.findFirst({
          where: { id: a.referenceId, deletedAt: null },
          include: { host: { select: { fullName: true, username: true } } },
        });
        referenceDetails = t
          ? {
              tableName: t.name,
              hostName: t.host?.fullName || t.host?.username || null,
            }
          : null;
      } else if (a.referenceType === 'PROMOTION') {
        const p = await prisma.promotion.findFirst({
          where: { id: a.referenceId, deletedAt: null },
          include: { venue: { select: { name: true } } },
        });
        referenceDetails = p
          ? {
              title: p.title,
              venueName: p.venue?.name || null,
            }
          : null;
      }

      items.push({
        id: a.id,
        activityType: a.activityType,
        description: a.description,
        referenceId: a.referenceId,
        referenceType: a.referenceType,
        createdAt: a.createdAt,
        referenceDetails,
        user: {
          id: a.userId,
          username: a.user.username || '',
          avatarUrl: a.user.userProfile?.avatarUrl || null,
        },
      });
    }

    res.json({ items, page, hasMore: page * limit < total });
  } catch (err) {
    next(err);
  }
});

export default router;
