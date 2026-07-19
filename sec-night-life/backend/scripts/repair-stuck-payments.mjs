/**
 * Re-apply fulfillment for Paystack-success payments that never finished.
 * Usage:
 *   node scripts/repair-stuck-payments.mjs
 *   node scripts/repair-stuck-payments.mjs --limit=50 --sinceDays=30
 *   node scripts/repair-stuck-payments.mjs <reference> [...]
 */
import { repairPaymentFulfillmentByReference, repairStuckSuccessPayments } from '../src/routes/payments.js';
import { prisma } from '../src/lib/prisma.js';

const args = process.argv.slice(2);
const refs = args.filter((a) => !a.startsWith('--'));
const limitArg = args.find((a) => a.startsWith('--limit='));
const sinceArg = args.find((a) => a.startsWith('--sinceDays='));
const limit = limitArg ? parseInt(limitArg.split('=')[1], 10) || 40 : 40;
const sinceDays = sinceArg ? parseInt(sinceArg.split('=')[1], 10) || 14 : 14;

try {
  if (refs.length) {
    for (const reference of refs) {
      console.log('\n--- Repair', reference);
      const result = await repairPaymentFulfillmentByReference(reference);
      console.log(result);
    }
  } else {
    console.log(`Scanning success payments from last ${sinceDays} day(s), limit ${limit}…`);
    const result = await repairStuckSuccessPayments({ limit, sinceDays });
    console.log(JSON.stringify(result, null, 2));
  }
} finally {
  await prisma.$disconnect();
}
