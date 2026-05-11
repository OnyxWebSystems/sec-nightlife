/**
 * Deletes HostedTable rows still in DRAFT with no successful listing Paystack ref
 * (in-app: no hostFeePaystackRef; external: no externalListingPaystackRef),
 * plus matching pending Payment + Transaction rows for TABLE_HOST_FEE /
 * HOSTED_TABLE_EXTERNAL_LISTING. Cascades remove group chats, invites, members.
 *
 * Run from backend with DATABASE_URL set:
 *   npx dotenv -e .env -- node scripts/cleanup-unpaid-draft-hosted-tables.mjs
 *
 * Pass --dry-run to only print counts without deleting.
 */
import { config } from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
config({ path: path.join(__dirname, '..', '.env') });

const dryRun = process.argv.includes('--dry-run');

const { prisma } = await import('../src/lib/prisma.js');

async function main() {
  const drafts = await prisma.hostedTable.findMany({
    where: {
      status: 'DRAFT',
      OR: [
        { tableType: 'IN_APP_EVENT', hostFeePaystackRef: null },
        { tableType: 'EXTERNAL_VENUE', externalListingPaystackRef: null },
      ],
    },
    select: { id: true, tableName: true, hostUserId: true, tableType: true },
  });
  const idSet = new Set(drafts.map((d) => d.id));
  if (idSet.size === 0) {
    console.log('No unpaid DRAFT hosted tables found.');
    return;
  }

  console.log(`Found ${idSet.size} unpaid DRAFT hosted table(s).`);
  for (const d of drafts.slice(0, 50)) {
    console.log(`  - ${d.id}  ${d.tableType}  ${d.tableName || '(no name)'}`);
  }
  if (drafts.length > 50) console.log(`  … and ${drafts.length - 50} more`);

  const pending = await prisma.payment.findMany({ where: { status: 'pending' } });
  const refsToDrop = [];
  for (const p of pending) {
    const m = p.metadata;
    if (!m || typeof m !== 'object') continue;
    const ty = m.type;
    const hid = m.hosted_table_id ?? m.hostedTableId;
    if (hid == null || !idSet.has(String(hid))) continue;
    if (ty === 'TABLE_HOST_FEE' || ty === 'HOSTED_TABLE_EXTERNAL_LISTING') {
      refsToDrop.push(p.reference);
    }
  }

  console.log(`Pending listing payments to remove: ${refsToDrop.length}`);

  if (dryRun) {
    console.log('Dry run — no deletes performed.');
    return;
  }

  const ids = [...idSet];
  await prisma.$transaction(async (tx) => {
    if (refsToDrop.length) {
      await tx.transaction.deleteMany({ where: { stripeId: { in: refsToDrop } } });
      await tx.payment.deleteMany({ where: { reference: { in: refsToDrop } } });
    }
    const deleted = await tx.hostedTable.deleteMany({ where: { id: { in: ids } } });
    console.log(`Deleted ${deleted.count} hosted_tables row(s).`);
  });

  console.log('Done.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
