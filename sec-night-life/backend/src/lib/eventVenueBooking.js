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
}) {
  if (!venueId || !eventId || !hostedTableId || !userId || !role) return null;
  const dup = await prisma.eventVenueTableBooking.findFirst({
    where: { hostedTableId, userId, role },
  });
  if (dup) return dup;
  return prisma.eventVenueTableBooking.create({
    data: {
      venueId,
      eventId,
      hostedTableId,
      userId,
      role,
      paystackReference,
      amountTotal,
      entranceZar,
      componentZar,
    },
  });
}
