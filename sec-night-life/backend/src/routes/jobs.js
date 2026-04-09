import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticateToken, optionalAuth } from '../middleware/auth.js';
import { sendEmail } from '../lib/email.js';
import { logger } from '../lib/logger.js';
import { signCloudinaryUrl, privateDownloadUrl } from '../lib/cloudinarySignedUrl.js';

const router = Router();
const USER_HOURLY_LIMIT = 5;
const HOUR_MS = 60 * 60 * 1000;

const postingSchema = z.object({
  title: z.string().trim().min(1),
  description: z.string().trim().min(1),
  requirements: z.string().trim().min(1),
  jobType: z.enum(['FULL_TIME', 'PART_TIME', 'ONCE_OFF', 'CONTRACT']),
  compensationType: z.enum(['FIXED', 'NEGOTIABLE', 'UNPAID_TRIAL']),
  compensationAmount: z.number().nonnegative().optional().nullable(),
  compensationPer: z.enum(['HOUR', 'MONTH', 'COMMISSION', 'ONCE_OFF']).optional().nullable(),
  currency: z.string().trim().min(1).default('ZAR'),
  totalSpots: z.number().int().min(1).default(1),
  closingDate: z.coerce.date().optional().nullable(),
  venueId: z.string().min(1),
});

const applicationSchema = z.object({
  coverMessage: z.string().trim().min(50).max(1000),
  cvUrl: z.string().url().optional().nullable(),
  cvFileName: z.string().max(255).optional().nullable(),
  portfolioUrl: z.string().url().optional().nullable(),
});

const messageSchema = z.object({
  body: z.string().trim().min(1).max(2000),
});

/** Who may submit a new job application (not listing own apps — that is always self-scoped). */
async function canApplyToJobs(userId, role) {
  if (['USER', 'FREELANCER', 'VENUE'].includes(role)) return true;
  const accountRole = await prisma.accountRole.findFirst({
    where: { userId, roleType: 'partygoer' },
    select: { id: true },
  });
  return !!accountRole;
}

async function getVenueOwnedByUser(venueId, userId) {
  return prisma.venue.findFirst({
    where: { id: venueId, ownerUserId: userId, deletedAt: null },
    select: { id: true, name: true, owner: { select: { id: true, email: true, fullName: true } } },
  });
}

async function getOwnedJob(jobId, ownerUserId) {
  return prisma.jobPosting.findFirst({
    where: { id: jobId, venue: { ownerUserId, deletedAt: null } },
    include: {
      venue: { select: { id: true, name: true, city: true, venueType: true, ownerUserId: true, owner: { select: { email: true, fullName: true } } } },
    },
  });
}

function publicJobWhere(query = {}) {
  const where = {
    status: 'OPEN',
    OR: [{ closingDate: null }, { closingDate: { gt: new Date() } }],
  };
  if (query.city) where.venue = { city: query.city, deletedAt: null };
  if (query.jobType) where.jobType = query.jobType;
  if (query.compensationType) where.compensationType = query.compensationType;
  return where;
}

async function createJobNotification({ userId, type, title, body, actionUrl }) {
  if (!userId) return;
  try {
    await prisma.notification.create({
      data: {
        userId,
        type,
        title,
        body: body ?? null,
        actionUrl: actionUrl ?? null,
      },
    });
  } catch (e) {
    logger.warn('job notification create failed', { err: e?.message });
  }
}

function formatCompensation(job) {
  if (job.compensationType === 'UNPAID_TRIAL') return 'Unpaid trial';
  if (job.compensationType === 'NEGOTIABLE') return 'Negotiable';
  if (job.compensationPer === 'COMMISSION') return 'Commission based';
  const amount = job.compensationAmount ? Number(job.compensationAmount).toFixed(0) : '0';
  const per = job.compensationPer?.toLowerCase() || 'month';
  return `R${amount} per ${per}`;
}

function myApplicationThreadPath(applicationId, jobPostingId) {
  return `/MyJobApplications?applicationId=${applicationId}&jobId=${jobPostingId}`;
}

function ownerJobDetailsPath(jobPostingId) {
  return `/JobDetails?id=${jobPostingId}`;
}

router.post('/', authenticateToken, async (req, res, next) => {
  try {
    const parsed = postingSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    const payload = parsed.data;
    if ((payload.compensationType === 'FIXED' || payload.compensationType === 'NEGOTIABLE') && !payload.compensationPer) {
      return res.status(400).json({ error: 'compensationPer is required for fixed or negotiable compensation' });
    }
    const venue = await getVenueOwnedByUser(payload.venueId, req.userId);
    if (!venue) return res.status(403).json({ error: 'Forbidden' });

    const created = await prisma.jobPosting.create({
      data: {
        venueId: payload.venueId,
        title: payload.title,
        description: payload.description,
        requirements: payload.requirements,
        jobType: payload.jobType,
        compensationType: payload.compensationType,
        compensationAmount: payload.compensationAmount ?? null,
        compensationPer: payload.compensationPer || 'MONTH',
        currency: payload.currency,
        totalSpots: payload.totalSpots,
        filledSpots: 0,
        closingDate: payload.closingDate ?? null,
        status: 'OPEN',
      },
    });
    return res.status(201).json(created);
  } catch (err) {
    return next(err);
  }
});

router.get('/venue/:venueId', authenticateToken, async (req, res, next) => {
  try {
    const venue = await getVenueOwnedByUser(req.params.venueId, req.userId);
    if (!venue) return res.status(403).json({ error: 'Forbidden' });
    const jobs = await prisma.jobPosting.findMany({
      where: { venueId: req.params.venueId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { applications: true, messages: true } } },
    });
    return res.json(jobs);
  } catch (err) {
    return next(err);
  }
});

router.get('/public', optionalAuth, async (req, res, next) => {
  try {
    const jobs = await prisma.jobPosting.findMany({
      where: publicJobWhere(req.query),
      orderBy: { createdAt: 'desc' },
      include: { venue: { select: { id: true, name: true, city: true, venueType: true } } },
    });
    return res.json(jobs.map((job) => ({
      id: job.id,
      venue: job.venue,
      title: job.title,
      jobType: job.jobType,
      compensationType: job.compensationType,
      compensationAmount: job.compensationAmount,
      compensationPer: job.compensationPer,
      currency: job.currency,
      compensationLabel: formatCompensation(job),
      description: job.description,
      requirements: job.requirements,
      totalSpots: job.totalSpots,
      filledSpots: job.filledSpots,
      closingDate: job.closingDate,
      createdAt: job.createdAt,
      status: job.status,
    })));
  } catch (err) {
    return next(err);
  }
});

router.get('/public/:jobId', optionalAuth, async (req, res, next) => {
  try {
    const job = await prisma.jobPosting.findFirst({
      where: { id: req.params.jobId, ...publicJobWhere({}) },
      include: { venue: { select: { id: true, name: true, city: true, venueType: true } } },
    });
    if (!job) return res.status(404).json({ error: 'Job not found' });
    return res.json({
      id: job.id,
      venue: job.venue,
      title: job.title,
      jobType: job.jobType,
      compensationType: job.compensationType,
      compensationAmount: job.compensationAmount,
      compensationPer: job.compensationPer,
      currency: job.currency,
      compensationLabel: formatCompensation(job),
      description: job.description,
      requirements: job.requirements,
      totalSpots: job.totalSpots,
      filledSpots: job.filledSpots,
      closingDate: job.closingDate,
      createdAt: job.createdAt,
      status: job.status,
    });
  } catch (err) {
    return next(err);
  }
});

// Must be registered before GET /:jobId or "my-applications" is captured as jobId (403).
router.get('/my-applications', authenticateToken, async (req, res, next) => {
  try {
    const apps = await prisma.jobApplication.findMany({
      where: { applicantUserId: req.userId },
      orderBy: { appliedAt: 'desc' },
      include: {
        jobPosting: { include: { venue: { select: { name: true } } } },
      },
    });
    const data = await Promise.all(apps.map(async (app) => {
      const unread = await prisma.jobMessage.count({
        where: { applicationId: app.id, readAt: null, senderUserId: { not: req.userId } },
      });
      return {
        id: app.id,
        jobPostingId: app.jobPostingId,
        jobTitle: app.jobPosting.title,
        venueName: app.jobPosting.venue.name,
        status: app.status,
        appliedAt: app.appliedAt,
        unreadCount: unread,
      };
    }));
    return res.json(data);
  } catch (err) {
    return next(err);
  }
});

router.get('/:jobId', authenticateToken, async (req, res, next) => {
  try {
    if (req.params.jobId === 'public') return next();
    const job = await prisma.jobPosting.findFirst({
      where: { id: req.params.jobId, venue: { ownerUserId: req.userId, deletedAt: null } },
      include: {
        venue: { select: { id: true, name: true, city: true, venueType: true } },
        applications: {
          orderBy: { appliedAt: 'desc' },
          select: {
            id: true, coverMessage: true, cvUrl: true, cvFileName: true, portfolioUrl: true, status: true, appliedAt: true,
            applicant: { select: { id: true, email: true, fullName: true } },
          },
        },
      },
    });
    if (!job) return res.status(403).json({ error: 'Forbidden' });
    return res.json(job);
  } catch (err) {
    return next(err);
  }
});

router.patch('/:jobId', authenticateToken, async (req, res, next) => {
  try {
    const ownedJob = await getOwnedJob(req.params.jobId, req.userId);
    if (!ownedJob) return res.status(403).json({ error: 'Forbidden' });
    const schema = postingSchema.partial().omit({ venueId: true }).extend({ status: z.enum(['OPEN', 'CLOSED', 'FILLED']).optional() });
    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    const updated = await prisma.jobPosting.update({
      where: { id: req.params.jobId },
      data: parsed.data,
    });
    return res.json(updated);
  } catch (err) {
    return next(err);
  }
});

router.delete('/:jobId', authenticateToken, async (req, res, next) => {
  try {
    const ownedJob = await getOwnedJob(req.params.jobId, req.userId);
    if (!ownedJob) return res.status(403).json({ error: 'Forbidden' });
    const count = await prisma.jobApplication.count({ where: { jobPostingId: req.params.jobId } });
    if (count > 0) {
      await prisma.jobPosting.update({ where: { id: req.params.jobId }, data: { status: 'CLOSED' } });
      return res.json({ status: 'CLOSED' });
    }
    await prisma.jobPosting.delete({ where: { id: req.params.jobId } });
    return res.json({ deleted: true });
  } catch (err) {
    return next(err);
  }
});

router.get('/:jobId/applications', authenticateToken, async (req, res, next) => {
  try {
    const ownedJob = await getOwnedJob(req.params.jobId, req.userId);
    if (!ownedJob) return res.status(403).json({ error: 'Forbidden' });
    const applications = await prisma.jobApplication.findMany({
      where: { jobPostingId: req.params.jobId },
      orderBy: { appliedAt: 'desc' },
      include: { applicant: { select: { id: true, fullName: true, email: true } } },
    });
    return res.json(applications);
  } catch (err) {
    return next(err);
  }
});

router.patch('/applications/:applicationId/status', authenticateToken, async (req, res, next) => {
  try {
    const schema = z.object({ status: z.enum(['SHORTLISTED', 'REJECTED', 'HIRED']) });
    const parsed = schema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });

    const application = await prisma.jobApplication.findFirst({
      where: { id: req.params.applicationId, jobPosting: { venue: { ownerUserId: req.userId } } },
      include: {
        applicant: { select: { id: true, email: true, fullName: true } },
        jobPosting: { include: { venue: { include: { owner: { select: { email: true, fullName: true } } } } } },
      },
    });
    if (!application) return res.status(403).json({ error: 'Forbidden' });

    const status = parsed.data.status;
    let becameFilled = false;
    const txResult = await prisma.$transaction(async (tx) => {
      const updated = await tx.jobApplication.update({
        where: { id: application.id },
        data: { status },
      });
      if (status === 'HIRED') {
        const posting = await tx.jobPosting.update({
          where: { id: application.jobPostingId },
          data: { filledSpots: { increment: 1 } },
        });
        if (posting.filledSpots >= posting.totalSpots) {
          await tx.jobPosting.update({ where: { id: posting.id }, data: { status: 'FILLED' } });
          becameFilled = true;
        }
      }
      return updated;
    });

    const jobTitle = application.jobPosting.title;
    const venueName = application.jobPosting.venue.name;
    if (application.applicant.email) {
      const subjects = {
        SHORTLISTED: `You've been shortlisted — ${jobTitle} at ${venueName}`,
        REJECTED: `Application Update — ${jobTitle} at ${venueName}`,
        HIRED: `You're hired! — ${jobTitle} at ${venueName}`,
      };
      await sendEmail({
        to: application.applicant.email,
        subject: subjects[status],
        text: `Your application status was updated to ${status}. Open the app to view details and messages.`,
      }).catch(() => {});
    }
    const statusTitles = {
      SHORTLISTED: 'Application shortlisted',
      REJECTED: 'Application update',
      HIRED: "You're hired",
    };
    const applicantThreadPath = myApplicationThreadPath(application.id, application.jobPostingId);
    await createJobNotification({
      userId: application.applicant.id,
      type: 'job_application',
      title: statusTitles[status] || 'Application update',
      body: `${jobTitle} at ${venueName}: status is now ${status}.`,
      actionUrl: applicantThreadPath,
    });

    if (status === 'HIRED' && becameFilled) {
      // Notify owner
      await createJobNotification({
        userId: application.jobPosting.venue.ownerUserId,
        type: 'job_application',
        title: 'Job filled',
        body: `${jobTitle} at ${venueName} is now filled.`,
        actionUrl: `/BusinessJobs`,
      });

      // Notify other applicants (do not change their status automatically)
      const otherApplicants = await prisma.jobApplication.findMany({
        where: { jobPostingId: application.jobPostingId, applicantUserId: { not: application.applicant.id } },
        select: { applicantUserId: true },
      });
      const otherIds = [...new Set(otherApplicants.map((a) => a.applicantUserId).filter(Boolean))];
      await Promise.all(otherIds.map((uid) => createJobNotification({
        userId: uid,
        type: 'job_application',
        title: 'Position filled',
        body: `${jobTitle} at ${venueName} has been filled.`,
        actionUrl: `/MyJobApplications`,
      })));
    }
    if (status === 'HIRED' && application.jobPosting.venue.owner.email) {
      await sendEmail({
        to: application.jobPosting.venue.owner.email,
        subject: `Hire confirmed — ${jobTitle}`,
        text: `You marked ${application.applicant.fullName || 'an applicant'} as hired.`,
      }).catch(() => {});
    }
    return res.json(txResult);
  } catch (err) {
    return next(err);
  }
});

router.get('/applications/:applicationId/cv', authenticateToken, async (req, res, next) => {
  try {
    const application = await prisma.jobApplication.findFirst({
      where: { id: req.params.applicationId, jobPosting: { venue: { ownerUserId: req.userId } } },
      select: { id: true, cvUrl: true, cvFileName: true },
    });
    logger.info('CV access attempt', { applicationId: req.params.applicationId, accessedBy: req.userId, accessedAt: new Date().toISOString() });
    if (!application) return res.status(403).json({ error: 'Forbidden' });
    const raw = application.cvUrl;
    const viewUrl = raw
      ? (privateDownloadUrl(raw) || signCloudinaryUrl(raw) || raw)
      : null;
    res.set('Cache-Control', 'no-store');
    res.set('Pragma', 'no-cache');
    return res.json({ cvUrl: raw, viewUrl, cvFileName: application.cvFileName });
  } catch (err) {
    return next(err);
  }
});

async function getApplicationWithAccess(applicationId, userId) {
  return prisma.jobApplication.findFirst({
    where: {
      id: applicationId,
      OR: [{ applicantUserId: userId }, { jobPosting: { venue: { ownerUserId: userId } } }],
    },
    include: {
      applicant: { select: { id: true, email: true, fullName: true } },
      jobPosting: { include: { venue: { include: { owner: { select: { id: true, email: true, fullName: true } } } } } },
    },
  });
}

router.get('/applications/:applicationId/messages', authenticateToken, async (req, res, next) => {
  try {
    const application = await getApplicationWithAccess(req.params.applicationId, req.userId);
    if (!application) return res.status(403).json({ error: 'Forbidden' });
    await prisma.jobMessage.updateMany({
      where: { applicationId: application.id, readAt: null, senderUserId: { not: req.userId } },
      data: { readAt: new Date() },
    });
    const messages = await prisma.jobMessage.findMany({
      where: { applicationId: application.id },
      orderBy: { sentAt: 'asc' },
      include: { sender: { select: { id: true, fullName: true, email: true } } },
    });
    return res.json(messages);
  } catch (err) {
    return next(err);
  }
});

router.post('/applications/:applicationId/messages', authenticateToken, async (req, res, next) => {
  try {
    const parsed = messageSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input' });
    const application = await getApplicationWithAccess(req.params.applicationId, req.userId);
    if (!application) return res.status(403).json({ error: 'Forbidden' });
    const created = await prisma.jobMessage.create({
      data: {
        applicationId: application.id,
        jobPostingId: application.jobPostingId,
        senderUserId: req.userId,
        body: parsed.data.body,
      },
      include: { sender: { select: { id: true, fullName: true, email: true } } },
    });

    const senderIsOwner = application.jobPosting.venue.owner.id === req.userId;
    const recipient = senderIsOwner ? application.applicant : application.jobPosting.venue.owner;
    const recipientActionPath = senderIsOwner
      ? myApplicationThreadPath(application.id, application.jobPostingId)
      : ownerJobDetailsPath(application.jobPostingId);
    if (recipient?.email) {
      const appBase = (process.env.APP_URL || '').replace(/\/+$/, '');
      const appUrl = appBase ? `${appBase}${recipientActionPath}` : '';
      await sendEmail({
        to: recipient.email,
        subject: `New message regarding your application — ${application.jobPosting.title}`,
        text: `${created.sender.fullName || 'Someone'} sent you a message. Open the app to reply.${appUrl ? ` ${appUrl}` : ''}`,
      }).catch(() => {});
    }
    const recipientUserId = senderIsOwner ? application.applicant.id : application.jobPosting.venue.owner.id;
    const bodyText = parsed.data.body || '';
    const preview = bodyText.slice(0, 120);
    await createJobNotification({
      userId: recipientUserId,
      type: 'message',
      title: `Message: ${application.jobPosting.title}`,
      body: `${created.sender.fullName || 'Someone'}: ${preview}${bodyText.length > 120 ? '…' : ''}`,
      actionUrl: recipientActionPath,
    });
    return res.status(201).json(created);
  } catch (err) {
    return next(err);
  }
});

router.get('/applications/:applicationId/messages/unread-count', authenticateToken, async (req, res, next) => {
  try {
    const application = await getApplicationWithAccess(req.params.applicationId, req.userId);
    if (!application) return res.status(403).json({ error: 'Forbidden' });
    const count = await prisma.jobMessage.count({
      where: { applicationId: application.id, readAt: null, senderUserId: { not: req.userId } },
    });
    return res.json({ count });
  } catch (err) {
    return next(err);
  }
});

router.post('/:jobId/apply', authenticateToken, async (req, res, next) => {
  try {
    const canApply = await canApplyToJobs(req.userId, req.userRole);
    if (!canApply) return res.status(403).json({ error: 'Your account cannot apply to jobs' });
    const parsed = applicationSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    const job = await prisma.jobPosting.findFirst({
      where: { id: req.params.jobId, status: 'OPEN' },
      include: { venue: { select: { name: true, ownerUserId: true, owner: { select: { id: true, email: true } } } } },
    });
    if (!job) return res.status(404).json({ error: 'Job not found or closed' });
    if (job.closingDate && new Date(job.closingDate) <= new Date()) return res.status(400).json({ error: 'Applications are closed for this job' });

    const hourlyCount = await prisma.jobApplication.count({
      where: { applicantUserId: req.userId, appliedAt: { gte: new Date(Date.now() - HOUR_MS) } },
    });
    if (hourlyCount >= USER_HOURLY_LIMIT) return res.status(429).json({ error: 'Application rate limit exceeded. Try again later.' });

    const exists = await prisma.jobApplication.findUnique({
      where: { jobPostingId_applicantUserId: { jobPostingId: req.params.jobId, applicantUserId: req.userId } },
      select: { id: true },
    });
    if (exists) return res.status(409).json({ error: 'You have already applied for this position' });

    const created = await prisma.jobApplication.create({
      data: {
        jobPostingId: req.params.jobId,
        applicantUserId: req.userId,
        coverMessage: parsed.data.coverMessage,
        cvUrl: parsed.data.cvUrl ?? null,
        cvFileName: parsed.data.cvFileName ?? null,
        portfolioUrl: parsed.data.portfolioUrl ?? null,
        status: 'PENDING',
      },
    });

    const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { fullName: true, email: true } });
    if (user?.email) {
      await sendEmail({
        to: user.email,
        subject: `Application received — ${job.title} at ${job.venue.name}`,
        text: 'Your application has been received. We will notify you of updates by email and in the app.',
      }).catch(() => {});
    }
    if (job.venue.owner.email) {
      await sendEmail({
        to: job.venue.owner.email,
        subject: `New application — ${job.title}`,
        text: `${user?.fullName || 'A user'} has applied. Review in your dashboard.`,
      }).catch(() => {});
    }
    await createJobNotification({
      userId: job.venue.ownerUserId,
      type: 'job_application',
      title: 'New job application',
      body: `${user?.fullName || 'Someone'} applied for ${job.title} at ${job.venue.name}.`,
      actionUrl: `/BusinessJobs`,
    });
    return res.status(201).json(created);
  } catch (err) {
    return next(err);
  }
});

export default router;
