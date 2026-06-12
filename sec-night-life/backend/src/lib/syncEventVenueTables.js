import { prisma } from './prisma.js';
import { normalizeHostingConfig, resolveTierBookingFees } from './hostingConfig.js';

/**
 * Sync event hosting_config tiers to VenueTable listings (one row per tier slot).
 */
export async function syncEventVenueTables(eventId) {
  const event = await prisma.event.findFirst({
    where: { id: eventId, deletedAt: null },
    include: { venue: true },
  });
  if (!event || event.status !== 'published') return { synced: 0 };

  const hosting = normalizeHostingConfig(event.hostingConfig);
  const desiredKeys = new Set();

  for (const cat of ['general', 'vip']) {
    const section = hosting[cat] || {};
    const tiers = Array.isArray(section.tiers) ? section.tiers : [];
    const allowsCustom = Boolean(section.allows_custom_requests);
    for (let tierIdx = 0; tierIdx < tiers.length; tierIdx++) {
      const tier = tiers[tierIdx];
      const slots = Number(tier.tier_table_slots) || 1;
      const tierKeyBase = `${cat}:${tierIdx}`;
      const { joinFee, hostFee } = resolveTierBookingFees(tier, section);
      const includedItems = Array.isArray(tier.included_items) ? tier.included_items : [];

      for (let slotIdx = 0; slotIdx < slots; slotIdx++) {
        const hostingTierKey = `${tierKeyBase}:${slotIdx}`;
        desiredKeys.add(hostingTierKey);
        const tableName = `${tier.tier_name || `Tier ${tierIdx + 1}`}${slots > 1 ? ` #${slotIdx + 1}` : ''}`;

        const existing = await prisma.venueTable.findFirst({
          where: { eventId: event.id, hostingTierKey },
        });

        const joinMin =
          tier.min_spend_join != null && tier.min_spend_join !== ''
            ? Number(tier.min_spend_join) || 0
            : Number(tier.min_spend) || 0;
        const hostMin =
          tier.min_spend_host != null && tier.min_spend_host !== ''
            ? Number(tier.min_spend_host) || 0
            : Number(tier.min_spend) || 0;
        const data = {
          venueId: event.venueId,
          eventId: event.id,
          tableName,
          description: event.description,
          guestCapacity: Number(tier.max_guests) || 6,
          minimumSpend: joinMin,
          hostMinimumSpend: hostMin,
          bookingFeeZar: joinFee,
          hostTableFeeZar: hostFee,
          minSpendSettlement: 'PREPAY_MENU',
          tierLabel: tier.tier_name || null,
          hostingTierKey,
          includedItems: includedItems.length ? includedItems : null,
          allowsCustomRequests: false,
          isActive: true,
        };

        if (existing) {
          const occupied = existing.currentOccupancy > 0;
          await prisma.venueTable.update({
            where: { id: existing.id },
            data: occupied
              ? {
                  tableName: data.tableName,
                  tierLabel: data.tierLabel,
                  includedItems: data.includedItems,
                  isActive: true,
                }
              : data,
          });
        } else {
          await prisma.venueTable.create({ data });
        }
      }
    }
  }

  const stale = await prisma.venueTable.findMany({
    where: {
      eventId: event.id,
      hostingTierKey: { not: null },
      NOT: { hostingTierKey: { in: [...desiredKeys] } },
    },
  });

  for (const row of stale) {
    if (row.currentOccupancy > 0) {
      await prisma.venueTable.update({
        where: { id: row.id },
        data: { isActive: false },
      });
    } else {
      await prisma.venueTable.delete({ where: { id: row.id } });
    }
  }

  await ensureEventCustomListing(event.id, event.venueId, hosting);

  return { synced: desiredKeys.size };
}

/** One custom-request listing per event when hosting config allows custom tables. */
export async function ensureEventCustomListing(eventId, venueId = null, hostingConfig = null) {
  let venue = venueId;
  let hosting = hostingConfig;
  if (!venue || !hosting) {
    const event = await prisma.event.findFirst({
      where: { id: eventId, deletedAt: null },
      select: { venueId: true, hostingConfig: true },
    });
    if (!event) return null;
    venue = event.venueId;
    hosting = normalizeHostingConfig(event.hostingConfig);
  }
  const allowsCustom = ['general', 'vip'].some((cat) => Boolean(hosting[cat]?.allows_custom_requests));
  if (!allowsCustom) return null;

  const existing = await prisma.venueTable.findFirst({
    where: { eventId, isCustomListing: true, isActive: true },
    select: { id: true },
  });
  if (existing) return existing.id;

  const created = await prisma.venueTable.create({
    data: {
      venueId: venue,
      eventId,
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
