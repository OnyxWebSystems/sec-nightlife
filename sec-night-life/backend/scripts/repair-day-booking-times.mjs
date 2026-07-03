/**
 * Recompute day-booking windowEndsAt / ticket expiry after SAST parseWindowInstant fix.
 * Usage:
 *   node scripts/repair-day-booking-times.mjs                    # all recent day bookings
 *   node scripts/repair-day-booking-times.mjs <paystackRef> ...  # by payment reference
 */
import { prisma } from '../src/lib/prisma.js';
import {
  normalizeBookingDateSast,
  parseWindowInstant,
  windowEndInstant,
  resolveBookingWindowFromMember,
} from '../src/lib/dayBookingWindows.js';
import { dayEventStartsAtFromMember } from '../src/lib/ticketHelpers.js';

const refs = process.argv.slice(2);

function computeWindowEndsAt(hostedTable, member, venueTable) {
  const window = member
    ? resolveBookingWindowFromMember(member, venueTable, hostedTable.eventDate)
    : null;
  const bookingDate = normalizeBookingDateSast(
    window?.bookingDate || member?.bookingDate || hostedTable.eventDate,
  );
  const startTime = window?.windowStartTime || member?.windowStartTime || hostedTable.eventTime;
  const endTime = window?.windowEndTime || member?.windowEndTime;
  if (startTime && endTime) {
    return windowEndInstant(bookingDate, startTime, endTime);
  }
  if (hostedTable.windowEndsAt) {
    const d =
      hostedTable.windowEndsAt instanceof Date
        ? hostedTable.windowEndsAt
        : new Date(hostedTable.windowEndsAt);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  return null;
}

async function repairHostedTable(ht, member, venueTable) {
  const windowEndsAt = computeWindowEndsAt(ht, member, venueTable);
  const eventStartsAt = member
    ? dayEventStartsAtFromMember(member, venueTable, ht.eventDate)
    : ht.eventTime
      ? parseWindowInstant(ht.eventDate, ht.eventTime)
      : null;

  const updates = {};
  if (windowEndsAt && !Number.isNaN(windowEndsAt.getTime())) {
    const prev = ht.windowEndsAt ? new Date(ht.windowEndsAt).toISOString() : null;
    const next = windowEndsAt.toISOString();
    if (prev !== next) {
      updates.windowEndsAt = windowEndsAt;
      console.log('  hostedTable.windowEndsAt:', prev, '→', next);
    }
  }

  if (Object.keys(updates).length) {
    await prisma.hostedTable.update({ where: { id: ht.id }, data: updates });
  }

  const tickets = await prisma.ticket.findMany({
    where: {
      hostedTableId: ht.id,
      kind: 'VENUE_TABLE_JOIN',
      eventId: null,
      refundedAt: null,
    },
  });

  for (const ticket of tickets) {
    const ticketUpdates = {};
    if (windowEndsAt && !Number.isNaN(windowEndsAt.getTime())) {
      const prevVis = ticket.visibleUntil ? new Date(ticket.visibleUntil).toISOString() : null;
      const nextVis = windowEndsAt.toISOString();
      if (prevVis !== nextVis) {
        ticketUpdates.visibleUntil = windowEndsAt;
        console.log('  ticket.visibleUntil:', ticket.id.slice(-8), prevVis, '→', nextVis);
      }
    }
    if (eventStartsAt && !Number.isNaN(eventStartsAt.getTime())) {
      const prevStart = ticket.eventStartsAt ? new Date(ticket.eventStartsAt).toISOString() : null;
      const nextStart = eventStartsAt.toISOString();
      if (prevStart !== nextStart) {
        ticketUpdates.eventStartsAt = eventStartsAt;
        console.log('  ticket.eventStartsAt:', ticket.id.slice(-8), prevStart, '→', nextStart);
      }
    }
    if (Object.keys(ticketUpdates).length) {
      await prisma.ticket.update({ where: { id: ticket.id }, data: ticketUpdates });
    }
  }

  return Object.keys(updates).length > 0 || tickets.length > 0;
}

async function repairByReference(reference) {
  console.log('\n--- Repair times for payment:', reference);
  const ticket = await prisma.ticket.findUnique({ where: { paystackReference: reference } });
  if (!ticket?.hostedTableId) {
    console.log('  no hosted-table ticket for reference');
    return false;
  }
  const ht = await prisma.hostedTable.findUnique({ where: { id: ticket.hostedTableId } });
  if (!ht?.venueTableId) {
    console.log('  not a day-booking hosted table');
    return false;
  }
  const venueTable = await prisma.venueTable.findUnique({ where: { id: ht.venueTableId } });
  const member = ticket.venueTableId
    ? await prisma.venueTableMember.findUnique({
        where: {
          venueTableId_userId: { venueTableId: ticket.venueTableId, userId: ticket.userId },
        },
      })
    : null;
  console.log('  hostedTable:', ht.id, 'table:', venueTable?.tableName);
  return repairHostedTable(ht, member, venueTable);
}

async function repairRecentDayBookings() {
  const since = new Date();
  since.setDate(since.getDate() - 90);
  const tables = await prisma.hostedTable.findMany({
    where: {
      venueTableId: { not: null },
      eventId: null,
      createdAt: { gte: since },
    },
    orderBy: { createdAt: 'desc' },
  });
  console.log(`Found ${tables.length} day-booking hosted tables (last 90 days)`);
  let changed = 0;
  for (const ht of tables) {
    const venueTable = await prisma.venueTable.findUnique({ where: { id: ht.venueTableId } });
    const member = await prisma.venueTableMember.findFirst({
      where: { venueTableId: ht.venueTableId, userId: ht.hostUserId, memberRole: 'HOST' },
      orderBy: { createdAt: 'desc' },
    });
    console.log('\n---', ht.id, venueTable?.tableName || '');
    const did = await repairHostedTable(ht, member, venueTable);
    if (did) changed += 1;
  }
  console.log(`\nDone. Touched ${changed} hosted table(s).`);
}

if (refs.length) {
  for (const ref of refs) {
    await repairByReference(ref);
  }
} else {
  await repairRecentDayBookings();
}

await prisma.$disconnect();
