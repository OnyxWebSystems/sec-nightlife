import { Router } from 'express';
import { z } from 'zod';
import { authenticateToken, optionalAuth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/rbac.js';
import { prisma } from '../lib/prisma.js';
import { getPromotersLeaderboard } from '../lib/leaderboard.js';

const router = Router();

router.get('/promoters', optionalAuth, async (req, res, next) => {
  try {
    const schema = z.object({
      page: z.coerce.number().int().min(1).optional(),
      limit: z.coerce.number().int().min(1).max(100).optional(),
    });
    const parsed = schema.parse(req.query || {});
    const result = await getPromotersLeaderboard(parsed);
    const data = result.data.map((row) => ({
      rank: row.rank,
      promoterId: row.promoterId,
      username: row.username,
      avatarUrl: row.avatarUrl,
      score: row.score,
      scoreBreakdown: row.scoreBreakdown,
      ratingAvg: row.ratingAvg,
      ratingCount: row.ratingCount,
      uniqueRaters: row.uniqueRaters,
      acceptedJobs: row.acceptedJobs,
      completedJobs: row.completedJobs,
      badges: row.badges,
      lastActivityAt: row.lastActivityAt,
    }));
    return res.json({
      policy: result.policy,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        hasMore: result.page * result.limit < result.total,
      },
      data,
    });
  } catch (err) {
    return next(err);
  }
});

router.get('/promoters/me/status', authenticateToken, async (req, res, next) => {
  try {
    const leaderboard = await getPromotersLeaderboard({ page: 1, limit: 500 });
    const found = leaderboard.data.find((row) => row.promoterId === req.userId);
    if (found) {
      return res.json({
        featured: true,
        rank: found.rank,
        score: found.score,
        badges: found.badges,
        eligibility: found.eligibility,
        nextSteps: [],
      });
    }

    const profile = await prisma.userProfile.findUnique({
      where: { userId: req.userId },
      select: {
        isVerifiedPromoter: true,
        serviceRatingCount: true,
      },
    });
    const nextSteps = [];
    if (!profile?.isVerifiedPromoter) nextSteps.push('Become a verified promoter');
    if ((profile?.serviceRatingCount || 0) < 5) nextSteps.push('Receive at least 5 promoter ratings');
    if (nextSteps.length === 0) nextSteps.push('Complete more promoter jobs and maintain compliance');

    return res.json({
      featured: false,
      rank: null,
      score: 0,
      badges: { verified: !!profile?.isVerifiedPromoter, compliant: false, rising: false },
      eligibility: null,
      nextSteps,
    });
  } catch (err) {
    return next(err);
  }
});

router.get('/promoters/admin/candidates', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const result = await getPromotersLeaderboard({ page: 1, limit: 200 });
    return res.json({
      policy: result.policy,
      data: result.data.map((row) => ({
        rank: row.rank,
        promoterId: row.promoterId,
        username: row.username,
        score: row.score,
        eligibility: row.eligibility,
        scoreBreakdown: row.scoreBreakdown,
        badges: row.badges,
      })),
    });
  } catch (err) {
    return next(err);
  }
});

export default router;

