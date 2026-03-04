import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';

// STEP 1: No fallback secret — validateEnv() ensures this is set at startup
const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;

export async function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const payload = jwt.verify(token, JWT_ACCESS_SECRET);

    // SECURITY: verify user is still active and not suspended on every authenticated request
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, role: true, suspendedAt: true, deletedAt: true }
    });

    if (!user || user.deletedAt) {
      return res.status(401).json({ error: 'Account not found' });
    }
    if (user.suspendedAt) {
      return res.status(403).json({ error: 'Account suspended. Contact support.' });
    }

    req.userId = user.id;
    req.userRole = user.role; // SECURITY: always use DB role, never trust JWT role
    next();
  } catch {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
}

// requireRole is in middleware/rbac.js — re-exported here for backward compatibility
export { requireRole } from './rbac.js';

export async function optionalAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    req.userId = null;
    req.userRole = null;
    return next();
  }

  try {
    const payload = jwt.verify(token, JWT_ACCESS_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
      select: { id: true, role: true, suspendedAt: true, deletedAt: true }
    });
    if (!user || user.deletedAt || user.suspendedAt) {
      req.userId = null;
      req.userRole = null;
    } else {
      req.userId = user.id;
      req.userRole = user.role; // SECURITY: always use DB role
    }
    next();
  } catch {
    req.userId = null;
    req.userRole = null;
    next();
  }
}
