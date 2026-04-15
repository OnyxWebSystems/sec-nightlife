/**
 * Role-Based Access Control middleware.
 *
 * SECURITY: All role checks happen server-side. Never trust frontend role.
 * The role is read from the JWT payload (req.userRole), set by authenticateToken.
 *
 * Usage:
 *   router.get('/admin', authenticateToken, requireAdmin, handler)
 *   router.post('/venue', authenticateToken, requireRole('VENUE','ADMIN'), handler)
 */

import { prisma } from '../lib/prisma.js';

function normalizeEmail(email) {
  return (email || '').trim().toLowerCase();
}

/** Only ADMIN */
export async function requireAdmin(req, res, next) {
  try {
    if (!req.userRole) return res.status(401).json({ error: 'Authentication required' });
    if (!['ADMIN', 'SUPER_ADMIN'].includes(req.userRole)) {
      const user = await prisma.user.findUnique({
        where: { id: req.userId, deletedAt: null },
        select: { email: true },
      });
      const userEmail = normalizeEmail(user?.email);
      if (!userEmail) {
        return res.status(403).json({ error: 'Admin access required' });
      }
      const delegate = await prisma.adminDashboardDelegate.findFirst({
        where: { email: userEmail, isActive: true },
        select: { id: true },
      });
      if (!delegate) {
        return res.status(403).json({ error: 'Admin access required' }); // SECURITY: sensitive admin route
      }
    }
    next();
  } catch (err) {
    next(err);
  }
}

/** ADMIN or MODERATOR */
export function requireStaff(req, res, next) {
  if (!req.userRole) return res.status(401).json({ error: 'Authentication required' });
  if (!['ADMIN', 'SUPER_ADMIN', 'MODERATOR'].includes(req.userRole)) {
    return res.status(403).json({ error: 'Staff access required' });
  }
  next();
}

/** Any of the given roles */
export function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.userRole) return res.status(401).json({ error: 'Authentication required' });
    const allowedRoles = roles.includes('ADMIN') && !roles.includes('SUPER_ADMIN')
      ? [...roles, 'SUPER_ADMIN']
      : roles;
    if (!allowedRoles.includes(req.userRole)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

/** Must be authenticated (any role) */
export function requireAuth(req, res, next) {
  if (!req.userId || !req.userRole) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  next();
}

/**
 * Ownership guard: ensures req.userId matches the target userId param.
 * Staff bypass.
 */
export function requireSelfOrStaff(paramName = 'id') {
  return (req, res, next) => {
    if (!req.userId) return res.status(401).json({ error: 'Authentication required' });
    const targetId = req.params[paramName];
    if (req.userId === targetId) return next();
    if (['ADMIN', 'SUPER_ADMIN', 'MODERATOR'].includes(req.userRole)) return next();
    return res.status(403).json({ error: 'Cannot access another user\'s resource' }); // SECURITY: IDOR protection
  };
}
