/**
 * Repair stuck HOSTED_TABLE_EXTERNAL_LISTING payments (paid but table still DRAFT).
 * Usage: node scripts/repair-external-listing-payments.mjs <paystackReference> [...]
 */
import { prisma } from '../src/lib/prisma.js';
import { ensureHostedTableLiveAfterListingPayment } from '../src/lib/hostedTableAfterListingPaid.js';
import { issueTicketAndNotify } from '../src/lib/issueTicket.js';
import {
  visibleUntilAfterHostedTable,
  eventStartsAtFromHostedTable,
  holderDisplayNameFromUser,
  formatSpecsFromHostedTable,
} from '../src/lib/ticketHelpers.js';
import { recordSecPlatformRevenue } from '../src/lib/paystackPayout.js';
import { logFriendActivity } from '../src/lib/friendActivity.js';
import { recordTableHistory } from '../src/lib/tableHistory.js';

const EXTERNAL_HOSTED_LISTING_ZAR = 200;

function flattenMeta(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const nested = value.metadata && typeof value.metadata === 'object' ? value.metadata : {};
  return { ...nested, ...value };
}

const refs = process.argv.slice(2);
if (!refs.length) {
  console.error('Usage: node scripts/repair-external-listing-payments.mjs <paystackReference> [...]');
  process.exit(1);
}

for (const reference of refs) {
  console.log('\n--- Repair external listing:', reference);
  const pay = await prisma.payment.findUnique({
    where: { reference },
    select: { status: true, amount: true, userId: true, email: true, metadata: true },
  });
  if (!pay) {
    console.log('  payment_not_found');
    continue;
  }
  const meta = flattenMeta(pay.metadata);
  console.log('  payment status:', pay.status, 'amount:', pay.amount, 'type:', meta.type);

  if (pay.status !== 'success') {
    console.log('  skip: payment not success');
    continue;
  }
  if (meta.type !== 'HOSTED_TABLE_EXTERNAL_LISTING') {
    console.log('  skip: wrong type');
    continue;
  }

  const htid = meta.hosted_table_id || meta.hostedTableId;
  if (!htid) {
    console.log('  skip: missing hosted_table_id');
    continue;
  }

  const ht = await prisma.hostedTable.findFirst({
    where: { id: String(htid), hostUserId: String(pay.userId) },
  });
  if (!ht) {
    console.log('  skip: hosted table not found for payer');
    continue;
  }
  console.log('  table:', ht.id, ht.tableName, 'status:', ht.status, 'ref:', ht.externalListingPaystackRef);

  if (ht.tableType !== 'EXTERNAL_VENUE') {
    console.log('  skip: not EXTERNAL_VENUE');
    continue;
  }

  const amountOk =
    Math.abs(Number(pay.amount) - EXTERNAL_HOSTED_LISTING_ZAR) < 0.01;
  if (!amountOk) {
    console.log('  skip: amount mismatch', pay.amount);
    continue;
  }

  if (ht.status === 'DRAFT' || ht.externalListingPaystackRef !== reference) {
    await prisma.hostedTable.update({
      where: { id: ht.id },
      data: {
        status: 'ACTIVE',
        externalListingPaystackRef: reference,
      },
    });
    console.log('  activated table → ACTIVE');
  }

  await ensureHostedTableLiveAfterListingPayment(ht.id);
  console.log('  ensured group chat + host GOING + spots');

  const existingTicket = await prisma.ticket.findUnique({ where: { paystackReference: reference } });
  if (!existingTicket) {
    const payer = await prisma.user.findUnique({
      where: { id: String(pay.userId) },
      select: { email: true, fullName: true, username: true, userProfile: { select: { username: true } } },
    });
    await issueTicketAndNotify(prisma, {
      userId: String(pay.userId),
      email: payer?.email || pay.email,
      paystackReference: reference,
      kind: 'EXTERNAL_HOSTED_LISTING',
      title: `External table listing — ${ht.tableName}`,
      subtitle: ht.venueName,
      visibleUntil: visibleUntilAfterHostedTable(ht),
      hostedTableId: ht.id,
      quantity: 1,
      holderDisplayName: holderDisplayNameFromUser(payer),
      tableSpecsSummary: formatSpecsFromHostedTable(ht),
      eventStartsAt: eventStartsAtFromHostedTable(ht),
    });
    console.log('  issued EXTERNAL_HOSTED_LISTING ticket');
  } else {
    console.log('  ticket already exists:', existingTicket.id);
  }

  logFriendActivity({
    userId: String(pay.userId),
    activityType: 'HOSTED_TABLE',
    referenceId: ht.id,
    referenceType: 'HOSTED_TABLE',
    description: 'hosted a table',
  });
  recordTableHistory({
    userId: String(pay.userId),
    role: 'HOST',
    hostedTableId: ht.id,
    eventId: ht.eventId || null,
    tableName: ht.tableName,
    eventTitle: null,
  });

  await recordSecPlatformRevenue(reference, Number(pay.amount || EXTERNAL_HOSTED_LISTING_ZAR)).catch((e) => {
    console.warn('  platform revenue note:', e?.message || e);
  });

  const { side_effects_processing, side_effects_processing_at, side_effects_error, ...metaBase } = meta;
  await prisma.payment.updateMany({
    where: { reference },
    data: {
      status: 'success',
      metadata: {
        ...metaBase,
        side_effects_applied: true,
        side_effects_processing: false,
      },
    },
  });

  const fresh = await prisma.hostedTable.findUnique({
    where: { id: ht.id },
    select: { status: true, externalListingPaystackRef: true, spotsRemaining: true },
  });
  console.log('  result:', fresh);
}

await prisma.$disconnect();
