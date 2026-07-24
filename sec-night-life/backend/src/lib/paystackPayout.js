import { prisma } from './prisma.js';
import { logger } from './logger.js';
import { splitPlatformGross } from './platformSplit.js';
import { FEED_BOOST_ZAR_PER_DAY, clampBoostDays } from './feedBoost.js';

export { splitPlatformGross, splitPlatformGross as splitSecPlatform } from './platformSplit.js';

export const EXTERNAL_HOSTED_LISTING_ZAR = 200;
export const PROMOTION_PUBLISH_ZAR_PER_DAY = 50;
export const PROMOTION_BOOST_ZAR_PER_DAY = 150;

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
 * Server-side expected amount for platform fee / boost / listing checkouts.
 * Returns null when type is not a fixed-price platform product.
 */
export function expectedPlatformProductAmountZar(meta = {}) {
  const type = String(meta.type || meta.sec_kind || '');
  const boostDays = clampBoostDays(meta.boost_days ?? meta.boostDays ?? meta.days ?? 1);

  if (type === 'HOSTED_TABLE_EXTERNAL_LISTING') {
    return EXTERNAL_HOSTED_LISTING_ZAR;
  }
  if (type === 'TABLE_BOOST' || type === 'EVENT_BOOST' || type === 'VENUE_TABLE_BOOST' || type === 'HOUSE_PARTY_BOOST') {
    return FEED_BOOST_ZAR_PER_DAY * boostDays;
  }
  if (type === 'BOOST' || type === 'PROMOTION_BOOST') {
    return PROMOTION_BOOST_ZAR_PER_DAY * boostDays;
  }
  if (type === 'PROMOTION_PUBLISH' || meta.sec_kind === 'PROMOTION_PUBLISH') {
    const publishDays = Math.max(1, Math.min(90, Number(meta.publish_days ?? meta.publishDays ?? 1) || 1));
    const boostPart = Number(meta.boost_days ?? meta.boostDays ?? 0) || 0;
    const boostZar = boostPart > 0 ? PROMOTION_BOOST_ZAR_PER_DAY * clampBoostDays(boostPart) : 0;
    return publishDays * PROMOTION_PUBLISH_ZAR_PER_DAY + boostZar;
  }
  return null;
}

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

/**
 * Claim-or-create ledger row by unique paymentReference, then initiate transfer.
 * Sync API success → PROCESSING until transfer.success webhook confirms TRANSFERRED.
 */
export async function recordPayoutAndMaybeTransfer(opts) {
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

  const existing = await prisma.payoutLedger.findUnique({
    where: { paymentReference },
  });
  if (existing) {
    if (['TRANSFERRED', 'PROCESSING', 'REFUNDED_MANUAL', 'SKIPPED_NO_RECIPIENT'].includes(existing.status)) {
      return { status: existing.status, ledgerId: existing.id, skipped: true };
    }
    if (existing.status === 'PENDING' || existing.status === 'FAILED') {
      return retryPayoutLedgerTransfer(existing.id);
    }
    return { status: existing.status, ledgerId: existing.id, skipped: true };
  }

  if (recipientType === 'PLATFORM' || recipientAmount <= 0) {
    try {
      const row = await prisma.payoutLedger.create({
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
      return { status: 'SKIPPED_NO_RECIPIENT', ledgerId: row.id };
    } catch (e) {
      if (e?.code === 'P2002') {
        const again = await prisma.payoutLedger.findUnique({ where: { paymentReference } });
        return { status: again?.status, ledgerId: again?.id, skipped: true };
      }
      throw e;
    }
  }

  if (!paystackRecipientCode) {
    try {
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
    } catch (e) {
      if (e?.code === 'P2002') {
        const again = await prisma.payoutLedger.findUnique({ where: { paymentReference } });
        return { status: again?.status, ledgerId: again?.id, skipped: true };
      }
      throw e;
    }
  }

  const amountKobo = Math.round(recipientAmount * 100);
  if (amountKobo < 100) {
    try {
      const row = await prisma.payoutLedger.create({
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
      return { status: 'FAILED', ledgerId: row.id };
    } catch (e) {
      if (e?.code === 'P2002') {
        const again = await prisma.payoutLedger.findUnique({ where: { paymentReference } });
        return { status: again?.status, ledgerId: again?.id, skipped: true };
      }
      throw e;
    }
  }

  let row;
  try {
    row = await prisma.payoutLedger.create({
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
  } catch (e) {
    if (e?.code === 'P2002') {
      const again = await prisma.payoutLedger.findUnique({ where: { paymentReference } });
      if (again && (again.status === 'PENDING' || again.status === 'FAILED')) {
        return retryPayoutLedgerTransfer(again.id);
      }
      return { status: again?.status, ledgerId: again?.id, skipped: true };
    }
    throw e;
  }

  return initiateTransferForLedger(row, paystackRecipientCode);
}

/** Paystack transfer references may only use alphanumeric, underscore, and hyphen. */
export function sanitizePaystackTransferReference(raw) {
  return String(raw || '')
    .replace(/[^A-Za-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 100);
}

async function initiateTransferForLedger(row, paystackRecipientCode) {
  const amountKobo = Math.round(Number(row.recipientAmount) * 100);
  if (!paystackRecipientCode) {
    await prisma.payoutLedger.update({
      where: { id: row.id },
      data: {
        status: 'PENDING',
        errorMessage: 'Missing paystack recipient code — configure payouts in account settings.',
      },
    });
    return { status: 'PENDING', ledgerId: row.id };
  }
  if (amountKobo < 100) {
    await prisma.payoutLedger.update({
      where: { id: row.id },
      data: { status: 'FAILED', errorMessage: 'Recipient amount below minimum transfer' },
    });
    return { status: 'FAILED', ledgerId: row.id };
  }

  const transferReference = sanitizePaystackTransferReference(
    `${row.paymentReference}-payout-${row.id}`,
  );

  try {
    const transfer = await paystackFetch('/transfer', {
      method: 'POST',
      body: {
        source: 'balance',
        amount: amountKobo,
        recipient: paystackRecipientCode,
        reason: `SEC payout ${row.paymentReference}`.slice(0, 100),
        reference: transferReference,
      },
    });
    const ref = transfer?.data?.reference || transfer?.data?.transfer_code || transferReference;
    await prisma.payoutLedger.update({
      where: { id: row.id },
      data: {
        status: 'PROCESSING',
        paystackTransferRef: ref,
        errorMessage: null,
      },
    });
    return { status: 'PROCESSING', ledgerId: row.id, transferRef: ref };
  } catch (e) {
    // Keep PENDING so Sec Wallet shows owed amount and cron can retry (e.g. insufficient balance).
    const msg = e?.message || String(e);
    await prisma.payoutLedger.update({
      where: { id: row.id },
      data: { status: 'PENDING', errorMessage: msg.slice(0, 2000) },
    });
    logger.error('paystack transfer failed (left PENDING for retry)', {
      paymentReference: row.paymentReference,
      err: msg,
    });
    return { status: 'PENDING', ledgerId: row.id, error: msg };
  }
}

/**
 * Retry PENDING/FAILED ledger when recipient is now available.
 */
export async function retryPayoutLedgerTransfer(ledgerId) {
  const row = await prisma.payoutLedger.findUnique({ where: { id: ledgerId } });
  if (!row) return { skipped: true, reason: 'not_found' };
  if (['TRANSFERRED', 'PROCESSING', 'REFUNDED_MANUAL', 'SKIPPED_NO_RECIPIENT'].includes(row.status)) {
    return { status: row.status, ledgerId: row.id, skipped: true };
  }
  if (row.recipientType === 'PLATFORM' || Number(row.recipientAmount) <= 0) {
    return { status: row.status, ledgerId: row.id, skipped: true };
  }

  let code = null;
  if (row.recipientVenueId) {
    code = await resolveRecipientCodeForVenue(row.recipientVenueId);
  } else if (row.recipientUserId) {
    code = await resolveRecipientCodeForUser(row.recipientUserId);
  }
  if (!code) {
    await prisma.payoutLedger.update({
      where: { id: row.id },
      data: {
        status: 'PENDING',
        errorMessage: 'Missing paystack recipient code — configure payouts in account settings.',
      },
    });
    return { status: 'PENDING', ledgerId: row.id, skipped: true, reason: 'no_recipient' };
  }

  return initiateTransferForLedger(row, code);
}

/**
 * Apply transfer webhook events to ledger rows.
 */
export async function applyTransferWebhookEvent(event, data) {
  const transferRef =
    data?.reference ||
    data?.transfer_code ||
    data?.transfer_reference ||
    null;
  const transferRefStr = typeof transferRef === 'string' ? transferRef : null;
  const payoutIdx = transferRefStr ? transferRefStr.lastIndexOf('-payout-') : -1;
  const ledgerIdHint = payoutIdx >= 0 ? transferRefStr.slice(payoutIdx + '-payout-'.length) : null;
  const paymentHint = payoutIdx > 0 ? transferRefStr.slice(0, payoutIdx) : null;

  let row = null;
  if (transferRefStr) {
    row = await prisma.payoutLedger.findFirst({
      where: {
        OR: [
          { paystackTransferRef: transferRefStr },
          ...(ledgerIdHint ? [{ id: ledgerIdHint }] : []),
          ...(paymentHint ? [{ paymentReference: paymentHint }] : []),
        ],
      },
    });
  }
  if (!row && paymentHint) {
    // Sanitized refs replace ":" with "-" (e.g. ref:menu → ref-menu)
    row = await prisma.payoutLedger.findFirst({
      where: {
        OR: [
          { paymentReference: paymentHint },
          { paymentReference: paymentHint.replace(/-/g, ':') },
        ],
      },
    });
  }
  if (!row) {
    logger.warn('transfer webhook: ledger not found', { event, transferRef });
    return { matched: false };
  }
  if (row.status === 'REFUNDED_MANUAL') {
    return { matched: true, ledgerId: row.id, status: row.status, skipped: true };
  }

  if (event === 'transfer.success') {
    await prisma.payoutLedger.update({
      where: { id: row.id },
      data: {
        status: 'TRANSFERRED',
        paystackTransferRef: transferRefStr || row.paystackTransferRef,
        errorMessage: null,
      },
    });
    return { matched: true, ledgerId: row.id, status: 'TRANSFERRED' };
  }

  if (event === 'transfer.failed' || event === 'transfer.reversed') {
    // Retryable: keep PENDING so wallet shows owed amount and cron retries.
    await prisma.payoutLedger.update({
      where: { id: row.id },
      data: {
        status: 'PENDING',
        paystackTransferRef: transferRefStr || row.paystackTransferRef,
        errorMessage: (data?.reason || data?.message || event).toString().slice(0, 2000),
      },
    });
    return { matched: true, ledgerId: row.id, status: 'PENDING' };
  }

  return { matched: true, ledgerId: row.id, status: row.status };
}

/** Mark ledgers for a payment as manually refunded (no Paystack clawback). */
export async function markPayoutsRefundedManual(paymentReference) {
  const refs = [
    paymentReference,
    `${paymentReference}:join`,
    `${paymentReference}:menu`,
  ];
  const result = await prisma.payoutLedger.updateMany({
    where: {
      OR: [
        { paymentReference: { in: refs } },
        { paymentReference: { startsWith: `${paymentReference}:` } },
      ],
      status: { not: 'REFUNDED_MANUAL' },
    },
    data: {
      status: 'REFUNDED_MANUAL',
      errorMessage: 'Marked after venue-approved manual guest refund (no Paystack clawback).',
    },
  });
  return result;
}

const RETRYABLE_FAILED_ERROR_PATTERNS = [
  /balance is not enough/i,
  /illegal special characters/i,
  /insufficient/i,
  /try again/i,
  /timeout/i,
  /temporar/i,
  /rate limit/i,
  /transfer\.failed/i,
  /transfer\.reversed/i,
];

function isRetryableFailedPayoutError(message) {
  const msg = String(message || '');
  if (!msg) return true; // legacy FAILED with no message — allow retry
  if (/below minimum transfer/i.test(msg)) return false;
  return RETRYABLE_FAILED_ERROR_PATTERNS.some((re) => re.test(msg));
}

/**
 * Flip legacy FAILED rows that should have stayed PENDING (insufficient balance, bad refs, etc.).
 */
export async function requeueRetryableFailedPayouts({ limit = 200 } = {}) {
  const rows = await prisma.payoutLedger.findMany({
    where: {
      status: 'FAILED',
      recipientType: { in: ['USER', 'VENUE'] },
      recipientAmount: { gt: 0 },
    },
    orderBy: { createdAt: 'asc' },
    take: Math.min(limit, 500),
    select: { id: true, errorMessage: true },
  });

  let requeued = 0;
  for (const row of rows) {
    if (!isRetryableFailedPayoutError(row.errorMessage)) continue;
    await prisma.payoutLedger.update({
      where: { id: row.id },
      data: {
        status: 'PENDING',
        errorMessage: row.errorMessage
          ? `Requeued for retry: ${row.errorMessage}`.slice(0, 2000)
          : 'Requeued for retry',
      },
    });
    requeued += 1;
  }
  return { scanned: rows.length, requeued };
}

/**
 * Cron/admin: retry PENDING/FAILED payouts that now have recipient codes.
 * Optional filters scope retries after a user/venue sets up their Sec Wallet.
 */
export async function retryStuckPayouts({
  limit = 50,
  recipientUserId = null,
  recipientVenueId = null,
  includeOwnerVenueFallback = false,
  requeueFailed = true,
} = {}) {
  let requeue = { scanned: 0, requeued: 0 };
  if (requeueFailed && !recipientUserId && !recipientVenueId) {
    requeue = await requeueRetryableFailedPayouts({ limit: Math.min(limit * 4, 200) });
  } else if (requeueFailed && (recipientUserId || recipientVenueId)) {
    // Scoped: requeue matching FAILED rows first
    const scopeWhere = {
      status: 'FAILED',
      recipientType: { in: ['USER', 'VENUE'] },
      recipientAmount: { gt: 0 },
      ...(recipientVenueId
        ? { recipientVenueId: String(recipientVenueId) }
        : { recipientUserId: String(recipientUserId) }),
    };
    const scopedFailed = await prisma.payoutLedger.findMany({
      where: scopeWhere,
      take: Math.min(limit, 100),
      select: { id: true, errorMessage: true },
    });
    for (const row of scopedFailed) {
      if (!isRetryableFailedPayoutError(row.errorMessage)) continue;
      await prisma.payoutLedger.update({
        where: { id: row.id },
        data: {
          status: 'PENDING',
          errorMessage: row.errorMessage
            ? `Requeued for retry: ${row.errorMessage}`.slice(0, 2000)
            : 'Requeued for retry',
        },
      });
      requeue.requeued += 1;
    }
    requeue.scanned = scopedFailed.length;
  }

  const where = {
    status: { in: ['PENDING', 'FAILED'] },
    recipientType: { in: ['USER', 'VENUE'] },
    recipientAmount: { gt: 0 },
  };

  if (recipientVenueId) {
    where.recipientVenueId = String(recipientVenueId);
  } else if (recipientUserId) {
    const userId = String(recipientUserId);
    if (includeOwnerVenueFallback) {
      const ownedVenues = await prisma.venue.findMany({
        where: {
          ownerUserId: userId,
          deletedAt: null,
          OR: [{ paystackRecipientCode: null }, { paystackRecipientCode: '' }],
        },
        select: { id: true },
      });
      const venueIds = ownedVenues.map((v) => v.id);
      if (venueIds.length) {
        where.OR = [
          { recipientUserId: userId },
          { recipientVenueId: { in: venueIds } },
        ];
      } else {
        where.recipientUserId = userId;
      }
    } else {
      where.recipientUserId = userId;
    }
  }

  const rows = await prisma.payoutLedger.findMany({
    where,
    orderBy: { createdAt: 'asc' },
    take: Math.min(limit, 100),
  });

  let retried = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    try {
      const result = await retryPayoutLedgerTransfer(row.id);
      if (result.skipped) skipped += 1;
      else if (result.status === 'FAILED') failed += 1;
      else retried += 1;
    } catch (e) {
      failed += 1;
      logger.error('retryStuckPayouts row failed', { id: row.id, err: e?.message });
    }
  }

  return { scanned: rows.length, retried, skipped, failed, requeue };
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

  const existing = await prisma.payoutLedger.findUnique({ where: { paymentReference: reference } });
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

    const ledger = await prisma.payoutLedger.findUnique({ where: { paymentReference: pay.reference } });
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
    const ledger = await prisma.payoutLedger.findUnique({ where: { paymentReference: joinRef } });
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
