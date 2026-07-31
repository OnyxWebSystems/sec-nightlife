import crypto from 'crypto';
import { prisma } from './prisma.js';
import {
  computeTicketCheckout,
  buildTicketPaymentMetadata,
} from './ticketCheckout.js';
import { issueEventTicketsFromPayment, normalizeTicketTiers } from './issueEventTickets.js';
import {
  computeEventEntranceCheckout,
  issueEventEntranceFromPayment,
} from './issueEventEntrance.js';
import { userHasPaidEventEntrance } from './entranceCheckout.js';

function shortId() {
  return crypto.randomBytes(8).toString('hex');
}

/**
 * Claim R0 event tickets (no Paystack). Issues EVENT_TICKET QR passes.
 */
export async function claimFreeEventTickets({
  eventId,
  userId,
  email = null,
  ticketTierName,
  quantity = 1,
  holderNames = [],
  selectedMenuItems = [],
  promoterUserId = null,
}) {
  const qty = Math.max(1, Math.min(10, parseInt(String(quantity), 10) || 1));
  const event = await prisma.event.findFirst({
    where: { id: String(eventId), deletedAt: null },
    select: {
      id: true,
      status: true,
      eventFormat: true,
      ticketTiers: true,
      venueId: true,
    },
  });
  if (!event) return { ok: false, status: 404, error: 'Event not found' };
  if (event.status !== 'published') {
    return { ok: false, status: 400, error: 'Event is not available' };
  }
  if (!normalizeTicketTiers(event.ticketTiers).length) {
    return { ok: false, status: 400, error: 'This event has no ticket tiers' };
  }

  const computed = await computeTicketCheckout(prisma, {
    eventId: event.id,
    ticketTierName,
    quantity: qty,
    selectedMenuItems,
  });
  if (!computed.ok) return { ok: false, status: 400, error: computed.error };
  if (Number(computed.total) > 0) {
    return {
      ok: false,
      status: 400,
      error: 'This checkout is not free. Use paid checkout instead.',
      expected_zar: computed.total,
    };
  }

  const reference = `free_ticket_${event.id}_${userId}_${shortId()}`;
  const baseMeta = {
    type: 'ticket',
    event_id: event.id,
    venue_id: event.venueId,
    ticket_tier_name: ticketTierName,
    quantity: String(qty),
    holder_names: Array.isArray(holderNames) ? holderNames : [],
  };
  if (promoterUserId) baseMeta.promoter_user_id = promoterUserId;
  const metadata = buildTicketPaymentMetadata(baseMeta, computed);

  const result = await issueEventTicketsFromPayment(prisma, {
    reference,
    userId: String(userId),
    email,
    amount: 0,
    metadata,
  });

  if (!result.issued && result.reason !== 'already_issued') {
    return {
      ok: false,
      status: 500,
      error: 'Could not issue free tickets. Please try again.',
      reason: result.reason,
    };
  }

  return {
    ok: true,
    confirmed: true,
    reference,
    quantity: qty,
    tickets_issued: result.issued || qty,
  };
}

/**
 * Claim R0 entrance pass (no Paystack). Issues EVENT_ENTRANCE QR.
 */
export async function claimFreeEventEntrance({
  eventId,
  userId,
  email = null,
  selectedMenuItems = [],
  promoterUserId = null,
}) {
  const already = await userHasPaidEventEntrance(userId, eventId);
  if (already) {
    return {
      ok: false,
      status: 400,
      error: 'You already have an entrance pass for this event.',
    };
  }

  const computed = await computeEventEntranceCheckout(prisma, {
    eventId,
    selectedMenuItems,
    allowFreeClaim: true,
  });
  if (!computed.ok) return { ok: false, status: 400, error: computed.error };
  if (Number(computed.total) > 0) {
    return {
      ok: false,
      status: 400,
      error: 'This checkout is not free. Use paid checkout instead.',
      expected_zar: computed.total,
    };
  }
  if (!computed.event?.hasEntranceFee) {
    return { ok: false, status: 400, error: 'This event does not have an entrance fee' };
  }

  const reference = `free_entrance_${eventId}_${userId}_${shortId()}`;
  const metadata = {
    type: 'EVENT_ENTRANCE',
    event_id: eventId,
    venue_id: computed.event.venueId,
    entrance_zar: computed.entranceZar,
    menu_zar: computed.menuZar,
    amount_total_zar: 0,
    selected_menu_items: computed.menuItems,
  };
  if (promoterUserId) metadata.promoter_user_id = promoterUserId;

  const result = await issueEventEntranceFromPayment(prisma, {
    reference,
    userId: String(userId),
    email,
    amount: 0,
    metadata,
  });

  if (!result.issued && result.reason !== 'already_issued') {
    return {
      ok: false,
      status: 500,
      error: 'Could not issue free entrance pass. Please try again.',
      reason: result.reason,
    };
  }

  return {
    ok: true,
    confirmed: true,
    reference,
    tickets_issued: 1,
  };
}
