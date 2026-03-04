import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticateToken } from '../middleware/auth.js';
import { canAccessVenue } from '../lib/access.js';

const router = Router();

async function resolveUserId(id) {
  const p = await prisma.userProfile.findUnique({ where: { id } });
  return p?.userId ?? id;
}

router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const { user_id, venue_id, type, status } = req.query;
    const where = {};
    if (user_id) {
      const uid = await resolveUserId(user_id);
      if (uid !== req.userId) return res.status(403).json({ error: 'Forbidden' });
      where.userId = uid;
    }
    if (venue_id) {
      const ok = await canAccessVenue(venue_id, req.userId, req.userRole);
      if (!ok) return res.status(403).json({ error: 'Forbidden' });
      where.venueId = venue_id;
    }
    if (type) where.type = type;
    if (status) where.status = status;
    const list = await prisma.transaction.findMany({
      where,
      orderBy: { createdAt: 'desc' }
    });
    res.json(
      list.map((t) => ({
        id: t.id,
        user_id: t.userId,
        venue_id: t.venueId,
        event_id: t.eventId,
        amount: t.amount,
        type: t.type,
        status: t.status,
        description: t.metadata?.description,
        created_date: t.createdAt
      }))
    );
  } catch (err) {
    next(err);
  }
});

router.get('/filter', authenticateToken, async (req, res, next) => {
  try {
    const { user_id, venue_id, type, status } = req.query;
    const where = {};
    if (user_id) {
      const uid = await resolveUserId(user_id);
      if (uid !== req.userId) return res.status(403).json({ error: 'Forbidden' });
      where.userId = uid;
    }
    if (venue_id) {
      const ok = await canAccessVenue(venue_id, req.userId, req.userRole);
      if (!ok) return res.status(403).json({ error: 'Forbidden' });
      where.venueId = venue_id;
    }
    if (type) where.type = type;
    if (status) where.status = status;
    const list = await prisma.transaction.findMany({ where });
    res.json(
      list.map((t) => ({
        id: t.id,
        user_id: t.userId,
        venue_id: t.venueId,
        event_id: t.eventId,
        amount: t.amount,
        type: t.type,
        status: t.status,
        created_date: t.createdAt
      }))
    );
  } catch (err) {
    next(err);
  }
});

router.post('/', authenticateToken, async (req, res, next) => {
  try {
    const schema = z.object({
      user_id: z.string().uuid(),
      venue_id: z.string().uuid().optional(),
      event_id: z.string().uuid().optional(),
      amount: z.number(),
      type: z.string(),
      status: z.string().optional(),
      description: z.string().optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });
    const d = parsed.data;
    if (d.user_id !== req.userId) return res.status(403).json({ error: 'Forbidden' });
    const t = await prisma.transaction.create({
      data: {
        userId: d.user_id,
        venueId: d.venue_id,
        eventId: d.event_id,
        amount: d.amount,
        type: d.type,
        status: d.status || 'pending',
        metadata: d.description ? { description: d.description } : {}
      }
    });
    res.status(201).json({ id: t.id });
  } catch (err) {
    next(err);
  }
});

export default router;
