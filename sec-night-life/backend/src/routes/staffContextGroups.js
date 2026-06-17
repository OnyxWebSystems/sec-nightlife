import { Router } from 'express';
import { authenticateToken } from '../middleware/auth.js';
import { resolveStaffVenueContext, staffPermissionOk } from '../lib/access.js';
import venueMessageGroupRoutes from './venueMessageGroups.js';

const router = Router({ mergeParams: true });

router.use(authenticateToken, async (req, res, next) => {
  try {
    const ctx = await resolveStaffVenueContext({
      token: req.params.accessToken,
      userId: req.userId,
    });
    if (!ctx) return res.status(404).json({ error: 'Staff context not found' });
    if (!staffPermissionOk(ctx.permissions, 'messages')) {
      return res.status(403).json({ error: 'Forbidden' });
    }
    req.params.venueId = ctx.venueId;
    req.staffVenueContext = ctx;
    next();
  } catch (e) {
    next(e);
  }
}, venueMessageGroupRoutes);

export default router;
