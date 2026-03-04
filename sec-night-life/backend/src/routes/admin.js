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
    const { status = 'pending', limit = 50, offset = 0 } = req.query;
    const reports = await prisma.report.findMany({
      where: { status: String(status) },
      orderBy: { createdAt: 'desc' },
      take: Math.min(parseInt(limit) || 50, 200),
      skip: parseInt(offset) || 0,
      include: {
        reporter: { select: { id: true, email: true, fullName: true } }
      }
    });
    const total = await prisma.report.count({ where: { status: String(status) } });
    res.json({ reports, total });
  } catch (err) {
    next(err);
  }
});

router.patch('/reports/:id/resolve', async (req, res, next) => {
  try {
    const { action } = z.object({
      action: z.enum(['resolved', 'dismissed'])
    }).parse(req.body);

    const report = await prisma.report.update({
      where: { id: req.params.id },
      data: { status: action, resolvedBy: req.userId, resolvedAt: new Date() }
    });

    await auditFromReq(req, {
      userId: req.userId,
      action: `REPORT_${action.toUpperCase()}`,
      entityType: 'report',
      entityId: report.id,
      metadata: { reportId: report.id, targetType: report.targetType, targetId: report.targetId }
    });

    res.json({ success: true, report });
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
      role: z.enum(['USER', 'VENUE', 'FREELANCER', 'ADMIN', 'MODERATOR'])
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

// ── Venue Moderation ──────────────────────────────────────────────────────

router.patch('/venues/:id/compliance', async (req, res, next) => {
  try {
    const { status } = z.object({
      status: z.enum(['approved', 'rejected', 'pending'])
    }).parse(req.body);

    const venue = await prisma.venue.update({
      where: { id: req.params.id },
      data: { complianceStatus: status, ...(status === 'approved' ? { isVerified: true } : {}) }
    });

    await auditFromReq(req, {
      userId: req.userId,
      action: 'VENUE_COMPLIANCE_UPDATED',
      entityType: 'venue',
      entityId: venue.id,
      metadata: { venueName: venue.name, status }
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
      totalVenues,
      pendingVenues,
      recentAuditLogs
    ] = await Promise.all([
      prisma.user.count({ where: { deletedAt: null } }),
      prisma.user.count({ where: { suspendedAt: { not: null }, deletedAt: null } }),
      prisma.report.count({ where: { status: 'pending' } }),
      prisma.venue.count({ where: { deletedAt: null } }),
      prisma.venue.count({ where: { complianceStatus: 'pending', deletedAt: null } }),
      prisma.auditLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10,
        include: { user: { select: { email: true } } }
      })
    ]);

    res.json({
      stats: { totalUsers, suspendedUsers, pendingReports, totalVenues, pendingVenues },
      recentActivity: recentAuditLogs
    });
  } catch (err) {
    next(err);
  }
});

export default router;
