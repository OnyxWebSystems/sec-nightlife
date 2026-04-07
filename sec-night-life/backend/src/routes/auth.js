import { Router } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../lib/prisma.js';
import { audit } from '../lib/audit.js';
import { logger } from '../lib/logger.js';
import { sendVerificationEmail, sendPasswordResetEmail } from '../lib/email.js';
import { authenticateToken } from '../middleware/auth.js';

const router = Router();
const SALT_ROUNDS = 12;

// STEP 1: Read secrets — validateEnv() already ensured these are set and non-placeholder
const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const JWT_ACCESS_EXPIRY = process.env.JWT_ACCESS_EXPIRY || '15m';
const JWT_REFRESH_EXPIRY = process.env.JWT_REFRESH_EXPIRY || '7d';

// ── Helpers ───────────────────────────────────────────────────────────────

function getIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || req.socket?.remoteAddress || null;
}

/** Generate a cryptographically secure random token */
function generateSecureToken() {
  return crypto.randomBytes(32).toString('hex');
}

/** SHA-256 hash of a token for DB storage (fast, one-way) */
function hashTokenSha256(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

/** bcrypt hash for refresh tokens (slower, stored in refresh_tokens table) */
async function hashRefreshToken(raw) {
  return bcrypt.hash(raw, 10);
}

async function verifyRefreshTokenHash(raw, hash) {
  return bcrypt.compare(raw, hash);
}

/** Issue a new access + refresh token pair; stores hashed refresh token */
async function issueTokens(user) {
  const accessToken = jwt.sign(
    { userId: user.id, role: user.role },
    JWT_ACCESS_SECRET,
    { expiresIn: JWT_ACCESS_EXPIRY }
  );
  const rawRefresh = uuidv4() + '.' + uuidv4(); // high-entropy opaque token
  const refreshHash = await hashRefreshToken(rawRefresh);
  const refreshExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await prisma.refreshToken.create({
    data: { userId: user.id, token: refreshHash, expiresAt: refreshExpiry }
  });

  return { accessToken, refreshToken: rawRefresh };
}

function userPayload(user) {
  return {
    id: user.id,
    email: user.email,
    full_name: user.fullName,
    role: user.role,
    verified: user.emailVerified
  };
}

// ── Schemas ───────────────────────────────────────────────────────────────

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8).max(128),
  full_name: z.string().min(1).max(200).optional(),
  role: z.enum(['USER', 'VENUE', 'FREELANCER']).default('USER')
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1).max(256),
  role: z.enum(['USER', 'VENUE', 'FREELANCER', 'ADMIN', 'SUPER_ADMIN']).optional()
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1)
});

const forgotPasswordSchema = z.object({
  email: z.string().email()
});

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8).max(128)
});

const verifyEmailSchema = z.object({
  token: z.string().min(1)
});

// ── Register ──────────────────────────────────────────────────────────────

router.post('/register', async (req, res, next) => {
  try {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    }
    const { email, password, full_name, role } = parsed.data;

    const existing = await prisma.user.findFirst({
      where: { email: email.toLowerCase(), role, deletedAt: null }
    });
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists for this account type. Please sign in.' });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);

    const skipVerification = process.env.SKIP_EMAIL_VERIFICATION === 'true' || process.env.SKIP_EMAIL_VERIFICATION === '1';
    const rawVerificationToken = generateSecureToken();
    const verificationTokenHash = hashTokenSha256(rawVerificationToken);

    const user = await prisma.user.create({
      data: {
        email: email.toLowerCase(),
        passwordHash,
        fullName: full_name || null,
        role,
        emailVerified: skipVerification,
        verificationTokenHash: skipVerification ? null : verificationTokenHash,
        verificationExpiry: skipVerification ? null : new Date(Date.now() + 24 * 60 * 60 * 1000)
      },
      select: { id: true, email: true, fullName: true, role: true, emailVerified: true }
    });

    if (!skipVerification) {
      sendVerificationEmail(user.email, rawVerificationToken).catch(err => {
        logger.error('Failed to send verification email', { userId: user.id, message: err.message });
      });
    }

    const { accessToken, refreshToken } = await issueTokens(user);

    await audit({
      userId: user.id,
      action: 'USER_REGISTERED',
      entityType: 'user',
      entityId: user.id,
      metadata: { email: user.email, role: user.role },
      ipAddress: getIp(req)
    });

    res.status(201).json({
      user: userPayload(user),
      accessToken,
      refreshToken,
      expiresIn: 900,
      emailVerificationRequired: !skipVerification
    });
  } catch (err) {
    next(err);
  }
});

// ── Login ─────────────────────────────────────────────────────────────────

router.post('/login', async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid email or password' });
    }
    const { email, password, role: loginRole } = parsed.data;

    // Require role so Party Goer and Business Owner stay separate (same email = different accounts).
    // If no role is supplied, pick the account whose password matches.
    let user = null;
    if (loginRole) {
      user = await prisma.user.findFirst({
        where: { email: email.toLowerCase(), role: loginRole, deletedAt: null }
      });
    } else {
      const accounts = await prisma.user.findMany({
        where: { email: email.toLowerCase(), deletedAt: null },
        orderBy: { createdAt: 'asc' }
      });

      if (accounts.length === 1) {
        [user] = accounts;
      } else {
        // Prefer staff roles first, but ultimately choose the first account that matches the password.
        const rolePriority = ['SUPER_ADMIN', 'ADMIN', 'MODERATOR', 'VENUE', 'FREELANCER', 'USER'];
        const sorted = [...accounts].sort((a, b) => {
          const ai = rolePriority.indexOf(a.role);
          const bi = rolePriority.indexOf(b.role);
          return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
        });

        for (const account of sorted) {
          // eslint-disable-next-line no-await-in-loop
          const ok = await bcrypt.compare(password, account.passwordHash);
          if (ok) {
            user = account;
            break;
          }
        }
      }
    }

    // If a role was provided, we haven't compared yet; do it now.
    if (loginRole && user && !(await bcrypt.compare(password, user.passwordHash))) {
      user = null;
    }

    if (!user) {
      // SECURITY: log failed attempt; same error message for both wrong email and wrong password
      await audit({
        userId: user?.id || null,
        action: 'LOGIN_FAILED',
        entityType: 'user',
        entityId: user?.id || null,
        metadata: { email: email.toLowerCase(), roleSupplied: loginRole || null },
        ipAddress: getIp(req)
      });
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // STEP 5.4: Block login if email not verified (unless ALLOW_UNVERIFIED_LOGIN for preview/dev)
    const allowUnverified = process.env.ALLOW_UNVERIFIED_LOGIN === 'true' || process.env.ALLOW_UNVERIFIED_LOGIN === '1';
    if (!user.emailVerified && !allowUnverified) {
      await audit({
        userId: user.id,
        action: 'LOGIN_BLOCKED_UNVERIFIED',
        entityType: 'user',
        entityId: user.id,
        metadata: { email: user.email },
        ipAddress: getIp(req)
      });
      return res.status(403).json({
        error: 'Email not verified. Please check your inbox and verify your email before signing in.',
        code: 'EMAIL_NOT_VERIFIED'
      });
    }

    const { accessToken, refreshToken } = await issueTokens(user);

    await audit({
      userId: user.id,
      action: 'LOGIN_SUCCESS',
      entityType: 'user',
      entityId: user.id,
      metadata: { email: user.email },
      ipAddress: getIp(req)
    });

    res.json({
      user: userPayload(user),
      accessToken,
      refreshToken,
      expiresIn: 900
    });
  } catch (err) {
    next(err);
  }
});

// ── Verify Email ──────────────────────────────────────────────────────────

router.post('/verify-email', async (req, res, next) => {
  try {
    const parsed = verifyEmailSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Verification token required' });
    }
    const { token: rawToken } = parsed.data;

    // STEP 5.3: Hash the incoming token and compare with stored hash
    const tokenHash = hashTokenSha256(rawToken);

    const user = await prisma.user.findFirst({
      where: {
        verificationTokenHash: tokenHash,
        verificationExpiry: { gt: new Date() },
        deletedAt: null
      }
    });

    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired verification link. Request a new one.' });
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        emailVerified: true,
        verificationTokenHash: null,
        verificationExpiry: null
      }
    });

    await audit({
      userId: user.id,
      action: 'EMAIL_VERIFIED',
      entityType: 'user',
      entityId: user.id,
      metadata: { email: user.email },
      ipAddress: getIp(req)
    });

    res.json({ success: true, message: 'Email verified. You can now sign in.' });
  } catch (err) {
    next(err);
  }
});

// ── Resend Verification Email ─────────────────────────────────────────────
// Rate limiting is applied in index.js (resendLimiter)

router.post('/resend-verification', async (req, res, next) => {
  try {
    const parsed = forgotPasswordSchema.safeParse(req.body); // reuse email schema
    if (!parsed.success) {
      return res.status(400).json({ error: 'Valid email required' });
    }
    const { email } = parsed.data;

    const user = await prisma.user.findFirst({
      where: { email: email.toLowerCase(), deletedAt: null }
    });

    // SECURITY: same response whether user exists or not
    if (user && !user.emailVerified) {
      const rawToken = generateSecureToken();
      const tokenHash = hashTokenSha256(rawToken);

      await prisma.user.update({
        where: { id: user.id },
        data: {
          verificationTokenHash: tokenHash,
          verificationExpiry: new Date(Date.now() + 24 * 60 * 60 * 1000)
        }
      });

      sendVerificationEmail(user.email, rawToken).catch(err => {
        logger.error('Failed to resend verification email', { userId: user.id, message: err.message });
      });
    }

    res.json({ message: 'If the email exists and is unverified, a new verification link was sent.' });
  } catch (err) {
    next(err);
  }
});

// ── Refresh Token ─────────────────────────────────────────────────────────

router.post('/refresh', async (req, res, next) => {
  try {
    const parsed = refreshSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Refresh token required' });
    }
    const { refreshToken: rawToken } = parsed.data;

    // Try to narrow by userId from JWT if rawToken happens to be a JWT (legacy)
    let payloadUserId = null;
    try {
      const p = jwt.verify(rawToken, JWT_REFRESH_SECRET);
      payloadUserId = p?.userId || null;
    } catch {
      // opaque token — no JWT payload, that's fine
    }

    const candidates = await prisma.refreshToken.findMany({
      where: {
        expiresAt: { gt: new Date() },
        ...(payloadUserId ? { userId: payloadUserId } : {})
      },
      take: 20
    });

    let matched = null;
    for (const c of candidates) {
      if (await verifyRefreshTokenHash(rawToken, c.token)) {
        matched = c;
        break;
      }
    }

    if (!matched) {
      return res.status(401).json({ error: 'Invalid or expired refresh token' });
    }

    const user = await prisma.user.findUnique({
      where: { id: matched.userId, deletedAt: null }
    });
    if (!user) {
      await prisma.refreshToken.delete({ where: { id: matched.id } });
      return res.status(401).json({ error: 'User not found' });
    }
    if (user.suspendedAt) {
      await prisma.refreshToken.delete({ where: { id: matched.id } });
      return res.status(403).json({ error: 'Account suspended. Contact support.' });
    }

    // SECURITY: Rotate — delete old token, issue new pair
    await prisma.refreshToken.delete({ where: { id: matched.id } });
    const { accessToken, refreshToken: newRefreshToken } = await issueTokens(user);

    res.json({
      user: userPayload(user),
      accessToken,
      refreshToken: newRefreshToken,
      expiresIn: 900
    });
  } catch (err) {
    next(err);
  }
});

// ── Logout ────────────────────────────────────────────────────────────────

router.post('/logout', async (req, res, next) => {
  try {
    const { refreshToken: rawToken } = req.body;
    if (rawToken && typeof rawToken === 'string') {
      const candidates = await prisma.refreshToken.findMany({
        where: { expiresAt: { gt: new Date() } },
        take: 50
      });
      for (const c of candidates) {
        if (await verifyRefreshTokenHash(rawToken, c.token)) {
          await prisma.refreshToken.delete({ where: { id: c.id } });
          break;
        }
      }
    }
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// ── Forgot Password ───────────────────────────────────────────────────────

router.post('/forgot-password', async (req, res, next) => {
  try {
    const parsed = forgotPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Valid email required' });
    }
    const { email } = parsed.data;

    const user = await prisma.user.findFirst({
      where: { email: email.toLowerCase(), deletedAt: null }
    });
    if (user) {
      const rawToken = generateSecureToken();
      const tokenHash = hashTokenSha256(rawToken);

      await prisma.user.update({
        where: { id: user.id },
        data: {
          resetTokenHash: tokenHash,
          resetTokenExpiry: new Date(Date.now() + 60 * 60 * 1000)
        }
      });

      sendPasswordResetEmail(user.email, rawToken).catch(err => {
        logger.error('Failed to send password reset email', { userId: user.id, message: err.message });
      });
    }

    // SECURITY: always return same response to prevent email enumeration
    res.json({ message: 'If the email exists, a reset link was sent' });
  } catch (err) {
    next(err);
  }
});

// ── Reset Password ────────────────────────────────────────────────────────

router.post('/reset-password', async (req, res, next) => {
  try {
    const parsed = resetPasswordSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input' });
    }
    const { token: rawToken, password } = parsed.data;

    const tokenHash = hashTokenSha256(rawToken);

    const user = await prisma.user.findFirst({
      where: {
        resetTokenHash: tokenHash,
        resetTokenExpiry: { gt: new Date() },
        deletedAt: null
      }
    });
    if (!user) {
      return res.status(400).json({ error: 'Invalid or expired reset token' });
    }

    const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, resetTokenHash: null, resetTokenExpiry: null }
    });

    // Invalidate all existing refresh tokens on password reset
    await prisma.refreshToken.deleteMany({ where: { userId: user.id } });

    await audit({
      userId: user.id,
      action: 'PASSWORD_RESET',
      entityType: 'user',
      entityId: user.id,
      ipAddress: getIp(req)
    });

    res.json({ message: 'Password reset successfully. Please sign in.' });
  } catch (err) {
    next(err);
  }
});

// ── Get Current User ──────────────────────────────────────────────────────

router.get('/me', async (req, res, next) => {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  try {
    const payload = jwt.verify(token, JWT_ACCESS_SECRET);
    const user = await prisma.user.findUnique({
      where: { id: payload.userId, deletedAt: null }
    });
    if (!user) return res.status(401).json({ error: 'User not found' });
    res.json(userPayload(user));
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
});

// ── Account Deletion (App Store requirement — MANDATORY) ─────────────────
// SECURITY: Atomic transaction ensures no orphaned sessions remain.
// Soft delete preserves data for legal/audit. deletedAt prevents all future logins.
// authenticateToken already checks deletedAt on every request — once set, the
// user's access token will be rejected on the very next authenticated call.

router.delete('/account', authenticateToken, async (req, res, next) => {
  try {
    const userId = req.userId;
    const now = new Date();

    // Atomic: soft-delete + revoke all tokens in one transaction
    await prisma.$transaction([
      // 1. Soft delete — sets deletedAt, which authenticateToken checks on every request
      prisma.user.update({
        where: { id: userId },
        data: {
          deletedAt: now,
          // Also suspend to block any race-condition window before token expiry
          suspendedAt: now,
          suspendedReason: 'Account deleted by user'
        }
      }),
      // 2. Revoke ALL refresh tokens — prevents any new access tokens from being issued
      prisma.refreshToken.deleteMany({ where: { userId } })
    ]);

    // Audit log is written after transaction succeeds
    await audit({
      userId,
      action: 'ACCOUNT_DELETED',
      entityType: 'user',
      entityId: userId,
      ipAddress: getIp(req)
    });

    res.json({ success: true, message: 'Account deleted. We are sorry to see you go.' });
  } catch (err) {
    next(err);
  }
});

export default router;
