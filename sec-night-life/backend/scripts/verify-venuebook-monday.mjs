import { buildVenueDayTableTiers } from '../src/lib/buildVenueDayTableTiers.js';

const VELDT_VINE_ID = '4479eaa5-bd8c-4e59-a017-66cf24617ecf';
const mondayMorning = new Date('2026-07-06T02:07:00+02:00');

const result = await buildVenueDayTableTiers(VELDT_VINE_ID, { bookingDate: mondayMorning });

if (!result) {
  console.error('FAIL: venue not found');
  process.exit(1);
}

console.log('venueWindow:', result.venueWindow);
console.log('tiers count:', result.tiers?.length ?? 0);
if (result.tiers?.length) {
  const tier = result.tiers[0];
  console.log('first tier:', tier.tierName, 'slots:', tier.slots?.length);
  console.log('canHost slots:', tier.slots?.filter((s) => s.canHost).length);
}

const ok =
  result.venueWindow?.startTime === '00:00' &&
  result.venueWindow?.endTime === '21:00' &&
  (result.tiers?.length ?? 0) > 0;

if (!ok) {
  console.error('FAIL: expected Monday window and non-empty tiers');
  process.exit(1);
}

console.log('OK: Veldt & Vine Monday day-table-tiers verified');
