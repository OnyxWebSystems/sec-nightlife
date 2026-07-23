import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';
import { cacheGetJson, cacheSetJson, cacheDel } from '../lib/redis.js';

// STEP 1: No fallback secret — validateEnv() ensures this is set at startup
const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const AUTH_USER_CACHE_TTL_SEC = 45;

function authUserCacheKey(userId) {
  return `auth:user:v1:${userId}`;
}

async function loadActiveUser(userId) {
  const cached = await cacheGetJson(authUserCacheKey(userId));
  if (
    cached &&
    typeof cached === 'object' &&
    cached.id &&
    typeof cached.role === 'string'
  ) {
    return {
      id: cached.id,
      role: cached.role,
      suspendedAt: cached.suspendedAt ? new Date(cached.suspendedAt) : null,
      deletedAt: cached.deletedAt ? new Date(cached.deletedAt) : null,
      emailVerified: Boolean(cached.emailVerified),
    };
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, role: true, suspendedAt: true, deletedAt: true, emailVerified: true },
  });
  if (!user) return null;

  await cacheSetJson(
    authUserCacheKey(userId),
    {
      id: user.id,
      role: user.role,
      suspendedAt: user.suspendedAt?.toISOString?.() || user.suspendedAt || null,
      deletedAt: user.deletedAt?.toISOString?.() || user.deletedAt || null,
      emailVerified: Boolean(user.emailVerified),
    },
    AUTH_USER_CACHE_TTL_SEC,
  );
  return user;
}

/** Call after suspend / soft-delete / role change so the next request hits DB. */
export async function invalidateAuthUserCache(userId) {
  if (!userId) return;
  await cacheDel(authUserCacheKey(userId));
}

export async function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  try {
    const payload = jwt.verify(token, JWT_ACCESS_SECRET);
    const user = await loadActiveUser(payload.userId);

    if (!user || user.deletedAt) {
      return res.status(401).json({ error: 'Account not found' });
    }
    if (user.suspendedAt) {
      return res.status(403).json({ error: 'Account suspended. Contact support.' });
    }

    req.userId = user.id;
    req.userRole = user.role; // SECURITY: always use DB role, never trust JWT role
    req.emailVerified = user.emailVerified;
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
    req.emailVerified = null;
    return next();
  }

  try {
    const payload = jwt.verify(token, JWT_ACCESS_SECRET);
    const user = await loadActiveUser(payload.userId);
    if (!user || user.deletedAt || user.suspendedAt) {
      req.userId = null;
      req.userRole = null;
      req.emailVerified = null;
    } else {
      req.userId = user.id;
      req.userRole = user.role; // SECURITY: always use DB role
      req.emailVerified = user.emailVerified;
    }
    next();
  } catch {
    req.userId = null;
    req.userRole = null;
    req.emailVerified = null;
    next();
  }
}
