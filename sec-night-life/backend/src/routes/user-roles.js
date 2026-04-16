/**
 * User roles API — explicit account types (partygoer, host, business).
 * Used by Layout to show correct nav modes.
 */
import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();

router.get('/me', authenticateToken, async (req, res, next) => {
  try {
    const roles = await prisma.accountRole.findMany({
      where: { userId: req.userId },
      select: { roleType: true },
    });
    const types = new Set(roles.map((r) => r.roleType));
    res.json({
      partygoer: true,
      host: true,
      business: types.has('business'),
    });
  } catch (err) {
    next(err);
  }
});

export default router;
