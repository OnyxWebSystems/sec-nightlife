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

function isVenueHostBookingMode(bookingMode, memberRole) {
  return bookingMode === 'host' || bookingMode === 'custom_host' || memberRole === 'HOST';
}

/**
 * Log a paid guest join on an event-linked venue table when a hosted table is linked.
 */
export async function recordGuestEventVenueTableBookingIfNeeded({
  venueTableId,
  userId,
  paystackReference = null,
  amountTotal = null,
  selectedMenuItems = null,
  bookingMode = null,
  memberRole = null,
}) {
  if (!venueTableId || !userId) return null;
  if (isVenueHostBookingMode(bookingMode, memberRole)) return null;

  const table = await prisma.venueTable.findUnique({
    where: { id: String(venueTableId) },
    select: { id: true, venueId: true, eventId: true, hostedTableId: true, tierLabel: true },
  });
  if (!table?.eventId || !table.hostedTableId) return null;

  return recordEventVenueTableBooking({
    venueId: table.venueId,
    eventId: table.eventId,
    hostedTableId: table.hostedTableId,
    userId: String(userId),
    role: 'GUEST',
    paystackReference,
    amountTotal,
    componentZar: amountTotal,
    selectedMenuItems: selectedMenuItems ?? undefined,
    hostingTierName: table.tierLabel ?? null,
  });
}
