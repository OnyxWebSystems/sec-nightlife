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
 * @param {object} opts
 * @param {string} opts.paymentReference
 * @param {number} opts.grossZar
 * @param {number} opts.secAmount
 * @param {number} opts.recipientAmount
 * @param {'USER'|'VENUE'|'PLATFORM'} opts.recipientType
 * @param {string|null} [opts.recipientUserId]
 * @param {string|null} [opts.recipientVenueId]
 * @param {string|null} [opts.paystackRecipientCode]
 */
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
