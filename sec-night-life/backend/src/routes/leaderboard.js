import { Router } from 'express';
import { z } from 'zod';
import { authenticateToken, optionalAuth } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/rbac.js';
import { getPromotersLeaderboard } from '../lib/leaderboard.js';

const router = Router();

router.get('/promoters', optionalAuth, async (req, res, next) => {
  try {
    const schema = z.object({
      page: z.coerce.number().int().min(1).optional(),
      limit: z.coerce.number().int().min(1).max(100).optional(),
    });
    const { page, limit } = schema.parse(req.query || {});
    const result = await getPromotersLeaderboard({ page, limit });
    res.json({
      policy: result.policy,
      pagination: {
        page: result.page,
        limit: result.limit,
        total: result.total,
        hasMore: result.page * result.limit < result.total,
      },
      data: result.data,
    });
  } catch (err) {
    next(err);
  }
});

router.get('/promoters/me/status', authenticateToken, async (req, res, next) => {
  try {
    const result = await getPromotersLeaderboard({ page: 1, limit: 500 });
    const me = result.data.find((x) => x.promoterId === req.userId);
    if (me) {
      return res.json({
        featured: true,
        rank: me.rank,
        score: me.score,
        badges: me.badges,
        eligibility: me.eligibility,
        nextSteps: [],
      });
    }
    return res.json({
      featured: false,
      rank: null,
      score: 0,
      badges: { verified: false, compliant: false, rising: false },
      eligibility: null,
      nextSteps: [
        'Become a verified promoter',
        'Complete at least 20 accepted promoter jobs',
        'Accept the Promoter Code of Conduct',
      ],
    });
  } catch (err) {
    next(err);
  }
});

router.get('/promoters/admin/candidates', authenticateToken, requireAdmin, async (req, res, next) => {
  try {
    const result = await getPromotersLeaderboard({ page: 1, limit: 200 });
    res.json(result);
  } catch (err) {
    next(err);
  }
});

export default router;

