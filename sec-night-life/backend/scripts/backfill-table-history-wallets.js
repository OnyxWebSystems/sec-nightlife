/**
 * Backfill user_table_history and sec_wallets for existing users/venues.
 * Run: node scripts/backfill-table-history-wallets.js
 */
import 'dotenv/config';
import { prisma } from '../src/lib/prisma.js';
import { recordTableHistoryAwait } from '../src/lib/tableHistory.js';
import { ensureSecWallet } from '../src/lib/secWallet.js';

async function backfillWallets() {
  const users = await prisma.user.findMany({ where: { deletedAt: null }, select: { id: true } });
  for (const u of users) {
    await ensureSecWallet('USER', u.id);
  }
  const venues = await prisma.venue.findMany({ where: { deletedAt: null }, select: { id: true } });
  for (const v of venues) {
    await ensureSecWallet('VENUE', v.id);
  }
  console.log(`Wallets: ${users.length} users, ${venues.length} venues`);
}

function ticketHistoryRole(kind) {
  if (kind === 'EVENT_TICKET') return null;
  if (kind === 'TABLE_HOST_FEE') return 'HOST';
  if (['VENUE_TABLE_JOIN', 'HOSTED_TABLE_JOIN', 'TABLE_JOIN'].includes(kind)) return 'JOINED';
  return null;
}

async function backfillTableHistory() {
  const tasks = [];

  const hosted = await prisma.table.findMany({
    where: { deletedAt: null },
    include: { event: { select: { title: true } } },
  });
  for (const t of hosted) {
    tasks.push(
      recordTableHistoryAwait({
        userId: t.hostUserId,
        role: 'HOST',
        tableId: t.id,
        eventId: t.eventId,
        tableName: t.name,
        eventTitle: t.event?.title || null,
        occurredAt: t.createdAt,
      })
    );
  }

  const htHosted = await prisma.hostedTable.findMany({
    where: { status: { not: 'DRAFT' } },
    include: { event: { select: { title: true } } },
  });
  for (const ht of htHosted) {
    tasks.push(
      recordTableHistoryAwait({
        userId: ht.hostUserId,
        role: 'HOST',
        hostedTableId: ht.id,
        eventId: ht.eventId,
        tableName: ht.tableName,
        eventTitle: ht.event?.title || null,
        occurredAt: ht.createdAt,
      })
    );
  }

  const htMembers = await prisma.hostedTableMember.findMany({
    where: { status: 'GOING' },
    include: { hostedTable: { include: { event: { select: { title: true } } } } },
  });
  for (const m of htMembers) {
    if (m.userId === m.hostedTable.hostUserId) continue;
    tasks.push(
      recordTableHistoryAwait({
        userId: m.userId,
        role: 'JOINED',
        hostedTableId: m.hostedTableId,
        eventId: m.hostedTable.eventId,
        tableName: m.hostedTable.tableName,
        eventTitle: m.hostedTable.event?.title || null,
        occurredAt: m.joinedAt,
      })
    );
  }

  const venueHosted = await prisma.venueTable.findMany({
    where: { hostUserId: { not: null } },
    include: { event: { select: { title: true } } },
  });
  for (const vt of venueHosted) {
    if (!vt.hostUserId) continue;
    tasks.push(
      recordTableHistoryAwait({
        userId: vt.hostUserId,
        role: 'HOST',
        venueTableId: vt.id,
        eventId: vt.eventId,
        tableName: vt.tableName,
        eventTitle: vt.event?.title || null,
        occurredAt: vt.createdAt,
      })
    );
  }

  const venueMembers = await prisma.venueTableMember.findMany({
    where: { status: { in: ['CONFIRMED', 'LEFT'] } },
    include: { venueTable: { include: { event: { select: { title: true } } } } },
  });
  for (const m of venueMembers) {
    if (m.userId === m.venueTable.hostUserId) continue;
    tasks.push(
      recordTableHistoryAwait({
        userId: m.userId,
        role: 'JOINED',
        venueTableId: m.venueTableId,
        eventId: m.venueTable.eventId,
        tableName: m.venueTable.tableName,
        eventTitle: m.venueTable.event?.title || null,
        occurredAt: m.paidAt || m.joinedAt,
      })
    );
  }

  const legacyTables = await prisma.table.findMany({
    where: { deletedAt: null, event: { deletedAt: null, status: 'published' } },
    include: { event: { select: { title: true } } },
  });
  for (const t of legacyTables) {
    const members = Array.isArray(t.members) ? t.members : [];
    for (const m of members) {
      const uid = typeof m === 'object' && m ? m.user_id || m.userId : m;
      if (!uid || uid === t.hostUserId) continue;
      tasks.push(
        recordTableHistoryAwait({
          userId: String(uid),
          role: 'JOINED',
          tableId: t.id,
          eventId: t.eventId,
          tableName: t.name,
          eventTitle: t.event?.title || null,
          occurredAt: t.createdAt,
        })
      );
    }
  }

  const tickets = await prisma.ticket.findMany({
    where: { hiddenFromHistoryAt: null },
    select: {
      userId: true,
      kind: true,
      title: true,
      subtitle: true,
      eventId: true,
      tableId: true,
      hostedTableId: true,
      venueTableId: true,
      createdAt: true,
      eventStartsAt: true,
    },
  });
  for (const ticket of tickets) {
    const role = ticketHistoryRole(ticket.kind);
    if (!role || !ticket.title) continue;
    tasks.push(
      recordTableHistoryAwait({
        userId: ticket.userId,
        role,
        tableId: ticket.tableId,
        hostedTableId: ticket.hostedTableId,
        venueTableId: ticket.venueTableId,
        eventId: ticket.eventId,
        tableName: ticket.title,
        eventTitle: ticket.subtitle || ticket.title,
        occurredAt: ticket.eventStartsAt || ticket.createdAt,
      })
    );
  }

  const results = await Promise.allSettled(tasks);
  const failed = results.filter((r) => r.status === 'rejected').length;
  console.log(`Table history backfill: ${results.length} rows (${failed} failed)`);
}

async function main() {
  await backfillWallets();
  await backfillTableHistory();
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
