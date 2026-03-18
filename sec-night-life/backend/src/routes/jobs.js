import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticateToken, optionalAuth } from '../middleware/auth.js';
import { applyJobVenueIsolation, canAccessVenue } from '../lib/access.js';

const router = Router();

function formatJob(j) {
  return {
    id: j.id,
    title: j.title,
    venue_id: j.venueId,
    event_id: j.eventId,
    status: j.status,
    job_type: j.jobType,
    spots_available: j.spotsAvailable,
    spots_filled: j.spotsFilled,
    city: j.city,
    description: j.description,
    suggested_pay_amount: j.suggestedPayAmount,
    suggested_pay_type: j.suggestedPayType,
    start_time: j.startTime,
    end_time: j.endTime,
    contact_details: j.contactDetails,
    date: j.date,
    applicants: j.applicants ?? [],
    created_date: j.createdAt.toISOString(),
  };
}

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
    res.json(jobs.map(formatJob));
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
    res.json(jobs.map(formatJob));
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
        applicants: [],
      }
    });
    res.status(201).json({ id: job.id, title: job.title });
  } catch (err) {
    next(err);
  }
});

// Apply to a job (Party Goer flow)
router.post('/:id/apply', authenticateToken, async (req, res, next) => {
  try {
    const schema = z.object({ message: z.string().max(2000).optional().nullable() });
    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });

    const job = await prisma.job.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const profile = await prisma.userProfile.findUnique({ where: { userId: req.userId } });
    if (!profile) return res.status(400).json({ error: 'Please complete your profile before applying.' });

    const applicants = Array.isArray(job.applicants) ? job.applicants : [];
    const already = applicants.some((a) => a && typeof a === 'object' && a.user_account_id === req.userId);
    if (already) return res.status(409).json({ error: 'You already applied for this job.' });

    const nextApplicants = [
      ...applicants,
      {
        user_account_id: req.userId,
        user_profile_id: profile.id,
        status: 'pending',
        applied_at: new Date().toISOString(),
        message: parsed.data.message || '',
      },
    ];

    await prisma.job.update({
      where: { id: job.id },
      data: { applicants: nextApplicants },
    });

    // Notify business owner
    try {
      const venue = await prisma.venue.findFirst({ where: { id: job.venueId, deletedAt: null } });
      if (venue?.ownerUserId) {
        await prisma.notification.create({
          data: {
            userId: venue.ownerUserId,
            type: 'job_application',
            title: 'New Job Application',
            message: `${profile.username || 'Someone'} applied for “${job.title}”`,
            data: { job_id: job.id, applicant_user_id: req.userId, applicant_profile_id: profile.id },
            actionUrl: `/JobDetails?id=${job.id}`,
          },
        });
      }
    } catch {}

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;
