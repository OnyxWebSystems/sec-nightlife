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
import { validateUsernameFormat } from '../lib/username.js';
import { createInAppNotification } from '../lib/inAppNotifications.js';
import { isIdentityVerifiedStatus } from '../middleware/requireIdentityVerified.js';

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

function userPayload(user, profileExtras = {}) {
  return {
    id: user.id,
    email: user.email,
    full_name: user.fullName,
    role: user.role,
    verified: user.emailVerified,
    ...profileExtras,
  };
}

function normalizeEmail(email) {
  return (email || '').trim().toLowerCase();
}

async function canAccessAdminDashboard(user) {
  if (!user) return false;
  if (['ADMIN', 'SUPER_ADMIN'].includes(user.role)) return true;
  const userEmail = normalizeEmail(user.email);
  if (!userEmail) return false;
  try {
    const delegate = await prisma.adminDashboardDelegate.findFirst({
      where: { email: userEmail, isActive: true },
      select: { id: true },
    });
    return Boolean(delegate);
  } catch (err) {
    // Migration not yet deployed in this environment; keep auth functional.
    const msg = String(err?.message || '');
    if (msg.includes('admin_dashboard_delegates') || msg.includes('does not exist')) {
      return false;
    }
    throw err;
  }
}

async function ensureIdentityReminderNotification(userId, verificationStatus) {
  if (!userId || isIdentityVerifiedStatus(verificationStatus)) return;
  const isSubmitted = verificationStatus === 'submitted';
  const title = isSubmitted ? 'ID verification in review' : 'Complete identity verification';
  const body = isSubmitted
    ? 'Your ID was uploaded successfully and is currently being reviewed for approval.'
    : 'You are not verified yet. Open Edit Profile to upload your ID when you are ready.';
  // One-time reminder per message type/state.
  const [existingInApp, existingLegacy] = await Promise.all([
    prisma.inAppNotification.findFirst({
      where: {
        userId,
        type: 'IDENTITY_VERIFICATION_REMINDER',
        title,
      },
      select: { id: true },
    }),
    prisma.notification.findFirst({
      where: {
        userId,
        type: 'IDENTITY_VERIFICATION_REMINDER',
        title,
      },
      select: { id: true },
    }),
  ]);
  if (!existingInApp && !existingLegacy) {
    await createInAppNotification({
      userId,
      type: 'IDENTITY_VERIFICATION_REMINDER',
      title,
      body,
      referenceId: '/EditProfile',
      referenceType: 'ROUTE',
    });
  }
}

/** Rows that reference users without Prisma User FK / cascade — must be removed before user.delete */
async function deleteUserOrphans(tx, userId) {
  await tx.accountRole.deleteMany({ where: { userId } });
  await tx.friendRequest.deleteMany({
    where: { OR: [{ fromUserId: userId }, { toUserId: userId }] }
  });
  await tx.hostEvent.deleteMany({ where: { hostUserId: userId } });
  await tx.eventAttendance.deleteMany({ where: { userId } });
  await tx.venueBlockedUser.deleteMany({ where: { userId } });
  await tx.serviceRating.deleteMany({
    where: { OR: [{ raterUserId: userId }, { rateeUserId: userId }] }
  });
  await tx.promotionImpression.deleteMany({ where: { userId } });
  await tx.notification.deleteMany({ where: { userId } });
  await tx.transaction.deleteMany({ where: { userId } });
  await tx.payment.deleteMany({ where: { userId } });
  await tx.message.deleteMany({ where: { senderId: userId } });
  await tx.profileView.deleteMany({
    where: { OR: [{ viewerId: userId }, { viewedId: userId }] }
  });
  await tx.reputationScore.deleteMany({ where: { userId } });
  await tx.analyticsEvent.deleteMany({ where: { userId } });

  const bookings = await tx.tableBooking.findMany({
    where: { organizerUserId: userId },
    select: { id: true }
  });
  for (const b of bookings) {
    // eslint-disable-next-line no-await-in-loop
    await tx.tableBookingSplit.deleteMany({ where: { bookingId: b.id } });
  }
  await tx.tableBooking.deleteMany({ where: { organizerUserId: userId } });
  await tx.tableBookingSplit.deleteMany({ where: { userId } });

  await tx.partyGroup.deleteMany({ where: { createdBy: userId } });
  await tx.partyGroupMember.deleteMany({ where: { userId } });
  await tx.partyGroupInvitation.deleteMany({
    where: { OR: [{ inviterId: userId }, { inviteeId: userId }] }
  });
}

// ── Schemas ───────────────────────────────────────────────────────────────

/** Match login: trim + lowercase so DB email matches lookup (register/login/forgot). */
const emailSchemaField = z.preprocess(
  (v) => (typeof v === 'string' ? v.trim().toLowerCase() : v),
  z.string().email()
);

const registerSchema = z.object({
  email: emailSchemaField,
  password: z.string().min(8).max(128),
  full_name: z.string().min(1).max(200).optional(),
  username: z.union([z.string(), z.null(), z.undefined()]).optional(),
  role: z.enum(['USER', 'VENUE', 'FREELANCER']).default('USER')
});

const loginSchema = z.object({
  email: emailSchemaField,
  password: z.string().min(1).max(256),
  role: z.enum(['USER', 'VENUE', 'FREELANCER', 'ADMIN', 'SUPER_ADMIN', 'MODERATOR']).optional()
});

const refreshSchema = z.object({
  refreshToken: z.string().min(1)
});

const forgotPasswordSchema = z.object({
  email: emailSchemaField
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
    const { email, password, full_name, username, role } = parsed.data;
    const normalizedPassword = password.trim();

    const usernameTrimmed =
      username === null || username === undefined ? '' : String(username).trim();
    if (!usernameTrimmed) {
      return res.status(400).json({ field: 'username', message: 'Username is required.' });
    }

    const v = validateUsernameFormat(usernameTrimmed);
    if (!v.ok) {
      return res.status(400).json({ field: 'username', message: v.message });
    }

    const usernameNormalized = v.username;
    const taken = await prisma.user.findFirst({
      where: { username: usernameNormalized, deletedAt: null },
      select: { id: true },
    });
    if (taken) {
      return res.status(409).json({
        field: 'username',
        message: 'This username is already taken. Please choose a different one.',
      });
    }

    const existing = await prisma.user.findFirst({
      where: { email, role, deletedAt: null }
    });
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists for this account type. Please sign in.' });
    }

    const passwordHash = await bcrypt.hash(normalizedPassword, SALT_ROUNDS);

    const skipVerification = process.env.SKIP_EMAIL_VERIFICATION === 'true' || process.env.SKIP_EMAIL_VERIFICATION === '1';
    const rawVerificationToken = generateSecureToken();
    const verificationTokenHash = hashTokenSha256(rawVerificationToken);

    const user = await prisma.user.create({
      data: {
        email,
        passwordHash,
        fullName: full_name || null,
        username: usernameNormalized,
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

    await prisma.userProfile.upsert({
      where: { userId: user.id },
      create: { userId: user.id, username: usernameNormalized },
      update: { username: usernameNormalized },
    }).catch(() => {});

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

    const normalizedEmail = email;
    let user = null;

    const tryPassword = async (account) => {
      if (!account) return null;
      if (await bcrypt.compare(password, account.passwordHash)) return account;
      const trimmedPassword = password.trim();
      if (trimmedPassword !== password && await bcrypt.compare(trimmedPassword, account.passwordHash)) {
        return account;
      }
      return null;
    };

    // Party Goer / Business Owner: authenticate the selected (email, role) row.
    // If that fails but there is exactly one account for this email, accept it when the
    // password matches (wrong Party/Business toggle should not block single-account users,
    // including staff roles that have only one account row).
    if (loginRole === 'USER' || loginRole === 'VENUE') {
      const row = await prisma.user.findFirst({
        where: { email: normalizedEmail, role: loginRole, deletedAt: null }
      });
      user = await tryPassword(row);
      if (!user) {
        const allForEmail = await prisma.user.findMany({
          where: { email: normalizedEmail, deletedAt: null }
        });
        if (allForEmail.length === 1) {
          user = await tryPassword(allForEmail[0]);
        } else if (allForEmail.length > 1) {
          // If multiple accounts share one email, allow login when exactly one row matches password.
          // This prevents stale Party/Business toggle state from blocking valid credentials.
          const matched = [];
          for (const account of allForEmail) {
            // eslint-disable-next-line no-await-in-loop
            const ok = await tryPassword(account);
            if (ok) matched.push(ok);
          }
          if (matched.length === 1) {
            [user] = matched;
          }
        }
      }
    } else if (loginRole) {
      // Staff / freelancer: try requested role first, then fall back if password matches another row (wrong client role).
      let row = await prisma.user.findFirst({
        where: { email: normalizedEmail, role: loginRole, deletedAt: null }
      });
      user = await tryPassword(row);
      if (!user) {
        const accounts = await prisma.user.findMany({
          where: { email: normalizedEmail, deletedAt: null },
          orderBy: { createdAt: 'asc' }
        });
        const rolePriority = ['SUPER_ADMIN', 'ADMIN', 'MODERATOR', 'VENUE', 'FREELANCER', 'USER'];
        const sorted = [...accounts].sort((a, b) => {
          const ai = rolePriority.indexOf(a.role);
          const bi = rolePriority.indexOf(b.role);
          return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
        });
        for (const account of sorted) {
          // eslint-disable-next-line no-await-in-loop
          const ok = await tryPassword(account);
          if (ok) {
            user = ok;
            break;
          }
        }
      }
    } else {
      // No role: legacy — single account or first password match (priority order).
      const accounts = await prisma.user.findMany({
        where: { email: normalizedEmail, deletedAt: null },
        orderBy: { createdAt: 'asc' }
      });

      if (accounts.length === 1) {
        user = await tryPassword(accounts[0]);
      } else {
        const rolePriority = ['SUPER_ADMIN', 'ADMIN', 'MODERATOR', 'VENUE', 'FREELANCER', 'USER'];
        const sorted = [...accounts].sort((a, b) => {
          const ai = rolePriority.indexOf(a.role);
          const bi = rolePriority.indexOf(b.role);
          return (ai === -1 ? 999 : ai) - (bi === -1 ? 999 : bi);
        });
        for (const account of sorted) {
          // eslint-disable-next-line no-await-in-loop
          const ok = await tryPassword(account);
          if (ok) {
            user = ok;
            break;
          }
        }
      }
    }

    if (!user) {
      const activeAccountsForEmail = await prisma.user.count({
        where: { email: normalizedEmail, deletedAt: null }
      });
      // SECURITY: log failed attempt; same error message for both wrong email and wrong password
      await audit({
        userId: user?.id || null,
        action: 'LOGIN_FAILED',
        entityType: 'user',
        entityId: user?.id || null,
        metadata: {
          email: normalizedEmail,
          roleSupplied: loginRole || null,
          activeAccountsForEmail,
          failureReason: activeAccountsForEmail > 0 ? 'password_mismatch' : 'lookup_missing'
        },
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

    const profile = await prisma.userProfile.findUnique({
      where: { userId: user.id },
      select: { verificationStatus: true },
    });
    const vStatus = profile?.verificationStatus ?? 'pending';
    const canAdminDashboard = await canAccessAdminDashboard(user);
    await ensureIdentityReminderNotification(user.id, vStatus);

    res.json({
      user: userPayload(user, {
        verification_status: vStatus,
        identity_verified: isIdentityVerifiedStatus(vStatus),
        can_admin_dashboard: canAdminDashboard,
      }),
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
      where: { email, deletedAt: null }
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

    const prof = await prisma.userProfile.findUnique({
      where: { userId: user.id },
      select: { verificationStatus: true },
    });
    const vSt = prof?.verificationStatus ?? 'pending';
    const canAdminDashboard = await canAccessAdminDashboard(user);

    res.json({
      user: userPayload(user, {
        verification_status: vSt,
        identity_verified: isIdentityVerifiedStatus(vSt),
        can_admin_dashboard: canAdminDashboard,
      }),
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
      where: { email, deletedAt: null }
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
      where: { id: payload.userId, deletedAt: null },
    });
    if (!user) return res.status(401).json({ error: 'User not found' });
    const profile = await prisma.userProfile.findUnique({
      where: { userId: user.id },
      select: { verificationStatus: true },
    });
    const vStatus = profile?.verificationStatus ?? 'pending';
    const canAdminDashboard = await canAccessAdminDashboard(user);
    await ensureIdentityReminderNotification(user.id, vStatus);
    res.json(
      userPayload(user, {
        verification_status: vStatus,
        identity_verified: isIdentityVerifiedStatus(vStatus),
        can_admin_dashboard: canAdminDashboard,
      }),
    );
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
});

// ── Account Deletion (App Store requirement — MANDATORY) ─────────────────
// Hard delete removes the user row so (email, role) and username can be re-registered.
// SECURITY: Single transaction — audit row, revoke sessions, clear orphan FK rows, delete user.

router.delete('/account', authenticateToken, async (req, res, next) => {
  try {
    const userId = req.userId;

    const existing = await prisma.user.findFirst({
      where: { id: userId, deletedAt: null },
      select: { id: true, email: true, role: true }
    });
    if (!existing) {
      return res.status(404).json({ error: 'User not found' });
    }

    await prisma.$transaction(
      async (tx) => {
        await tx.auditLog.create({
          data: {
            userId,
            action: 'ACCOUNT_DELETED',
            resource: 'user',
            resourceId: userId,
            details: { email: existing.email, role: existing.role, hardDelete: true },
            ipAddress: getIp(req)
          }
        });

        await tx.refreshToken.deleteMany({ where: { userId } });
        await deleteUserOrphans(tx, userId);
        await tx.user.delete({ where: { id: userId } });
      },
      { maxWait: 20000, timeout: 120000 }
    );

    res.json({ success: true, message: 'Account deleted. We are sorry to see you go.' });
  } catch (err) {
    next(err);
  }
});

export default router;
