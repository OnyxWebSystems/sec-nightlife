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

const PENDING_STATUSES = ['PENDING', 'SKIPPED_NO_RECIPIENT', 'FAILED'];

export async function aggregateWalletSummary({ userId = null, venueId = null }) {
  const where =
    userId != null
      ? { recipientUserId: userId }
      : { recipientVenueId: venueId };

  const ledgers = await prisma.payoutLedger.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 100,
  });

  let pendingBalance = 0;
  let totalReceived = 0;
  const transactions = [];

  for (const row of ledgers) {
    const amt = Number(row.recipientAmount) || 0;
    if (PENDING_STATUSES.includes(row.status)) {
      pendingBalance += amt;
    }
    if (row.status === 'TRANSFERRED') {
      totalReceived += amt;
    }
    transactions.push({
      id: row.id,
      amount: amt,
      grossAmount: row.grossAmount,
      status: row.status,
      paymentReference: row.paymentReference,
      createdAt: row.createdAt,
      label: payoutLabelFromReference(row.paymentReference),
    });
  }

  pendingBalance = Math.round(pendingBalance * 100) / 100;
  totalReceived = Math.round(totalReceived * 100) / 100;

  return { pendingBalance, totalReceived, transactions };
}

function payoutLabelFromReference(ref) {
  if (!ref) return 'Earnings';
  if (ref.includes('ticket')) return 'Event ticket';
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
