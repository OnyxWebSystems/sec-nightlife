import crypto from 'crypto';
import { prisma } from './prisma.js';

function randomWalletSuffix() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

/**
 * Ensure a Sec Wallet exists for a user or venue; returns wallet row.
 * @param {'USER'|'VENUE'} ownerType
 * @param {string} ownerId — userId or venueId
 */
export async function ensureSecWallet(ownerType, ownerId) {
  if (ownerType === 'USER') {
    const existing = await prisma.secWallet.findUnique({ where: { userId: ownerId } });
    if (existing) return existing;
    const prefix = 'SEC-U';
    let wallet;
    for (let i = 0; i < 8; i += 1) {
      try {
        wallet = await prisma.secWallet.create({
          data: {
            walletCode: `${prefix}-${randomWalletSuffix()}`,
            ownerType: 'USER',
            userId: ownerId,
          },
        });
        break;
      } catch (e) {
        if (e?.code !== 'P2002') throw e;
      }
    }
    if (!wallet) throw new Error('Could not allocate wallet code');
    return wallet;
  }

  const existing = await prisma.secWallet.findUnique({ where: { venueId: ownerId } });
  if (existing) return existing;
  const prefix = 'SEC-V';
  let wallet;
  for (let i = 0; i < 8; i += 1) {
    try {
      wallet = await prisma.secWallet.create({
        data: {
          walletCode: `${prefix}-${randomWalletSuffix()}`,
          ownerType: 'VENUE',
          venueId: ownerId,
        },
      });
      break;
    } catch (e) {
      if (e?.code !== 'P2002') throw e;
    }
  }
  if (!wallet) throw new Error('Could not allocate wallet code');
  return wallet;
}

/** Still owed to recipient (not yet in their bank). Includes legacy FAILED. */
const PENDING_STATUSES = ['PENDING', 'PROCESSING', 'FAILED'];

export async function aggregateWalletSummary({
  userId = null,
  venueId = null,
  transactionsSince = null,
  transactionLimit = 40,
} = {}) {
  const where =
    userId != null
      ? { recipientUserId: userId }
      : { recipientVenueId: venueId };

  const [pendingAgg, receivedAgg, recent] = await Promise.all([
    prisma.payoutLedger.aggregate({
      where: {
        ...where,
        status: { in: PENDING_STATUSES },
        recipientAmount: { gt: 0 },
        recipientType: { in: ['USER', 'VENUE'] },
      },
      _sum: { recipientAmount: true },
    }),
    prisma.payoutLedger.aggregate({
      where: {
        ...where,
        status: 'TRANSFERRED',
        recipientAmount: { gt: 0 },
      },
      _sum: { recipientAmount: true },
    }),
    prisma.payoutLedger.findMany({
      where: {
        ...where,
        recipientType: { in: ['USER', 'VENUE'] },
        recipientAmount: { gt: 0 },
        status: { in: [...PENDING_STATUSES, 'TRANSFERRED'] },
        ...(transactionsSince
          ? { createdAt: { gte: new Date(transactionsSince) } }
          : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: Math.min(transactionLimit, 100),
    }),
  ]);

  const pendingBalance = Math.round((Number(pendingAgg._sum.recipientAmount) || 0) * 100) / 100;
  const totalReceived = Math.round((Number(receivedAgg._sum.recipientAmount) || 0) * 100) / 100;

  const transactions = recent.map((row) => ({
    id: row.id,
    amount: Number(row.recipientAmount) || 0,
    grossAmount: row.grossAmount,
    status: row.status,
    statusLabel: payoutStatusLabel(row.status),
    paymentReference: row.paymentReference,
    createdAt: row.createdAt,
    label: payoutLabelFromReference(row.paymentReference),
    errorMessage: row.errorMessage || null,
  }));

  return { pendingBalance, totalReceived, transactions };
}

function payoutStatusLabel(status) {
  switch (status) {
    case 'TRANSFERRED':
      return 'Received';
    case 'PROCESSING':
      return 'Transferring';
    case 'FAILED':
      return 'Pending';
    case 'PENDING':
    default:
      return 'Pending';
  }
}

function payoutLabelFromReference(ref) {
  if (!ref) return 'Earnings';
  if (ref.includes('ticket')) return 'Event ticket';
  if (ref.includes(':menu') || ref.includes('-menu')) return 'Menu order';
  if (ref.includes(':join') || ref.includes('-join')) return 'Table join';
  if (ref.includes('table') || ref.includes('TABLE')) return 'Table';
  if (ref.includes('host')) return 'Table host fee';
  if (ref.includes('promo')) return 'Promotion';
  return 'Payment';
}

export function maskAccountNumber(num) {
  const s = String(num || '').replace(/\s/g, '');
  if (s.length <= 4) return '****';
  return `****${s.slice(-4)}`;
}
