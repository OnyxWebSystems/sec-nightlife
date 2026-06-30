import { prisma } from './prisma.js';
import { issueTicketAndNotify } from './issueTicket.js';
import { ensureHostedTableFromVenueHostPayment } from './venueTableHostAfterPayment.js';
import { recordEventVenueTableBooking, recordGuestEventVenueTableBookingIfNeeded } from './eventVenueBooking.js';
import { resolveVenueMenuSelections } from './menuHelpers.js';
import { buildVenueTableMemberTicketSummary } from './ticketMemberSummary.js';
import {
  visibleUntilAfterEventDate,
  visibleUntilForVenueTableMember,
  visibleUntilForDayVenueTable,
  eventStartsAtFromEvent,
  eventEndsAtFromEvent,
  dayStartsAtFromVenueTable,
  holderDisplayNameFromUser,
  venueTableTicketTitle,
} from './ticketHelpers.js';
import { splitSecPlatform, recordPayoutAndMaybeTransfer, resolveRecipientCodeForVenue } from './paystackPayout.js';
import { logger } from './logger.js';

function flattenMetadata(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const nested = value.metadata && typeof value.metadata === 'object' ? value.metadata : {};
  return { ...nested, ...value };
}

/**
 * Repair path: ensure venue-table checkout fulfillment for a paid reference.
 * Handles PENDING_PAYMENT members, missing tickets, and missing hosted-table links.
 */
export async function ensureVenueTableFulfillmentForPayment(reference, paystackData = null) {
  const pay = await prisma.payment.findUnique({
    where: { reference },
    select: { userId: true, email: true, amount: true, metadata: true, status: true },
  });
  if (!pay) return { repaired: false, reason: 'payment_not_found' };

  const paid = pay.status === 'success' || paystackData?.status === 'success';
  if (!paid) return { repaired: false, reason: 'not_paid' };

  const metadata = flattenMetadata(pay.metadata);
  const type = metadata.type;
  if (type !== 'TABLE_CHECKOUT' && type !== 'VENUE_TABLE_JOIN') {
    return { repaired: false, reason: 'wrong_type' };
  }

  const venueTableId = metadata.venueTableId || metadata.venue_table_id;
  const venueTableMemberId = metadata.venueTableMemberId || metadata.venue_table_member_id;
  const userId = pay.userId || metadata.user_id || metadata.userId;
  if (!venueTableId || !venueTableMemberId || !userId) {
    return { repaired: false, reason: 'missing_metadata' };
  }

  const amount = paystackData?.amount ? paystackData.amount / 100 : Number(pay.amount || 0);
  const email = pay.email || paystackData?.customer?.email || metadata.email || 'unknown@secnightlife.app';
  let repaired = false;

  let member = await prisma.venueTableMember.findFirst({
    where: {
      id: String(venueTableMemberId),
      venueTableId: String(venueTableId),
      userId: String(userId),
    },
    include: { venueTable: { include: { venue: true } } },
  });
  if (!member) return { repaired: false, reason: 'member_not_found' };

  if (member.status === 'PENDING_PAYMENT') {
    await prisma.$transaction(async (tx) => {
      const freshMember = await tx.venueTableMember.findFirst({
        where: { id: member.id },
        include: { venueTable: { include: { venue: true } } },
      });
      if (!freshMember || freshMember.status === 'CONFIRMED') return;

      const table = freshMember.venueTable;
      const totalPaid = Number(amount || 0);
      const { secAmount, recipientAmount: venueAmount } = splitSecPlatform(totalPaid);
      const currentOccupancy = table.currentOccupancy + 1;
      const amountContributed = table.amountContributed + totalPaid;
      const nextStatus =
        currentOccupancy >= table.guestCapacity
          ? 'LOCKED'
          : amountContributed >= table.minimumSpend
            ? 'PARTIALLY_FILLED'
            : 'AVAILABLE';

      await tx.venueTableMember.update({
        where: { id: freshMember.id },
        data: {
          status: 'CONFIRMED',
          amountPaid: totalPaid,
          selectedMenuItems: metadata.selectedMenuItems || freshMember.selectedMenuItems,
          paidAt: new Date(),
          paystackReference: reference,
          tableSessionNumber: Number(table.tableSessionNumber) || 1,
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
      const existingLog = await tx.splitPaymentLog.findFirst({ where: { reference } });
      if (!existingLog) {
        await tx.splitPaymentLog.create({
          data: {
            venueTableId: table.id,
            memberId: freshMember.id,
            totalAmount: totalPaid,
            secAmount,
            venueAmount,
            reference,
          },
        });
      }

      const bookingMode = metadata.booking_mode || metadata.bookingMode;
      const isHostPayment =
        bookingMode === 'host' || bookingMode === 'custom_host' || freshMember.memberRole === 'HOST';
      if (isHostPayment && !table.hostedTableId) {
        await ensureHostedTableFromVenueHostPayment({
          tx,
          venueTable: table,
          userId: String(userId),
          paystackReference: reference,
          amountTotal: totalPaid,
          selectedMenuItems: metadata.selectedMenuItems || freshMember.selectedMenuItems,
          settlementMode: metadata.settlement_mode || freshMember.settlementMode,
        });
      }
    });
    repaired = true;
    member = await prisma.venueTableMember.findFirst({
      where: { id: String(venueTableMemberId) },
      include: { venueTable: { include: { venue: true } } },
    });
  }

  const vt = await prisma.venueTable.findUnique({
    where: { id: String(venueTableId) },
    include: { event: true, venue: true },
  });
  if (!vt || member?.status !== 'CONFIRMED') {
    return { repaired, reason: repaired ? 'confirmed_pending_ticket' : 'not_confirmed' };
  }

  const bookingMode = metadata.booking_mode || metadata.bookingMode;
  const isHostMode = bookingMode === 'host' || bookingMode === 'custom_host' || member.memberRole === 'HOST';

  if (isHostMode && !vt.hostedTableId) {
    await prisma.$transaction(async (tx) => {
      const freshTable = await tx.venueTable.findUnique({ where: { id: vt.id } });
      if (freshTable && !freshTable.hostedTableId) {
        await ensureHostedTableFromVenueHostPayment({
          tx,
          venueTable: freshTable,
          userId: String(userId),
          paystackReference: reference,
          amountTotal: amount,
          selectedMenuItems: metadata.selectedMenuItems || member.selectedMenuItems,
          settlementMode: metadata.settlement_mode || member.settlementMode,
        });
        repaired = true;
      }
    });
  }

  const refreshedVt = await prisma.venueTable.findUnique({
    where: { id: String(venueTableId) },
    include: { event: true, venue: true },
  });

  if (isHostMode && refreshedVt?.hostedTableId && refreshedVt.eventId) {
    const existingBooking = await prisma.eventVenueTableBooking.findFirst({
      where: {
        hostedTableId: refreshedVt.hostedTableId,
        userId: String(userId),
        role: 'HOST',
      },
    });
    if (!existingBooking) {
      await recordEventVenueTableBooking({
        venueId: refreshedVt.venueId,
        eventId: refreshedVt.eventId,
        hostedTableId: refreshedVt.hostedTableId,
        userId: String(userId),
        role: 'HOST',
        paystackReference: reference,
        amountTotal: amount,
      });
      repaired = true;
    }
  }

  if (!isHostMode && refreshedVt?.eventId) {
    const guestBooking = await recordGuestEventVenueTableBookingIfNeeded({
      venueTableId: refreshedVt.id,
      userId: String(userId),
      paystackReference: reference,
      amountTotal: amount,
      selectedMenuItems: metadata.selectedMenuItems || member.selectedMenuItems,
      bookingMode,
      memberRole: member.memberRole,
    });
    if (guestBooking) repaired = true;
  }

  const existingTicket = await prisma.ticket.findUnique({ where: { paystackReference: reference } });
  if (!existingTicket) {
    const vu = await prisma.user.findUnique({
      where: { id: String(userId) },
      select: { email: true, fullName: true, username: true, userProfile: { select: { username: true } } },
    });
    const visFallback = refreshedVt.event?.date
      ? visibleUntilForVenueTableMember(refreshedVt, refreshedVt.event)
      : visibleUntilForDayVenueTable(refreshedVt);
    const eventStartsAt = refreshedVt.event
      ? eventStartsAtFromEvent(refreshedVt.event)
      : dayStartsAtFromVenueTable(refreshedVt);
    const eventEndsAt = refreshedVt.event ? eventEndsAtFromEvent(refreshedVt.event) : null;
    const settlementMode = metadata.settlement_mode || metadata.settlementMode || member.settlementMode;
    const minSpendZar = isHostMode
      ? Number(refreshedVt.hostMinimumSpend ?? refreshedVt.minimumSpend ?? 0)
      : Number(refreshedVt.minimumSpend ?? 0);
    let menuResolved = null;
    const menuSel = metadata.selectedMenuItems || member.selectedMenuItems;
    if (Array.isArray(menuSel) && menuSel.length && refreshedVt.venueId) {
      menuResolved = await resolveVenueMenuSelections(menuSel, refreshedVt.venueId);
    }
    const tableSpecsSummary = await buildVenueTableMemberTicketSummary(prisma, {
      member,
      table: refreshedVt,
      venue: refreshedVt.venue,
      bookingMode,
      settlementMode,
      minSpendZar,
      menuItemsResolved: menuResolved,
    });
    await issueTicketAndNotify(prisma, {
      userId: String(userId),
      email: vu?.email || email,
      paystackReference: reference,
      kind: 'VENUE_TABLE_JOIN',
      title: venueTableTicketTitle(
        refreshedVt.tableName,
        refreshedVt.event?.title,
        isHostMode,
      ),
      subtitle: refreshedVt.venue?.name || null,
      visibleUntil: visFallback,
      venueTableId: refreshedVt.id,
      eventId: refreshedVt.eventId || null,
      quantity: 1,
      holderDisplayName: holderDisplayNameFromUser(vu),
      tableSpecsSummary,
      eventStartsAt,
      eventEndsAt,
    });
    const { secAmount: sAmt, recipientAmount: vAmt } = splitSecPlatform(Number(amount || 0));
    const venueCode = await resolveRecipientCodeForVenue(refreshedVt.venueId);
    await recordPayoutAndMaybeTransfer({
      paymentReference: reference,
      grossZar: Number(amount || 0),
      secAmount: sAmt,
      recipientAmount: vAmt,
      recipientType: 'VENUE',
      recipientVenueId: refreshedVt.venueId,
      recipientUserId: null,
      paystackRecipientCode: venueCode,
    }).catch((e) => logger.warn('venue table repair payout failed', { err: e?.message }));
    repaired = true;
  }

  return { repaired, reason: repaired ? 'ok' : 'already_complete' };
}
