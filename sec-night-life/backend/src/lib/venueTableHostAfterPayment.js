import { prisma } from './prisma.js';
import { normalizeHostingConfig } from './hostingConfig.js';
import { splitPlatformGross } from './platformSplit.js';

function parseHostingTierKey(key) {
  if (!key || typeof key !== 'string') return { category: 'GENERAL', tierIndex: 0 };
  const parts = key.split(':');
  if (parts[0] === 'day') {
    const tierIndex = Number(parts[1]);
    return {
      category: 'GENERAL',
      tierIndex: Number.isFinite(tierIndex) ? tierIndex : 0,
    };
  }
  const cat = parts[0] === 'vip' ? 'VIP' : 'GENERAL';
  const tierIndex = Number(parts[1]);
  return {
    category: cat,
    tierIndex: Number.isFinite(tierIndex) ? tierIndex : 0,
  };
}

export function parseGuestCountFromSpecs(specs) {
  if (!specs || typeof specs !== 'object' || Array.isArray(specs)) return null;
  const n = Number(specs.guestCount);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.min(500, Math.round(n));
}

/** Custom listings use a placeholder capacity — use the host's requested guest count instead. */
export function resolveCustomHostGuestQuantity(venueTable, memberOrSpecs) {
  const fallback = Math.max(1, Number(venueTable?.guestCapacity) || 1);
  if (!venueTable?.isCustomListing) return fallback;
  const specs =
    memberOrSpecs?.userSpecs && typeof memberOrSpecs.userSpecs === 'object'
      ? memberOrSpecs.userSpecs
      : memberOrSpecs;
  return parseGuestCountFromSpecs(specs) ?? fallback;
}

function resolveCustomHostMinSpend(venueTable, memberOrSpecs) {
  const fallback = Number(venueTable?.minimumSpend) || 0;
  if (!venueTable?.isCustomListing) return fallback;
  const specs =
    memberOrSpecs?.userSpecs && typeof memberOrSpecs.userSpecs === 'object'
      ? memberOrSpecs.userSpecs
      : memberOrSpecs;
  if (specs?.proposedMinimumSpend == null) return fallback;
  const n = Number(specs.proposedMinimumSpend);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

async function createHostedTableFromVenueSlot({
  tx,
  venueTable,
  userId,
  paystackReference,
  amountTotal,
  selectedMenuItems,
  settlementMode,
  hostMember,
  eventContext,
  venueContext,
}) {
  const { category, tierIndex } = parseHostingTierKey(venueTable.hostingTierKey);
  const guestQty = resolveCustomHostGuestQuantity(venueTable, hostMember);
  const minSpend = resolveCustomHostMinSpend(venueTable, hostMember);
  const menuSpend = Number(amountTotal) - Number(venueTable.hostTableFeeZar || 0);

  let tierName = venueTable.tierLabel || venueTable.tableName;
  let eventDate = venueTable.serviceDate || new Date();
  let eventTime = venueTable.startTime ? String(venueTable.startTime) : '20:00';
  let venueName = 'Venue';
  let venueAddress = null;
  let eventId = null;

  if (eventContext) {
    const hosting = normalizeHostingConfig(eventContext.hostingConfig);
    const catKey = category === 'VIP' ? 'vip' : 'general';
    const tierDef = hosting[catKey]?.tiers?.[tierIndex] || {};
    tierName = tierDef.tier_name || tierName;
    eventDate = eventContext.date;
    eventTime = eventContext.startTime ? String(eventContext.startTime) : eventTime;
    venueName = eventContext.venue?.name || venueName;
    venueAddress = eventContext.venue?.address || eventContext.city || null;
    eventId = eventContext.id;
  } else if (venueContext) {
    venueName = venueContext.name || venueName;
    venueAddress = venueContext.address || venueContext.city || null;
    if (!venueTable.serviceDate) eventDate = new Date();
  }

  const hosted = await tx.hostedTable.create({
    data: {
      hostUserId: userId,
      tableType: 'IN_APP_EVENT',
      tableName: venueTable.tableName,
      tableDescription: venueTable.description,
      eventType: 'CLUB_TABLE',
      eventId,
      venueName,
      venueAddress,
      eventDate,
      eventTime,
      guestQuantity: guestQty,
      spotsRemaining: Math.max(0, guestQty - 1),
      hostingCategory: category,
      hostingTierIndex: tierIndex,
      tierMaxGuests: guestQty,
      tierMinSpend: minSpend,
      menuSpendTotal: Math.max(0, menuSpend),
      tierIncludedItems: {
        tier_name: tierName,
        items: Array.isArray(venueTable.includedItems) ? venueTable.includedItems : [],
      },
      isPublic: true,
      hasJoiningFee: false,
      status: 'ACTIVE',
      hostFeePaystackRef: paystackReference,
      members: {
        create: [
          {
            userId,
            status: 'GOING',
            selectedMenuItems: selectedMenuItems || undefined,
          },
        ],
      },
      groupChat: {
        create: {
          name: venueTable.tableName,
          members: { create: [{ userId }] },
        },
      },
    },
    include: { groupChat: true },
  });

  await tx.venueTable.update({
    where: { id: venueTable.id },
    data: {
      hostedTableId: hosted.id,
      hostUserId: userId,
    },
  });

  if (eventId) {
    await tx.eventVenueTableBooking.create({
      data: {
        venueId: venueTable.venueId,
        eventId,
        hostedTableId: hosted.id,
        userId,
        role: 'HOST',
        paystackReference,
        amountTotal,
        bookingFeeZar: Number(venueTable.hostTableFeeZar || 0),
        minimumSpendZar: minSpend,
        platformFeeZar: splitPlatformGross(amountTotal).secAmount,
        settlementMode: settlementMode || 'PREPAY_MENU',
        selectedMenuItems: selectedMenuItems || undefined,
        hostingTierName: tierName,
        hostingCategory: category,
      },
    });
  }

  return hosted;
}

/**
 * After a venue-table host checkout payment, create HostedTable and link the slot.
 */
export async function ensureHostedTableFromVenueHostPayment({
  tx,
  venueTable,
  userId,
  paystackReference,
  amountTotal,
  selectedMenuItems,
  settlementMode,
  hostMember = null,
}) {
  if (venueTable?.hostedTableId) return null;

  let member = hostMember;
  if (!member && userId && venueTable.id) {
    member = await tx.venueTableMember.findUnique({
      where: { venueTableId_userId: { venueTableId: venueTable.id, userId: String(userId) } },
    });
  }

  if (venueTable.eventId) {
    const event = await tx.event.findFirst({
      where: { id: venueTable.eventId, deletedAt: null },
      include: { venue: true },
    });
    if (!event) return null;
    return createHostedTableFromVenueSlot({
      tx,
      venueTable,
      userId,
      paystackReference,
      amountTotal,
      selectedMenuItems,
      settlementMode,
      hostMember: member,
      eventContext: event,
    });
  }

  const venue = await tx.venue.findFirst({
    where: { id: venueTable.venueId, deletedAt: null },
  });
  if (!venue) return null;

  return createHostedTableFromVenueSlot({
    tx,
    venueTable,
    userId,
    paystackReference,
    amountTotal,
    selectedMenuItems,
    settlementMode,
    hostMember: member,
    venueContext: venue,
  });
}

/** Day-hosted tables link back to a venue table row — used for venue_id + QR expiry. */
export async function resolveLinkedVenueTableForHostedTable(db, hostedTableId) {
  if (!hostedTableId) return null;
  return db.venueTable.findFirst({
    where: { hostedTableId: String(hostedTableId) },
    select: {
      id: true,
      venueId: true,
      serviceDate: true,
      serviceEndDate: true,
      startTime: true,
      endTime: true,
    },
  });
}

/**
 * Resolve venue for a hosted table: event venue first, else linked day-booking venue slot.
 * @param {import('@prisma/client').PrismaClient | object} db
 * @param {{ id?: string, eventId?: string|null, event?: { venueId?: string|null, venue?: { id?: string, ownerUserId?: string|null }|null }|null }} hostedTable
 */
export async function resolveVenueContextForHostedTable(db, hostedTable) {
  let venueId = hostedTable?.event?.venueId || hostedTable?.event?.venue?.id || null;
  let venueOwnerUserId = hostedTable?.event?.venue?.ownerUserId || null;
  let linkedVenueTable = null;
  if (!venueId && hostedTable?.id) {
    linkedVenueTable = await resolveLinkedVenueTableForHostedTable(db, hostedTable.id);
    venueId = linkedVenueTable?.venueId || null;
  }
  if (venueId && !venueOwnerUserId) {
    const venue = await db.venue.findFirst({
      where: { id: venueId, deletedAt: null },
      select: { ownerUserId: true },
    });
    venueOwnerUserId = venue?.ownerUserId || null;
  }
  return { venueId, venueOwnerUserId, linkedVenueTable };
}

/** @param {import('@prisma/client').PrismaClient | object} db */
export async function resolveVenueIdForHostedTable(db, hostedTable) {
  const { venueId } = await resolveVenueContextForHostedTable(db, hostedTable);
  return venueId;
}
