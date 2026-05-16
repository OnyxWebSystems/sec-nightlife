import { prisma } from './prisma.js';
import { normalizeHostingConfig } from './hostingConfig.js';

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
      const bookingFee =
        tier.booking_fee_zar != null && tier.booking_fee_zar !== ''
          ? Number(tier.booking_fee_zar) || 0
          : Number(section.host_table_fee_zar) || 0;
      const includedItems = Array.isArray(tier.included_items) ? tier.included_items : [];

      for (let slotIdx = 0; slotIdx < slots; slotIdx++) {
        const hostingTierKey = `${tierKeyBase}:${slotIdx}`;
        desiredKeys.add(hostingTierKey);
        const tableName = `${tier.tier_name || `Tier ${tierIdx + 1}`}${slots > 1 ? ` #${slotIdx + 1}` : ''}`;

        const existing = await prisma.venueTable.findFirst({
          where: { eventId: event.id, hostingTierKey },
        });

        const data = {
          venueId: event.venueId,
          eventId: event.id,
          tableName,
          description: event.description,
          guestCapacity: Number(tier.max_guests) || 6,
          minimumSpend: Number(tier.min_spend) || 0,
          bookingFeeZar: bookingFee,
          minSpendSettlement: 'PREPAY_LUMP',
          tierLabel: tier.tier_name || null,
          hostingTierKey,
          includedItems: includedItems.length ? includedItems : null,
          allowsCustomRequests: allowsCustom,
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
                  allowsCustomRequests: data.allowsCustomRequests,
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

  if (desiredKeys.size === 0) {
    const customOnly = await prisma.venueTable.findFirst({
      where: {
        eventId: event.id,
        allowsCustomRequests: true,
        isCustomListing: true,
        isActive: true,
      },
    });
    if (!customOnly) {
      const anyCustom = ['general', 'vip'].some((cat) =>
        Boolean(hosting[cat]?.allows_custom_requests),
      );
      if (anyCustom) {
        await prisma.venueTable.create({
          data: {
            venueId: event.venueId,
            eventId: event.id,
            tableName: 'Custom table request',
            description: 'Submit your specs — the venue reviews before checkout.',
            guestCapacity: 20,
            minimumSpend: 0,
            bookingFeeZar: 0,
            minSpendSettlement: 'PREPAY_LUMP',
            allowsCustomRequests: true,
            isCustomListing: true,
            isActive: true,
          },
        });
      }
    }
  }

  return { synced: desiredKeys.size };
}
