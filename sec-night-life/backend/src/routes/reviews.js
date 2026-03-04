import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const { venue_id, user_id } = req.query;
    const where = {};
    if (venue_id) where.venueId = venue_id;
    if (user_id) where.userId = user_id;
    const list = await prisma.venueReview.findMany({ where });
    res.json(
      list.map((r) => ({
        id: r.id,
        venue_id: r.venueId,
        event_id: r.eventId,
        user_id: r.userId,
        rating: r.rating,
        review_text: r.comment,
        created_date: r.createdAt,
        atmosphere_rating: r.metadata?.atmosphere_rating,
        service_rating: r.metadata?.service_rating,
        value_rating: r.metadata?.value_rating,
        verified_attendance: r.metadata?.verified_attendance
      }))
    );
  } catch (err) {
    next(err);
  }
});

router.get('/filter', authenticateToken, async (req, res, next) => {
  try {
    const { venue_id, user_id } = req.query;
    const where = {};
    if (venue_id) where.venueId = venue_id;
    if (user_id) where.userId = user_id;
    const list = await prisma.venueReview.findMany({ where });
    res.json(
      list.map((r) => ({
        id: r.id,
        venue_id: r.venueId,
        event_id: r.eventId,
        user_id: r.userId,
        rating: r.rating,
        review_text: r.comment,
        created_date: r.createdAt,
        atmosphere_rating: r.metadata?.atmosphere_rating,
        service_rating: r.metadata?.service_rating,
        value_rating: r.metadata?.value_rating,
        verified_attendance: r.metadata?.verified_attendance
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
      rating: z.number().int().min(1).max(5),
      review_text: z.string().optional(),
      atmosphere_rating: z.number().optional(),
      service_rating: z.number().optional(),
      value_rating: z.number().optional()
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });
    const d = parsed.data;
    if (d.user_id !== req.userId) return res.status(403).json({ error: 'Forbidden' });
    if (!d.venue_id && !d.event_id) return res.status(400).json({ error: 'venue_id or event_id required' });
    let venueId = d.venue_id;
    if (!venueId && d.event_id) {
      const ev = await prisma.event.findUnique({ where: { id: d.event_id } });
      if (ev) venueId = ev.venueId;
    }
    if (!venueId) return res.status(400).json({ error: 'Could not resolve venue' });
    const metadata = {};
    if (d.atmosphere_rating != null) metadata.atmosphere_rating = d.atmosphere_rating;
    if (d.service_rating != null) metadata.service_rating = d.service_rating;
    if (d.value_rating != null) metadata.value_rating = d.value_rating;
    const r = await prisma.venueReview.create({
      data: {
        venueId,
        eventId: d.event_id,
        userId: d.user_id,
        rating: d.rating,
        comment: d.review_text,
        metadata: Object.keys(metadata).length ? metadata : undefined
      }
    });
    res.status(201).json({ id: r.id });
  } catch (err) {
    next(err);
  }
});

export default router;
