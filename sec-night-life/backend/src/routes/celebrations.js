import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticateToken } from '../middleware/auth.js';
import { createInAppNotification } from '../lib/inAppNotifications.js';

const router = Router();

const createSchema = z.object({
  venueId: z.string().optional().nullable(),
  eventType: z.string().trim().min(1).max(80),
  title: z.string().trim().min(1).max(120),
  description: z.string().trim().max(5000).optional().nullable(),
  guestCount: z.number().int().min(1).max(5000).optional(),
  preferredDate: z.coerce.date().optional().nullable(),
});

router.post('/', authenticateToken, async (req, res, next) => {
  try {
    const d = createSchema.parse(req.body || {});
    if (d.venueId) {
      const venue = await prisma.venue.findFirst({ where: { id: d.venueId, deletedAt: null } });
      if (!venue) return res.status(404).json({ error: 'Venue not found' });
    }
    const row = await prisma.celebrationRequest.create({
      data: {
        userId: req.userId,
        venueId: d.venueId ?? null,
        eventType: d.eventType,
        title: d.title,
        description: d.description ?? null,
        guestCount: d.guestCount ?? null,
        preferredDate: d.preferredDate ?? null,
        status: 'open',
      },
    });
    if (d.venueId) {
      const venue = await prisma.venue.findUnique({ where: { id: d.venueId }, select: { ownerUserId: true, name: true } });
      if (venue?.ownerUserId) {
        await createInAppNotification({
          userId: venue.ownerUserId,
          type: 'CELEBRATION_REQUEST',
          title: 'Private celebration inquiry',
          body: `${d.title} — review and respond from your dashboard.`,
          referenceId: row.id,
          referenceType: 'CELEBRATION',
        });
      }
    }
    res.status(201).json(row);
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: 'Invalid input' });
    next(e);
  }
});

router.get('/mine', authenticateToken, async (req, res, next) => {
  try {
    const rows = await prisma.celebrationRequest.findMany({
      where: { userId: req.userId },
      include: { venue: { select: { id: true, name: true, city: true } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json(rows);
  } catch (e) {
    next(e);
  }
});

export default router;
