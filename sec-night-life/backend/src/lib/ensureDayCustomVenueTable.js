import { prisma } from './prisma.js';

/**
 * Idempotent day-booking custom table listing for guest requests.
 * @returns {Promise<{ id: string } | null>}
 */
export async function ensureDayCustomVenueTable(venueId) {
  const venue = await prisma.venue.findFirst({
    where: { id: venueId, deletedAt: null },
    select: { id: true, acceptsDayBookings: true },
  });
  if (!venue?.acceptsDayBookings) return null;

  const existing = await prisma.venueTable.findFirst({
    where: {
      venueId: venue.id,
      eventId: null,
      isCustomListing: true,
    },
    select: { id: true, isActive: true },
  });
  if (existing) {
    if (existing.isActive) return existing;
    return prisma.venueTable.update({
      where: { id: existing.id },
      data: { isActive: true },
      select: { id: true },
    });
  }

  return prisma.venueTable.create({
    data: {
      venueId: venue.id,
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
}
