import { prisma } from './prisma.js';
import { isVenueTableBookableToday } from './serviceSchedule.js';
import {
  buildHostedTablePayload,
  buildOccupancyForSlot,
  canHostInWindow,
  venueWindowFromTables,
  windowsOverlap,
} from './dayBookingWindows.js';
import { expireDayTableSessions } from './releaseDayTableSession.js';

/**
 * Build grouped table tier payloads for day bookings (VenueBook).
 * @param {string} venueId
 * @param {{ windowStart?: string, windowEnd?: string, bookingDate?: Date }} [options]
 */
export async function buildVenueDayTableTiers(venueId, options = {}) {
  const bookingDate = options.bookingDate || new Date();
  const userWindowStart = options.windowStart || null;
  const userWindowEnd = options.windowEnd || null;

  await expireDayTableSessions({ now: new Date() }).catch(() => {});

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

  const bookableToday = venueTables.filter((vt) => isVenueTableBookableToday(vt, bookingDate));
  const venueWindow = venueWindowFromTables(bookableToday, bookingDate);

  const tierMap = new Map();

  for (const vt of bookableToday) {
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
    const occupancy = await buildOccupancyForSlot(vt, bookingDate);

    let canHost = true;
    let joinableSessions = occupancy.filter((o) => o.spotsRemaining > 0);

    if (userWindowStart && userWindowEnd) {
      const hostCheck = await canHostInWindow(vt.id, bookingDate, userWindowStart, userWindowEnd);
      canHost = hostCheck.ok;
      joinableSessions = occupancy.filter(
        (o) =>
          o.spotsRemaining > 0 &&
          windowsOverlap(userWindowStart, userWindowEnd, o.startTime, o.endTime),
      );
    }

    const primaryJoin = joinableSessions[0]?.hostedTable || null;
    const isHosted = occupancy.length > 0;

    tier.slots.push({
      venueTableId: vt.id,
      tableName: vt.tableName,
      spotsRemaining: primaryJoin?.spotsRemaining ?? (Number(vt.guestCapacity) || 6),
      isHosted,
      canHost,
      hostedTable: primaryJoin,
      occupancy,
      joinableSessions: joinableSessions.map((o) => ({
        hostedTableId: o.hostedTableId,
        startTime: o.startTime,
        endTime: o.endTime,
        hostedTable: o.hostedTable,
      })),
    });
  }

  const tiers = [...tierMap.values()].map((tier) => {
    let tablesOpenForHost = 0;
    let tablesOpenForJoin = 0;
    let totalSpotsRemaining = 0;

    if (userWindowStart && userWindowEnd) {
      for (const s of tier.slots) {
        if (s.canHost) tablesOpenForHost += 1;
        tablesOpenForJoin += s.joinableSessions?.length || 0;
        totalSpotsRemaining += s.joinableSessions?.reduce(
          (sum, j) => sum + (j.hostedTable?.spotsRemaining || 0),
          0,
        ) || 0;
        if (s.canHost) totalSpotsRemaining += tier.maxGuestsPerTable;
      }
    } else {
      tablesOpenForHost = tier.slots.length;
      tablesOpenForJoin = tier.slots.reduce((sum, s) => sum + (s.occupancy?.length || 0), 0);
      totalSpotsRemaining = tier.slots.reduce(
        (sum, s) => sum + (s.hostedTable?.spotsRemaining ?? tier.maxGuestsPerTable),
        0,
      );
    }

    return {
      ...tier,
      minSpend: tier.minSpendJoin,
      tablesOpenForHost,
      tablesOpenForJoin,
      totalSpotsRemaining,
      allowsCustomRequests: false,
    };
  });

  const customRow = await prisma.venueTable.findFirst({
    where: {
      venueId,
      eventId: null,
      isCustomListing: true,
      isActive: true,
    },
    select: { id: true, serviceSchedule: true, startTime: true, endTime: true },
  });

  return {
    venue: { id: venue.id, name: venue.name },
    venueWindow,
    tiers,
    customListingId: customRow?.id ?? null,
    allowsCustomRequests: Boolean(customRow?.id),
  };
}
