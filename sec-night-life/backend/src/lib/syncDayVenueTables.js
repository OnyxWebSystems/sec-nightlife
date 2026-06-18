import { prisma } from './prisma.js';
import { resolveTierBookingFees } from './hostingConfig.js';
import { normalizeServiceSchedule } from './serviceSchedule.js';

function resolveTierMinSpendsFromTier(tier) {
  const joinMin =
    tier.min_spend_join != null && tier.min_spend_join !== ''
      ? Number(tier.min_spend_join) || 0
      : Number(tier.min_spend) || 0;
  const hostMin =
    tier.min_spend_host != null && tier.min_spend_host !== ''
      ? Number(tier.min_spend_host) || 0
      : joinMin;
  return { joinMin, hostMin };
}

/**
 * Sync day-booking tier definitions to VenueTable rows (one row per slot).
 */
export async function syncDayVenueTables(venueId, options = {}) {
  const {
    description = null,
    serviceSchedule = null,
    serviceDate = null,
    serviceEndDate = null,
    startTime = null,
    endTime = null,
    allowsCustomRequests = false,
    tiers = [],
  } = options;

  const scheduleRows = normalizeServiceSchedule(serviceSchedule);

  const desiredKeys = new Set();

  for (let tierIdx = 0; tierIdx < tiers.length; tierIdx++) {
    const tier = tiers[tierIdx];
    const slots = Math.max(1, Math.min(50, Number(tier.tier_table_slots) || 1));
    const tierKeyBase = `day:${tierIdx}`;
    const { joinFee, hostFee } = resolveTierBookingFees(tier, {});
    const { joinMin, hostMin } = resolveTierMinSpendsFromTier(tier);
    const includedItems = Array.isArray(tier.included_items) ? tier.included_items : [];

    for (let slotIdx = 0; slotIdx < slots; slotIdx++) {
      const hostingTierKey = `${tierKeyBase}:${slotIdx}`;
      desiredKeys.add(hostingTierKey);
      const tableName = `${tier.tier_name || `Tier ${tierIdx + 1}`}${slots > 1 ? ` #${slotIdx + 1}` : ''}`;

      const existing = await prisma.venueTable.findFirst({
        where: { venueId, eventId: null, hostingTierKey, isCustomListing: false },
      });

      const data = {
        venueId,
        eventId: null,
        tableName,
        description,
        guestCapacity: Number(tier.max_guests) || 6,
        minimumSpend: joinMin,
        hostMinimumSpend: hostMin,
        bookingFeeZar: joinFee,
        hostTableFeeZar: hostFee,
        minSpendSettlement: 'PREPAY_MENU',
        serviceDate: scheduleRows.length ? null : (serviceDate ?? null),
        serviceEndDate: scheduleRows.length ? null : (serviceEndDate ?? null),
        serviceSchedule: scheduleRows.length ? scheduleRows : null,
        startTime: scheduleRows.length ? null : (startTime ?? null),
        endTime: scheduleRows.length ? null : (endTime ?? null),
        tierLabel: tier.tier_name || null,
        hostingTierKey,
        includedItems: includedItems.length ? includedItems : null,
        allowsCustomRequests: false,
        isActive: true,
      };

      if (existing) {
        const occupied = existing.currentOccupancy > 0 || existing.hostUserId || existing.hostedTableId;
        await prisma.venueTable.update({
          where: { id: existing.id },
          data: occupied
            ? {
                tableName: data.tableName,
                tierLabel: data.tierLabel,
                includedItems: data.includedItems,
                description: data.description,
                serviceDate: data.serviceDate,
                serviceEndDate: data.serviceEndDate,
                serviceSchedule: data.serviceSchedule,
                startTime: data.startTime,
                endTime: data.endTime,
                isActive: true,
              }
            : data,
        });
      } else {
        await prisma.venueTable.create({ data });
      }
    }
  }

  const stale = await prisma.venueTable.findMany({
    where: {
      venueId,
      eventId: null,
      isCustomListing: false,
      hostingTierKey: { startsWith: 'day:' },
      NOT: { hostingTierKey: { in: [...desiredKeys] } },
    },
  });

  for (const row of stale) {
    if (row.currentOccupancy > 0 || row.hostUserId || row.hostedTableId) {
      await prisma.venueTable.update({
        where: { id: row.id },
        data: { isActive: false },
      });
    } else {
      await prisma.venueTable.delete({ where: { id: row.id } });
    }
  }

  if (allowsCustomRequests) {
    await ensureDayCustomListingFlag(venueId);
  }

  return { synced: desiredKeys.size };
}

/**
 * Assign day:{tier}:{slot} keys to listings created before tier sync (guest browse requires these).
 */
export async function repairLegacyDayVenueTables(venueId) {
  const legacy = await prisma.venueTable.findMany({
    where: {
      venueId,
      eventId: null,
      isCustomListing: false,
      OR: [{ hostingTierKey: null }, { hostingTierKey: '' }],
    },
    orderBy: { createdAt: 'asc' },
  });
  if (!legacy.length) return { repaired: 0 };

  const keyed = await prisma.venueTable.findMany({
    where: {
      venueId,
      eventId: null,
      isCustomListing: false,
      hostingTierKey: { startsWith: 'day:' },
    },
    select: { hostingTierKey: true },
  });

  let nextTierIdx = 0;
  for (const row of keyed) {
    const idx = tierIndexFromHostingKey(row.hostingTierKey);
    if (idx != null && idx >= nextTierIdx) nextTierIdx = idx + 1;
  }

  const groups = new Map();
  for (const row of legacy) {
    const base = row.tierLabel || row.tableName?.replace(/\s#\d+$/, '').trim() || 'Standard';
    if (!groups.has(base)) groups.set(base, []);
    groups.get(base).push(row);
  }

  let repaired = 0;
  for (const rows of [...groups.values()]) {
    const tierIdx = nextTierIdx++;
    for (let slotIdx = 0; slotIdx < rows.length; slotIdx++) {
      const row = rows[slotIdx];
      const tierLabel = row.tierLabel || row.tableName?.replace(/\s#\d+$/, '').trim() || null;
      await prisma.venueTable.update({
        where: { id: row.id },
        data: {
          hostingTierKey: `day:${tierIdx}:${slotIdx}`,
          tierLabel,
        },
      });
      repaired += 1;
    }
  }

  return { repaired };
}

function tierIndexFromHostingKey(key) {
  const parts = String(key || '').split(':');
  if (parts[0] !== 'day') return null;
  const idx = Number(parts[1]);
  return Number.isFinite(idx) ? idx : null;
}

function venueTableToTierDef(row) {
  return {
    tier_name: row.tierLabel || row.tableName?.replace(/\s#\d+$/, '') || 'Tier',
    max_guests: row.guestCapacity,
    min_spend: row.minimumSpend,
    min_spend_join: row.minimumSpend,
    min_spend_host: row.hostMinimumSpend ?? row.minimumSpend,
    booking_fee_zar: row.bookingFeeZar,
    host_table_fee_zar: row.hostTableFeeZar,
    tier_table_slots: 1,
    included_items: Array.isArray(row.includedItems) ? row.includedItems : [],
  };
}

/**
 * Rebuild all day tiers from existing rows and adjust one tier's slot count + fields.
 */
export async function adjustDayTierFromVenueListing(venueId, tierIndex, tierPatch = {}, scheduleOptions = {}) {
  const rows = await prisma.venueTable.findMany({
    where: {
      venueId,
      eventId: null,
      isCustomListing: false,
      hostingTierKey: { startsWith: 'day:' },
    },
    orderBy: { hostingTierKey: 'asc' },
  });

  const tierMap = new Map();
  for (const row of rows) {
    const idx = tierIndexFromHostingKey(row.hostingTierKey);
    if (idx == null) continue;
    if (!tierMap.has(idx)) {
      tierMap.set(idx, { def: venueTableToTierDef(row), slots: 0, sample: row });
    }
    tierMap.get(idx).slots += 1;
  }

  if (!tierMap.has(tierIndex)) {
    throw new Error('Tier not found');
  }

  const existing = tierMap.get(tierIndex);
  const slots = Math.max(1, Math.min(50, Number(tierPatch.tier_table_slots) || existing.slots));
  tierMap.set(tierIndex, {
    ...existing,
    def: {
      ...existing.def,
      tier_name: tierPatch.tier_name ?? existing.def.tier_name,
      max_guests: tierPatch.max_guests ?? existing.def.max_guests,
      min_spend: tierPatch.min_spend ?? existing.def.min_spend,
      min_spend_join: tierPatch.min_spend_join ?? existing.def.min_spend_join,
      min_spend_host: tierPatch.min_spend_host ?? existing.def.min_spend_host,
      booking_fee_zar: tierPatch.booking_fee_zar ?? existing.def.booking_fee_zar,
      host_table_fee_zar: tierPatch.host_table_fee_zar ?? existing.def.host_table_fee_zar,
      tier_table_slots: slots,
      included_items: tierPatch.included_items ?? existing.def.included_items,
    },
    slots,
  });

  const tiers = [...tierMap.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, v]) => ({ ...v.def, tier_table_slots: v.slots }));

  const sample = existing.sample;
  const schedule =
    scheduleOptions.serviceSchedule ??
    (sample?.serviceSchedule ? sample.serviceSchedule : null);

  return syncDayVenueTables(venueId, {
    description: tierPatch.description ?? sample?.description ?? null,
    serviceSchedule: schedule,
    allowsCustomRequests: false,
    tiers,
  });
}

/**
 * Remove a day tier and re-index remaining tiers. Blocks if any slot is in use.
 */
export async function deleteDayTier(venueId, tierIndex) {
  const rows = await prisma.venueTable.findMany({
    where: {
      venueId,
      eventId: null,
      isCustomListing: false,
      hostingTierKey: { startsWith: 'day:' },
    },
    orderBy: { hostingTierKey: 'asc' },
  });

  const tierMap = new Map();
  for (const row of rows) {
    const idx = tierIndexFromHostingKey(row.hostingTierKey);
    if (idx == null) continue;
    if (!tierMap.has(idx)) {
      tierMap.set(idx, { def: venueTableToTierDef(row), slots: 0, sample: row });
    }
    tierMap.get(idx).slots += 1;
  }

  if (!tierMap.has(tierIndex)) {
    throw new Error('Tier not found');
  }

  const tierRows = rows.filter((r) => tierIndexFromHostingKey(r.hostingTierKey) === tierIndex);
  for (const row of tierRows) {
    if (row.currentOccupancy > 0 || row.hostUserId || row.hostedTableId) {
      const err = new Error('Reset all tables in this tier before deleting');
      err.statusCode = 409;
      throw err;
    }
  }

  const tableIds = tierRows.map((r) => r.id);
  const activeMemberCount = await prisma.venueTableMember.count({
    where: {
      venueTableId: { in: tableIds },
      status: { in: ['CONFIRMED', 'APPROVED', 'PENDING_PAYMENT', 'PENDING_VENUE_REVIEW'] },
    },
  });
  if (activeMemberCount > 0) {
    const err = new Error('Reset all tables in this tier before deleting');
    err.statusCode = 409;
    throw err;
  }

  await prisma.venueTable.deleteMany({ where: { id: { in: tableIds } } });

  tierMap.delete(tierIndex);
  const tiers = [...tierMap.entries()]
    .sort(([a], [b]) => a - b)
    .map(([, v]) => ({ ...v.def, tier_table_slots: v.slots }));

  const sample =
    [...tierMap.values()][0]?.sample ||
    tierRows[0];
  const schedule = sample?.serviceSchedule ?? null;

  return syncDayVenueTables(venueId, {
    description: sample?.description ?? null,
    serviceSchedule: schedule,
    allowsCustomRequests: false,
    tiers,
  });
}

async function ensureDayCustomListingFlag(venueId) {
  const existing = await prisma.venueTable.findFirst({
    where: { venueId, eventId: null, isCustomListing: true, isActive: true },
    select: { id: true },
  });
  if (existing) return existing.id;
  const created = await prisma.venueTable.create({
    data: {
      venueId,
      eventId: null,
      tableName: 'Custom table request',
      description: 'Submit your specs — the venue reviews before checkout.',
      guestCapacity: 500,
      minimumSpend: 0,
      bookingFeeZar: 0,
      minSpendSettlement: 'PREPAY_MENU',
      allowsCustomRequests: true,
      isCustomListing: true,
      isActive: true,
    },
    select: { id: true },
  });
  return created.id;
}
