import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from './prisma.js';

const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

export function hashTokenSha256Sync(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function timingSafeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** New tokens: `{userId}.{uuid}.{uuid}` — enables per-user lookup. */
export function parseRefreshTokenUserId(rawToken) {
  if (!rawToken || typeof rawToken !== 'string') return null;
  const parts = rawToken.split('.');
  if (parts.length >= 3 && UUID_RE.test(parts[0])) return parts[0];
  if (!JWT_REFRESH_SECRET) return null;
  try {
    const p = jwt.verify(rawToken, JWT_REFRESH_SECRET);
    return p?.userId || null;
  } catch {
    return null;
  }
}

/**
 * Resolve refresh row by SHA-256 tokenLookup only (no bcrypt, no legacy scan).
 * Rows created before this change still work if they have tokenLookup set.
 */
export async function findRefreshTokenRecord(rawToken) {
  if (!rawToken) return null;

  const lookup = hashTokenSha256Sync(rawToken);
  const byLookup = await prisma.refreshToken.findFirst({
    where: { tokenLookup: lookup, expiresAt: { gt: new Date() } },
  });
  if (byLookup) {
    // Prefer SHA-256 stored in token; accept legacy bcrypt rows via lookup alone.
    if (
      !byLookup.token ||
      byLookup.token.startsWith('$2') ||
      timingSafeEqualHex(byLookup.token, lookup)
    ) {
      return byLookup;
    }
  }
  return null;
}

export async function revokeRefreshToken(rawToken) {
  const matched = await findRefreshTokenRecord(rawToken);
  if (matched) {
    await prisma.refreshToken.delete({ where: { id: matched.id } });
  }
}

/** Keep the most recent N sessions per user; drop older refresh rows. */
export async function pruneUserRefreshTokens(userId, keep = 25) {
  const tokens = await prisma.refreshToken.findMany({
    where: { userId },
    orderBy: { createdAt: 'desc' },
    select: { id: true },
  });
  if (tokens.length < keep) return;
  const ids = tokens.slice(keep).map((t) => t.id);
  await prisma.refreshToken.deleteMany({ where: { id: { in: ids } } });
}

export async function createRefreshTokenRow(userId, refreshExpiry, tx = prisma) {
  const rawRefresh = `${userId}.${uuidv4()}.${uuidv4()}`;
  const tokenLookup = hashTokenSha256Sync(rawRefresh);

  await tx.refreshToken.create({
    data: {
      userId,
      token: tokenLookup,
      tokenLookup,
      expiresAt: refreshExpiry,
    },
  });

  return rawRefresh;
}

/** Atomically issue a new refresh token and revoke the old one (create before delete). */
export async function rotateRefreshToken(matchedRecord, refreshExpiry) {
  const userId = matchedRecord.userId;
  const rawRefresh = `${userId}.${uuidv4()}.${uuidv4()}`;
  const tokenLookup = hashTokenSha256Sync(rawRefresh);

  await prisma.$transaction(async (tx) => {
    await tx.refreshToken.create({
      data: {
        userId,
        token: tokenLookup,
        tokenLookup,
        expiresAt: refreshExpiry,
      },
    });
    await tx.refreshToken.delete({ where: { id: matchedRecord.id } });
  });

  return rawRefresh;
}

/**
 * After a concurrent rotation, the presented token may already be deleted.
 * If this user has a refresh row created within graceMs, treat as rotation race
 * and return that row so the caller can rotate again and issue a fresh pair.
 */
export async function findRecentRefreshTokenForUser(userId, graceMs = 45_000) {
  if (!userId) return null;
  const since = new Date(Date.now() - graceMs);
  return prisma.refreshToken.findFirst({
    where: {
      userId,
      expiresAt: { gt: new Date() },
      createdAt: { gte: since },
    },
    orderBy: { createdAt: 'desc' },
  });
}
