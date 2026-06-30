import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticateToken } from '../middleware/auth.js';
import {
  applyRefundApproval,
  computeRefundAmounts,
  mapRefundRequestRow,
  notifyRefundApproved,
  notifyRefundRejected,
  notifyRefundSubmitted,
  validateRefundEligibility,
} from '../lib/refunds.js';
import {
  formatRefundRejectMessages,
  validateRefundRejectPayload,
} from '../lib/refundRejectTemplates.js';
import { basePaymentReference } from '../lib/paymentMetadata.js';
import {
  resolveAccessibleVenueIds,
  staffHasVenuePermission,
  staffCtxFromQuery,
  venueIdFromQuery,
} from '../lib/access.js';

const router = Router();

/** POST /api/refunds/request — party-goer submits refund request */
router.post('/request', authenticateToken, async (req, res, next) => {
  try {
    const body = z
      .object({
        payment_reference: z.string().min(6),
        reason: z.string().min(10).max(2000),
        wallet_code: z.string().min(6).max(32),
      })
      .parse(req.body ?? {});

    const baseRef = basePaymentReference(body.payment_reference.trim());
    const payment = await prisma.payment.findFirst({
      where: {
        OR: [{ reference: baseRef }, { reference: body.payment_reference.trim() }],
        status: 'success',
      },
    });

    const eligibility = await validateRefundEligibility({
      payment,
      userId: req.userId,
      userWalletCode: body.wallet_code.trim(),
    });
    if (!eligibility.ok) {
      return res.status(eligibility.status || 400).json({ error: eligibility.error });
    }

    const grossZar =
      eligibility.grossAmountZar != null
        ? Number(eligibility.grossAmountZar)
        : Number(payment.amount) || 0;
    const amounts = computeRefundAmounts(grossZar);

    const refundRequest = await prisma.$transaction(async (tx) => {
      const row = await tx.refundRequest.create({
        data: {
          userId: req.userId,
          venueId: eligibility.venueId,
          paymentReference: eligibility.baseRef,
          refundType: eligibility.refundType,
          status: 'PENDING',
          userReason: body.reason.trim(),
          userWalletCode: eligibility.walletCode,
          grossAmountZar: amounts.grossAmountZar,
          venueRefundDueZar: amounts.venueRefundDueZar,
          platformFeeKeptZar: amounts.platformFeeKeptZar,
          ticketIds: eligibility.ticketIds,
          venueTableMemberId: eligibility.venueTableMember?.id ?? null,
          venueTableId: eligibility.venueTableId,
          eventId: eligibility.eventId,
        },
      });

      await tx.payment.update({
        where: { id: payment.id },
        data: { refundStatus: 'PENDING', refundRequestId: row.id },
      });

      return row;
    });

    const venue = await prisma.venue.findUnique({
      where: { id: eligibility.venueId },
      select: { name: true, ownerUserId: true },
    });

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { email: true },
    });

    await notifyRefundSubmitted({
      refundRequest,
      venueName: venue?.name,
      userEmail: user?.email,
      venueOwnerId: venue?.ownerUserId,
    });

    res.status(201).json({ request: mapRefundRequestRow(refundRequest) });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Invalid input' });
    next(err);
  }
});

/** GET /api/refunds/my — user's refund requests */
router.get('/my', authenticateToken, async (req, res, next) => {
  try {
    const rows = await prisma.refundRequest.findMany({
      where: { userId: req.userId },
      include: { venue: { select: { id: true, name: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    res.json({
      items: rows.map((r) => mapRefundRequestRow(r, { includeVenue: true })),
    });
  } catch (e) {
    next(e);
  }
});

/** GET /api/refunds/eligible-payments — payments user can request refund for */
router.get('/eligible-payments', authenticateToken, async (req, res, next) => {
  try {
    const payments = await prisma.payment.findMany({
      where: {
        userId: req.userId,
        status: 'success',
        refundStatus: { in: ['NONE', 'PENDING'] },
      },
      orderBy: { createdAt: 'desc' },
      take: 80,
      select: {
        reference: true,
        amount: true,
        type: true,
        metadata: true,
        createdAt: true,
        refundStatus: true,
      },
    });

    const items = [];
    for (const p of payments) {
      const check = await validateRefundEligibility({
        payment: { ...p, userId: req.userId, refundStatus: p.refundStatus },
        userId: req.userId,
        userWalletCode: 'SKIP',
      });
      if (check.ok || check.error === 'Invalid Sec Wallet ID — use your wallet code from Profile') {
        const grossZar =
          check.grossAmountZar != null ? Number(check.grossAmountZar) : Number(p.amount) || 0;
        const amounts = computeRefundAmounts(grossZar);
        const meta = p.metadata && typeof p.metadata === 'object' ? p.metadata : {};
        items.push({
          reference: basePaymentReference(p.reference),
          amount: p.amount,
          type: p.type,
          metaType: meta.type || null,
          createdAt: p.createdAt,
          refundStatus: p.refundStatus,
          refundType: check.refundType || null,
          venueRefundDueZar: amounts.venueRefundDueZar,
          platformFeeKeptZar: amounts.platformFeeKeptZar,
          refundableGrossZar: grossZar,
          label:
            check.refundType === 'HOSTED_TABLE_MENU' && check.partialMenuOnly
              ? 'Menu items only (join fee not refundable)'
              : meta.event_title || meta.eventTitle || meta.ticket_tier_name || 'Booking payment',
        });
      }
    }

    res.json({ items });
  } catch (e) {
    next(e);
  }
});

async function resolveVenueRefundScope(req) {
  const venueIdFilter = venueIdFromQuery(req.query);
  const venueIds = await resolveAccessibleVenueIds(req.userId, {
    venueIdFilter,
    staffCtx: staffCtxFromQuery(req.query),
    permission: 'bookings',
  });
  return { venueIds, venueIdFilter };
}

/** GET /api/refunds/venue — venue staff refund queue */
router.get('/venue', authenticateToken, async (req, res, next) => {
  try {
    const { venueIds, venueIdFilter } = await resolveVenueRefundScope(req);
    if (!venueIds.length) {
      if (venueIdFilter) return res.status(404).json({ error: 'Venue not found' });
      return res.json({ items: [], pendingCount: 0 });
    }

    const statusRaw = typeof req.query.status === 'string' ? req.query.status.toUpperCase() : '';
    const statusFilter =
      statusRaw && ['PENDING', 'REJECTED', 'APPROVED', 'PAID_BY_VENUE'].includes(statusRaw)
        ? statusRaw
        : null;

    const where = {
      venueId: venueIds.length === 1 ? venueIds[0] : { in: venueIds },
      ...(statusFilter ? { status: statusFilter } : {}),
    };

    const [rows, pendingCount] = await Promise.all([
      prisma.refundRequest.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              fullName: true,
              username: true,
              userProfile: { select: { username: true } },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
      prisma.refundRequest.count({
        where: {
          venueId: venueIds.length === 1 ? venueIds[0] : { in: venueIds },
          status: 'PENDING',
        },
      }),
    ]);

    res.json({
      items: rows.map((r) => mapRefundRequestRow(r, { includeUser: true })),
      pendingCount,
    });
  } catch (e) {
    next(e);
  }
});

/** GET /api/refunds/venue/:id — detail */
router.get('/venue/:id', authenticateToken, async (req, res, next) => {
  try {
    const row = await prisma.refundRequest.findUnique({
      where: { id: req.params.id },
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            username: true,
            email: true,
            userProfile: { select: { username: true } },
          },
        },
        venue: { select: { id: true, name: true } },
      },
    });
    if (!row) return res.status(404).json({ error: 'Refund request not found' });

    const canManage = await staffHasVenuePermission(req.userId, row.venueId, 'bookings');
    if (!canManage) return res.status(403).json({ error: 'Forbidden' });

    res.json({ request: mapRefundRequestRow(row, { includeUser: true, includeVenue: true }) });
  } catch (e) {
    next(e);
  }
});

/** POST /api/refunds/venue/:id/approve */
router.post('/venue/:id/approve', authenticateToken, async (req, res, next) => {
  try {
    const existing = await prisma.refundRequest.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Refund request not found' });
    if (existing.status !== 'PENDING') {
      return res.status(400).json({ error: 'This request has already been processed' });
    }

    const canManage = await staffHasVenuePermission(req.userId, existing.venueId, 'bookings');
    if (!canManage) return res.status(403).json({ error: 'Forbidden' });

    let approved;
    try {
      approved = await prisma.$transaction(async (tx) =>
        applyRefundApproval(tx, { ...existing, approvedByUserId: req.userId }),
      );
    } catch (err) {
      if (err?.code === 'HOST_REFUND_GUESTS_REMAIN' || err?.statusCode === 409) {
        return res.status(409).json({
          error: err.message || 'Cannot approve while other paid guests remain on this table',
        });
      }
      throw err;
    }

    const [user, venue] = await Promise.all([
      prisma.user.findUnique({ where: { id: existing.userId }, select: { email: true } }),
      prisma.venue.findUnique({ where: { id: existing.venueId }, select: { name: true } }),
    ]);

    await notifyRefundApproved({
      refundRequest: approved,
      userId: existing.userId,
      userEmail: user?.email,
      venueName: venue?.name,
    });

    res.json({ request: mapRefundRequestRow(approved) });
  } catch (e) {
    next(e);
  }
});

/** POST /api/refunds/venue/:id/reject */
router.post('/venue/:id/reject', authenticateToken, async (req, res, next) => {
  try {
    const body = z
      .object({
        template_keys: z.array(z.string()).min(1).max(3),
      })
      .parse(req.body ?? {});

    const validation = validateRefundRejectPayload({ templateKeys: body.template_keys });
    if (!validation.ok) return res.status(400).json({ error: validation.error });

    const existing = await prisma.refundRequest.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Refund request not found' });
    if (existing.status !== 'PENDING') {
      return res.status(400).json({ error: 'This request has already been processed' });
    }

    const canManage = await staffHasVenuePermission(req.userId, existing.venueId, 'bookings');
    if (!canManage) return res.status(403).json({ error: 'Forbidden' });

    const messages = formatRefundRejectMessages(validation.keys);
    const rejected = await prisma.$transaction(async (tx) => {
      const row = await tx.refundRequest.update({
        where: { id: existing.id },
        data: {
          status: 'REJECTED',
          rejectedAt: new Date(),
          rejectTemplateKeys: validation.keys,
        },
      });

      const baseRef = basePaymentReference(existing.paymentReference);
      await tx.payment.updateMany({
        where: {
          reference: { in: [existing.paymentReference, baseRef] },
          refundRequestId: existing.id,
        },
        data: { refundStatus: 'NONE', refundRequestId: null },
      });

      return row;
    });

    const [user, venue] = await Promise.all([
      prisma.user.findUnique({ where: { id: existing.userId }, select: { email: true } }),
      prisma.venue.findUnique({ where: { id: existing.venueId }, select: { name: true } }),
    ]);

    await notifyRefundRejected({
      refundRequest: rejected,
      userId: existing.userId,
      userEmail: user?.email,
      venueName: venue?.name,
      messages,
    });

    res.json({ request: mapRefundRequestRow(rejected) });
  } catch (err) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: 'Invalid input' });
    next(err);
  }
});

/** POST /api/refunds/venue/:id/mark-paid — venue confirms off-app payout */
router.post('/venue/:id/mark-paid', authenticateToken, async (req, res, next) => {
  try {
    const existing = await prisma.refundRequest.findUnique({ where: { id: req.params.id } });
    if (!existing) return res.status(404).json({ error: 'Refund request not found' });
    if (existing.status !== 'APPROVED') {
      return res.status(400).json({ error: 'Only approved refunds can be marked paid' });
    }

    const canManage = await staffHasVenuePermission(req.userId, existing.venueId, 'bookings');
    if (!canManage) return res.status(403).json({ error: 'Forbidden' });

    const updated = await prisma.refundRequest.update({
      where: { id: existing.id },
      data: { status: 'PAID_BY_VENUE' },
    });

    res.json({ request: mapRefundRequestRow(updated) });
  } catch (e) {
    next(e);
  }
});

export default router;
