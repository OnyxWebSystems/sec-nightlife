import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { resolveStaffVenueContext, staffPermissionOk } from '../lib/access.js';
import { fetchVenuePromotionsList } from './promotions.js';

const router = Router({ mergeParams: true });

router.get('/', authenticateToken, async (req, res, next) => {
  try {
    const ctx = await resolveStaffVenueContext({
      token: req.params.accessToken,
      userId: req.userId,
    });
    if (!ctx) return res.status(404).json({ error: 'Staff context not found' });
    if (!staffPermissionOk(ctx.permissions, 'promotions')) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    res.json(await fetchVenuePromotionsList(ctx.venueId));
  } catch (e) {
    next(e);
  }
});

export default router;
