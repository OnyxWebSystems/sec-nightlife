import { prisma } from './prisma.js';
import { resolveTierBookingFees } from './hostingConfig.js';

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
    serviceDate = null,
    serviceEndDate = null,
    startTime = null,
    endTime = null,
    allowsCustomRequests = false,
    tiers = [],
  } = options;

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
        serviceDate: serviceDate ?? null,
        serviceEndDate: serviceEndDate ?? null,
        startTime: startTime ?? null,
        endTime: endTime ?? null,
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
