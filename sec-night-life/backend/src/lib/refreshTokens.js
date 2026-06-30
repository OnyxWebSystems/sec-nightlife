import bcrypt from 'bcrypt';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from './prisma.js';

const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

export function hashTokenSha256Sync(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

async function verifyRefreshTokenHash(raw, hash) {
  return bcrypt.compare(raw, hash);
}

async function hashRefreshToken(raw) {
  return bcrypt.hash(raw, 10);
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

export async function findRefreshTokenRecord(rawToken) {
  if (!rawToken) return null;

  const lookup = hashTokenSha256Sync(rawToken);
  const byLookup = await prisma.refreshToken.findFirst({
    where: { tokenLookup: lookup, expiresAt: { gt: new Date() } },
  });
  if (byLookup && (await verifyRefreshTokenHash(rawToken, byLookup.token))) {
    return byLookup;
  }

  const userId = parseRefreshTokenUserId(rawToken);
  if (userId) {
    const candidates = await prisma.refreshToken.findMany({
      where: { userId, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: 'desc' },
    });
    for (const c of candidates) {
      if (await verifyRefreshTokenHash(rawToken, c.token)) return c;
    }
  }

  // Legacy opaque tokens (pre userId prefix / token_lookup)
  const legacy = await prisma.refreshToken.findMany({
    where: { expiresAt: { gt: new Date() }, tokenLookup: null },
    orderBy: { createdAt: 'desc' },
    take: 500,
  });
  for (const c of legacy) {
    if (await verifyRefreshTokenHash(rawToken, c.token)) return c;
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

export async function createRefreshTokenRow(userId, refreshExpiry) {
  const rawRefresh = `${userId}.${uuidv4()}.${uuidv4()}`;
  const refreshHash = await hashRefreshToken(rawRefresh);
  const tokenLookup = hashTokenSha256Sync(rawRefresh);

  await prisma.refreshToken.create({
    data: {
      userId,
      token: refreshHash,
      tokenLookup,
      expiresAt: refreshExpiry,
    },
  });

  return rawRefresh;
}
