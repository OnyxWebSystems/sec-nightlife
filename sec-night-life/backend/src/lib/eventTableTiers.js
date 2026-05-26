import { prisma } from './prisma.js';
import { normalizeHostingConfig } from './hostingConfig.js';

/**
 * Build grouped table tier payloads for Event Details.
 */
export async function buildEventTableTiers(eventId) {
  const event = await prisma.event.findFirst({
    where: { id: eventId, deletedAt: null },
    select: { id: true, hostingConfig: true },
  });
  if (!event) return null;

  const hosting = normalizeHostingConfig(event.hostingConfig);
  const venueTables = await prisma.venueTable.findMany({
    where: {
      eventId,
      isActive: true,
      isCustomListing: false,
      hostingTierKey: { not: null },
    },
    orderBy: { hostingTierKey: 'asc' },
  });

  const hostedTables = await prisma.hostedTable.findMany({
    where: {
      eventId,
      tableType: 'IN_APP_EVENT',
      status: { in: ['ACTIVE', 'FULL'] },
    },
    include: {
      host: {
        select: {
          id: true,
          username: true,
          fullName: true,
          userProfile: { select: { username: true, avatarUrl: true } },
        },
      },
    },
  });

  const hostedByTierIndex = new Map();
  for (const ht of hostedTables) {
    const cat = ht.hostingCategory === 'VIP' ? 'vip' : 'general';
    const idx = ht.hostingTierIndex ?? 0;
    const key = `${cat}:${idx}`;
    if (!hostedByTierIndex.has(key)) hostedByTierIndex.set(key, []);
    hostedByTierIndex.get(key).push(ht);
  }

  const tiers = [];

  for (const cat of ['general', 'vip']) {
    const section = hosting[cat] || {};
    const tierDefs = Array.isArray(section.tiers) ? section.tiers : [];
    for (let tierIdx = 0; tierIdx < tierDefs.length; tierIdx++) {
      const tierDef = tierDefs[tierIdx];
      const tierKey = `${cat}:${tierIdx}`;
      const tierPrefix = `${tierKey}:`;

      const slotsForTier = venueTables.filter((t) => t.hostingTierKey?.startsWith(tierPrefix));
      const hostFee =
        tierDef.host_table_fee_zar != null && tierDef.host_table_fee_zar !== ''
          ? Number(tierDef.host_table_fee_zar) || 0
          : Number(section.host_table_fee_zar) || 0;
      const joinFee =
        tierDef.booking_fee_zar != null && tierDef.booking_fee_zar !== ''
          ? Number(tierDef.booking_fee_zar) || 0
          : 0;

      const slots = slotsForTier.map((vt) => {
        const spotsRemaining = Math.max(0, vt.guestCapacity - vt.currentOccupancy);
        const linkedHosted = vt.hostedTableId
          ? hostedTables.find((h) => h.id === vt.hostedTableId)
          : null;
        const isHosted = Boolean(linkedHosted || vt.hostUserId);

        let hostedTablePayload = null;
        if (linkedHosted) {
          hostedTablePayload = {
            id: linkedHosted.id,
            tableName: linkedHosted.tableName,
            isPublic: linkedHosted.isPublic,
            hasJoiningFee: linkedHosted.hasJoiningFee,
            joiningFee: linkedHosted.joiningFee,
            spotsRemaining: linkedHosted.spotsRemaining,
            host: {
              id: linkedHosted.host?.id,
              username: linkedHosted.host?.userProfile?.username || linkedHosted.host?.username,
              fullName: linkedHosted.host?.fullName,
              avatarUrl: linkedHosted.host?.userProfile?.avatarUrl || null,
            },
          };
        }

        return {
          venueTableId: vt.id,
          tableName: vt.tableName,
          spotsRemaining,
          isHosted,
          hostedTable: hostedTablePayload,
        };
      });

      const unhostedOpen = slots.filter((s) => !s.isHosted && s.spotsRemaining > 0);
      const hostedOpen = slots.filter((s) => s.isHosted && s.hostedTable && s.hostedTable.spotsRemaining > 0);

      const linkedHostedIds = new Set(slots.map((s) => s.hostedTable?.id).filter(Boolean));
      const orphanHosted = (hostedByTierIndex.get(tierKey) || []).filter((ht) => !linkedHostedIds.has(ht.id));
      for (const ht of orphanHosted) {
        if (ht.spotsRemaining <= 0) continue;
        slots.push({
          venueTableId: null,
          tableName: ht.tableName,
          spotsRemaining: ht.spotsRemaining,
          isHosted: true,
          hostedTable: {
            id: ht.id,
            tableName: ht.tableName,
            isPublic: ht.isPublic,
            hasJoiningFee: ht.hasJoiningFee,
            joiningFee: ht.joiningFee,
            spotsRemaining: ht.spotsRemaining,
            host: {
              id: ht.host?.id,
              username: ht.host?.userProfile?.username || ht.host?.username,
              fullName: ht.host?.fullName,
              avatarUrl: ht.host?.userProfile?.avatarUrl || null,
            },
          },
        });
      }

      const allHostedOpen = slots.filter((s) => s.isHosted && s.hostedTable && s.hostedTable.spotsRemaining > 0);
      const allUnhostedOpen = slots.filter((s) => !s.isHosted && s.spotsRemaining > 0);
      const totalSpotsRemaining = slots.reduce((sum, s) => sum + s.spotsRemaining, 0);

      const minSpendJoin = Number(tierDef.min_spend_join ?? tierDef.min_spend) || 0;
      const minSpendHost = Number(tierDef.min_spend_host ?? tierDef.min_spend_join ?? tierDef.min_spend) || 0;

      tiers.push({
        tierKey,
        tierName: tierDef.tier_name || tierDef.name || `Tier ${tierIdx + 1}`,
        category: cat,
        tierIndex: tierIdx,
        minSpend: minSpendJoin,
        minSpendJoin,
        minSpendHost,
        hostBookingFeeZar: hostFee,
        joinBookingFeeZar: joinFee,
        maxGuestsPerTable: Number(tierDef.max_guests) || 6,
        tablesOpenForHost: allUnhostedOpen.filter((s) => s.venueTableId).length,
        tablesOpenForJoin: allUnhostedOpen.length + allHostedOpen.length,
        totalSpotsRemaining,
        allowsCustomRequests: Boolean(section.allows_custom_requests),
        slots,
      });
    }
  }

  return { tiers };
}

/**
 * Derive Tables & attendance stats from tier payloads (venue slots + hosted tables).
 */
export function statsFromEventTableTiers(tiers = []) {
  const empty = () => ({
    tables_remaining: 0,
    tables_with_join_space: 0,
    tables_full: 0,
    hosted_tables: 0,
  });

  const byCat = { general: empty(), vip: empty() };

  let hostedAll = 0;

  for (const tier of tiers) {
    const cat = tier.category === 'vip' ? 'vip' : 'general';
    const bucket = byCat[cat];
    bucket.tables_remaining += Number(tier.totalSpotsRemaining) || 0;
    bucket.tables_with_join_space += Number(tier.tablesOpenForJoin) || 0;

    for (const slot of tier.slots || []) {
      if (slot.isHosted) hostedAll += 1;
      if (slot.spotsRemaining <= 0) bucket.tables_full += 1;
    }
  }

  return {
    hosted_tables: hostedAll,
    general: byCat.general,
    vip: byCat.vip,
  };
}
