import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

function isUniqueConstraint(err) {
  return err?.code === 'P2002';
}

function tableMemberIds(table) {
  const members = Array.isArray(table?.members) ? table.members : [];
  const ids = new Set();
  for (const m of members) {
    const uid = m?.user_id || m?.userId;
    if (uid) ids.add(uid);
  }
  return ids;
}

router.post('/', authenticateToken, async (req, res, next) => {
  try {
    const schema = z.object({
      ratee_user_id: z.string().min(1),
      score: z.number().int().min(1).max(5),
      message: z.string().max(2000).optional().nullable(),
      context_type: z.enum(['job', 'host_event', 'event', 'table']),
      context_id: z.string().min(1),
    });
    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });
    const d = parsed.data;
    if (d.ratee_user_id === req.userId) return res.status(400).json({ error: 'You cannot rate yourself.' });

    // Authorization: owner + participants (strict context checks)
    if (d.context_type === 'job') {
      // New job posting system
      const application = await prisma.jobApplication.findFirst({
        where: { jobPostingId: d.context_id, applicantUserId: d.ratee_user_id },
        include: { jobPosting: { include: { venue: { select: { ownerUserId: true } } } } },
      });
      if (application?.jobPosting?.venue?.ownerUserId) {
        const ownerId = application.jobPosting.venue.ownerUserId;
        const participantId = application.applicantUserId;
        const allowed = req.userId === ownerId || req.userId === participantId;
        if (!allowed) return res.status(403).json({ error: 'Forbidden' });
        if (application.status !== 'HIRED') return res.status(400).json({ error: 'Only hired workers can be rated.' });
        if (!application.completedAt) return res.status(400).json({ error: 'Rating is only available after completion.' });
      } else {
        // Legacy Job model fallback
        const job = await prisma.job.findFirst({ where: { id: d.context_id, deletedAt: null } });
        if (!job) return res.status(404).json({ error: 'Job not found' });
        let ownerId = null;
        if (job.venueId) {
          const venue = await prisma.venue.findFirst({ where: { id: job.venueId, deletedAt: null } });
          ownerId = venue?.ownerUserId || null;
        } else if (job.hostEventId) {
          const he = await prisma.hostEvent.findFirst({ where: { id: job.hostEventId, deletedAt: null } });
          ownerId = he?.hostUserId || null;
        }
        if (!ownerId) return res.status(403).json({ error: 'Forbidden' });
        const apps = Array.isArray(job.applicants) ? job.applicants : [];
        const app = apps.find((a) => a && typeof a === 'object' && a.user_account_id === d.ratee_user_id);
        if (!app) return res.status(400).json({ error: 'User did not apply for this job.' });
        const participantId = app.user_account_id;
        const allowed = req.userId === ownerId || req.userId === participantId;
        if (!allowed) return res.status(403).json({ error: 'Forbidden' });
        if ((app.status || 'pending') !== 'accepted') return res.status(400).json({ error: 'Only accepted workers can be rated.' });
        if (!app.work_completed_at) return res.status(400).json({ error: 'Rating is only available after the job is marked completed.' });
      }
    } else if (d.context_type === 'host_event') {
      const he = await prisma.hostEvent.findFirst({ where: { id: d.context_id, deletedAt: null } });
      if (!he) return res.status(404).json({ error: 'Host event not found' });
      if (he.hostUserId !== req.userId && he.hostUserId !== d.ratee_user_id) {
        return res.status(403).json({ error: 'Forbidden' });
      }
      const ev = await prisma.event.findFirst({
        where: { id: d.context_id, deletedAt: null },
        select: { status: true, date: true },
      });
      if (ev && (ev.status !== 'published' || new Date(ev.date) > new Date())) {
        return res.status(400).json({ error: 'Ratings are only available after the event.' });
      }
    } else if (d.context_type === 'event') {
      const ev = await prisma.event.findFirst({ where: { id: d.context_id, deletedAt: null } });
      if (!ev) return res.status(404).json({ error: 'Event not found' });
      const venue = await prisma.venue.findFirst({ where: { id: ev.venueId, deletedAt: null } });
      const attendance = await prisma.eventAttendance.findFirst({
        where: { eventId: ev.id, userId: req.userId, checkedIn: true },
        select: { id: true },
      });
      const allowed = venue?.ownerUserId === req.userId || !!attendance;
      if (!allowed) return res.status(403).json({ error: 'Forbidden' });
      if (new Date(ev.date) > new Date()) return res.status(400).json({ error: 'Ratings are only available after the event.' });
    } else if (d.context_type === 'table') {
      const table = await prisma.table.findFirst({ where: { id: d.context_id, deletedAt: null } });
      if (!table) return res.status(404).json({ error: 'Table not found' });
      const memberIds = tableMemberIds(table);
      const isParticipant = memberIds.has(req.userId);
      const allowed = table.hostUserId === req.userId || isParticipant;
      if (!allowed) return res.status(403).json({ error: 'Forbidden' });
      if (table.status !== 'closed') return res.status(400).json({ error: 'Table ratings are only available after closure.' });
      if (!memberIds.has(d.ratee_user_id) && d.ratee_user_id !== table.hostUserId) {
        return res.status(400).json({ error: 'Ratee is not part of this table.' });
      }
    }

    const existing = await prisma.serviceRating.findFirst({
      where: {
        raterUserId: req.userId,
        rateeUserId: d.ratee_user_id,
        contextType: d.context_type,
        contextId: d.context_id,
      },
      select: { id: true },
    });
    if (existing) return res.status(409).json({ error: 'You already rated this promoter for this context.' });

    try {
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
    } catch (err) {
      if (isUniqueConstraint(err)) {
        return res.status(409).json({ error: 'You already rated this promoter for this context.' });
      }
      throw err;
    }

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

