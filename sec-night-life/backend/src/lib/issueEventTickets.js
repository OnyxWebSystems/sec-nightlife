import { prisma } from './prisma.js';
import { issueTicketAndNotify, sendConsolidatedEventTicketsEmail } from './issueTicket.js';
import { createNotification } from './notifications.js';
import { logFriendActivity } from './friendActivity.js';
import { upsertConfirmedAttendance } from './eventAttendance.js';
import {
  eventStartsAtFromEvent,
  eventEndsAtFromEvent,
  visibleUntilAfterEventDate,
  holderDisplayNameFromUser,
} from './ticketHelpers.js';
import { recordPayoutAndMaybeTransfer, resolveRecipientCodeForVenue, splitSecPlatform } from './paystackPayout.js';
import { promoterUserIdFromMetadata, recordPromoterConversion } from './promoterAttribution.js';
import { buildTicketDoorContext } from './ticketDoorContext.js';
import { logger } from './logger.js';

export function normalizeTicketTiers(raw) {
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  if (raw && typeof raw === 'object') {
    const values = Object.values(raw);
    if (values.every((v) => v && typeof v === 'object')) return values;
  }
  return [];
}

function parseTicketMenuItems(meta) {
  const raw = meta?.selected_menu_items ?? meta?.selectedMenuItems;
  if (Array.isArray(raw)) return raw;
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }
  return [];
}

export function ticketReferencesForPayment(reference, qty) {
  if (qty <= 1) return [reference];
  return Array.from({ length: qty }, (_, i) => `${reference}-${i + 1}`);
}

async function syncTierSoldFromTickets(db, eventId, ticketTier) {
  const event = await db.event.findUnique({ where: { id: eventId }, select: { ticketTiers: true } });
  if (!event) return;
  const tiers = normalizeTicketTiers(event.ticketTiers);
  const tierRow = tiers.find((t) => t.name === ticketTier);
  if (!tierRow) return;
  const actualCount = await db.ticket.count({
    where: { eventId, kind: 'EVENT_TICKET', subtitle: ticketTier, hiddenFromHistoryAt: null },
  });
  const currentSold = Number(tierRow.sold) || 0;
  if (actualCount > currentSold) {
    const updatedTiers = tiers.map((t) =>
      t.name === ticketTier ? { ...t, sold: actualCount } : t,
    );
    await db.event.update({ where: { id: eventId }, data: { ticketTiers: updatedTiers } });
  }
}

/**
 * Idempotently issue EVENT_TICKET rows after a successful ticket payment.
 */
export async function issueEventTicketsFromPayment(db, {
  reference,
  userId,
  email,
  amount = 0,
  metadata = {},
  skipSoldUpdate = false,
  skipSideNotifications = false,
}) {
  const eventId = metadata.event_id || metadata.eventId;
  const ticketTier = metadata.ticket_tier_name || metadata.ticketTierName;
  const qty = Math.max(1, parseInt(String(metadata.quantity || '1'), 10) || 1);

  if (!eventId || !ticketTier || !userId) {
    return { issued: 0, skipped: true, reason: 'missing_metadata' };
  }

  const refs = ticketReferencesForPayment(reference, qty);
  const existing = await db.ticket.findMany({
    where: { paystackReference: { in: refs } },
    select: { id: true, paystackReference: true },
  });
  const existingCount = existing.length;
  if (existingCount >= qty) {
    await syncTierSoldFromTickets(db, eventId, ticketTier);
    return { issued: 0, skipped: true, reason: 'already_issued', existing: existingCount };
  }

  const event = await db.event.findFirst({
    where: { id: String(eventId), deletedAt: null },
    include: {
      venue: { select: { ownerUserId: true, name: true, address: true, city: true } },
    },
  });
  if (!event) {
    logger.warn('issueEventTickets: event not found', { eventId, reference });
    return { issued: 0, skipped: true, reason: 'event_not_found' };
  }

  const tiers = normalizeTicketTiers(event.ticketTiers);
  if (!tiers.length) {
    logger.warn('issueEventTickets: no ticket tiers on event', { eventId, reference });
    return { issued: 0, skipped: true, reason: 'no_tiers' };
  }

  const tierRow = tiers.find((t) => t.name === ticketTier);
  if (!tierRow) {
    logger.warn('issueEventTickets: tier not found', { eventId, ticketTier, reference });
    return { issued: 0, skipped: true, reason: 'tier_not_found' };
  }

  const toIssue = qty - existingCount;
  const soldIncrement = skipSoldUpdate ? 0 : toIssue;

  if (!skipSideNotifications) {
    await createNotification({
      userId,
      type: 'payment',
      title: 'Tickets confirmed',
      body: `Your ticket purchase for "${event.title}" was confirmed.`,
      actionUrl: `/Profile?tab=tickets`,
    });
    logFriendActivity({
      userId,
      activityType: 'JOINED_EVENT',
      referenceId: event.id,
      referenceType: 'EVENT',
      description: 'joined an event',
    });
    await upsertConfirmedAttendance(userId, event.id);
    const { addUserToEventGroupChat } = await import('./groupChatHelpers.js');
    await addUserToEventGroupChat(event.id, userId, event.title);

    await createNotification({
      userId: event.venue?.ownerUserId,
      type: 'payment',
      title: 'Ticket purchase',
      body: `${qty} ticket(s) sold for "${event.title}" at ${event.venue?.name || 'your venue'}.`,
      actionUrl: `/BusinessEvents`,
    });

    const { secAmount: eSec, recipientAmount: eRec } = splitSecPlatform(Number(amount || 0));
    const vCode = await resolveRecipientCodeForVenue(event.venueId);
    await recordPayoutAndMaybeTransfer({
      paymentReference: reference,
      grossZar: Number(amount || 0),
      secAmount: eSec,
      recipientAmount: eRec,
      recipientType: 'VENUE',
      recipientVenueId: event.venueId,
      recipientUserId: null,
      paystackRecipientCode: vCode,
    });
  }

  const payerEv = await db.user.findUnique({
    where: { id: String(userId) },
    select: { email: true, fullName: true, username: true, userProfile: { select: { username: true } } },
  });
  const visEv = eventEndsAtFromEvent(event) || visibleUntilAfterEventDate(event.date);
  const eventStartsAt = eventStartsAtFromEvent(event);
  const eventEndsAt = eventEndsAtFromEvent(event);

  let holderNames = [];
  try {
    const raw = metadata.holder_names ?? metadata.holderNames;
    holderNames = typeof raw === 'string' ? JSON.parse(raw) : Array.isArray(raw) ? raw : [];
  } catch {
    holderNames = [];
  }

  const menuItems = parseTicketMenuItems(metadata);
  const ticketPromoterId = promoterUserIdFromMetadata(metadata);
  const locParts = [
    event.locationAddress || event.venue?.address,
    event.locationCity || event.city,
  ].filter(Boolean);

  const existingRefs = new Set(existing.map((t) => t.paystackReference));
  const issuedTickets = [];
  let issued = 0;

  await db.$transaction(async (tx) => {
    if (soldIncrement > 0) {
      const fresh = await tx.event.findUnique({ where: { id: event.id }, select: { ticketTiers: true } });
      const freshTiers = normalizeTicketTiers(fresh?.ticketTiers);
      const updatedTiers = freshTiers.map((t) =>
        t.name === ticketTier ? { ...t, sold: (Number(t.sold) || 0) + soldIncrement } : t,
      );
      await tx.event.update({ where: { id: event.id }, data: { ticketTiers: updatedTiers } });
    }

    for (let i = 0; i < qty; i += 1) {
      const payRef = refs[i];
      if (existingRefs.has(payRef)) continue;

      const holder = String(holderNames[i] || '').trim() || holderDisplayNameFromUser(payerEv);
      const summaryLines = [
        ticketTier,
        tierRow.description ? String(tierRow.description) : null,
        `R${Number(tierRow.price || 0).toLocaleString('en-ZA')}`,
        holder ? `Guest: ${holder}` : null,
        event.title,
        locParts.length ? locParts.join(', ') : null,
      ];
      if (menuItems.length > 0 && i === 0) {
        summaryLines.push('Menu add-ons:');
        for (const m of menuItems) {
          summaryLines.push(`${m.quantity}× ${m.name}`);
        }
      }

      const ticket = await issueTicketAndNotify(tx, {
        userId: String(userId),
        email: null,
        skipEmail: true,
        paystackReference: payRef,
        kind: 'EVENT_TICKET',
        title: event.title,
        subtitle: ticketTier,
        visibleUntil: visEv,
        eventId: event.id,
        quantity: 1,
        holderDisplayName: holder,
        tableSpecsSummary: summaryLines.filter(Boolean).join('\n'),
        eventStartsAt,
        eventEndsAt,
        promoterUserId: ticketPromoterId,
      });
      issuedTickets.push({ ticket, holderLabel: holder ? `Guest: ${holder}` : `Guest ${i + 1}` });
      issued += 1;
    }
  });

  if (issuedTickets.length > 0) {
    const emailPayload = [];
    for (const { ticket, holderLabel } of issuedTickets) {
      const door = await buildTicketDoorContext(db, ticket);
      emailPayload.push({
        qrToken: ticket.qrToken,
        paystackReference: ticket.paystackReference,
        eventStartsAt: ticket.eventStartsAt,
        holderLabel,
        door,
      });
    }
    await sendConsolidatedEventTicketsEmail({
      to: payerEv?.email || email,
      eventTitle: event.title,
      tierName: ticketTier,
      tickets: emailPayload,
    });
  }

  if (issued > 0) {
    const promoterUserId = promoterUserIdFromMetadata(metadata);
    if (promoterUserId) {
      await recordPromoterConversion({
        eventId: event.id,
        promoterUserId,
        conversionType: 'TICKET_PURCHASE',
        buyerUserId: String(userId),
        amountZar: amount,
        paystackReference: reference,
        quantity: qty,
      }).catch(() => {});
    }
  }

  if (skipSoldUpdate && issued === 0 && existingCount > 0) {
    await syncTierSoldFromTickets(db, eventId, ticketTier);
  }

  return { issued, skipped: issued === 0, reason: issued ? 'ok' : 'partial_or_none' };
}

/** Repair path: ensure tickets exist for a paid ticket payment reference. */
export async function ensureEventTicketsForPayment(reference, paystackData = null) {
  const pay = await prisma.payment.findUnique({
    where: { reference },
    select: { userId: true, email: true, amount: true, metadata: true, status: true },
  });
  if (!pay) return { repaired: false };
  const paid = pay.status === 'success' || paystackData?.status === 'success';
  if (!paid) return { repaired: false };

  const metadata = pay.metadata && typeof pay.metadata === 'object' ? pay.metadata : {};
  const type = metadata.type;
  if (type !== 'ticket' && !(metadata.event_id && metadata.ticket_tier_name)) {
    return { repaired: false };
  }

  const amount = paystackData?.amount ? paystackData.amount / 100 : Number(pay.amount || 0);
  const result = await issueEventTicketsFromPayment(prisma, {
    reference,
    userId: pay.userId,
    email: pay.email,
    amount,
    metadata,
    skipSoldUpdate: false,
    skipSideNotifications: true,
  });
  return { repaired: result.issued > 0, ...result };
}
