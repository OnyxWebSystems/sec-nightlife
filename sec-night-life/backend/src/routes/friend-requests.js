import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticateToken } from '../middleware/auth.js';
import { createNotification } from '../lib/notifications.js';

const router = Router();

function resolveUserId(id) {
  return prisma.userProfile.findUnique({ where: { id } }).then((p) => p?.userId ?? id);
}

router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const { to_user_id, from_user_id, status } = req.query;
    const where = {};
    if (to_user_id) {
      const uid = await resolveUserId(to_user_id);
      if (uid !== req.userId) return res.status(403).json({ error: 'Forbidden' });
      where.toUserId = uid;
    }
    if (from_user_id) {
      const uid = await resolveUserId(from_user_id);
      if (uid !== req.userId) return res.status(403).json({ error: 'Forbidden' });
      where.fromUserId = uid;
    }
    if (status) where.status = status;
    const list = await prisma.friendRequest.findMany({ where });
    res.json(
      list.map((r) => ({
        id: r.id,
        from_user_id: r.fromUserId,
        to_user_id: r.toUserId,
        status: r.status,
        created_date: r.createdAt
      }))
    );
  } catch (err) {
    next(err);
  }
});

router.get('/filter', authenticateToken, async (req, res, next) => {
  try {
    const { to_user_id, from_user_id, status } = req.query;
    const where = {};
    if (to_user_id) {
      const uid = await resolveUserId(to_user_id);
      if (uid !== req.userId) return res.status(403).json({ error: 'Forbidden' });
      where.toUserId = uid;
    }
    if (from_user_id) {
      const uid = await resolveUserId(from_user_id);
      if (uid !== req.userId) return res.status(403).json({ error: 'Forbidden' });
      where.fromUserId = uid;
    }
    if (status) where.status = status;
    const list = await prisma.friendRequest.findMany({ where });
    res.json(
      list.map((r) => ({
        id: r.id,
        from_user_id: r.fromUserId,
        to_user_id: r.toUserId,
        status: r.status,
        created_date: r.createdAt
      }))
    );
  } catch (err) {
    next(err);
  }
});

router.post('/', authenticateToken, async (req, res, next) => {
  try {
    const schema = z.object({
      from_user_id: z.string().uuid(),
      to_user_id: z.string().uuid(),
      status: z.string().optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });
    const d = parsed.data;
    const fromUid = await resolveUserId(d.from_user_id);
    if (fromUid !== req.userId) return res.status(403).json({ error: 'Forbidden' });
    const toUid = await resolveUserId(d.to_user_id);
    const existing = await prisma.friendRequest.findUnique({
      where: {
        fromUserId_toUserId: { fromUserId: req.userId, toUserId: toUid }
      }
    });
    if (existing) return res.status(409).json({ error: 'Request already exists' });
    const r = await prisma.friendRequest.create({
      data: { fromUserId: fromUid, toUserId: toUid, status: d.status || 'pending' }
    });

    const fromUser = await prisma.user.findUnique({ where: { id: fromUid }, select: { fullName: true } }).catch(() => null);
    const fromName = fromUser?.fullName || 'Someone';
    await createNotification({
      userId: toUid,
      type: 'friend_request',
      title: 'New friend request',
      body: `${fromName} sent you a friend request.`,
      actionUrl: '/Friends',
    });

    res.status(201).json({ id: r.id, from_user_id: r.fromUserId, to_user_id: r.toUserId, status: r.status });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', authenticateToken, async (req, res, next) => {
  try {
    const r = await prisma.friendRequest.findUnique({ where: { id: req.params.id } });
    if (!r) return res.status(404).json({ error: 'Not found' });
    if (r.toUserId !== req.userId) return res.status(403).json({ error: 'Forbidden' });
    const schema = z.object({ status: z.enum(['accepted', 'declined']) });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });
    const updated = await prisma.friendRequest.update({
      where: { id: r.id },
      data: { status: parsed.data.status }
    });

    if (updated.status === 'accepted') {
      // Keep a durable server-side friendship list on profiles.
      const [fromProfile, toProfile] = await Promise.all([
        prisma.userProfile.findUnique({ where: { userId: updated.fromUserId } }).catch(() => null),
        prisma.userProfile.findUnique({ where: { userId: updated.toUserId } }).catch(() => null),
      ]);
      const fromFriends = new Set([...(fromProfile?.friends || []), updated.toUserId]);
      const toFriends = new Set([...(toProfile?.friends || []), updated.fromUserId]);
      await Promise.all([
        prisma.userProfile.upsert({
          where: { userId: updated.fromUserId },
          create: { userId: updated.fromUserId, friends: [...fromFriends] },
          update: { friends: [...fromFriends] },
        }),
        prisma.userProfile.upsert({
          where: { userId: updated.toUserId },
          create: { userId: updated.toUserId, friends: [...toFriends] },
          update: { friends: [...toFriends] },
        }),
      ]);

      const toUser = await prisma.user.findUnique({ where: { id: updated.toUserId }, select: { fullName: true } }).catch(() => null);
      const toName = toUser?.fullName || 'Someone';
      await createNotification({
        userId: updated.fromUserId,
        type: 'friend_request',
        title: 'Friend request accepted',
        body: `${toName} accepted your friend request.`,
        actionUrl: '/Friends',
      });
    }

    res.json({ id: updated.id, status: updated.status });
  } catch (err) {
    next(err);
  }
});

export default router;
