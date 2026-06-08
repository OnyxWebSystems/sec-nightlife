/**
 * Backfill user_table_history and sec_wallets for existing users/venues.
 * Run: node scripts/backfill-table-history-wallets.js
 */
import 'dotenv/config';
import { prisma } from '../src/lib/prisma.js';
import { recordTableHistory } from '../src/lib/tableHistory.js';
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

async function backfillTableHistory() {
  const hosted = await prisma.table.findMany({
    where: { deletedAt: null },
    include: { event: { select: { title: true } } },
  });
  for (const t of hosted) {
    recordTableHistory({
      userId: t.hostUserId,
      role: 'HOST',
      tableId: t.id,
      eventId: t.eventId,
      tableName: t.name,
      eventTitle: t.event?.title || null,
      occurredAt: t.createdAt,
    });
  }

  const htHosted = await prisma.hostedTable.findMany({
    where: { status: { not: 'DRAFT' } },
    include: { event: { select: { title: true } } },
  });
  for (const ht of htHosted) {
    recordTableHistory({
      userId: ht.hostUserId,
      role: 'HOST',
      hostedTableId: ht.id,
      eventId: ht.eventId,
      tableName: ht.tableName,
      eventTitle: ht.event?.title || null,
      occurredAt: ht.createdAt,
    });
  }

  const htMembers = await prisma.hostedTableMember.findMany({
    include: { hostedTable: { include: { event: { select: { title: true } } } } },
  });
  for (const m of htMembers) {
    if (m.userId === m.hostedTable.hostUserId) continue;
    recordTableHistory({
      userId: m.userId,
      role: 'JOINED',
      hostedTableId: m.hostedTableId,
      eventId: m.hostedTable.eventId,
      tableName: m.hostedTable.tableName,
      eventTitle: m.hostedTable.event?.title || null,
      occurredAt: m.joinedAt,
    });
  }

  await new Promise((r) => setTimeout(r, 3000));
  console.log('Table history backfill queued');
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
