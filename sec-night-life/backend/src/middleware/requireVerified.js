/**
 * requireVerified middleware.
 * Blocks access to protected actions for users whose email is not verified.
 *
 * Must be placed AFTER authenticateToken (which sets req.userId).
 *
 * SECURITY: Unverified users cannot:
 *   - Create tables
 *   - Join tables
 *   - Access analytics
 *   - Access premium features
 *   - Perform any transactional action
 *
 * Usage:
 *   router.post('/tables', authenticateToken, requireVerified, handler)
 */
import { prisma } from '../lib/prisma.js';

export async function requireVerified(req, res, next) {
  if (!req.userId) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  // SECURITY: always check DB — never trust a cached value
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { emailVerified: true, deletedAt: true }
  });

  if (!user || user.deletedAt) {
    return res.status(401).json({ error: 'Account not found' });
  }

  if (!user.emailVerified) {
    return res.status(403).json({
      error: 'Email verification required. Please verify your email before performing this action.',
      code: 'EMAIL_NOT_VERIFIED'
    });
  }

  next();
}
