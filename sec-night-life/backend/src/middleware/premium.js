/**
 * Premium Feature Middleware Stub
 * Restricts access to premium-only features.
 * isPremium flag is set on the User model.
 * Payments NOT implemented yet — this is infrastructure preparation only.
 *
 * Usage:
 *   router.get('/search-profiles', authenticateToken, requirePremium, handler)
 */
import { prisma } from '../lib/prisma.js';

export async function requirePremium(req, res, next) {
  if (!req.userId) return res.status(401).json({ error: 'Authentication required' });

  // SECURITY: Always check DB, never trust frontend claim
  const user = await prisma.user.findUnique({
    where: { id: req.userId },
    select: { isPremium: true, role: true }
  });

  if (!user) return res.status(401).json({ error: 'User not found' });

  // Admin bypass
  if (user.role === 'ADMIN') return next();

  if (!user.isPremium) {
    return res.status(403).json({
      error: 'Premium subscription required',
      code: 'PREMIUM_REQUIRED'
    });
  }

  next();
}
