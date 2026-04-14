/**
 * Admin Moderation Dashboard Routes
 * SECURITY: All routes require ADMIN role. Never expose to USER or VENUE.
 */
import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticateToken } from '../middleware/auth.js';
import { requireAdmin, requireStaff } from '../middleware/rbac.js';
import { auditFromReq } from '../lib/audit.js';

const router = Router();

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

router.get('/payments', async (req, res, next) => {
  try {
    const { status, type, limit = 50, offset = 0 } = req.query;
    const where = {};
    if (status) where.status = String(status);
    if (type) where.type = String(type);

    const payments = await prisma.payment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: Math.min(parseInt(limit) || 50, 200),
      skip: parseInt(offset) || 0,
    });
    const total = await prisma.payment.count({ where });
    const totalsByStatus = await prisma.payment.groupBy({
      by: ['status'],
      where: { status: 'success' },
      _sum: { amount: true },
      _count: true,
    });
    res.json({ payments, total, summary: totalsByStatus });
  } catch (err) {
    next(err);
  }
});

// ── Verification Queue (User ID) ───────────────────────────────────────────

router.get('/verification/users', async (req, res, next) => {
  try {
    const { status = 'pending', limit = 50, offset = 0 } = req.query;
    const where = { user: { deletedAt: null } };
    if (status) {
      where.verificationStatus = String(status);
      if (status === 'pending') where.idDocumentUrl = { not: null };
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

router.patch('/verification/users/:userId', async (req, res, next) => {
  try {
    const { status, note } = z.object({
      status: z.enum(['approved', 'rejected']),
      note: z.string().max(500).optional().nullable(),
    }).parse(req.body);

    const profile = await prisma.userProfile.update({
      where: { userId: req.params.userId },
      data: {
        verificationStatus: status,
        verificationRejectionNote: status === 'rejected' ? (note || null) : null,
        ageVerified: status === 'approved',
      },
    });

    await auditFromReq(req, {
      userId: req.userId,
      action: 'USER_VERIFICATION_UPDATED',
      entityType: 'user_profile',
      entityId: profile.id,
      metadata: { userId: profile.userId, status, note },
    });

    res.json({ success: true, profile: { userId: profile.userId, verificationStatus: profile.verificationStatus } });
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

// ── Dashboard Summary ─────────────────────────────────────────────────────

router.get('/dashboard', async (req, res, next) => {
  try {
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
      recentAuditLogs
    ] = await Promise.all([
      prisma.user.count({ where: { deletedAt: null } }),
      prisma.user.count({ where: { suspendedAt: { not: null }, deletedAt: null } }),
      prisma.report.count({ where: { status: 'pending' } }),
      prisma.report.count({ where: { status: 'pending', priority: 'critical' } }),
      prisma.report.count({ where: { status: 'pending', priority: 'high' } }),
      prisma.venue.count({ where: { deletedAt: null } }),
      prisma.venue.count({ where: { complianceStatus: 'pending', deletedAt: null } }),
      prisma.userProfile.count({ where: { verificationStatus: 'pending', idDocumentUrl: { not: null } } }),
      prisma.payment.aggregate({ where: { status: 'success' }, _sum: { amount: true }, _count: true }),
      prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { user: { select: { email: true } } }
      })
    ]);

    res.json({
      stats: {
        totalUsers, suspendedUsers, pendingReports, totalVenues, pendingVenues,
        criticalReports, highReports,
        pendingUserVerifications,
        totalPaymentAmount: totalPaymentsSuccess._sum.amount ?? 0,
        totalPaymentCount: totalPaymentsSuccess._count ?? 0,
      },
      recentActivity: recentAuditLogs
    });
  } catch (err) {
    next(err);
  }
});

export default router;
