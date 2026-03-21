import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

router.post('/', authenticateToken, async (req, res, next) => {
  try {
    const schema = z.object({
      ratee_user_id: z.string().min(1),
      score: z.number().int().min(1).max(5),
      message: z.string().max(2000).optional().nullable(),
      context_type: z.enum(['job', 'host_event', 'event']),
      context_id: z.string().min(1),
    });
    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });
    const d = parsed.data;

    // Authorization: only the owner of the context can rate
    if (d.context_type === 'job') {
      const job = await prisma.job.findFirst({ where: { id: d.context_id, deletedAt: null } });
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

      // Must be after work completion (not during application)
      const apps = Array.isArray(job.applicants) ? job.applicants : [];
      const app = apps.find((a) => a && typeof a === 'object' && a.user_account_id === d.ratee_user_id);
      if (!app) return res.status(400).json({ error: 'User did not apply for this job.' });
      if ((app.status || 'pending') !== 'accepted') return res.status(400).json({ error: 'Only accepted workers can be rated.' });
      if (!app.work_completed_at) return res.status(400).json({ error: 'Rating is only available after the job is marked completed.' });
    } else if (d.context_type === 'host_event') {
      const he = await prisma.hostEvent.findFirst({ where: { id: d.context_id, deletedAt: null } });
      if (!he) return res.status(404).json({ error: 'Host event not found' });
      if (he.hostUserId !== req.userId) return res.status(403).json({ error: 'Forbidden' });
    } else if (d.context_type === 'event') {
      const ev = await prisma.event.findFirst({ where: { id: d.context_id, deletedAt: null } });
      if (!ev) return res.status(404).json({ error: 'Event not found' });
      // venue-owned events only (for now)
      const venue = await prisma.venue.findFirst({ where: { id: ev.venueId, deletedAt: null } });
      if (!venue || venue.ownerUserId !== req.userId) return res.status(403).json({ error: 'Forbidden' });
    }

    await prisma.serviceRating.create({
      data: {
        raterUserId: req.userId,
        rateeUserId: d.ratee_user_id,
        contextType: d.context_type,
        contextId: d.context_id,
        score: d.score,
        message: d.message || null,
      }
    });

    // Update aggregates on user profile (if profile exists)
    const profile = await prisma.userProfile.findUnique({ where: { userId: d.ratee_user_id } });
    if (profile) {
      const nextCount = (profile.serviceRatingCount || 0) + 1;
      const nextAvg = ((profile.serviceRatingAvg || 0) * (profile.serviceRatingCount || 0) + d.score) / nextCount;
      await prisma.userProfile.update({
        where: { userId: d.ratee_user_id },
        data: { serviceRatingCount: nextCount, serviceRatingAvg: nextAvg }
      });
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

export default router;

