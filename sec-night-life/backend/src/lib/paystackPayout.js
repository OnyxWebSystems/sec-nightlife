import { prisma } from './prisma.js';
import { logger } from './logger.js';
import { splitPlatformGross } from './platformSplit.js';

export { splitPlatformGross, splitPlatformGross as splitSecPlatform } from './platformSplit.js';

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

/**
 * Record ledger row and attempt Paystack transfer of recipient share to a transfer recipient code.
 */
/** Record 100% SEC revenue (promotions, boosts, platform fees) — no recipient transfer. */
export async function recordSecPlatformRevenue(paymentReference, grossZar) {
  const gross = Number(grossZar) || 0;
  if (gross <= 0) return { skipped: true };
  return recordPayoutAndMaybeTransfer({
    paymentReference,
    grossZar: gross,
    secAmount: gross,
    recipientAmount: 0,
    recipientType: 'PLATFORM',
  });
}

/** Record ledger row and attempt Paystack transfer of recipient share to a transfer recipient code. */
export async function recordPayoutAndMaybeTransfer(opts) {
  const existing = await prisma.payoutLedger.findFirst({ where: { paymentReference: opts.paymentReference } });
  if (existing) {
    return { status: existing.status, ledgerId: existing.id, skipped: true };
  }

  const {
    paymentReference,
    grossZar,
    secAmount,
    recipientAmount,
    recipientType,
    recipientUserId = null,
    recipientVenueId = null,
    paystackRecipientCode = null,
  } = opts;

  if (recipientType === 'PLATFORM' || recipientAmount <= 0) {
    await prisma.payoutLedger.create({
      data: {
        paymentReference,
        grossAmount: grossZar,
        secAmount,
        recipientAmount,
        recipientType: 'PLATFORM',
        recipientUserId: null,
        recipientVenueId: null,
        status: 'SKIPPED_NO_RECIPIENT',
        errorMessage: null,
      },
    });
    return { status: 'SKIPPED_NO_RECIPIENT' };
  }

  if (!paystackRecipientCode) {
    const row = await prisma.payoutLedger.create({
      data: {
        paymentReference,
        grossAmount: grossZar,
        secAmount,
        recipientAmount,
        recipientType,
        recipientUserId,
        recipientVenueId,
        status: 'PENDING',
        errorMessage: 'Missing paystack recipient code — configure payouts in account settings.',
      },
    });
    logger.warn('payout pending: no recipient code', { paymentReference, recipientUserId, recipientVenueId });
    return { status: 'PENDING', ledgerId: row.id };
  }

  const amountKobo = Math.round(recipientAmount * 100);
  if (amountKobo < 100) {
    await prisma.payoutLedger.create({
      data: {
        paymentReference,
        grossAmount: grossZar,
        secAmount,
        recipientAmount,
        recipientType,
        recipientUserId,
        recipientVenueId,
        status: 'FAILED',
        errorMessage: 'Recipient amount below minimum transfer',
      },
    });
    return { status: 'FAILED' };
  }

  const row = await prisma.payoutLedger.create({
    data: {
      paymentReference,
      grossAmount: grossZar,
      secAmount,
      recipientAmount,
      recipientType,
      recipientUserId,
      recipientVenueId,
      status: 'PENDING',
    },
  });

  try {
    const transfer = await paystackFetch('/transfer', {
      method: 'POST',
      body: {
        source: 'balance',
        amount: amountKobo,
        recipient: paystackRecipientCode,
        reason: `SEC payout ${paymentReference}`,
        reference: `${paymentReference}-payout-${row.id}`.slice(0, 100),
      },
    });
    const ref = transfer?.data?.reference || transfer?.data?.transfer_code || null;
    await prisma.payoutLedger.update({
      where: { id: row.id },
      data: { status: 'TRANSFERRED', paystackTransferRef: ref, errorMessage: null },
    });
    return { status: 'TRANSFERRED', ledgerId: row.id, transferRef: ref };
  } catch (e) {
    const msg = e?.message || String(e);
    await prisma.payoutLedger.update({
      where: { id: row.id },
      data: { status: 'FAILED', errorMessage: msg.slice(0, 2000) },
    });
    logger.error('paystack transfer failed', { paymentReference, err: msg });
    return { status: 'FAILED', ledgerId: row.id, error: msg };
  }
}

export async function resolveRecipientCodeForUser(userId) {
  const u = await prisma.user.findUnique({
    where: { id: userId },
    select: { paystackRecipientCode: true },
  });
  return u?.paystackRecipientCode || null;
}

export async function resolveRecipientCodeForVenue(venueId) {
  const v = await prisma.venue.findFirst({
    where: { id: venueId, deletedAt: null },
    select: { paystackRecipientCode: true, ownerUserId: true },
  });
  if (v?.paystackRecipientCode) return v.paystackRecipientCode;
  if (v?.ownerUserId) return resolveRecipientCodeForUser(v.ownerUserId);
  return null;
}

function flattenPaymentMetadata(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const nested = value.metadata && typeof value.metadata === 'object' ? value.metadata : {};
  return { ...nested, ...value };
}

/**
 * Idempotently record venue-table payout ledger (SEC 15% + venue 85%) when missing.
 */
export async function ensureVenueTablePayoutLedger({ reference, amountZar, venueId }) {
  const gross = Number(amountZar) || 0;
  if (!reference || gross <= 0 || !venueId) {
    return { skipped: true, reason: 'invalid_input' };
  }

  const existing = await prisma.payoutLedger.findFirst({ where: { paymentReference: reference } });
  if (existing) {
    return { skipped: true, status: existing.status, ledgerId: existing.id };
  }

  const { secAmount, recipientAmount } = splitPlatformGross(gross);
  const venueCode = await resolveRecipientCodeForVenue(venueId);
  const result = await recordPayoutAndMaybeTransfer({
    paymentReference: reference,
    grossZar: gross,
    secAmount,
    recipientAmount,
    recipientType: 'VENUE',
    recipientVenueId: venueId,
    recipientUserId: null,
    paystackRecipientCode: venueCode,
  });
  return { skipped: false, ...result };
}

/**
 * Backfill missing payout ledgers for successful venue table checkouts.
 */
export async function repairMissingVenueTablePayouts({ sinceDays = 60, limit = 80 } = {}) {
  const since = new Date(Date.now() - sinceDays * 86400000);
  const payments = await prisma.payment.findMany({
    where: { status: 'success', createdAt: { gte: since } },
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit * 3, 500),
    select: { reference: true, amount: true, metadata: true },
  });

  const tableTypes = new Set(['TABLE_CHECKOUT', 'VENUE_TABLE_JOIN']);
  let repaired = 0;
  let skipped = 0;

  for (const pay of payments) {
    if (repaired + skipped >= limit) break;
    const meta = flattenPaymentMetadata(pay.metadata);
    if (!tableTypes.has(String(meta.type || ''))) continue;

    const venueId = meta.venue_id ?? meta.venueId;
    const memberId = meta.venueTableMemberId ?? meta.venue_table_member_id;
    if (!venueId || !memberId) continue;

    const ledger = await prisma.payoutLedger.findFirst({ where: { paymentReference: pay.reference } });
    if (ledger) {
      skipped += 1;
      continue;
    }

    const member = await prisma.venueTableMember.findUnique({
      where: { id: String(memberId) },
      select: { status: true },
    });
    if (member?.status !== 'CONFIRMED') continue;

    const result = await ensureVenueTablePayoutLedger({
      reference: pay.reference,
      amountZar: Number(pay.amount) || 0,
      venueId: String(venueId),
    });
    if (!result.skipped) repaired += 1;
    else skipped += 1;
  }

  return { repaired, skipped, scanned: payments.length };
}

/**
 * Backfill missing host join-fee payout ledgers for successful HOSTED_TABLE_JOIN payments.
 */
export async function repairMissingHostedTableJoinPayouts({ sinceDays = 90, limit = 100 } = {}) {
  const since = new Date(Date.now() - sinceDays * 86400000);
  const payments = await prisma.payment.findMany({
    where: { status: 'success', createdAt: { gte: since } },
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit * 5, 800),
    select: { reference: true, amount: true, metadata: true },
  });

  let repaired = 0;
  let skipped = 0;

  for (const pay of payments) {
    if (repaired + skipped >= limit) break;
    const meta = flattenPaymentMetadata(pay.metadata);
    if (String(meta.type || '') !== 'HOSTED_TABLE_JOIN') continue;

    const joinZar = Number(meta.join_zar ?? meta.joinZar ?? 0) || 0;
    if (joinZar <= 0) {
      skipped += 1;
      continue;
    }

    const joinRef = `${pay.reference}:join`;
    const ledger = await prisma.payoutLedger.findFirst({ where: { paymentReference: joinRef } });
    if (ledger) {
      skipped += 1;
      continue;
    }

    const hostedTableId = meta.hosted_table_id ?? meta.hostedTableId;
    if (!hostedTableId) continue;

    const ht = await prisma.hostedTable.findUnique({
      where: { id: String(hostedTableId) },
      select: { hostUserId: true },
    });
    if (!ht?.hostUserId) continue;

    const hostCode = await resolveRecipientCodeForUser(ht.hostUserId);
    const { secAmount, recipientAmount } = splitPlatformGross(joinZar);
    const result = await recordPayoutAndMaybeTransfer({
      paymentReference: joinRef,
      grossZar: joinZar,
      secAmount,
      recipientAmount,
      recipientType: 'USER',
      recipientUserId: ht.hostUserId,
      recipientVenueId: null,
      paystackRecipientCode: hostCode,
    });
    if (!result.skipped) repaired += 1;
    else skipped += 1;
  }

  return { repaired, skipped, scanned: payments.length };
}
