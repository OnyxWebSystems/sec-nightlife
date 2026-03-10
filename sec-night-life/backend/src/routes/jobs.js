import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticateToken, optionalAuth } from '../middleware/auth.js';
import { applyJobVenueIsolation, canAccessVenue } from '../lib/access.js';

const router = Router();

router.get('/', optionalAuth, async (req, res, next) => {
  try {
    const where = { deletedAt: null };
    if (req.query.status) where.status = req.query.status;
    if (req.query.venue_id) where.venueId = req.query.venue_id;
    if (req.userId && req.userRole === 'VENUE') {
      const ok = await canAccessVenue(req.query.venue_id, req.userId, req.userRole);
      if (!ok && req.query.venue_id) return res.status(403).json({ error: 'Forbidden' });
      await applyJobVenueIsolation(where, req.userId, req.userRole, req.query.venue_id || null);
    }
    const jobs = await prisma.job.findMany({
      where,
      take: Math.min(parseInt(req.query.limit) || 100, 100)
    });
    res.json(jobs.map(j => ({
      id: j.id, title: j.title, venue_id: j.venueId, event_id: j.eventId,
      status: j.status, job_type: j.jobType, spots_available: j.spotsAvailable,
      spots_filled: j.spotsFilled, city: j.city,
      description: j.description, suggested_pay_amount: j.suggestedPayAmount,
      suggested_pay_type: j.suggestedPayType, start_time: j.startTime, end_time: j.endTime,
      contact_details: j.contactDetails, date: j.date,
      created_date: j.createdAt.toISOString()
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
    if (req.userId && req.userRole === 'VENUE') {
      const ok = await canAccessVenue(req.query.venue_id, req.userId, req.userRole);
      if (!ok && req.query.venue_id) return res.status(403).json({ error: 'Forbidden' });
      await applyJobVenueIsolation(where, req.userId, req.userRole, req.query.venue_id || null);
    }
    const jobs = await prisma.job.findMany({ where });
    res.json(jobs.map(j => ({
      id: j.id, title: j.title, venue_id: j.venueId, event_id: j.eventId,
      status: j.status, job_type: j.jobType, spots_available: j.spotsAvailable,
      spots_filled: j.spotsFilled, city: j.city,
      description: j.description, suggested_pay_amount: j.suggestedPayAmount,
      suggested_pay_type: j.suggestedPayType, start_time: j.startTime, end_time: j.endTime,
      contact_details: j.contactDetails, date: j.date,
      created_date: j.createdAt.toISOString()
    })));
  } catch (err) {
    next(err);
  }
});

router.post('/', authenticateToken, async (req, res, next) => {
  try {
    const schema = z.object({
      venue_id: z.string().uuid(),
      event_id: z.string().uuid().optional().nullable(),
      title: z.string().min(1),
      job_type: z.string().min(1),
      spots_available: z.number().int().min(1),
      city: z.string().min(1),
      description: z.string().optional().nullable(),
      suggested_pay_amount: z.number().int().optional().nullable(),
      suggested_pay_type: z.string().optional().nullable(),
      start_time: z.string().optional().nullable(),
      end_time: z.string().optional().nullable(),
      contact_details: z.string().optional().nullable(),
      date: z.string().optional().nullable(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    const d = parsed.data;
    const venue = await prisma.venue.findFirst({ where: { id: d.venue_id, deletedAt: null } });
    if (!venue || venue.ownerUserId !== req.userId) return res.status(403).json({ error: 'Not authorized' });
    const job = await prisma.job.create({
      data: {
        venueId: d.venue_id,
        eventId: d.event_id || null,
        title: d.title,
        jobType: d.job_type,
        spotsAvailable: d.spots_available,
        city: d.city,
        description: d.description || null,
        suggestedPayAmount: d.suggested_pay_amount ?? null,
        suggestedPayType: d.suggested_pay_type || null,
        startTime: d.start_time || null,
        endTime: d.end_time || null,
        contactDetails: d.contact_details || null,
        date: d.date || null,
      }
    });
    res.status(201).json({ id: job.id, title: job.title });
  } catch (err) {
    next(err);
  }
});

export default router;
