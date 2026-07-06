import { prisma } from './prisma.js';

export function mapSeatingPlanForGuest(plan) {
  if (!plan) return null;
  return {
    id: plan.id,
    name: plan.name,
    caption: plan.caption || null,
    imageUrl: plan.imageUrl,
  };
}

/** Default plan for a venue (isDefault first, else lowest sortOrder). */
export async function getVenueDefaultSeatingPlan(venueId) {
  const plans = await prisma.venueSeatingPlan.findMany({
    where: { venueId },
    orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    take: 1,
  });
  return plans[0] || null;
}

/** Guest-facing seating plan for day bookings when venue toggle is on. */
export async function resolveDayBookingSeatingPlan(venueId) {
  const venue = await prisma.venue.findFirst({
    where: { id: venueId, deletedAt: null },
    select: { showSeatingPlanForDayBookings: true },
  });
  if (!venue?.showSeatingPlanForDayBookings) return null;
  const plan = await getVenueDefaultSeatingPlan(venueId);
  return mapSeatingPlanForGuest(plan);
}

/** Guest-facing seating plan for an event when event toggle is on. */
export async function resolveEventSeatingPlan(eventId) {
  const event = await prisma.event.findFirst({
    where: { id: eventId, deletedAt: null },
    select: {
      venueId: true,
      showSeatingPlan: true,
      seatingPlanId: true,
      seatingPlan: {
        select: { id: true, name: true, caption: true, imageUrl: true, venueId: true },
      },
    },
  });
  if (!event?.showSeatingPlan) return null;
  if (event.seatingPlan) return mapSeatingPlanForGuest(event.seatingPlan);
  if (event.seatingPlanId) {
    const plan = await prisma.venueSeatingPlan.findUnique({
      where: { id: event.seatingPlanId },
      select: { id: true, name: true, caption: true, imageUrl: true },
    });
    return mapSeatingPlanForGuest(plan);
  }
  const fallback = await getVenueDefaultSeatingPlan(event.venueId);
  return mapSeatingPlanForGuest(fallback);
}

/** Resolve seating plan for a venue table (day or event context). */
export async function resolveVenueTableSeatingPlan(table) {
  if (!table) return null;
  if (table.eventId) return resolveEventSeatingPlan(table.eventId);
  return resolveDayBookingSeatingPlan(table.venueId);
}

export function mapSeatingPlanForBusiness(plan) {
  if (!plan) return null;
  return {
    id: plan.id,
    venue_id: plan.venueId,
    name: plan.name,
    caption: plan.caption || null,
    image_url: plan.imageUrl,
    image_public_id: plan.imagePublicId || null,
    sort_order: plan.sortOrder,
    is_default: plan.isDefault,
    created_at: plan.createdAt?.toISOString?.() ?? plan.createdAt,
    updated_at: plan.updatedAt?.toISOString?.() ?? plan.updatedAt,
  };
}
