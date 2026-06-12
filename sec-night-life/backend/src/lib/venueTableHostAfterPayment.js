import { prisma } from './prisma.js';
import { normalizeHostingConfig } from './hostingConfig.js';
import { splitPlatformGross } from './platformSplit.js';

function parseHostingTierKey(key) {
  if (!key || typeof key !== 'string') return { category: 'GENERAL', tierIndex: 0 };
  const parts = key.split(':');
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
  if (!venueTable?.eventId || venueTable.hostedTableId) return null;

  let member = hostMember;
  if (!member && userId && venueTable.id) {
    member = await tx.venueTableMember.findUnique({
      where: { venueTableId_userId: { venueTableId: venueTable.id, userId: String(userId) } },
    });
  }

  const event = await tx.event.findFirst({
    where: { id: venueTable.eventId, deletedAt: null },
    include: { venue: true },
  });
  if (!event) return null;

  const { category, tierIndex } = parseHostingTierKey(venueTable.hostingTierKey);
  const hosting = normalizeHostingConfig(event.hostingConfig);
  const catKey = category === 'VIP' ? 'vip' : 'general';
  const tierDef = hosting[catKey]?.tiers?.[tierIndex] || {};
  const tierName = tierDef.tier_name || venueTable.tierLabel || venueTable.tableName;
  const guestQty = resolveCustomHostGuestQuantity(venueTable, member);
  const minSpend = resolveCustomHostMinSpend(venueTable, member);
  const menuSpend = Number(amountTotal) - Number(venueTable.hostTableFeeZar || 0);

  const hosted = await tx.hostedTable.create({
    data: {
      hostUserId: userId,
      tableType: 'IN_APP_EVENT',
      tableName: venueTable.tableName,
      tableDescription: venueTable.description,
      eventType: 'CLUB_TABLE',
      eventId: event.id,
      venueName: event.venue?.name || 'Venue',
      venueAddress: event.venue?.address || event.city || null,
      eventDate: event.date,
      eventTime: event.startTime ? String(event.startTime) : '20:00',
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

  await tx.eventVenueTableBooking.create({
    data: {
      venueId: venueTable.venueId,
      eventId: event.id,
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

  return hosted;
}
