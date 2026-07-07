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

const guestPlanSelect = {
  id: true,
  name: true,
  caption: true,
  imageUrl: true,
  sortOrder: true,
  isDefault: true,
  createdAt: true,
};

/** All venue seating plans ordered for guest display. */
export async function getVenueSeatingPlansForGuest(venueId) {
  const rows = await prisma.venueSeatingPlan.findMany({
    where: { venueId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    select: guestPlanSelect,
  });
  return rows.map(mapSeatingPlanForGuest).filter(Boolean);
}

/** Default plan for a venue (isDefault first, else lowest sortOrder). */
export async function getVenueDefaultSeatingPlan(venueId) {
  const plans = await prisma.venueSeatingPlan.findMany({
    where: { venueId },
    orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }],
    take: 1,
    select: guestPlanSelect,
  });
  return plans[0] || null;
}

function orderPlansWithPrimaryFirst(plans, primaryId) {
  if (!primaryId || plans.length <= 1) return plans;
  const idx = plans.findIndex((p) => p.id === primaryId);
  if (idx <= 0) return plans;
  const reordered = [...plans];
  const [primary] = reordered.splice(idx, 1);
  reordered.unshift(primary);
  return reordered;
}

/** Guest-facing seating plans for day bookings when venue toggle is on. */
export async function resolveDayBookingSeatingPlans(venueId) {
  const venue = await prisma.venue.findFirst({
    where: { id: venueId, deletedAt: null },
    select: { showSeatingPlanForDayBookings: true },
  });
  if (!venue?.showSeatingPlanForDayBookings) return [];
  return getVenueSeatingPlansForGuest(venueId);
}

/** Guest-facing seating plan for day bookings (first in list). */
export async function resolveDayBookingSeatingPlan(venueId) {
  const plans = await resolveDayBookingSeatingPlans(venueId);
  return plans[0] || null;
}

/** Guest-facing seating plans for an event when event toggle is on. */
export async function resolveEventSeatingPlans(eventId) {
  const event = await prisma.event.findFirst({
    where: { id: eventId, deletedAt: null },
    select: {
      venueId: true,
      showSeatingPlan: true,
      seatingPlanId: true,
    },
  });
  if (!event?.showSeatingPlan) return [];

  const allPlans = await getVenueSeatingPlansForGuest(event.venueId);
  if (allPlans.length === 0) return [];

  let primaryId = event.seatingPlanId || null;
  if (!primaryId) {
    const defaultPlan = await getVenueDefaultSeatingPlan(event.venueId);
    primaryId = defaultPlan?.id || allPlans[0]?.id || null;
  }

  return orderPlansWithPrimaryFirst(allPlans, primaryId);
}

/** Guest-facing seating plan for an event (first in list). */
export async function resolveEventSeatingPlan(eventId) {
  const plans = await resolveEventSeatingPlans(eventId);
  return plans[0] || null;
}

/** Resolve seating plans for a venue table (day or event context). */
export async function resolveVenueTableSeatingPlans(table) {
  if (!table) return [];
  if (table.eventId) return resolveEventSeatingPlans(table.eventId);
  return resolveDayBookingSeatingPlans(table.venueId);
}

/** Resolve seating plan for a venue table (day or event context). */
export async function resolveVenueTableSeatingPlan(table) {
  const plans = await resolveVenueTableSeatingPlans(table);
  return plans[0] || null;
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

/** Attach seatingPlan + seatingPlans to a guest API payload. */
export function attachGuestSeatingPlans(payload, plans) {
  const list = Array.isArray(plans) ? plans.filter(Boolean) : [];
  return {
    ...payload,
    seatingPlans: list,
    seatingPlan: list[0] || null,
  };
}
