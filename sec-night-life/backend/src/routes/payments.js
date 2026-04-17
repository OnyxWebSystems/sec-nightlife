/**
 * Paystack-only payment routes.
 * NO Stripe or other gateways. All payments via Paystack.
 * SECURITY: JWT required for initialize/verify; webhook uses HMAC signature.
 */
import { Router } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticateToken } from '../middleware/auth.js';
import { userHasIdentityVerified } from '../middleware/requireIdentityVerified.js';
import { createNotification, createNotifications } from '../lib/notifications.js';
import { logFriendActivity } from '../lib/friendActivity.js';
import { upsertConfirmedAttendance } from '../lib/eventAttendance.js';
import { sendEmail } from '../lib/email.js';
import { createInAppNotification } from '../lib/inAppNotifications.js';

const router = Router();

const PAYMENT_TYPES = ['event', 'table', 'promotion', 'ticket', 'other'];

function requirePaystackKey() {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) {
    const err = new Error('Paystack is not configured');
    err.status = 500;
    throw err;
  }
  return key;
}

async function paystackFetch(path, { method = 'GET', body } = {}) {
  const key = requirePaystackKey();
  const res = await fetch(`https://api.paystack.co${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.status) {
    const msg = data?.message || 'Paystack request failed';
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function applyReferenceSideEffects(reference, paystackData) {
  // Idempotency: if Payment already success, skip
  const existingPayment = await prisma.payment.findUnique({
    where: { reference },
    select: { status: true },
  });
  if (existingPayment?.status === 'success') return;

  const metadata = paystackData?.metadata || {};
  const userId = metadata.user_id || paystackData?.customer?.customer_code;
  const email = paystackData?.customer?.email || metadata.email || 'unknown@secnightlife.app';
  const amount = paystackData?.amount ? paystackData.amount / 100 : 0;
  const type = metadata.type || 'other';

  // Upsert Payment record (canonical store)
  await prisma.payment.upsert({
    where: { reference },
    create: {
      userId: userId || 'unknown',
      email,
      amount,
      reference,
      status: 'success',
      type: PAYMENT_TYPES.includes(type) ? type : 'other',
      metadata: paystackData,
    },
    update: { status: 'success', metadata: paystackData },
  });

  // Legacy: update Transaction if exists
  await prisma.transaction.updateMany({
    where: { stripeId: reference },
    data: { status: 'paid', metadata: paystackData },
  });

  // Type-specific side effects
  const isBoost = metadata.type === 'BOOST';
  const promoId = metadata.promotedPostId || metadata.promotion_id;
  if (promoId) {
    const boostExpiry = new Date(Date.now() + (7 * 24 * 60 * 60 * 1000));
    await prisma.promotion.updateMany({
      where: { id: promoId, deletedAt: null },
      data: isBoost
        ? {
            boosted: true,
            boostedAt: new Date(),
            boostExpiresAt: boostExpiry,
            boostPaystackRef: reference,
            status: 'ACTIVE',
          }
        : {
            boosted: true,
            boostedAt: new Date(),
            boostExpiresAt: boostExpiry,
            boostPaystackRef: reference,
          },
    });

    const promo = await prisma.promotion.findFirst({
      where: { id: promoId, deletedAt: null },
      select: { id: true, title: true, venueId: true, boostExpiresAt: true },
    });
    if (promo) {
      const venue = await prisma.venue.findFirst({
        where: { id: promo.venueId, deletedAt: null },
        select: { ownerUserId: true, name: true, owner: { select: { email: true } } },
      });
      await createNotification({
        userId: venue?.ownerUserId,
        type: 'payment',
        title: 'Promotion boost active',
        body: `"${promo.title}" is now boosted for ${venue?.name || 'your venue'}.`,
        actionUrl: `/BusinessPromotions`,
      });
      if (isBoost && venue?.owner?.email) {
        sendEmail({
          to: venue.owner.email,
          subject: `Boost activated — ${promo.title}`,
          text: `Your promotion "${promo.title}" is now boosted for 7 days. Boost expires on ${promo.boostExpiresAt?.toISOString() || 'N/A'}.`,
        }).catch(() => {});
      }
    }
  }

  const housePartyIdMeta = metadata.housePartyId || metadata.house_party_id;
  if (metadata.type === 'HOUSE_PARTY_PUBLISH' && housePartyIdMeta && userId) {
    const party = await prisma.houseParty.findFirst({ where: { id: String(housePartyIdMeta) } });
    if (party && party.hostUserId === userId) {
      await prisma.houseParty.update({
        where: { id: party.id },
        data: {
          status: 'PUBLISHED',
          publishedAt: new Date(),
          publishPaystackRef: reference,
        },
      });
      await createInAppNotification({
        userId: party.hostUserId,
        type: 'EVENT_JOINED',
        title: 'Party live',
        body: 'Your house party is now live!',
        referenceId: party.id,
        referenceType: 'HOUSE_PARTY',
      });
    }
  }

  if (metadata.type === 'HOUSE_PARTY_BOOST' && housePartyIdMeta && userId) {
    const boostExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const party = await prisma.houseParty.findFirst({ where: { id: String(housePartyIdMeta) } });
    if (party && party.hostUserId === userId) {
      await prisma.houseParty.update({
        where: { id: party.id },
        data: {
          boosted: true,
          boostedAt: new Date(),
          boostExpiresAt: boostExpiry,
          boostPaystackRef: reference,
        },
      });
      await createInAppNotification({
        userId: party.hostUserId,
        type: 'EVENT_JOINED',
        title: 'Boost active',
        body: 'Your house party boost is active for 7 days!',
        referenceId: party.id,
        referenceType: 'HOUSE_PARTY',
      });
    }
  }

  const hostedTableBoostId = metadata.hostedTableId || metadata.hosted_table_id;
  if (metadata.type === 'TABLE_BOOST' && hostedTableBoostId && userId) {
    const boostExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const ht = await prisma.hostedTable.findFirst({ where: { id: String(hostedTableBoostId) } });
    if (ht && ht.hostUserId === userId) {
      await prisma.hostedTable.update({
        where: { id: ht.id },
        data: {
          boosted: true,
          boostedAt: new Date(),
          boostExpiresAt: boostExpiry,
          boostPaystackRef: reference,
        },
      });
    }
  }

  const venueTableId = metadata.venueTableId || metadata.venue_table_id;
  const venueTableMemberId = metadata.venueTableMemberId || metadata.venue_table_member_id;
  if (metadata.type === 'VENUE_TABLE_JOIN' && venueTableId && venueTableMemberId && userId) {
    await prisma.$transaction(async (tx) => {
      const member = await tx.venueTableMember.findFirst({
        where: { id: String(venueTableMemberId), venueTableId: String(venueTableId), userId: String(userId) },
        include: { venueTable: { include: { venue: true } } },
      });
      if (!member) return;
      if (member.status === 'CONFIRMED') return;
      const table = member.venueTable;
      const totalPaid = Number(amount || 0);
      const secAmount = Number((totalPaid * 0.1).toFixed(2));
      const venueAmount = Number((totalPaid * 0.9).toFixed(2));
      // TODO: Configure Paystack subaccounts per venue before launch for automatic splits.
      // If table.venue.venuePaystackSubaccountCode exists, wire Paystack split payload before go-live.

      const currentOccupancy = table.currentOccupancy + 1;
      const amountContributed = table.amountContributed + totalPaid;
      const nextStatus =
        currentOccupancy >= table.guestCapacity
          ? 'LOCKED'
          : (amountContributed >= table.minimumSpend ? 'PARTIALLY_FILLED' : 'AVAILABLE');

      await tx.venueTableMember.update({
        where: { id: member.id },
        data: {
          status: 'CONFIRMED',
          amountPaid: totalPaid,
          selectedMenuItems: metadata.selectedMenuItems || member.selectedMenuItems,
          paidAt: new Date(),
          paystackReference: reference,
        },
      });
      await tx.venueTable.update({
        where: { id: table.id },
        data: {
          amountContributed: { increment: totalPaid },
          currentOccupancy: { increment: 1 },
          status: nextStatus,
        },
      });
      await tx.splitPaymentLog.create({
        data: {
          venueTableId: table.id,
          memberId: member.id,
          totalAmount: totalPaid,
          secAmount,
          venueAmount,
          reference,
        },
      });
      const user = await tx.user.findUnique({
        where: { id: String(userId) },
        include: { userProfile: { select: { username: true } } },
      });
      const username = user?.userProfile?.username || user?.username || 'someone';
      await createInAppNotification({
        userId: table.venue.ownerUserId,
        type: 'TABLE_JOINED',
        title: 'Venue table joined',
        body: `@${username} joined your table ${table.tableName} and contributed R${totalPaid.toFixed(2)}`,
        referenceId: table.id,
        referenceType: 'VENUE_TABLE',
      });
      await createInAppNotification({
        userId: String(userId),
        type: 'TABLE_JOINED',
        title: 'Table confirmed',
        body: `You're confirmed at ${table.tableName}. Menu items are locked in. No refunds.`,
        referenceId: table.id,
        referenceType: 'VENUE_TABLE',
      });
    });
  }

  const tableId = metadata.table_id;
  if (tableId && userId) {
    const table = await prisma.table.findFirst({
      where: { id: tableId, deletedAt: null },
      include: { venue: { select: { ownerUserId: true, name: true } } },
    });
    if (table) {
      const members = Array.isArray(table.members) ? [...table.members] : [];
      const memberIdx = members.findIndex((m) => m?.user_id === userId);
      const contribution = amount || (memberIdx >= 0 ? members[memberIdx]?.contribution : 0) || table.joiningFee || 0;
      if (memberIdx >= 0) {
        members[memberIdx] = { ...members[memberIdx], status: 'confirmed', contribution };
      } else {
        members.push({ user_id: userId, status: 'confirmed', contribution, joined_at: new Date().toISOString() });
      }
      const pendingRequests = Array.isArray(table.pendingRequests) ? table.pendingRequests.filter((id) => id !== userId) : [];
      const updated = await prisma.table.update({
        where: { id: tableId },
        data: {
          members,
          pendingRequests,
          currentGuests: members.length,
        },
      });

      const payer = await prisma.user.findUnique({ where: { id: userId }, select: { fullName: true } });
      const payerName = payer?.fullName || 'Someone';

      await createNotifications({
        userIds: [table.hostUserId, table.venue?.ownerUserId],
        type: 'payment',
        title: 'Table payment confirmed',
        body: `${payerName} completed payment to join "${table.name}".`,
        actionUrl: `/ManageTable?id=${tableId}`,
      });

      await createNotification({
        userId,
        type: 'payment',
        title: 'Payment confirmed',
        body: `Your payment for "${table.name}" was confirmed.`,
        actionUrl: `/TableDetails?id=${tableId}`,
      });

      logFriendActivity({
        userId,
        activityType: 'JOINED_TABLE',
        referenceId: tableId,
        referenceType: 'TABLE',
        description: 'joined a table',
      });
      await upsertConfirmedAttendance(userId, table.eventId);

      if (updated.status === 'full') {
        await createNotifications({
          userIds: [table.hostUserId, table.venue?.ownerUserId],
          type: 'table_full',
          title: 'Table is fully booked',
          body: `"${table.name}" has reached max capacity.`,
          actionUrl: `/ManageTable?id=${tableId}`,
        });
      }
    }
  }

  const eventId = metadata.event_id;
  const ticketTier = metadata.ticket_tier_name;
  const qty = parseInt(metadata.quantity || '1', 10);
  if (eventId && ticketTier && qty > 0) {
    const event = await prisma.event.findFirst({
      where: { id: eventId, deletedAt: null },
      include: { venue: { select: { ownerUserId: true, name: true } } },
    });
    if (event?.ticketTiers && Array.isArray(event.ticketTiers)) {
      const tiers = event.ticketTiers.map((t) =>
        t.name === ticketTier ? { ...t, sold: (t.sold || 0) + qty } : t
      );
      await prisma.event.update({
        where: { id: eventId },
        data: { ticketTiers: tiers },
      });

      if (userId) {
        await createNotification({
          userId,
          type: 'payment',
          title: 'Tickets confirmed',
          body: `Your ticket purchase for "${event.title}" was confirmed.`,
          actionUrl: `/EventDetails?id=${eventId}`,
        });
        logFriendActivity({
          userId,
          activityType: 'JOINED_EVENT',
          referenceId: eventId,
          referenceType: 'EVENT',
          description: 'joined an event',
        });
        await upsertConfirmedAttendance(userId, eventId);
      }

      await createNotification({
        userId: event.venue?.ownerUserId,
        type: 'payment',
        title: 'Ticket purchase',
        body: `${qty} ticket(s) sold for "${event.title}" at ${event.venue?.name || 'your venue'}.`,
        actionUrl: `/BusinessEvents`,
      });
    }
  }
}

const initSchema = z.object({
  amount: z.number().positive().max(1_000_000),
  email: z.string().email().optional(),
  description: z.string().max(2000).optional().nullable(),
  /** Venue/event IDs may be UUID or Cuid depending on DB row; do not over-restrict. */
  venue_id: z.union([z.string().min(1).max(64), z.null()]).optional(),
  event_id: z.union([z.string().min(1).max(64), z.null()]).optional(),
  metadata: z.record(z.any()).optional().nullable(),
});

// POST /api/payments/initialize — primary endpoint (spec-compliant)
router.post('/initialize', authenticateToken, async (req, res, next) => {
  try {
    const parsed = initSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    const d = parsed.data;

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { email: true },
    });
    const email = d.email || user?.email || 'user@secnightlife.app';

    const amountInCents = Math.round(d.amount * 100);
    const reference = crypto.randomBytes(16).toString('hex');
    const meta = d.metadata || {};
    const type = meta.type || (d.venue_id && meta.promotion_id ? 'promotion' : d.event_id ? 'event' : 'table') || 'other';

    if (type === 'table' && !(await userHasIdentityVerified(req.userId))) {
      return res.status(403).json({
        error: 'Identity verification required to pay for table bookings.',
        code: 'IDENTITY_NOT_VERIFIED',
      });
    }

    // Create Payment (pending)
    await prisma.payment.create({
      data: {
        userId: req.userId,
        email,
        amount: d.amount,
        reference,
        status: 'pending',
        type: PAYMENT_TYPES.includes(type) ? type : 'other',
        metadata: { description: d.description, venue_id: d.venue_id, event_id: d.event_id, ...meta },
      },
    });

    // Legacy Transaction for backward compat
    await prisma.transaction.create({
      data: {
        userId: req.userId,
        venueId: d.venue_id || null,
        eventId: d.event_id || null,
        amount: d.amount,
        currency: 'ZAR',
        type: 'paystack',
        status: 'pending',
        stripeId: reference,
        metadata: { provider: 'paystack', reference, description: d.description, ...meta },
      },
    });

    const paystackResp = await paystackFetch('/transaction/initialize', {
      method: 'POST',
      body: {
        email,
        amount: amountInCents,
        reference,
        metadata: { user_id: req.userId, type, description: d.description, ...meta },
        callback_url: process.env.APP_URL ? `${process.env.APP_URL}/PaymentSuccess?ref=${reference}` : undefined,
      },
    });

    res.json({
      reference,
      authorization_url: paystackResp.data.authorization_url,
      access_code: paystackResp.data.access_code,
    });
  } catch (err) {
    next(err);
  }
});

// Backward compat: /paystack/initialize
router.post('/paystack/initialize', authenticateToken, async (req, res, next) => {
  try {
    const parsed = initSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    const d = parsed.data;
    const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { email: true } });
    const email = d.email || user?.email || 'user@secnightlife.app';
    const amountInCents = Math.round(d.amount * 100);
    const reference = crypto.randomBytes(16).toString('hex');
    const meta = d.metadata || {};
    const type = meta.type || (meta.promotion_id ? 'promotion' : d.event_id ? 'event' : 'table') || 'other';
    if (type === 'table' && !(await userHasIdentityVerified(req.userId))) {
      return res.status(403).json({
        error: 'Identity verification required to pay for table bookings.',
        code: 'IDENTITY_NOT_VERIFIED',
      });
    }
    await prisma.payment.create({
      data: { userId: req.userId, email, amount: d.amount, reference, status: 'pending', type: PAYMENT_TYPES.includes(type) ? type : 'other', metadata: { description: d.description, venue_id: d.venue_id, event_id: d.event_id, ...meta } },
    });
    await prisma.transaction.create({
      data: { userId: req.userId, venueId: d.venue_id || null, eventId: d.event_id || null, amount: d.amount, currency: 'ZAR', type: 'paystack', status: 'pending', stripeId: reference, metadata: { provider: 'paystack', reference, description: d.description, ...meta } },
    });
    const paystackResp = await paystackFetch('/transaction/initialize', {
      method: 'POST',
      body: { email, amount: amountInCents, reference, metadata: { user_id: req.userId, type, description: d.description, ...meta }, callback_url: process.env.APP_URL ? `${process.env.APP_URL}/PaymentSuccess?ref=${reference}` : undefined },
    });
    res.json({ reference, authorization_url: paystackResp.data.authorization_url, access_code: paystackResp.data.access_code });
  } catch (err) {
    next(err);
  }
});

// GET /api/payments/verify/:reference — primary (spec-compliant)
router.get('/verify/:reference', authenticateToken, async (req, res, next) => {
  try {
    const reference = req.params.reference;
    const paystackResp = await paystackFetch(`/transaction/verify/${encodeURIComponent(reference)}`);
    const status = paystackResp.data.status;
    const mapped = status === 'success' ? 'paid' : status === 'failed' ? 'failed' : 'pending';

    // Update Payment
    const payment = await prisma.payment.findUnique({ where: { reference } });
    if (payment) {
      await prisma.payment.update({
        where: { reference },
        data: { status: mapped === 'paid' ? 'success' : mapped, metadata: paystackResp.data },
      });
    }

    // Update Transaction
    await prisma.transaction.updateMany({
      where: { userId: req.userId, stripeId: reference },
      data: { status: mapped, metadata: paystackResp.data },
    });

    // Idempotent: only apply side effects once
    if (mapped === 'paid') {
      await applyReferenceSideEffects(reference, paystackResp.data);
    }

    res.json({
      status: mapped,
      paystack_status: status,
    });
  } catch (err) {
    next(err);
  }
});

// Backward compat: /paystack/verify/:reference
router.get('/paystack/verify/:reference', authenticateToken, async (req, res, next) => {
  try {
    const reference = req.params.reference;
    const paystackResp = await paystackFetch(`/transaction/verify/${encodeURIComponent(reference)}`);
    const status = paystackResp.data.status;
    const mapped = status === 'success' ? 'paid' : status === 'failed' ? 'failed' : 'pending';
    const payment = await prisma.payment.findUnique({ where: { reference } });
    if (payment) {
      await prisma.payment.update({ where: { reference }, data: { status: mapped === 'paid' ? 'success' : mapped, metadata: paystackResp.data } });
    }
    await prisma.transaction.updateMany({ where: { userId: req.userId, stripeId: reference }, data: { status: mapped, metadata: paystackResp.data } });
    if (mapped === 'paid') await applyReferenceSideEffects(reference, paystackResp.data);
    res.json({ status: mapped, paystack_status: status });
  } catch (err) {
    next(err);
  }
});

// Paystack webhook handler — used by BOTH /api/webhooks/paystack and /api/payments/paystack/webhook
export async function paystackWebhookHandler(req, res) {
  const sig = req.headers['x-paystack-signature'];
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!sig || !key) return res.status(400).send('bad request');
  const hash = crypto.createHmac('sha512', key).update(req.body).digest('hex');
  if (hash !== sig) return res.status(401).send('invalid signature');

  let payload;
  try {
    payload = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).send('invalid json');
  }

  const event = payload?.event;
  const data = payload?.data;
  const reference = data?.reference;
  if (!reference) return res.status(200).send('ok');

  if (event === 'charge.success') {
    try {
      const verified = await paystackFetch(`/transaction/verify/${encodeURIComponent(reference)}`);
      if (verified?.data?.status === 'success') {
        await applyReferenceSideEffects(reference, verified.data);
      }
    } catch (e) {
      // Log but don't fail — Paystack may retry
      console.error('Paystack webhook applyReferenceSideEffects error:', e?.message);
    }
  }

  return res.status(200).send('ok');
}

export default router;
