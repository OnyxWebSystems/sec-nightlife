/**
 * Reviews & ratings — user-to-user and venue reviews (in-app only).
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticateToken, optionalAuth } from '../middleware/auth.js';
import { requireRole } from '../middleware/rbac.js';
import { checkUserReviewEligibility } from '../lib/reviewEligibility.js';
import { createInAppNotification, createInAppNotificationsForUsers } from '../lib/inAppNotifications.js';

const router = Router();

const ratingComment = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().min(10).max(300),
});

function round1(avg) {
  if (avg == null || Number.isNaN(Number(avg))) return 0;
  return Math.round(Number(avg) * 10) / 10;
}

function mapReviewerUser(u) {
  if (!u) return null;
  return {
    id: u.id,
    username: u.username,
    fullName: u.fullName,
    avatarUrl: u.userProfile?.avatarUrl ?? null,
  };
}

async function countReviewsCreatedLastHour(reviewerId) {
  const since = new Date(Date.now() - 60 * 60 * 1000);
  const [uc, vc] = await Promise.all([
    prisma.userReview.count({ where: { reviewerId, createdAt: { gte: since } } }),
    prisma.venueReview.count({ where: { reviewerId, createdAt: { gte: since } } }),
  ]);
  return uc + vc;
}

async function getSuperAdminUserIds() {
  const rows = await prisma.user.findMany({
    where: { role: 'SUPER_ADMIN', deletedAt: null, suspendedAt: null },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

// --- Authenticated: reviews I've written (user reviews) ---
router.get('/me/given', authenticateToken, async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    const limit = 10;
    const skip = (page - 1) * limit;

    const [rows, total] = await Promise.all([
      prisma.userReview.findMany({
        where: { reviewerId: req.userId, flagged: false },
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          subject: {
            select: {
              id: true,
              username: true,
              fullName: true,
              userProfile: { select: { avatarUrl: true } },
            },
          },
          event: { select: { id: true, title: true, date: true } },
        },
      }),
      prisma.userReview.count({ where: { reviewerId: req.userId, flagged: false } }),
    ]);

    res.json({
      reviews: rows.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt.toISOString(),
        eventId: r.eventId,
        event: r.event
          ? { id: r.event.id, name: r.event.title, date: r.event.date.toISOString() }
          : null,
        subject: mapReviewerUser(r.subject),
      })),
      page,
      totalPages: Math.ceil(total / limit) || 1,
      total,
    });
  } catch (e) {
    next(e);
  }
});

// --- Admin (must be before /users/:userId) ---
router.get('/admin/flagged', authenticateToken, requireRole('SUPER_ADMIN'), async (req, res, next) => {
  try {
    const [userReviews, venueReviews] = await Promise.all([
      prisma.userReview.findMany({
        where: { flagged: true },
        orderBy: { flaggedAt: 'desc' },
        include: {
          reviewer: {
            select: { id: true, username: true, fullName: true, userProfile: { select: { avatarUrl: true } } },
          },
          subject: {
            select: { id: true, username: true, fullName: true, userProfile: { select: { avatarUrl: true } } },
          },
          event: { select: { id: true, title: true, date: true } },
        },
      }),
      prisma.venueReview.findMany({
        where: { flagged: true },
        orderBy: { flaggedAt: 'desc' },
        include: {
          reviewer: {
            select: { id: true, username: true, fullName: true, userProfile: { select: { avatarUrl: true } } },
          },
          venue: { select: { id: true, name: true, ownerUserId: true } },
        },
      }),
    ]);

    res.json({
      userReviews: userReviews.map((r) => ({
        id: r.id,
        type: 'user',
        rating: r.rating,
        comment: r.comment,
        flagReason: r.flagReason,
        flaggedAt: r.flaggedAt?.toISOString() ?? null,
        reviewer: mapReviewerUser(r.reviewer),
        subject: mapReviewerUser(r.subject),
        event: r.event
          ? { id: r.event.id, name: r.event.title, date: r.event.date.toISOString() }
          : null,
      })),
      venueReviews: venueReviews.map((r) => ({
        id: r.id,
        type: 'venue',
        rating: r.rating,
        comment: r.comment,
        flagReason: r.flagReason,
        flaggedAt: r.flaggedAt?.toISOString() ?? null,
        reviewer: mapReviewerUser(r.reviewer),
        venue: r.venue ? { id: r.venue.id, name: r.venue.name, ownerUserId: r.venue.ownerUserId } : null,
      })),
    });
  } catch (e) {
    next(e);
  }
});

router.patch(
  '/admin/:reviewType/:reviewId/dismiss',
  authenticateToken,
  requireRole('SUPER_ADMIN'),
  async (req, res, next) => {
    try {
      const { reviewType, reviewId } = req.params;
      if (reviewType === 'user') {
        const u = await prisma.userReview.updateMany({
          where: { id: reviewId },
          data: { flagged: false, flagReason: null, flaggedAt: null },
        });
        if (u.count === 0) return res.status(404).json({ error: 'Review not found' });
        return res.json({ ok: true });
      }
      if (reviewType === 'venue') {
        const u = await prisma.venueReview.updateMany({
          where: { id: reviewId },
          data: { flagged: false, flagReason: null, flaggedAt: null },
        });
        if (u.count === 0) return res.status(404).json({ error: 'Review not found' });
        return res.json({ ok: true });
      }
      return res.status(400).json({ error: 'Invalid review type' });
    } catch (e) {
      next(e);
    }
  }
);

router.delete(
  '/admin/:reviewType/:reviewId/remove',
  authenticateToken,
  requireRole('SUPER_ADMIN'),
  async (req, res, next) => {
    try {
      const { reviewType, reviewId } = req.params;

      if (reviewType === 'user') {
        const row = await prisma.userReview.findUnique({
          where: { id: reviewId },
          include: { subject: { select: { id: true } } },
        });
        if (!row) return res.status(404).json({ error: 'Review not found' });
        await prisma.userReview.delete({ where: { id: reviewId } });
        await createInAppNotification({
          userId: row.subjectUserId,
          type: 'REVIEW_REMOVED_BY_ADMIN',
          title: 'A flagged review has been removed',
          body: 'After review, we removed a flagged review from your profile.',
          referenceId: reviewId,
          referenceType: 'USER_REVIEW_REMOVED',
        });
        return res.json({ ok: true });
      }

      if (reviewType === 'venue') {
        const row = await prisma.venueReview.findUnique({
          where: { id: reviewId },
          include: { venue: { select: { ownerUserId: true } } },
        });
        if (!row) return res.status(404).json({ error: 'Review not found' });
        await prisma.venueReview.delete({ where: { id: reviewId } });
        await createInAppNotification({
          userId: row.venue.ownerUserId,
          type: 'REVIEW_REMOVED_BY_ADMIN',
          title: 'A flagged review has been removed',
          body: 'After review, we removed a flagged review from your profile.',
          referenceId: reviewId,
          referenceType: 'VENUE_REVIEW_REMOVED',
        });
        return res.json({ ok: true });
      }

      return res.status(400).json({ error: 'Invalid review type' });
    } catch (e) {
      next(e);
    }
  }
);

// --- User reviews: public list ---
router.get('/users/:userId', optionalAuth, async (req, res, next) => {
  try {
    const { userId } = req.params;
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    const limit = 10;
    const skip = (page - 1) * limit;

    const where = { subjectUserId: userId, flagged: false };

    const [agg, rows, total] = await Promise.all([
      prisma.userReview.aggregate({
        where,
        _avg: { rating: true },
        _count: { id: true },
      }),
      prisma.userReview.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          reviewer: {
            select: { id: true, username: true, fullName: true, userProfile: { select: { avatarUrl: true } } },
          },
          event: { select: { id: true, title: true, date: true } },
        },
      }),
      prisma.userReview.count({ where }),
    ]);

    res.json({
      averageRating: round1(agg._avg.rating),
      totalReviews: agg._count.id,
      reviews: rows.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt.toISOString(),
        eventId: r.eventId,
        reviewer: mapReviewerUser(r.reviewer),
        event: r.event
          ? { id: r.event.id, name: r.event.title, date: r.event.date.toISOString() }
          : null,
      })),
      page,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (e) {
    next(e);
  }
});

router.get('/users/:userId/eligibility', authenticateToken, async (req, res, next) => {
  try {
    const { userId } = req.params;
    if (userId === req.userId) {
      return res.json({ eligible: false, sharedEvents: [], existingReview: null });
    }

    const { eligible, sharedEvents } = await checkUserReviewEligibility(req.userId, userId);

    const existing = await prisma.userReview.findFirst({
      where: { reviewerId: req.userId, subjectUserId: userId },
      orderBy: { createdAt: 'desc' },
      include: { event: { select: { id: true, title: true, date: true } } },
    });

    res.json({
      eligible,
      sharedEvents: sharedEvents.map((e) => ({
        id: e.id,
        name: e.name,
        date: e.date instanceof Date ? e.date.toISOString() : e.date,
      })),
      existingReview: existing
        ? {
            id: existing.id,
            rating: existing.rating,
            comment: existing.comment,
            eventId: existing.eventId,
            event: existing.event
              ? {
                  id: existing.event.id,
                  name: existing.event.title,
                  date: existing.event.date.toISOString(),
                }
              : null,
          }
        : null,
    });
  } catch (e) {
    next(e);
  }
});

router.post('/users/:userId', authenticateToken, async (req, res, next) => {
  try {
    const { userId: subjectUserId } = req.params;
    if (subjectUserId === req.userId) {
      return res.status(400).json({ error: 'You cannot review yourself.' });
    }

    const schema = ratingComment.extend({
      eventId: z.string().uuid(),
    });
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    }
    const { rating, comment, eventId } = parsed.data;

    const { eligible, sharedEvents } = await checkUserReviewEligibility(req.userId, subjectUserId, eventId);
    if (!eligible || !sharedEvents.some((e) => e.id === eventId)) {
      return res.status(403).json({
        error: 'You can only review someone you have shared an event or table with.',
      });
    }

    const createdLastHour = await countReviewsCreatedLastHour(req.userId);
    if (createdLastHour >= 5) {
      return res.status(429).json({
        error: 'You are posting reviews too quickly. Please wait before submitting another.',
      });
    }

    try {
      const review = await prisma.userReview.create({
        data: {
          reviewerId: req.userId,
          subjectUserId,
          eventId,
          rating,
          comment,
        },
        include: {
          reviewer: { select: { username: true } },
        },
      });

      const reviewerUsername = review.reviewer?.username || 'Someone';
      await createInAppNotification({
        userId: subjectUserId,
        type: 'USER_REVIEW_RECEIVED',
        title: 'New review on your profile',
        body: `@${reviewerUsername} left you a ${rating}-star review`,
        referenceId: review.id,
        referenceType: 'USER_REVIEW',
      });

      res.status(201).json({
        id: review.id,
        reviewerId: review.reviewerId,
        subjectUserId: review.subjectUserId,
        eventId: review.eventId,
        rating: review.rating,
        comment: review.comment,
        createdAt: review.createdAt.toISOString(),
      });
    } catch (err) {
      if (err && typeof err === 'object' && err.code === 'P2002') {
        return res.status(409).json({
          error:
            'You have already reviewed this person for this event. Edit your existing review instead.',
        });
      }
      throw err;
    }
  } catch (e) {
    next(e);
  }
});

router.patch('/users/review/:reviewId', authenticateToken, async (req, res, next) => {
  try {
    const { reviewId } = req.params;
    const parsed = ratingComment.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    }

    const existing = await prisma.userReview.findUnique({ where: { id: reviewId } });
    if (!existing) return res.status(404).json({ error: 'Review not found' });
    if (existing.reviewerId !== req.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const updated = await prisma.userReview.update({
      where: { id: reviewId },
      data: { rating: parsed.data.rating, comment: parsed.data.comment },
    });

    res.json({
      id: updated.id,
      rating: updated.rating,
      comment: updated.comment,
      eventId: updated.eventId,
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (e) {
    next(e);
  }
});

router.delete('/users/review/:reviewId', authenticateToken, async (req, res, next) => {
  try {
    const { reviewId } = req.params;
    const existing = await prisma.userReview.findUnique({ where: { id: reviewId } });
    if (!existing) return res.status(404).json({ error: 'Review not found' });
    if (existing.reviewerId !== req.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    await prisma.userReview.delete({ where: { id: reviewId } });
    res.json({ deleted: true });
  } catch (e) {
    next(e);
  }
});

router.post('/users/review/:reviewId/flag', authenticateToken, async (req, res, next) => {
  try {
    const { reviewId } = req.params;
    const parsed = z.object({ reason: z.string().min(1).max(200) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid reason' });

    const review = await prisma.userReview.findUnique({
      where: { id: reviewId },
      include: {
        reviewer: { select: { username: true } },
        subject: { select: { username: true } },
      },
    });
    if (!review) return res.status(404).json({ error: 'Review not found' });
    if (review.subjectUserId !== req.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (review.flagged) {
      return res.status(409).json({ error: 'Already flagged' });
    }

    await prisma.userReview.update({
      where: { id: reviewId },
      data: {
        flagged: true,
        flagReason: parsed.data.reason,
        flaggedAt: new Date(),
      },
    });

    const admins = await getSuperAdminUserIds();
    const subj = review.subject?.username || 'user';
    const rev = review.reviewer?.username || 'user';
    await createInAppNotificationsForUsers(admins, {
      type: 'ADMIN_FLAGGED_USER_REVIEW',
      title: 'Review flagged for admin review',
      body: `@${subj} flagged a review by @${rev}`,
      referenceId: reviewId,
      referenceType: 'FLAGGED_REVIEW',
    });

    res.json({ flagged: true });
  } catch (e) {
    next(e);
  }
});

// --- Venue: my review (before /venues/:venueId) ---
router.get('/venues/:venueId/my-review', authenticateToken, async (req, res, next) => {
  try {
    const { venueId } = req.params;
    const row = await prisma.venueReview.findFirst({
      where: { venueId, reviewerId: req.userId, flagged: false },
    });
    res.json(
      row
        ? {
            id: row.id,
            rating: row.rating,
            comment: row.comment,
            createdAt: row.createdAt.toISOString(),
            updatedAt: row.updatedAt.toISOString(),
          }
        : null
    );
  } catch (e) {
    next(e);
  }
});

router.get('/venues/:venueId', optionalAuth, async (req, res, next) => {
  try {
    const { venueId } = req.params;
    const page = Math.max(1, parseInt(String(req.query.page || '1'), 10) || 1);
    const limit = 10;
    const skip = (page - 1) * limit;

    const where = { venueId, flagged: false };

    const [agg, rows, total] = await Promise.all([
      prisma.venueReview.aggregate({
        where,
        _avg: { rating: true },
        _count: { id: true },
      }),
      prisma.venueReview.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip,
        take: limit,
        include: {
          reviewer: {
            select: { id: true, username: true, fullName: true, userProfile: { select: { avatarUrl: true } } },
          },
        },
      }),
      prisma.venueReview.count({ where }),
    ]);

    res.json({
      averageRating: round1(agg._avg.rating),
      totalReviews: agg._count.id,
      reviews: rows.map((r) => ({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt.toISOString(),
        reviewer: mapReviewerUser(r.reviewer),
      })),
      page,
      totalPages: Math.ceil(total / limit) || 1,
    });
  } catch (e) {
    next(e);
  }
});

router.post('/venues/:venueId', authenticateToken, async (req, res, next) => {
  try {
    const { venueId } = req.params;
    const parsed = ratingComment.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    }

    const venue = await prisma.venue.findFirst({
      where: { id: venueId, deletedAt: null },
      select: { id: true, ownerUserId: true },
    });
    if (!venue) return res.status(404).json({ error: 'Venue not found' });
    if (venue.ownerUserId === req.userId) {
      return res.status(403).json({ error: 'You cannot review your own venue.' });
    }

    const createdLastHour = await countReviewsCreatedLastHour(req.userId);
    if (createdLastHour >= 5) {
      return res.status(429).json({
        error: 'You are posting reviews too quickly. Please wait before submitting another.',
      });
    }

    try {
      const r = await prisma.venueReview.create({
        data: {
          reviewerId: req.userId,
          venueId,
          rating: parsed.data.rating,
          comment: parsed.data.comment,
        },
      });
      res.status(201).json({
        id: r.id,
        rating: r.rating,
        comment: r.comment,
        createdAt: r.createdAt.toISOString(),
      });
    } catch (err) {
      if (err && typeof err === 'object' && err.code === 'P2002') {
        return res.status(409).json({
          error: 'You have already reviewed this venue. Edit your existing review instead.',
        });
      }
      throw err;
    }
  } catch (e) {
    next(e);
  }
});

router.patch('/venues/:venueId', authenticateToken, async (req, res, next) => {
  try {
    const { venueId } = req.params;
    const parsed = ratingComment.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    }

    const existing = await prisma.venueReview.findFirst({
      where: { venueId, reviewerId: req.userId },
    });
    if (!existing) return res.status(404).json({ error: 'Review not found' });

    const updated = await prisma.venueReview.update({
      where: { id: existing.id },
      data: { rating: parsed.data.rating, comment: parsed.data.comment },
    });

    res.json({
      id: updated.id,
      rating: updated.rating,
      comment: updated.comment,
      updatedAt: updated.updatedAt.toISOString(),
    });
  } catch (e) {
    next(e);
  }
});

router.delete('/venues/review/:reviewId', authenticateToken, async (req, res, next) => {
  try {
    const { reviewId } = req.params;
    const existing = await prisma.venueReview.findUnique({ where: { id: reviewId } });
    if (!existing) return res.status(404).json({ error: 'Review not found' });
    if (existing.reviewerId !== req.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    await prisma.venueReview.delete({ where: { id: reviewId } });
    res.json({ deleted: true });
  } catch (e) {
    next(e);
  }
});

router.post('/venues/review/:reviewId/flag', authenticateToken, async (req, res, next) => {
  try {
    const { reviewId } = req.params;
    const parsed = z.object({ reason: z.string().min(1).max(200) }).safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Invalid reason' });

    const review = await prisma.venueReview.findUnique({
      where: { id: reviewId },
      include: {
        venue: { select: { name: true, ownerUserId: true } },
        reviewer: { select: { username: true } },
      },
    });
    if (!review) return res.status(404).json({ error: 'Review not found' });
    if (review.venue.ownerUserId !== req.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    if (review.flagged) {
      return res.status(409).json({ error: 'Already flagged' });
    }

    await prisma.venueReview.update({
      where: { id: reviewId },
      data: {
        flagged: true,
        flagReason: parsed.data.reason,
        flaggedAt: new Date(),
      },
    });

    const admins = await getSuperAdminUserIds();
    const vname = review.venue?.name || 'Venue';
    const run = review.reviewer?.username || 'user';
    await createInAppNotificationsForUsers(admins, {
      type: 'ADMIN_FLAGGED_VENUE_REVIEW',
      title: 'Venue review flagged',
      body: `${vname} flagged a review by @${run}`,
      referenceId: reviewId,
      referenceType: 'FLAGGED_VENUE_REVIEW',
    });

    res.json({ flagged: true });
  } catch (e) {
    next(e);
  }
});

export default router;
