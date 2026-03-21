import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticateToken, optionalAuth } from '../middleware/auth.js';

const router = Router();

function formatPromotion(p) {
  return {
    id: p.id,
    venue_id: p.venueId,
    type: p.type,
    title: p.title,
    description: p.description,
    status: p.status,
    start_at: p.startAt,
    end_at: p.endAt,
    boost_status: p.boostStatus,
    boost_ref: p.boostRef,
    boost_paid_at: p.boostPaidAt,
    created_at: p.createdAt,
  };
}

// Public list (published promotions) - optional venue filter
router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const where = { deletedAt: null, status: 'published' };
    if (req.query.venue_id) where.venueId = req.query.venue_id;
    const list = await prisma.promotion.findMany({
      where,
      orderBy: [{ boostStatus: 'desc' }, { createdAt: 'desc' }],
      take: Math.min(parseInt(req.query.limit) || 50, 100),
    });
    res.json(list.map(formatPromotion));
  } catch (err) {
    next(err);
  }
});

// Owner list for a venue (includes drafts)
router.get('/owner', authenticateToken, async (req, res, next) => {
  try {
    const venueId = req.query.venue_id;
    if (!venueId) return res.status(400).json({ error: 'venue_id required' });
    const venue = await prisma.venue.findFirst({ where: { id: venueId, deletedAt: null } });
    if (!venue || venue.ownerUserId !== req.userId) return res.status(403).json({ error: 'Forbidden' });
    const list = await prisma.promotion.findMany({
      where: { venueId, deletedAt: null },
      orderBy: { createdAt: 'desc' },
      take: 100
    });
    res.json(list.map(formatPromotion));
  } catch (err) {
    next(err);
  }
});

// Create or publish a promotion for a venue
router.post('/', authenticateToken, async (req, res, next) => {
  try {
    const schema = z.object({
      venue_id: z.string().uuid(),
      type: z.string().min(1),
      title: z.string().min(1).max(120),
      description: z.string().max(5000).optional().nullable(),
      status: z.enum(['draft', 'published']).optional(),
      start_at: z.string().datetime().optional().nullable(),
      end_at: z.string().datetime().optional().nullable(),
    });
    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });
    const d = parsed.data;
    const venue = await prisma.venue.findFirst({ where: { id: d.venue_id, deletedAt: null } });
    if (!venue || venue.ownerUserId !== req.userId) return res.status(403).json({ error: 'Forbidden' });

    const p = await prisma.promotion.create({
      data: {
        venueId: d.venue_id,
        type: d.type,
        title: d.title,
        description: d.description || null,
        status: d.status || 'draft',
        startAt: d.start_at ? new Date(d.start_at) : null,
        endAt: d.end_at ? new Date(d.end_at) : null,
      }
    });
    res.status(201).json(formatPromotion(p));
  } catch (err) {
    next(err);
  }
});

// Update promotion (owner only)
router.patch('/:id', authenticateToken, async (req, res, next) => {
  try {
    const schema = z.object({
      title: z.string().min(1).max(120).optional(),
      description: z.string().max(5000).optional().nullable(),
      status: z.enum(['draft', 'published', 'archived']).optional(),
      start_at: z.string().datetime().optional().nullable(),
      end_at: z.string().datetime().optional().nullable(),
      boost_status: z.enum(['none', 'pending', 'active']).optional(),
      boost_ref: z.string().optional().nullable(),
      boost_paid_at: z.string().datetime().optional().nullable(),
    });
    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });
    const d = parsed.data;

    const existing = await prisma.promotion.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!existing) return res.status(404).json({ error: 'Not found' });
    const venue = await prisma.venue.findFirst({ where: { id: existing.venueId, deletedAt: null } });
    if (!venue || venue.ownerUserId !== req.userId) return res.status(403).json({ error: 'Forbidden' });

    const updated = await prisma.promotion.update({
      where: { id: existing.id },
      data: {
        title: d.title ?? undefined,
        description: d.description === undefined ? undefined : d.description,
        status: d.status ?? undefined,
        startAt: d.start_at === undefined ? undefined : (d.start_at ? new Date(d.start_at) : null),
        endAt: d.end_at === undefined ? undefined : (d.end_at ? new Date(d.end_at) : null),
        boostStatus: d.boost_status ?? undefined,
        boostRef: d.boost_ref === undefined ? undefined : d.boost_ref,
        boostPaidAt: d.boost_paid_at === undefined ? undefined : (d.boost_paid_at ? new Date(d.boost_paid_at) : null),
      }
    });
    res.json(formatPromotion(updated));
  } catch (err) {
    next(err);
  }
});

export default router;

