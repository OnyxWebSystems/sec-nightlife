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
    host_event_id: j.hostEventId,
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
      venue_id: z.string().uuid().optional().nullable(),
      event_id: z.string().uuid().optional().nullable(),
      host_event_id: z.string().uuid().optional().nullable(),
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
    if (!d.venue_id && !d.host_event_id) return res.status(400).json({ error: 'Missing venue_id or host_event_id' });
    if (d.venue_id && d.host_event_id) return res.status(400).json({ error: 'Choose either venue_id or host_event_id (not both)' });

    if (d.venue_id) {
      const venue = await prisma.venue.findFirst({ where: { id: d.venue_id, deletedAt: null } });
      if (!venue || venue.ownerUserId !== req.userId) return res.status(403).json({ error: 'Not authorized' });
    }
    if (d.host_event_id) {
      const he = await prisma.hostEvent.findFirst({ where: { id: d.host_event_id, deletedAt: null } });
      if (!he || he.hostUserId !== req.userId) return res.status(403).json({ error: 'Not authorized' });
    }
    const job = await prisma.job.create({
      data: {
        venueId: d.venue_id || null,
        eventId: d.event_id || null,
        hostEventId: d.host_event_id || null,
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
    const schema = z.object({
      message: z.string().max(2000).optional().nullable(),
      resume_url: z.string().url().optional().nullable(),
    });
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
        resume_url: parsed.data.resume_url || '',
        employer_message: '',
      },
    ];

    await prisma.job.update({
      where: { id: job.id },
      data: { applicants: nextApplicants },
    });

    // Notify job owner (venue owner or host event owner)
    try {
      if (job.venueId) {
        const venue = await prisma.venue.findFirst({ where: { id: job.venueId, deletedAt: null } });
        if (venue?.ownerUserId) {
          await prisma.notification.create({
            data: {
              userId: venue.ownerUserId,
              type: 'job_application',
              title: 'New Job Application',
              body: `${profile.username || 'Someone'} applied for “${job.title}”`,
              data: { job_id: job.id, applicant_user_id: req.userId, applicant_profile_id: profile.id },
              actionUrl: `/JobDetails?id=${job.id}`,
            },
          });
        }
      } else if (job.hostEventId) {
        const he = await prisma.hostEvent.findFirst({ where: { id: job.hostEventId, deletedAt: null } });
        if (he?.hostUserId) {
          await prisma.notification.create({
            data: {
              userId: he.hostUserId,
              type: 'job_application',
              title: 'New Job Application',
              body: `${profile.username || 'Someone'} applied for “${job.title}”`,
              data: { job_id: job.id, applicant_user_id: req.userId, applicant_profile_id: profile.id },
              actionUrl: `/JobDetails?id=${job.id}`,
            },
          });
        }
      }
    } catch {}

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// Applicant: list my applications (for tracking status)
router.get('/applications/me', authenticateToken, async (req, res, next) => {
  try {
    const profile = await prisma.userProfile.findUnique({ where: { userId: req.userId } });
    if (!profile) return res.json([]);

    const jobs = await prisma.job.findMany({
      where: { deletedAt: null },
      select: { id: true, title: true, venueId: true, applicants: true, createdAt: true }
    });
    const out = [];
    for (const j of jobs) {
      const apps = Array.isArray(j.applicants) ? j.applicants : [];
      const mine = apps.find((a) => a && typeof a === 'object' && a.user_profile_id === profile.id);
      if (mine) {
        out.push({
          job_id: j.id,
          title: j.title,
          venue_id: j.venueId,
          status: mine.status || 'pending',
          applied_at: mine.applied_at,
          message: mine.message || '',
          resume_url: mine.resume_url || '',
          employer_message: mine.employer_message || '',
        });
      }
    }
    res.json(out);
  } catch (err) {
    next(err);
  }
});

// Employer: list applications for a job (venue owner only)
router.get('/:id/applications', authenticateToken, async (req, res, next) => {
  try {
    const job = await prisma.job.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (job.venueId) {
      const venue = await prisma.venue.findFirst({ where: { id: job.venueId, deletedAt: null } });
      if (!venue || venue.ownerUserId !== req.userId) return res.status(403).json({ error: 'Forbidden' });
    } else if (job.hostEventId) {
      const he = await prisma.hostEvent.findFirst({ where: { id: job.hostEventId, deletedAt: null } });
      if (!he || he.hostUserId !== req.userId) return res.status(403).json({ error: 'Forbidden' });
    } else {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const apps = Array.isArray(job.applicants) ? job.applicants : [];
    const profileIds = apps.map((a) => a?.user_profile_id).filter(Boolean);
    const profiles = await prisma.userProfile.findMany({ where: { id: { in: profileIds } } });

    res.json(apps.map((a) => {
      const p = profiles.find((x) => x.id === a.user_profile_id);
      return {
        user_profile_id: a.user_profile_id,
        user_account_id: a.user_account_id,
        username: p?.username,
        full_name: null,
        avatar_url: p?.avatarUrl,
        city: p?.city,
        service_rating_avg: p?.serviceRatingAvg ?? 0,
        service_rating_count: p?.serviceRatingCount ?? 0,
        status: a.status || 'pending',
        applied_at: a.applied_at,
        message: a.message || '',
        resume_url: a.resume_url || '',
        employer_message: a.employer_message || '',
      };
    }));
  } catch (err) {
    next(err);
  }
});

// Employer: update application status + message (accept/reject)
router.patch('/:id/applications/:profileId', authenticateToken, async (req, res, next) => {
  try {
    const schema = z.object({
      status: z.enum(['pending', 'accepted', 'rejected']),
      employer_message: z.string().max(2000).optional().nullable(),
    });
    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });

    const job = await prisma.job.findFirst({ where: { id: req.params.id, deletedAt: null } });
    if (!job) return res.status(404).json({ error: 'Job not found' });
    if (job.venueId) {
      const venue = await prisma.venue.findFirst({ where: { id: job.venueId, deletedAt: null } });
      if (!venue || venue.ownerUserId !== req.userId) return res.status(403).json({ error: 'Forbidden' });
    } else if (job.hostEventId) {
      const he = await prisma.hostEvent.findFirst({ where: { id: job.hostEventId, deletedAt: null } });
      if (!he || he.hostUserId !== req.userId) return res.status(403).json({ error: 'Forbidden' });
    } else {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const apps = Array.isArray(job.applicants) ? job.applicants : [];
    const idx = apps.findIndex((a) => a && typeof a === 'object' && a.user_profile_id === req.params.profileId);
    if (idx === -1) return res.status(404).json({ error: 'Application not found' });

    const updated = { ...apps[idx], status: parsed.data.status, employer_message: parsed.data.employer_message || '' };
    const nextApps = [...apps];
    nextApps[idx] = updated;

    await prisma.job.update({ where: { id: job.id }, data: { applicants: nextApps } });

    // Notify applicant
    try {
      if (updated.user_account_id) {
        await prisma.notification.create({
          data: {
            userId: updated.user_account_id,
            type: 'job_application_update',
            title: `Application ${parsed.data.status}`,
            body: parsed.data.employer_message || `Your application for “${job.title}” is now ${parsed.data.status}.`,
            data: { job_id: job.id, venue_id: job.venueId },
            actionUrl: `/MyJobApplications`,
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
