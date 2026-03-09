import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticateToken, optionalAuth } from '../middleware/auth.js';
import { applyEventVenueIsolation, canAccessVenue, isStaff } from '../lib/access.js';

const router = Router();
const eventSchema = z.object({
  venue_id: z.string().uuid(),
  title: z.string().min(1).max(300),
  description: z.string().optional(),
  date: z.string(),
  city: z.string().min(1),
  status: z.enum(['draft', 'published']).default('draft'),
  is_featured: z.boolean().optional(),
  cover_image_url: z.string().url().optional().nullable(),
  banner_url: z.string().url().optional().nullable(),
  ticket_tiers: z.any().optional()
});

router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const where = { deletedAt: null };
    if (req.query.status) where.status = req.query.status;
    if (req.query.venue_id) where.venueId = req.query.venue_id;
    if (req.query.city) where.city = String(req.query.city);
    if (req.userId && req.userRole === 'VENUE') {
      const ok = await canAccessVenue(req.query.venue_id, req.userId, req.userRole);
      if (!ok && req.query.venue_id) return res.status(403).json({ error: 'Forbidden' });
      await applyEventVenueIsolation(where, req.userId, req.userRole, req.query.venue_id || null);
    }
    const events = await prisma.event.findMany({
      where,
      orderBy: { date: req.query.sort === '-date' ? 'desc' : 'asc' },
      take: Math.min(parseInt(req.query.limit) || 50, 100)
    });
    res.json(events.map(e => ({
      id: e.id, title: e.title, date: e.date.toISOString().slice(0, 10),
      city: e.city, venue_id: e.venueId, status: e.status, is_featured: e.isFeatured,
      cover_image_url: e.coverImageUrl, ticket_tiers: e.ticketTiers
    })));
  } catch (err) {
    next(err);
  }
});

router.get('/filter', optionalAuth, async (req, res, next) => {
  try {
    const where = { deletedAt: null };
    if (req.query.id) where.id = req.query.id;
    if (req.query.venue_id) where.venueId = req.query.venue_id;
    if (req.query.status) where.status = req.query.status;
    if (req.userId && req.userRole === 'VENUE') {
      const ok = await canAccessVenue(req.query.venue_id, req.userId, req.userRole);
      if (!ok && req.query.venue_id) return res.status(403).json({ error: 'Forbidden' });
      await applyEventVenueIsolation(where, req.userId, req.userRole, req.query.venue_id || null);
    }
    const events = await prisma.event.findMany({ where });
    res.json(events.map(e => ({
      id: e.id, title: e.title, date: e.date.toISOString().slice(0, 10),
      city: e.city, venue_id: e.venueId, status: e.status, cover_image_url: e.coverImageUrl,
      ticket_tiers: e.ticketTiers
    })));
  } catch (err) {
    next(err);
  }
});

router.get('/:id', optionalAuth, async (req, res, next) => {
  try {
    const event = await prisma.event.findFirst({
      where: { id: req.params.id, deletedAt: null },
      include: { venue: true }
    });
    if (!event) return res.status(404).json({ error: 'Event not found' });
    if (event.status === 'draft' && req.userId) {
      if (event.venue.ownerUserId !== req.userId && !isStaff(req.userRole)) {
        return res.status(403).json({ error: 'Forbidden' });
      }
    }
    res.json({
      id: event.id, title: event.title, description: event.description,
      date: event.date.toISOString().slice(0, 10), city: event.city, venue_id: event.venueId,
      status: event.status, is_featured: event.isFeatured,
      cover_image_url: event.coverImageUrl, banner_url: event.bannerUrl,
      ticket_tiers: event.ticketTiers
    });
  } catch (err) {
    next(err);
  }
});

router.post('/', authenticateToken, async (req, res, next) => {
  try {
    const parsed = eventSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });
    const d = parsed.data;
    const venue = await prisma.venue.findFirst({ where: { id: d.venue_id, deletedAt: null } });
    if (!venue || venue.ownerUserId !== req.userId) return res.status(403).json({ error: 'Not authorized' });
    const event = await prisma.event.create({
      data: {
        venueId: d.venue_id, title: d.title, description: d.description,
        date: new Date(d.date), city: d.city, status: d.status,
        isFeatured: d.is_featured ?? false, coverImageUrl: d.cover_image_url,
        bannerUrl: d.banner_url, ticketTiers: d.ticket_tiers
      }
    });
    res.status(201).json({ id: event.id, title: event.title, venue_id: event.venueId });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', authenticateToken, async (req, res, next) => {
  try {
    const event = await prisma.event.findFirst({
      where: { id: req.params.id, deletedAt: null },
      include: { venue: true }
    });
    if (!event || (event.venue.ownerUserId !== req.userId && !isStaff(req.userRole))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    const parsed = eventSchema.partial().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });
    const d = parsed.data;
    const updates = {};
    if (d.title != null) updates.title = d.title;
    if (d.description != null) updates.description = d.description;
    if (d.date != null) updates.date = new Date(d.date);
    if (d.city != null) updates.city = d.city;
    if (d.status != null) updates.status = d.status;
    if (d.cover_image_url !== undefined) updates.coverImageUrl = d.cover_image_url;
    if (d.banner_url !== undefined) updates.bannerUrl = d.banner_url;
    if (d.ticket_tiers != null) updates.ticketTiers = d.ticket_tiers;
    const updated = await prisma.event.update({ where: { id: event.id }, data: updates });
    res.json({ id: updated.id, status: updated.status });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', authenticateToken, async (req, res, next) => {
  try {
    const event = await prisma.event.findFirst({
      where: { id: req.params.id, deletedAt: null },
      include: { venue: true }
    });
    if (!event || (event.venue.ownerUserId !== req.userId && !isStaff(req.userRole))) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    await prisma.event.update({
      where: { id: event.id },
      data: { deletedAt: new Date() }
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
