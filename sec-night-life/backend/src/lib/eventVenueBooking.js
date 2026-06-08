import { prisma } from './prisma.js';

/**
 * Idempotent log for venue dashboard: SEC event hosted table host or paid guest.
 */
export async function recordEventVenueTableBooking({
  venueId,
  eventId,
  hostedTableId,
  userId,
  role,
  paystackReference = null,
  amountTotal = null,
  entranceZar = null,
  componentZar = null,
  selectedMenuItems = null,
  hostingTierName = null,
  hostingCategory = null,
  menuTotalZar = null,
  promoterUserId = null,
}) {
  if (!venueId || !eventId || !hostedTableId || !userId || !role) return null;
  const dup = await prisma.eventVenueTableBooking.findFirst({
    where: { hostedTableId, userId, role },
  });
  const data = {
    paystackReference,
    amountTotal,
    entranceZar,
    componentZar,
    ...(selectedMenuItems != null ? { selectedMenuItems } : {}),
    ...(hostingTierName != null ? { hostingTierName } : {}),
    ...(hostingCategory != null ? { hostingCategory } : {}),
    ...(menuTotalZar != null ? { menuTotalZar } : {}),
    ...(promoterUserId ? { promoterUserId } : {}),
  };
  if (dup) {
    return prisma.eventVenueTableBooking.update({ where: { id: dup.id }, data });
  }
  return prisma.eventVenueTableBooking.create({
    data: {
      venueId,
      eventId,
      hostedTableId,
      userId,
      role,
      ...data,
    },
  });
}
