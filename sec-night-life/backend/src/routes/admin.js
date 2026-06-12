/**
 * Admin Moderation Dashboard Routes
 * SECURITY: All routes require ADMIN role. Never expose to USER or VENUE.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireAdmin } from '../middleware/rbac.js';
import { auditFromReq } from '../lib/audit.js';
import { privateDownloadUrl, signCloudinaryUrl } from '../lib/cloudinarySignedUrl.js';
import { createInAppNotification } from '../lib/inAppNotifications.js';
import { sendIdVerificationApprovedEmail } from '../lib/email.js';
import { requireSuperAdmin } from '../middleware/complianceReviewer.js';
import { getPromotersLeaderboard } from '../lib/leaderboard.js';
import { logger } from '../lib/logger.js';
import { isIdentityVerifiedStatus } from '../middleware/requireIdentityVerified.js';

const router = Router();

function normalizeEmail(email) {
  return (email || '').trim().toLowerCase();
}

// All admin routes require authentication + admin role
router.use(authenticateToken, requireAdmin); // SECURITY: admin-only zone

// ── Reports ───────────────────────────────────────────────────────────────

router.get('/reports', async (req, res, next) => {
  try {
    const { status = 'pending', category, priority, targetType, assignedTo, from, to, limit = 50, offset = 0 } = req.query;
    const where = { status: String(status) };
    if (category) where.category = String(category);
    if (priority) where.priority = String(priority);
    if (targetType) where.targetType = String(targetType);
    if (assignedTo) where.assignedTo = String(assignedTo);
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(String(from));
      if (to) where.createdAt.lte = new Date(String(to));
    }

    const reports = await prisma.report.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(parseInt(limit) || 50, 200),
      skip: parseInt(offset) || 0,
      include: {
        reporter: { select: { id: true, email: true, fullName: true } },
      },
    });
    const total = await prisma.report.count({ where });
    res.json({ reports, total });
  } catch (err) {
    next(err);
  }
});

router.patch('/reports/:id/assign', async (req, res, next) => {
  try {
    const { assignedTo } = z.object({
      assignedTo: z.string().uuid().nullable().optional(),
    }).parse(req.body);

    const report = await prisma.report.update({
      where: { id: req.params.id },
      data: {
        assignedTo: assignedTo || null,
        status: 'in_review',
        reviewedAt: new Date(),
      },
    });
    res.json({ success: true, report });
  } catch (err) {
    next(err);
  }
});

router.patch('/reports/:id/resolve', async (req, res, next) => {
  try {
    const { action, resolutionNote } = z.object({
      action: z.enum(['action_taken', 'dismissed', 'resolved']),
      resolutionNote: z.string().min(3).max(2000),
    }).parse(req.body);

    const report = await prisma.report.update({
      where: { id: req.params.id },
      data: {
        status: action,
        resolutionNote,
        resolvedBy: req.userId,
        resolvedAt: new Date(),
        reviewedAt: new Date(),
      },
    });

    await auditFromReq(req, {
      userId: req.userId,
      action: `REPORT_${action.toUpperCase()}`,
      entityType: 'report',
      entityId: report.id,
      metadata: { reportId: report.id, targetType: report.targetType, targetId: report.targetId, resolutionNote },
    });

    res.json({ success: true, report });
  } catch (err) {
    next(err);
  }
});

router.post('/reports/:id/moderate', async (req, res, next) => {
  try {
    const { action, reason } = z.object({
      action: z.enum(['suspend_user', 'unsuspend_user', 'reject_venue', 'pending_venue', 'cancel_event']),
      reason: z.string().min(3).max(500),
    }).parse(req.body);

    const report = await prisma.report.findUnique({ where: { id: req.params.id } });
    if (!report) return res.status(404).json({ error: 'Report not found' });

    if (action === 'suspend_user' || action === 'unsuspend_user') {
      if (report.targetType !== 'user') return res.status(400).json({ error: 'Report target must be user' });
      if (action === 'suspend_user') {
        await prisma.user.update({
          where: { id: report.targetId },
          data: { suspendedAt: new Date(), suspendedReason: reason },
        });
        await prisma.refreshToken.deleteMany({ where: { userId: report.targetId } });
      } else {
        await prisma.user.update({
          where: { id: report.targetId },
          data: { suspendedAt: null, suspendedReason: null },
        });
      }
    }

    if (action === 'reject_venue' || action === 'pending_venue') {
      if (report.targetType !== 'venue') return res.status(400).json({ error: 'Report target must be venue' });
      await prisma.venue.update({
        where: { id: report.targetId },
        data: {
          complianceStatus: action === 'reject_venue' ? 'rejected' : 'pending',
          complianceRejectionNote: reason,
        },
      });
    }

    if (action === 'cancel_event') {
      if (report.targetType !== 'event') return res.status(400).json({ error: 'Report target must be event' });
      await prisma.event.update({
        where: { id: report.targetId },
        data: { status: 'cancelled' },
      });
    }

    const updatedReport = await prisma.report.update({
      where: { id: report.id },
      data: {
        status: 'action_taken',
        resolutionNote: reason,
        resolvedBy: req.userId,
        resolvedAt: new Date(),
        reviewedAt: new Date(),
      },
    });

    await auditFromReq(req, {
      userId: req.userId,
      action: `REPORT_MODERATION_${action.toUpperCase()}`,
      entityType: 'report',
      entityId: report.id,
      metadata: {
        reportId: report.id,
        targetType: report.targetType,
        targetId: report.targetId,
        reason,
      },
    });

    res.json({ success: true, report: updatedReport });
  } catch (err) {
    next(err);
  }
});

// ── User Moderation ───────────────────────────────────────────────────────

router.get('/users', async (req, res, next) => {
  try {
    const { search, role, suspended, limit = 50, offset = 0 } = req.query;
    const where = { deletedAt: null };
    if (role) where.role = String(role);
    if (suspended === 'true') where.suspendedAt = { not: null };
    if (suspended === 'false') where.suspendedAt = null;
    if (search) {
      where.OR = [
        { email: { contains: String(search), mode: 'insensitive' } },
        { fullName: { contains: String(search), mode: 'insensitive' } }
      ];
    }

    const users = await prisma.user.findMany({
      where,
      select: {
        id: true, email: true, fullName: true, role: true,
        isPremium: true, suspendedAt: true, suspendedReason: true,
        emailVerified: true, createdAt: true
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(parseInt(limit) || 50, 200),
      skip: parseInt(offset) || 0
    });

    const total = await prisma.user.count({ where });
    res.json({ users, total });
  } catch (err) {
    next(err);
  }
});

router.post('/users/:id/suspend', async (req, res, next) => {
  try {
    const { reason } = z.object({ reason: z.string().min(1).max(500) }).parse(req.body);

    // SECURITY: prevent admin from suspending themselves
    if (req.params.id === req.userId) {
      return res.status(400).json({ error: 'Cannot suspend yourself' });
    }

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { suspendedAt: new Date(), suspendedReason: reason }
    });

    // Revoke all refresh tokens on suspension
    await prisma.refreshToken.deleteMany({ where: { userId: user.id } });

    await auditFromReq(req, {
      userId: req.userId,
      action: 'USER_SUSPENDED',
      entityType: 'user',
      entityId: user.id,
      metadata: { targetEmail: user.email, reason }
    });

    res.json({ success: true, userId: user.id });
  } catch (err) {
    next(err);
  }
});

router.post('/users/:id/unsuspend', async (req, res, next) => {
  try {
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { suspendedAt: null, suspendedReason: null }
    });

    await auditFromReq(req, {
      userId: req.userId,
      action: 'USER_UNSUSPENDED',
      entityType: 'user',
      entityId: user.id,
      metadata: { targetEmail: user.email }
    });

    res.json({ success: true, userId: user.id });
  } catch (err) {
    next(err);
  }
});

router.patch('/users/:id/role', async (req, res, next) => {
  try {
    const { role } = z.object({
      role: z.enum(['USER', 'VENUE', 'FREELANCER', 'ADMIN', 'SUPER_ADMIN', 'MODERATOR'])
    }).parse(req.body);

    // SECURITY: prevent demoting yourself
    if (req.params.id === req.userId) {
      return res.status(400).json({ error: 'Cannot change your own role' });
    }

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { role }
    });

    await auditFromReq(req, {
      userId: req.userId,
      action: 'ROLE_CHANGED',
      entityType: 'user',
      entityId: user.id,
      metadata: { targetEmail: user.email, newRole: role }
    });

    res.json({ success: true, userId: user.id, role });
  } catch (err) {
    next(err);
  }
});

// ── Audit Log Viewer ──────────────────────────────────────────────────────

router.get('/audit-logs', async (req, res, next) => {
  try {
    const { userId, action, resource, from, to, limit = 50, offset = 0 } = req.query;
    const where = {};
    if (userId) where.userId = String(userId);
    if (action) where.action = { contains: String(action), mode: 'insensitive' };
    if (resource) where.resource = String(resource);
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(String(from));
      if (to) where.createdAt.lte = new Date(String(to));
    }

    const logs = await prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(parseInt(limit) || 50, 200),
      skip: parseInt(offset) || 0,
      include: {
        user: { select: { id: true, email: true, fullName: true } }
      }
    });

    const total = await prisma.auditLog.count({ where });
    res.json({ logs, total });
  } catch (err) {
    next(err);
  }
});

// ── Payments ───────────────────────────────────────────────────────────────

function basePaymentReference(ref) {
  const s = String(ref || '');
  const idx = s.indexOf(':');
  return idx >= 0 ? s.slice(0, idx) : s;
}

function aggregateLedgersForPayments(payments, ledgers) {
  const byBase = new Map();
  for (const row of ledgers) {
    const base = basePaymentReference(row.paymentReference);
    if (!byBase.has(base)) {
      byBase.set(base, { grossZar: 0, secAmountZar: 0, recipientAmountZar: 0, statuses: [] });
    }
    const agg = byBase.get(base);
    agg.grossZar += Number(row.grossAmount) || 0;
    agg.secAmountZar += Number(row.secAmount) || 0;
    agg.recipientAmountZar += Number(row.recipientAmount) || 0;
    if (row.status) agg.statuses.push(row.status);
  }

  return payments.map((p) => {
    const agg = byBase.get(p.reference);
    const statuses = agg?.statuses || [];
    const pendingStatuses = new Set(['PENDING', 'FAILED', 'SKIPPED_NO_RECIPIENT']);
    let transferStatus = null;
    if (statuses.length) {
      if (statuses.every((s) => s === 'COMPLETED' || s === 'TRANSFERRED' || s === 'SKIPPED_NO_RECIPIENT')) {
        transferStatus = statuses.some((s) => s === 'COMPLETED' || s === 'TRANSFERRED') ? 'COMPLETED' : 'SKIPPED';
      } else if (statuses.some((s) => pendingStatuses.has(s))) {
        transferStatus = 'PENDING';
      } else {
        transferStatus = 'MIXED';
      }
    }
    const grossZar = Number(p.amount) || 0;
    return {
      ...p,
      grossZar,
      secAmountZar: agg?.secAmountZar ?? null,
      recipientAmountZar: agg?.recipientAmountZar ?? null,
      ledgerGrossZar: agg?.grossZar ?? null,
      transferStatus,
      no_ledger: p.status === 'success' && !agg,
    };
  });
}

router.get('/payments', async (req, res, next) => {
  try {
    const { ensureEventTicketsForPayment } = await import('../lib/issueEventTickets.js');
    const stuckPending = await prisma.payment.findMany({
      where: { status: 'pending' },
      take: 40,
      orderBy: { createdAt: 'desc' },
      select: { reference: true },
    });
    await Promise.all(
      stuckPending.map((p) =>
        ensureEventTicketsForPayment(p.reference, { status: 'success' }).catch(() => null),
      ),
    );

    const incompleteTicketPayments = await prisma.payment.findMany({
      where: { status: 'success', type: { in: ['ticket', 'event'] } },
      take: 30,
      orderBy: { createdAt: 'desc' },
      select: { reference: true },
    });
    await Promise.all(
      incompleteTicketPayments.map((p) =>
        ensureEventTicketsForPayment(p.reference, { status: 'success' }).catch(() => null),
      ),
    );

    const { status, type, limit = 50, offset = 0, from, to } = req.query;
    const where = {};
    const rawStatus = status != null && String(status) !== '' ? String(status) : '';
    if (rawStatus === 'all') {
      // no status filter
    } else if (rawStatus) {
      where.status = rawStatus;
    } else {
      where.status = { in: ['success', 'failed', 'pending'] };
    }
    if (type) where.type = String(type);
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(String(from));
      if (to) where.createdAt.lte = new Date(String(to));
    }

    const payments = await prisma.payment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(parseInt(limit) || 50, 200),
      skip: parseInt(offset) || 0,
    });
    const total = await prisma.payment.count({ where });

    const refs = payments.map((p) => p.reference);
    const ledgers =
      refs.length > 0
        ? await prisma.payoutLedger.findMany({
            where: {
              OR: refs.flatMap((ref) => [
                { paymentReference: ref },
                { paymentReference: { startsWith: `${ref}:` } },
              ]),
            },
          })
        : [];

    const enriched = aggregateLedgersForPayments(payments, ledgers);

    const successWhere = { ...where, status: 'success' };
    const [grossAgg, ledgerAgg, pendingTransfers] = await Promise.all([
      prisma.payment.aggregate({ where: successWhere, _sum: { amount: true }, _count: true }),
      prisma.payoutLedger.aggregate({
        _sum: { grossAmount: true, secAmount: true, recipientAmount: true },
      }),
      prisma.payoutLedger.count({ where: { status: { in: ['PENDING', 'FAILED'] } } }),
    ]);

    const totalsByStatus = await prisma.payment.groupBy({
      by: ['status'],
      where,
      _sum: { amount: true },
      _count: true,
    });

    res.json({
      payments: enriched,
      total,
      summary: totalsByStatus,
      revenue: {
        totalGrossZar: grossAgg._sum?.amount ?? 0,
        totalSecRevenueZar: ledgerAgg._sum?.secAmount ?? 0,
        totalRecipientShareZar: ledgerAgg._sum?.recipientAmount ?? 0,
        pendingTransfers,
        paymentCount: grossAgg._count ?? 0,
      },
    });
  } catch (err) {
    next(err);
  }
});

router.get('/payouts', async (req, res, next) => {
  try {
    const { from, to, limit = 50, offset = 0 } = req.query;
    const where = {};
    if (from || to) {
      where.createdAt = {};
      if (from) where.createdAt.gte = new Date(String(from));
      if (to) where.createdAt.lte = new Date(String(to));
    }
    const [rows, total, agg] = await Promise.all([
      prisma.payoutLedger.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: Math.min(parseInt(limit) || 50, 200),
        skip: parseInt(offset) || 0,
        include: {
          recipientUser: { select: { id: true, email: true, fullName: true } },
          recipientVenue: { select: { id: true, name: true } },
        },
      }),
      prisma.payoutLedger.count({ where }),
      prisma.payoutLedger.aggregate({
        where,
        _sum: { grossAmount: true, secAmount: true, recipientAmount: true },
      }),
    ]);
    res.json({
      rows,
      total,
      summary: {
        totalGrossZar: agg._sum?.grossAmount ?? 0,
        totalSecRevenueZar: agg._sum?.secAmount ?? 0,
        totalRecipientShareZar: agg._sum?.recipientAmount ?? 0,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── Verification Queue (User ID) ───────────────────────────────────────────

router.get('/verification/users', async (req, res, next) => {
  try {
    const { status = 'pending', limit = 50, offset = 0 } = req.query;
    const where = { user: { deletedAt: null } };
    // Queue: awaiting admin review — submitted, or legacy pending + ID on file
    if (status === 'pending' || status === 'queue') {
      where.AND = [
        { NOT: { verificationStatus: { in: ['verified', 'approved', 'rejected'] } } },
        {
          OR: [
            { verificationStatus: 'submitted' },
            { AND: [{ verificationStatus: 'pending' }, { idDocumentUrl: { not: null } }] },
          ],
        },
      ];
    } else if (status) {
      where.verificationStatus = String(status);
    }

    const profiles = await prisma.userProfile.findMany({
      where,
      include: { user: { select: { id: true, email: true, fullName: true } } },
      orderBy: { updatedAt: 'desc' },
      take: Math.min(parseInt(limit) || 50, 200),
      skip: parseInt(offset) || 0,
    });
    const total = await prisma.userProfile.count({ where });
    res.json({ profiles, total });
  } catch (err) {
    next(err);
  }
});

router.get('/verification/users/:userId/id-document', async (req, res, next) => {
  try {
    const profile = await prisma.userProfile.findUnique({
      where: { userId: req.params.userId },
      select: { id: true, idDocumentUrl: true, userId: true },
    });
    const fileUrl = profile?.idDocumentUrl;
    if (!fileUrl) return res.status(404).json({ error: 'No ID document on file' });

    const viewUrl = fileUrl
      ? privateDownloadUrl(fileUrl) || signCloudinaryUrl(fileUrl) || fileUrl
      : null;

    await auditFromReq(req, {
      userId: req.userId,
      action: 'USER_ID_DOCUMENT_VIEWED',
      entityType: 'user_profile',
      entityId: profile.id,
      metadata: { targetUserId: req.params.userId },
    });

    res.json({ viewUrl });
  } catch (err) {
    next(err);
  }
});

router.patch('/verification/users/:userId', async (req, res, next) => {
  try {
    const { status, note } = z.object({
      status: z.enum(['verified', 'rejected']),
      note: z.string().max(500).optional().nullable(),
    }).parse(req.body);

    const userId = req.params.userId;
    const existing = await prisma.userProfile.findUnique({
      where: { userId },
      select: { id: true, userId: true, verificationStatus: true },
    });
    if (!existing) return res.status(404).json({ error: 'Profile not found' });

    if (status === 'verified' && isIdentityVerifiedStatus(existing.verificationStatus)) {
      return res.json({
        success: true,
        alreadyVerified: true,
        profile: { userId: existing.userId, verificationStatus: existing.verificationStatus },
      });
    }

    const profile = await prisma.userProfile.update({
      where: { userId },
      data: {
        verificationStatus: status,
        verificationRejectionNote: status === 'rejected' ? (note || null) : null,
        ageVerified: status === 'verified',
      },
    });

    await auditFromReq(req, {
      userId: req.userId,
      action: 'USER_VERIFICATION_UPDATED',
      entityType: 'user_profile',
      entityId: profile.id,
      metadata: { userId: profile.userId, status, note },
    });

    if (status === 'verified') {
      const targetUser = await prisma.user.findUnique({
        where: { id: profile.userId },
        select: { id: true, email: true, fullName: true },
      });
      if (targetUser) {
        await prisma.inAppNotification.updateMany({
          where: {
            userId: targetUser.id,
            type: 'IDENTITY_VERIFICATION_REMINDER',
            read: false,
          },
          data: { read: true },
        });
        await createInAppNotification({
          userId: targetUser.id,
          type: 'IDENTITY_VERIFICATION_REMINDER',
          title: 'ID verification approved',
          body: 'Your ID has been approved. You can now access verified-only features.',
          referenceId: '/EditProfile',
          referenceType: 'ROUTE',
        });
        sendIdVerificationApprovedEmail(targetUser.email, targetUser.fullName).catch(() => {});
      }
    }

    res.json({ success: true, profile: { userId: profile.userId, verificationStatus: profile.verificationStatus } });
  } catch (err) {
    next(err);
  }
});

// ── Promoter Verification & Moderation ─────────────────────────────────────

router.get('/promoters/candidates', async (req, res, next) => {
  try {
    const result = await getPromotersLeaderboard({ page: 1, limit: 500, includeUnverified: true });
    res.json({
      policy: result.policy,
      total: result.total,
      data: result.data,
    });
  } catch (err) {
    next(err);
  }
});

router.patch('/promoters/:userId/verify', async (req, res, next) => {
  try {
    const { note } = z.object({
      note: z.string().max(1000).optional().nullable(),
    }).parse(req.body || {});
    const userId = req.params.userId;
    const profile = await prisma.userProfile.upsert({
      where: { userId },
      create: {
        userId,
        isVerifiedPromoter: true,
        promoterVerifiedAt: new Date(),
        promoterVerifiedBy: req.userId,
        promoterRevokedAt: null,
        promoterRevokedBy: null,
        promoterVerificationNote: note || null,
      },
      update: {
        isVerifiedPromoter: true,
        promoterVerifiedAt: new Date(),
        promoterVerifiedBy: req.userId,
        promoterRevokedAt: null,
        promoterRevokedBy: null,
        promoterVerificationNote: note || null,
      },
    });
    await auditFromReq(req, {
      userId: req.userId,
      action: 'PROMOTER_VERIFIED',
      entityType: 'user_profile',
      entityId: profile.id,
      metadata: { targetUserId: userId, note: note || null },
    });
    await createInAppNotification({
      userId,
      type: 'IDENTITY_VERIFICATION_REMINDER',
      title: 'Verified promoter status granted',
      body: 'You are now a verified promoter and eligible for promoter features.',
      referenceId: '/Leaderboard',
      referenceType: 'ROUTE',
    });
    res.json({ success: true, profile: { userId: profile.userId, isVerifiedPromoter: profile.isVerifiedPromoter } });
  } catch (err) {
    next(err);
  }
});

router.patch('/promoters/:userId/revoke', async (req, res, next) => {
  try {
    const { reason } = z.object({
      reason: z.string().min(3).max(1000),
    }).parse(req.body || {});
    const userId = req.params.userId;
    const profile = await prisma.userProfile.upsert({
      where: { userId },
      create: {
        userId,
        isVerifiedPromoter: false,
        promoterRevokedAt: new Date(),
        promoterRevokedBy: req.userId,
        promoterVerificationNote: reason,
      },
      update: {
        isVerifiedPromoter: false,
        promoterRevokedAt: new Date(),
        promoterRevokedBy: req.userId,
        promoterVerificationNote: reason,
      },
    });
    await auditFromReq(req, {
      userId: req.userId,
      action: 'PROMOTER_VERIFICATION_REVOKED',
      entityType: 'user_profile',
      entityId: profile.id,
      metadata: { targetUserId: userId, reason },
    });
    await createInAppNotification({
      userId,
      type: 'IDENTITY_VERIFICATION_REMINDER',
      title: 'Verified promoter status removed',
      body: reason,
      referenceId: '/Settings',
      referenceType: 'ROUTE',
    });
    res.json({ success: true, profile: { userId: profile.userId, isVerifiedPromoter: profile.isVerifiedPromoter } });
  } catch (err) {
    next(err);
  }
});

router.patch('/promoters/:userId/leaderboard-visibility', async (req, res, next) => {
  try {
    const { hidden, reason, until } = z.object({
      hidden: z.boolean(),
      reason: z.string().max(1000).optional().nullable(),
      until: z.string().datetime().optional().nullable(),
    }).parse(req.body || {});
    const userId = req.params.userId;
    const profile = await prisma.userProfile.upsert({
      where: { userId },
      create: {
        userId,
        leaderboardHidden: hidden,
        leaderboardHiddenReason: hidden ? (reason || null) : null,
        leaderboardHiddenUntil: hidden && until ? new Date(until) : null,
      },
      update: {
        leaderboardHidden: hidden,
        leaderboardHiddenReason: hidden ? (reason || null) : null,
        leaderboardHiddenUntil: hidden && until ? new Date(until) : null,
      },
    });
    await auditFromReq(req, {
      userId: req.userId,
      action: hidden ? 'PROMOTER_LEADERBOARD_HIDDEN' : 'PROMOTER_LEADERBOARD_UNHIDDEN',
      entityType: 'user_profile',
      entityId: profile.id,
      metadata: { targetUserId: userId, reason: reason || null, until: until || null },
    });
    res.json({
      success: true,
      profile: {
        userId: profile.userId,
        leaderboardHidden: profile.leaderboardHidden,
        leaderboardHiddenReason: profile.leaderboardHiddenReason,
        leaderboardHiddenUntil: profile.leaderboardHiddenUntil,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ── Verification Queue (Business/Venue Compliance) ─────────────────────────

router.get('/verification/venues', async (req, res, next) => {
  try {
    const { status = 'pending', limit = 50, offset = 0 } = req.query;
    const where = { deletedAt: null };
    if (status) where.complianceStatus = String(status);

    const venues = await prisma.venue.findMany({
      where,
      include: { owner: { select: { id: true, email: true, fullName: true } } },
      orderBy: { updatedAt: 'desc' },
      take: Math.min(parseInt(limit) || 50, 200),
      skip: parseInt(offset) || 0,
    });
    const total = await prisma.venue.count({ where });
    res.json({ venues, total });
  } catch (err) {
    next(err);
  }
});

// ── Venue Moderation ──────────────────────────────────────────────────────

router.patch('/venues/:id/compliance', async (req, res, next) => {
  try {
    const { status, note } = z.object({
      status: z.enum(['approved', 'rejected', 'pending']),
      note: z.string().max(500).optional().nullable(),
    }).parse(req.body);

    const venue = await prisma.venue.update({
      where: { id: req.params.id },
      data: {
        complianceStatus: status,
        complianceRejectionNote: status === 'rejected' ? (note || null) : null,
        ...(status === 'approved' ? { isVerified: true } : {}),
      },
    });

    await auditFromReq(req, {
      userId: req.userId,
      action: 'VENUE_COMPLIANCE_UPDATED',
      entityType: 'venue',
      entityId: venue.id,
      metadata: { venueName: venue.name, status, note },
    });

    res.json({ success: true, venue: { id: venue.id, complianceStatus: venue.complianceStatus } });
  } catch (err) {
    next(err);
  }
});

// ── Admin Dashboard Delegates (Super Admin managed) ────────────────────────

router.get('/delegates', requireSuperAdmin, async (req, res, next) => {
  try {
    const delegates = await prisma.adminDashboardDelegate.findMany({
      orderBy: { addedAt: 'desc' },
    });
    res.json({ delegates });
  } catch (err) {
    next(err);
  }
});

router.post('/delegates', requireSuperAdmin, async (req, res, next) => {
  try {
    const { email, name } = z.object({
      email: z.string().email(),
      name: z.string().min(1).max(200),
    }).parse(req.body);

    const created = await prisma.adminDashboardDelegate.create({
      data: {
        email: normalizeEmail(email),
        name: name.trim(),
        isActive: true,
        addedByUserId: req.userId,
      },
    });

    await auditFromReq(req, {
      userId: req.userId,
      action: 'ADMIN_DASHBOARD_DELEGATE_CREATED',
      entityType: 'admin_dashboard_delegate',
      entityId: created.id,
      metadata: { delegateEmail: created.email, delegateName: created.name },
    });

    res.status(201).json({ delegate: created });
  } catch (err) {
    next(err);
  }
});

router.patch('/delegates/:delegateId', requireSuperAdmin, async (req, res, next) => {
  try {
    const { delegateId } = z.object({ delegateId: z.string().min(1) }).parse(req.params);
    const { isActive } = z.object({ isActive: z.boolean() }).parse(req.body);

    const updated = await prisma.adminDashboardDelegate.update({
      where: { id: delegateId },
      data: { isActive },
    });

    await auditFromReq(req, {
      userId: req.userId,
      action: isActive ? 'ADMIN_DASHBOARD_DELEGATE_REACTIVATED' : 'ADMIN_DASHBOARD_DELEGATE_DEACTIVATED',
      entityType: 'admin_dashboard_delegate',
      entityId: updated.id,
      metadata: { delegateEmail: updated.email, delegateName: updated.name, isActive },
    });

    res.json({ delegate: updated });
  } catch (err) {
    next(err);
  }
});

router.delete('/delegates/:delegateId', requireSuperAdmin, async (req, res, next) => {
  try {
    const { delegateId } = z.object({ delegateId: z.string().min(1) }).parse(req.params);

    const existing = await prisma.adminDashboardDelegate.findUnique({ where: { id: delegateId } });
    if (!existing) return res.status(404).json({ error: 'Delegate not found' });

    await prisma.adminDashboardDelegate.delete({ where: { id: delegateId } });

    await auditFromReq(req, {
      userId: req.userId,
      action: 'ADMIN_DASHBOARD_DELEGATE_DELETED',
      entityType: 'admin_dashboard_delegate',
      entityId: delegateId,
      metadata: { delegateEmail: existing.email, delegateName: existing.name },
    });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
});

// ── Dashboard Summary ─────────────────────────────────────────────────────

router.get('/dashboard', async (req, res, next) => {
  try {
    const dashboardQueries = [
      { name: 'totalUsers', run: () => prisma.user.count({ where: { deletedAt: null } }), fallback: 0 },
      { name: 'suspendedUsers', run: () => prisma.user.count({ where: { suspendedAt: { not: null }, deletedAt: null } }), fallback: 0 },
      { name: 'pendingReports', run: () => prisma.report.count({ where: { status: 'pending' } }), fallback: 0 },
      { name: 'criticalReports', run: () => prisma.report.count({ where: { status: 'pending', priority: 'critical' } }), fallback: 0 },
      { name: 'highReports', run: () => prisma.report.count({ where: { status: 'pending', priority: 'high' } }), fallback: 0 },
      { name: 'totalVenues', run: () => prisma.venue.count({ where: { deletedAt: null } }), fallback: 0 },
      { name: 'pendingVenues', run: () => prisma.venue.count({ where: { complianceStatus: 'pending', deletedAt: null } }), fallback: 0 },
      {
        name: 'pendingUserVerifications',
        run: () =>
          prisma.userProfile.count({
            where: {
              AND: [
                { NOT: { verificationStatus: { in: ['verified', 'approved', 'rejected'] } } },
                {
                  OR: [
                    { verificationStatus: 'submitted' },
                    { AND: [{ verificationStatus: 'pending' }, { idDocumentUrl: { not: null } }] },
                  ],
                },
              ],
            },
          }),
        fallback: 0,
      },
      {
        name: 'paymentsAggregate',
        run: () =>
          prisma.payment.aggregate({ where: { status: 'success' }, _sum: { amount: true }, _count: true }),
        fallback: { _sum: { amount: null }, _count: 0 },
      },
      {
        name: 'ledgerAggregate',
        run: () =>
          prisma.payoutLedger.aggregate({
            _sum: { grossAmount: true, secAmount: true, recipientAmount: true },
          }),
        fallback: { _sum: { grossAmount: null, secAmount: null, recipientAmount: null } },
      },
      {
        name: 'pendingTransfers',
        run: () => prisma.payoutLedger.count({ where: { status: { in: ['PENDING', 'FAILED'] } } }),
        fallback: 0,
      },
      {
        name: 'recentAuditLogs',
        run: () =>
          prisma.auditLog.findMany({
            orderBy: { createdAt: 'desc' },
            take: 10,
            include: { user: { select: { email: true } } },
          }),
        fallback: [],
      },
    ];

    const settled = await Promise.allSettled(dashboardQueries.map((q) => q.run()));
    const values = settled.map((result, i) => {
      if (result.status === 'fulfilled') return result.value;
      logger.warn('admin dashboard query failed', {
        query: dashboardQueries[i].name,
        err: String(result.reason?.message || result.reason),
      });
      return dashboardQueries[i].fallback;
    });

    const [
      totalUsers,
      suspendedUsers,
      pendingReports,
      criticalReports,
      highReports,
      totalVenues,
      pendingVenues,
      pendingUserVerifications,
      totalPaymentsSuccess,
      ledgerAggregate,
      pendingTransfers,
      recentAuditLogs,
    ] = values;

    res.json({
      stats: {
        totalUsers,
        suspendedUsers,
        pendingReports,
        totalVenues,
        pendingVenues,
        criticalReports,
        highReports,
        pendingUserVerifications,
        totalPaymentAmount: totalPaymentsSuccess._sum?.amount ?? 0,
        totalPaymentCount: totalPaymentsSuccess._count ?? 0,
        totalGrossZar: totalPaymentsSuccess._sum?.amount ?? 0,
        totalSecRevenueZar: ledgerAggregate._sum?.secAmount ?? 0,
        totalRecipientShareZar: ledgerAggregate._sum?.recipientAmount ?? 0,
        pendingTransfers,
      },
      recentActivity: recentAuditLogs,
    });
  } catch (err) {
    next(err);
  }
});

// ── Platform announcements (home feed) ───────────────────────────────────

const announcementSchema = z.object({
  title: z.string().min(1).max(100),
  message: z.string().min(10).max(600),
  ctaUrl: z
    .string()
    .max(2000)
    .optional()
    .nullable()
    .refine((v) => v == null || v === '' || /^https?:\/\//i.test(v) || v.startsWith('/'), {
      message: 'Invalid URL',
    }),
  ctaLabel: z.string().max(40).optional().nullable(),
});

router.get('/announcements', async (req, res, next) => {
  try {
    const rows = await prisma.platformAnnouncement.findMany({
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: {
        createdBy: { select: { id: true, username: true, fullName: true } },
        removedBy: { select: { id: true, username: true, fullName: true } },
      },
    });
    res.json({
      announcements: rows.map((r) => ({
        id: r.id,
        title: r.title,
        message: r.message,
        ctaUrl: r.ctaUrl,
        ctaLabel: r.ctaLabel,
        isActive: r.isActive,
        createdAt: r.createdAt.toISOString(),
        removedAt: r.removedAt?.toISOString() ?? null,
        createdBy: r.createdBy
          ? { id: r.createdBy.id, username: r.createdBy.username, fullName: r.createdBy.fullName }
          : null,
        removedBy: r.removedBy
          ? { id: r.removedBy.id, username: r.removedBy.username, fullName: r.removedBy.fullName }
          : null,
      })),
    });
  } catch (err) {
    next(err);
  }
});

router.post('/announcements', async (req, res, next) => {
  try {
    const parsed = announcementSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    }
    const d = parsed.data;
    const row = await prisma.platformAnnouncement.create({
      data: {
        title: d.title.trim(),
        message: d.message.trim(),
        ctaUrl: d.ctaUrl?.trim() || null,
        ctaLabel: d.ctaLabel?.trim() || null,
        createdById: req.userId,
        isActive: true,
      },
    });
    await auditFromReq(req, {
      userId: req.userId,
      action: 'PLATFORM_ANNOUNCEMENT_CREATED',
      entityType: 'platform_announcement',
      entityId: row.id,
      metadata: { title: row.title },
    });
    res.status(201).json({
      id: row.id,
      title: row.title,
      message: row.message,
      ctaUrl: row.ctaUrl,
      ctaLabel: row.ctaLabel,
      isActive: row.isActive,
      createdAt: row.createdAt.toISOString(),
    });
  } catch (err) {
    next(err);
  }
});

router.delete('/announcements/:id/permanent', async (req, res, next) => {
  try {
    const existing = await prisma.platformAnnouncement.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Announcement not found' });
    if (existing.isActive) {
      return res.status(400).json({ error: 'Remove the announcement from the home feed before deleting permanently.' });
    }
    await prisma.platformAnnouncement.delete({ where: { id: req.params.id } });
    await auditFromReq(req, {
      userId: req.userId,
      action: 'PLATFORM_ANNOUNCEMENT_PURGED',
      entityType: 'platform_announcement',
      entityId: req.params.id,
      metadata: { title: existing.title },
    });
    res.json({ ok: true, purged: true });
  } catch (err) {
    next(err);
  }
});

router.delete('/announcements/:id', async (req, res, next) => {
  try {
    const existing = await prisma.platformAnnouncement.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Announcement not found' });
    if (!existing.isActive) {
      return res.json({ ok: true, alreadyRemoved: true });
    }
    await prisma.platformAnnouncement.update({
      where: { id: req.params.id },
      data: {
        isActive: false,
        removedAt: new Date(),
        removedById: req.userId,
      },
    });
    await auditFromReq(req, {
      userId: req.userId,
      action: 'PLATFORM_ANNOUNCEMENT_REMOVED',
      entityType: 'platform_announcement',
      entityId: req.params.id,
    });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

export default router;
