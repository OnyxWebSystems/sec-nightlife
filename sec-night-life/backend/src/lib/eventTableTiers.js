import { prisma } from './prisma.js';
import { normalizeHostingConfig } from './hostingConfig.js';
import { ensureEventCustomListing } from './syncEventVenueTables.js';
import { parseGuestCountFromSpecs } from './venueTableHostAfterPayment.js';

function buildHostedTablePayload(ht, { goingCount = null, requestedGuestCount = null } = {}) {
  const going =
    goingCount != null
      ? Math.max(0, Number(goingCount) || 0)
      : Math.max(0, Number(ht.guestQuantity) - Number(ht.spotsRemaining));
  const capacity =
    requestedGuestCount != null && requestedGuestCount >= 1
      ? Math.round(requestedGuestCount)
      : Math.max(1, Number(ht.guestQuantity) || 1);
  const spotsRemaining = Math.max(0, capacity - going);

  return {
    id: ht.id,
    tableName: ht.tableName,
    isPublic: ht.isPublic,
    hasJoiningFee: ht.hasJoiningFee,
    joiningFee: ht.joiningFee,
    guestCapacity: capacity,
    spotsRemaining,
    isCustomTable: Boolean(requestedGuestCount),
    host: {
      id: ht.host?.id,
      username: ht.host?.userProfile?.username || ht.host?.username,
      fullName: ht.host?.fullName,
      avatarUrl: ht.host?.userProfile?.avatarUrl || null,
    },
  };
}

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

  const hostedIds = hostedTables.map((ht) => ht.id);
  const goingByHostedId = new Map();
  if (hostedIds.length > 0) {
    const goingRows = await prisma.hostedTableMember.groupBy({
      by: ['hostedTableId'],
      where: { hostedTableId: { in: hostedIds }, status: 'GOING' },
      _count: { _all: true },
    });
    for (const row of goingRows) {
      goingByHostedId.set(row.hostedTableId, row._count._all);
    }
  }

  const customGuestByHostedId = new Map();
  const customGuestByHostUserId = new Map();
  const customListing = await prisma.venueTable.findFirst({
    where: { eventId, isCustomListing: true, isActive: true },
    select: { id: true, hostedTableId: true },
  });
  if (customListing) {
    const hostMembers = await prisma.venueTableMember.findMany({
      where: { venueTableId: customListing.id, memberRole: 'HOST' },
      select: { userId: true, userSpecs: true },
    });
    for (const member of hostMembers) {
      const guestCount = parseGuestCountFromSpecs(member.userSpecs);
      if (!guestCount) continue;
      customGuestByHostUserId.set(member.userId, guestCount);
      const linkedHosted = hostedTables.find(
        (ht) =>
          ht.hostUserId === member.userId &&
          (ht.id === customListing.hostedTableId || ht.tableName === 'Custom table request'),
      );
      if (linkedHosted) customGuestByHostedId.set(linkedHosted.id, guestCount);
    }
  }

  const hostedSpotContext = (ht) => ({
    goingCount: goingByHostedId.get(ht.id) ?? null,
    requestedGuestCount: customGuestByHostedId.get(ht.id) ?? customGuestByHostUserId.get(ht.hostUserId) ?? null,
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
          hostedTablePayload = buildHostedTablePayload(linkedHosted, hostedSpotContext(linkedHosted));
        }

        return {
          venueTableId: vt.id,
          tableName: vt.tableName,
          spotsRemaining: hostedTablePayload?.spotsRemaining ?? spotsRemaining,
          isHosted,
          hostedTable: hostedTablePayload,
        };
      });

      const unhostedOpen = slots.filter((s) => !s.isHosted && s.spotsRemaining > 0);
      const hostedOpen = slots.filter((s) => s.isHosted && s.hostedTable && s.hostedTable.spotsRemaining > 0);

      const linkedHostedIds = new Set(slots.map((s) => s.hostedTable?.id).filter(Boolean));
      const orphanHosted = (hostedByTierIndex.get(tierKey) || []).filter((ht) => !linkedHostedIds.has(ht.id));
      for (const ht of orphanHosted) {
        const payload = buildHostedTablePayload(ht, hostedSpotContext(ht));
        if (payload.spotsRemaining <= 0) continue;
        slots.push({
          venueTableId: null,
          tableName: ht.tableName,
          spotsRemaining: payload.spotsRemaining,
          isHosted: true,
          hostedTable: payload,
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

  await ensureEventCustomListing(eventId);

  const customListingRow = await prisma.venueTable.findFirst({
    where: {
      eventId,
      isActive: true,
      isCustomListing: true,
      allowsCustomRequests: true,
    },
    select: { id: true },
  });

  return {
    tiers,
    customListingId: customListingRow?.id ?? null,
    allowsCustomRequests: tiers.some((t) => t.allowsCustomRequests) || Boolean(customListingRow),
  };
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
