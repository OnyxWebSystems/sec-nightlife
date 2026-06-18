import { prisma } from './prisma.js';
import { ensureDayCustomVenueTable } from './ensureDayCustomVenueTable.js';
import { isVenueTableBookableToday } from './serviceSchedule.js';

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
 * Build grouped table tier payloads for day bookings (VenueBook).
 */
export async function buildVenueDayTableTiers(venueId) {
  const venue = await prisma.venue.findFirst({
    where: { id: venueId, deletedAt: null },
    select: { id: true, name: true, acceptsDayBookings: true },
  });
  if (!venue) return null;

  const { repairLegacyDayVenueTables } = await import('./syncDayVenueTables.js');
  await repairLegacyDayVenueTables(venueId);

  const venueTables = await prisma.venueTable.findMany({
    where: {
      venueId,
      eventId: null,
      isActive: true,
      isCustomListing: false,
      hostingTierKey: { startsWith: 'day:' },
    },
    orderBy: { hostingTierKey: 'asc' },
  });

  const hostedTableIds = [
    ...new Set(venueTables.map((t) => t.hostedTableId).filter(Boolean)),
  ];
  const hostedTables = hostedTableIds.length
    ? await prisma.hostedTable.findMany({
        where: {
          id: { in: hostedTableIds },
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
      })
    : [];

  const goingByHostedId = new Map();
  if (hostedTables.length) {
    const goingRows = await prisma.hostedTableMember.groupBy({
      by: ['hostedTableId'],
      where: { hostedTableId: { in: hostedTables.map((h) => h.id) }, status: 'GOING' },
      _count: { _all: true },
    });
    for (const row of goingRows) {
      goingByHostedId.set(row.hostedTableId, row._count._all);
    }
  }

  const tierMap = new Map();

  for (const vt of venueTables) {
    if (!isVenueTableBookableToday(vt)) continue;
    const parts = String(vt.hostingTierKey || '').split(':');
    const tierIdx = Number(parts[1]);
    const tierKey = Number.isFinite(tierIdx) ? `day:${tierIdx}` : `day:${vt.tierLabel || vt.id}`;

    if (!tierMap.has(tierKey)) {
      tierMap.set(tierKey, {
        tierKey,
        tierName: vt.tierLabel || vt.tableName,
        category: 'general',
        tierIndex: Number.isFinite(tierIdx) ? tierIdx : 0,
        minSpendJoin: Number(vt.minimumSpend) || 0,
        minSpendHost: Number(vt.hostMinimumSpend ?? vt.minimumSpend) || 0,
        hostBookingFeeZar: Number(vt.hostTableFeeZar) || 0,
        joinBookingFeeZar: Number(vt.bookingFeeZar) || 0,
        maxGuestsPerTable: Number(vt.guestCapacity) || 6,
        slots: [],
      });
    }

    const tier = tierMap.get(tierKey);
    const spotsRemaining = Math.max(0, vt.guestCapacity - vt.currentOccupancy);
    const linkedHosted = vt.hostedTableId
      ? hostedTables.find((h) => h.id === vt.hostedTableId)
      : null;
    const isHosted = Boolean(linkedHosted || vt.hostUserId);

    let hostedTablePayload = null;
    if (linkedHosted) {
      hostedTablePayload = buildHostedTablePayload(linkedHosted, {
        goingCount: goingByHostedId.get(linkedHosted.id) ?? null,
      });
    }

    tier.slots.push({
      venueTableId: vt.id,
      tableName: vt.tableName,
      spotsRemaining: hostedTablePayload?.spotsRemaining ?? spotsRemaining,
      isHosted,
      hostedTable: hostedTablePayload,
    });
  }

  const tiers = [...tierMap.values()].map((tier) => {
    const allHostedOpen = tier.slots.filter(
      (s) => s.isHosted && s.hostedTable && s.hostedTable.spotsRemaining > 0,
    );
    const allUnhostedOpen = tier.slots.filter((s) => !s.isHosted && s.spotsRemaining > 0);
    const totalSpotsRemaining = tier.slots.reduce((sum, s) => sum + s.spotsRemaining, 0);
    return {
      ...tier,
      minSpend: tier.minSpendJoin,
      tablesOpenForHost: allUnhostedOpen.filter((s) => s.venueTableId).length,
      tablesOpenForJoin: allUnhostedOpen.length + allHostedOpen.length,
      totalSpotsRemaining,
      allowsCustomRequests: false,
    };
  });

  const customListingId = await ensureDayCustomVenueTable(venueId);

  return {
    venue: { id: venue.id, name: venue.name },
    tiers,
    customListingId,
    allowsCustomRequests: Boolean(customListingId),
  };
}
