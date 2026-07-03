/**
 * Repair stuck day-host TABLE_CHECKOUT payments by reference.
 * Usage: node scripts/repair-host-payments.mjs ref1 ref2 ...
 */
import { prisma } from '../src/lib/prisma.js';
import { ensureVenueTableFulfillmentForPayment } from '../src/lib/ensureVenueTableFulfillment.js';

const refs = process.argv.slice(2);
if (!refs.length) {
  console.error('Usage: node scripts/repair-host-payments.mjs <paystackReference> [...]');
  process.exit(1);
}

for (const reference of refs) {
  console.log('\n--- Repair:', reference);
  const pay = await prisma.payment.findUnique({
    where: { reference },
    select: { status: true, amount: true, userId: true, metadata: true },
  });
  if (!pay) {
    console.log('  payment_not_found');
    continue;
  }
  console.log('  payment status:', pay.status, 'amount:', pay.amount, 'userId:', pay.userId);
  const meta = pay.metadata && typeof pay.metadata === 'object' ? pay.metadata : {};
  console.log('  side_effects_error:', meta.side_effects_error || null);

  const repair = await ensureVenueTableFulfillmentForPayment(reference, { status: 'success' });
  console.log('  repair:', repair);

  const ticket = await prisma.ticket.findUnique({ where: { paystackReference: reference } });
  const memberId = meta.venueTableMemberId || meta.venue_table_member_id;
  let hostedTableId = null;
  if (memberId) {
    const member = await prisma.venueTableMember.findUnique({
      where: { id: String(memberId) },
      select: { status: true, venueTableId: true },
    });
    if (member?.venueTableId) {
      const vt = await prisma.venueTable.findUnique({
        where: { id: member.venueTableId },
        select: { hostedTableId: true, tableName: true },
      });
      hostedTableId = vt?.hostedTableId;
      console.log('  member:', member.status, 'table:', vt?.tableName, 'hostedTableId:', hostedTableId);
    }
  }
  console.log('  ticket:', ticket ? ticket.id : null);
  console.log('  fulfilled:', Boolean(ticket && hostedTableId));
}

await prisma.$disconnect();
