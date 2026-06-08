import { Router } from 'express';
import { authenticateToken, optionalAuth } from '../middleware/auth.js';
import { prisma } from '../lib/prisma.js';
import { getPromoterStatusForUser } from '../lib/leaderboard.js';

const router = Router();
const APP_BASE = (process.env.APP_URL || '').replace(/\/+$/, '');

function promoterEventShareUrl(eventId, promoterUserId) {
  const path = `/EventDetails?id=${encodeURIComponent(eventId)}&ref=${encodeURIComponent(promoterUserId)}`;
  return APP_BASE ? `${APP_BASE}${path}` : path;
}

router.get('/me/status', authenticateToken, async (req, res, next) => {
  try {
    const status = await getPromoterStatusForUser(req.userId);
    res.json(status);
  } catch (err) {
    next(err);
  }
});

router.get('/leaderboard/week', async (req, res, next) => {
  try {
    const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const rows = await prisma.promoterConversion.groupBy({
      by: ['promoterUserId'],
      where: { createdAt: { gte: since } },
      _sum: { pointsAwarded: true },
      _count: { _all: true },
      orderBy: { _sum: { pointsAwarded: 'desc' } },
      take: 5,
    });
    const userIds = rows.map((r) => r.promoterUserId);
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: {
        id: true,
        username: true,
        userProfile: { select: { avatarUrl: true, isVerifiedPromoter: true } },
      },
    });
    const userMap = new Map(users.map((u) => [u.id, u]));
    res.json({
      data: rows.map((r) => {
        const u = userMap.get(r.promoterUserId);
        return {
          promoterId: r.promoterUserId,
          username: u?.username,
          avatarUrl: u?.userProfile?.avatarUrl || null,
          isVerifiedPromoter: !!u?.userProfile?.isVerifiedPromoter,
          points: Number(r._sum.pointsAwarded || 0),
          conversions: r._count._all,
        };
      }),
    });
  } catch (err) {
    next(err);
  }
});

router.get('/me/hub', authenticateToken, async (req, res, next) => {
  try {
    const assignments = await prisma.eventPromoterAssignment.findMany({
      where: { promoterUserId: req.userId, status: 'ACTIVE' },
      include: {
        event: {
          select: {
            id: true,
            title: true,
            date: true,
            endsAt: true,
            status: true,
            eventFormat: true,
            coverImageUrl: true,
            venue: { select: { name: true, city: true } },
          },
        },
      },
      orderBy: { assignedAt: 'desc' },
    });

    const now = new Date();
    const active = [];
    const past = [];

    for (const a of assignments) {
      const ends = a.event.endsAt || a.event.date;
      const item = {
        assignmentId: a.id,
        eventId: a.event.id,
        title: a.event.title,
        date: a.event.date,
        endsAt: a.event.endsAt,
        eventFormat: a.event.eventFormat,
        coverImageUrl: a.event.coverImageUrl,
        venueName: a.event.venue?.name,
        venueCity: a.event.venue?.city,
        shareUrl: promoterEventShareUrl(a.event.id, req.userId),
        assignedAt: a.assignedAt,
      };
      if (ends && new Date(ends) < now) past.push(item);
      else active.push(item);
    }

    const conversionAgg = await prisma.promoterConversion.aggregate({
      where: { promoterUserId: req.userId },
      _count: { _all: true },
      _sum: { pointsAwarded: true },
    });

    res.json({
      active,
      past,
      stats: {
        totalConversions: conversionAgg._count._all,
        totalPoints: Number(conversionAgg._sum.pointsAwarded || 0),
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/:promoterId/promotions', optionalAuth, async (req, res, next) => {
  try {
    const { promoterId } = req.params;
    const now = new Date();

    const [assignments, conversions] = await Promise.all([
      prisma.eventPromoterAssignment.findMany({
        where: { promoterUserId: promoterId, status: { in: ['ACTIVE', 'COMPLETED'] } },
        include: {
          event: {
            select: {
              id: true,
              title: true,
              date: true,
              endsAt: true,
              coverImageUrl: true,
              eventFormat: true,
              venue: { select: { name: true, city: true } },
            },
          },
        },
        orderBy: { assignedAt: 'desc' },
        take: 50,
      }),
      prisma.promoterConversion.groupBy({
        by: ['eventId', 'conversionType'],
        where: { promoterUserId: promoterId },
        _count: { _all: true },
        _sum: { pointsAwarded: true },
      }),
    ]);

    const conversionByEvent = new Map();
    for (const row of conversions) {
      const cur = conversionByEvent.get(row.eventId) || { tickets: 0, tableHosts: 0, tableJoins: 0, points: 0 };
      if (row.conversionType === 'TICKET_PURCHASE') cur.tickets += row._count._all;
      if (row.conversionType === 'TABLE_HOST') cur.tableHosts += row._count._all;
      if (row.conversionType === 'TABLE_JOIN') cur.tableJoins += row._count._all;
      cur.points += Number(row._sum.pointsAwarded || 0);
      conversionByEvent.set(row.eventId, cur);
    }

    const current = [];
    const past = [];
    for (const a of assignments) {
      const ends = a.event.endsAt || a.event.date;
      const stats = conversionByEvent.get(a.event.id) || { tickets: 0, tableHosts: 0, tableJoins: 0, points: 0 };
      const item = {
        eventId: a.event.id,
        title: a.event.title,
        date: a.event.date,
        endsAt: a.event.endsAt,
        coverImageUrl: a.event.coverImageUrl,
        eventFormat: a.event.eventFormat,
        venueName: a.event.venue?.name,
        venueCity: a.event.venue?.city,
        assignedAt: a.assignedAt,
        stats,
      };
      if (ends && new Date(ends) < now) past.push(item);
      else current.push(item);
    }

    res.json({ current, past });
  } catch (err) {
    next(err);
  }
});

router.post('/attribution/click', optionalAuth, async (req, res, next) => {
  try {
    const { eventId, promoterUserId } = req.body || {};
    if (!eventId || !promoterUserId) return res.status(400).json({ error: 'eventId and promoterUserId required' });
    const assigned = await prisma.eventPromoterAssignment.findFirst({
      where: { eventId, promoterUserId, status: 'ACTIVE' },
      select: { id: true },
    });
    res.json({ tracked: !!assigned });
  } catch (err) {
    next(err);
  }
});

router.post('/:promoterId/follow', authenticateToken, async (req, res, next) => {
  try {
    const { promoterId } = req.params;
    if (promoterId === req.userId) return res.status(400).json({ error: 'You cannot follow yourself.' });
    const profile = await prisma.userProfile.findUnique({
      where: { userId: promoterId },
      select: { isVerifiedPromoter: true },
    });
    if (!profile?.isVerifiedPromoter) return res.status(400).json({ error: 'Only verified promoters can be followed.' });
    await prisma.promoterFollow.upsert({
      where: { userId_promoterId: { userId: req.userId, promoterId } },
      create: { userId: req.userId, promoterId },
      update: {},
    });
    res.status(201).json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.delete('/:promoterId/follow', authenticateToken, async (req, res, next) => {
  try {
    const { promoterId } = req.params;
    await prisma.promoterFollow.deleteMany({
      where: { userId: req.userId, promoterId },
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

router.get('/:promoterId/followers/count', async (req, res, next) => {
  try {
    const { promoterId } = req.params;
    const count = await prisma.promoterFollow.count({ where: { promoterId } });
    res.json({ promoterId, followers: count });
  } catch (err) {
    next(err);
  }
});

router.get('/me/following', authenticateToken, async (req, res, next) => {
  try {
    const rows = await prisma.promoterFollow.findMany({
      where: { userId: req.userId },
      select: { promoterId: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ data: rows });
  } catch (err) {
    next(err);
  }
});

router.get('/:promoterId/following-status', authenticateToken, async (req, res, next) => {
  try {
    const { promoterId } = req.params;
    const row = await prisma.promoterFollow.findUnique({
      where: { userId_promoterId: { userId: req.userId, promoterId } },
      select: { userId: true },
    });
    res.json({ following: !!row });
  } catch (err) {
    next(err);
  }
});

export default router;
