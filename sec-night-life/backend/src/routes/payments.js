/**
 * Paystack-only payment routes.
 * NO Stripe or other gateways. All payments via Paystack.
 * SECURITY: JWT required for initialize/verify; webhook uses HMAC signature.
 */
import { Router } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { authenticateToken } from '../middleware/auth.js';
import { userHasIdentityVerified } from '../middleware/requireIdentityVerified.js';
import { createNotification, createNotifications } from '../lib/notifications.js';
import { logFriendActivity } from '../lib/friendActivity.js';
import { recordTableHistory } from '../lib/tableHistory.js';
import { upsertConfirmedAttendance } from '../lib/eventAttendance.js';
import { sendEmail } from '../lib/email.js';
import { createInAppNotification } from '../lib/inAppNotifications.js';
import { normalizeHostingConfig } from '../lib/hostingConfig.js';
import { expectedTotalFromMetadata } from '../lib/checkoutLines.js';
import {
  computeTicketCheckout,
  buildTicketPaymentMetadata,
  expectedTicketTotalFromMetadata,
} from '../lib/ticketCheckout.js';
import { normalizeGuestGenderPreference } from '../lib/genderPreference.js';
import { getEventEntranceZar } from '../lib/hostedTableSecFees.js';
import { recordEventVenueTableBooking } from '../lib/eventVenueBooking.js';
import { ensureHostedTableFromVenueHostPayment } from '../lib/venueTableHostAfterPayment.js';
import {
  visibleUntilAfterEventDate,
  visibleUntilAfterParty,
  visibleUntilAfterHostedTable,
  visibleUntilForVenueTableMember,
  eventStartsAtFromEvent,
  eventStartsAtFromHostedTable,
  eventEndsAtFromEvent,
  holderDisplayNameFromUser,
  formatSpecsFromTable,
  formatSpecsFromVenueTable,
  formatSpecsFromHostedTable,
  refreshHostedTableTickets,
} from '../lib/ticketHelpers.js';
import { mergeMemberMenuItems, resolveVenueMenuSelections } from '../lib/menuHelpers.js';
import {
  buildVenueTableMemberTicketSummary,
  buildHostedTableJoinTicketSummary,
  buildHostedTableMenuTicketSummary,
  buildHostedTableHostTicketSummary,
} from '../lib/ticketMemberSummary.js';
import { issueTicketAndNotify } from '../lib/issueTicket.js';
import { issueEventTicketsFromPayment, ensureEventTicketsForPayment } from '../lib/issueEventTickets.js';
import { ensureVenueTableFulfillmentForPayment } from '../lib/ensureVenueTableFulfillment.js';
import { reconcileTableInvitesOnJoin } from '../lib/hostedTableInvites.js';
import { promoterUserIdFromMetadata, recordPromoterConversion } from '../lib/promoterAttribution.js';

async function applyPromoterAttribution({ metadata, eventId, buyerUserId, conversionType, amountZar, reference, quantity = 1 }) {
  const promoterUserId = promoterUserIdFromMetadata(metadata);
  if (!promoterUserId || !eventId || !buyerUserId) return null;
  return recordPromoterConversion({
    eventId,
    promoterUserId,
    conversionType,
    buyerUserId: String(buyerUserId),
    amountZar,
    paystackReference: reference,
    quantity,
  });
}

function parseTicketMenuItems(meta) {
  const raw = meta?.selected_menu_items;
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
import { notifyPaymentSuccess } from '../lib/paymentNotifications.js';
import { recordPayoutAndMaybeTransfer, recordSecPlatformRevenue, resolveRecipientCodeForUser, resolveRecipientCodeForVenue, splitSecPlatform } from '../lib/paystackPayout.js';
import { ensureHostedTableLiveAfterListingPayment } from '../lib/hostedTableAfterListingPaid.js';
import { addUserToHostedTableGroupChat } from '../lib/hostedTableGroupChat.js';
import {
  activatePromotionAfterPublishPayment,
  isPromotionPublishPayment,
  resolvePromotionIdFromMetadata,
} from '../lib/promotionPublishAfterPayment.js';
import {
  abandonSupersededPendingPayments,
  buildPaystackInitializeBody,
} from '../lib/paystackInitialize.js';

const router = Router();

const EXTERNAL_HOSTED_LISTING_ZAR = 200;

const tableCreateFromPaymentSchema = z.object({
  event_id: z.string().uuid(),
  venue_id: z.string().uuid(),
  name: z.string().min(1).max(200),
  table_category: z.enum(['general', 'vip']).optional(),
  max_guests: z.number().int().min(1).max(500),
  min_spend: z.number().min(0).optional(),
  joining_fee: z.number().min(0).optional(),
  is_public: z.boolean().optional(),
  guest_gender_preference: z.enum(['ANY', 'MALE_ONLY', 'FEMALE_ONLY', 'OTHER_ONLY']).optional(),
});

const PAYMENT_TYPES = ['event', 'table', 'promotion', 'ticket', 'other'];

function requirePaystackKey() {
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) {
    const err = new Error('Paystack is not configured');
    err.status = 500;
    throw err;
  }
  return key;
}

/** Public key for Paystack Inline in the browser (safe to expose). Set on the API alongside the secret. */
function getPaystackPublicKeyForClient() {
  return String(process.env.PAYSTACK_PUBLIC_KEY || process.env.VITE_PAYSTACK_PUBLIC_KEY || '').trim();
}

async function paystackFetch(path, { method = 'GET', body } = {}) {
  const key = requirePaystackKey();
  const res = await fetch(`https://api.paystack.co${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.status) {
    const msg = data?.message || 'Paystack request failed';
    const err = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

/**
 * Merge Paystack verify metadata with what we stored on Payment.
 * Paystack often echoes incomplete metadata and may overwrite keys like `type` — our DB copy must win.
 */
function mergePaymentMetadataFromVerify(priorMeta, paystackData) {
  const rawMd = paystackData?.metadata;
  let fromCharge = {};
  if (rawMd && typeof rawMd === 'object' && !Array.isArray(rawMd)) {
    fromCharge = rawMd;
  } else if (typeof rawMd === 'string') {
    try {
      fromCharge = JSON.parse(rawMd) || {};
    } catch {
      fromCharge = {};
    }
  }
  return { ...fromCharge, ...priorMeta };
}

function isObjectRecord(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function flattenPaymentMetadata(value) {
  if (!isObjectRecord(value)) return {};
  const nested = isObjectRecord(value.metadata) ? value.metadata : {};
  return { ...nested, ...value };
}

async function finalizePaymentIfFulfilled(reference, paystackData = null) {
  const pay = await prisma.payment.findUnique({
    where: { reference },
    select: { status: true, metadata: true, amount: true },
  });
  if (!pay) return;
  const meta = flattenPaymentMetadata(pay.metadata);
  if (pay.status === 'success' && meta.side_effects_applied) return;

  const paystackOk = paystackData?.status === 'success';
  const fulfillmentComplete = await isPaymentFulfillmentComplete(reference, meta);
  if (!paystackOk && !fulfillmentComplete) return;
  if (!fulfillmentComplete && pay.status === 'success') return;

  const amount = paystackData?.amount ? paystackData.amount / 100 : Number(pay.amount) || 0;
  const { side_effects_processing: _sp, side_effects_processing_at: _spa, ...metaBase } = meta;
  await prisma.payment.updateMany({
    where: { reference },
    data: {
      status: 'success',
      ...(amount > 0 ? { amount } : {}),
      metadata: {
        ...metaBase,
        side_effects_applied: fulfillmentComplete,
        side_effects_processing: false,
      },
    },
  });
}

const SIDE_EFFECTS_PROCESSING_STALE_MS = 2 * 60 * 1000;

function sideEffectsProcessingIsStale(meta) {
  if (!meta?.side_effects_processing) return true;
  const started = meta.side_effects_processing_at
    ? new Date(meta.side_effects_processing_at).getTime()
    : 0;
  if (!started || Number.isNaN(started)) return true;
  return Date.now() - started > SIDE_EFFECTS_PROCESSING_STALE_MS;
}

async function applyReferenceSideEffects(reference, paystackData) {
  const priorPay = await prisma.payment.findUnique({
    where: { reference },
    select: { metadata: true, userId: true, email: true, type: true, status: true },
  });
  if (!priorPay) return;
  const priorMeta = flattenPaymentMetadata(priorPay.metadata);
  if (priorMeta.side_effects_applied) {
    await runPaymentRepairPaths(reference, paystackData);
    await finalizePaymentIfFulfilled(reference, paystackData);
    return;
  }

  if (priorMeta.side_effects_processing && !sideEffectsProcessingIsStale(priorMeta)) {
    await runPaymentRepairPaths(reference, paystackData);
    await finalizePaymentIfFulfilled(reference, paystackData);
    return;
  }

  const metadata = flattenPaymentMetadata(mergePaymentMetadataFromVerify(priorMeta, paystackData));

  const claimed = await prisma.payment.updateMany({
    where: {
      reference,
      NOT: { metadata: { path: ['side_effects_applied'], equals: true } },
    },
    data: {
      metadata: {
        ...metadata,
        side_effects_processing: true,
        side_effects_processing_at: new Date().toISOString(),
      },
    },
  });
  if (claimed.count === 0) {
    const latest = await prisma.payment.findUnique({
      where: { reference },
      select: { metadata: true },
    });
    const latestMeta = flattenPaymentMetadata(latest?.metadata);
    if (latestMeta.side_effects_processing && !sideEffectsProcessingIsStale(latestMeta)) {
      await runPaymentRepairPaths(reference, paystackData);
      await finalizePaymentIfFulfilled(reference, paystackData);
      return;
    }
    await runPaymentRepairPaths(reference, paystackData);
    await finalizePaymentIfFulfilled(reference, paystackData);
    return;
  }

  const userId = priorPay.userId || metadata.user_id || metadata.userId || null;
  const email =
    paystackData?.customer?.email || priorPay.email || metadata.email || 'unknown@secnightlife.app';
  const amount = paystackData?.amount ? paystackData.amount / 100 : 0;
  const type = metadata.type || 'other';

  try {
  // Legacy: update Transaction if exists
  await prisma.transaction.updateMany({
    where: { stripeId: reference },
    data: { status: 'paid', metadata: paystackData },
  });

  const PROMO_MS_DAY = 24 * 60 * 60 * 1000;
  const promoId = resolvePromotionIdFromMetadata(metadata);
  const isPromoPublish = isPromotionPublishPayment(metadata, priorPay.type);
  if (!promoId && (metadata.sec_kind === 'PROMOTION_PUBLISH' || metadata.type === 'BOOST')) {
    console.warn('applyReferenceSideEffects: promotion metadata missing promoId', {
      reference,
      sec_kind: metadata.sec_kind,
      type: metadata.type,
    });
  }

  if (isPromoPublish && promoId) {
    const activation = await activatePromotionAfterPublishPayment({
      promoId,
      metadata,
      reference,
      payerUserId: priorPay.userId || userId,
      payerEmail: email,
      sendNotification: true,
    });
    if (!activation.activated && activation.reason !== 'already_live') {
      console.error('PROMOTION_PUBLISH: activation failed', {
        reference,
        promoId,
        reason: activation.reason,
        status: activation.promotion?.status,
      });
      throw new Error(
        activation.reason
          ? `Promotion activation failed: ${activation.reason}`
          : 'Promotion activation failed after payment',
      );
    }
    if (amount > 0) {
      await recordSecPlatformRevenue(reference, amount);
    }
  } else if ((metadata.sec_kind === 'BOOST' || metadata.type === 'BOOST') && promoId) {
    const boostDaysRaw = metadata.boostDays ?? metadata.boost_days;
    const boostDays = Math.min(30, Math.max(1, parseInt(String(boostDaysRaw || '7'), 10) || 7));
    const boostExpiry = new Date(Date.now() + boostDays * PROMO_MS_DAY);

    const preBoost = await prisma.promotion.findFirst({
      where: { id: String(promoId), deletedAt: null },
      select: { boostPaystackRef: true },
    });
    if (preBoost?.boostPaystackRef === reference) {
      // Idempotent: same Paystack reference already applied
    } else {
      await prisma.promotion.updateMany({
        where: { id: String(promoId), deletedAt: null },
        data: {
          boosted: true,
          boostedAt: new Date(),
          boostExpiresAt: boostExpiry,
          boostPaystackRef: reference,
          status: 'ACTIVE',
        },
      });

      const promo = await prisma.promotion.findFirst({
        where: { id: String(promoId), deletedAt: null },
        select: { id: true, title: true, venueId: true, boostExpiresAt: true },
      });
      if (promo) {
        const venue = await prisma.venue.findFirst({
          where: { id: promo.venueId, deletedAt: null },
          select: { ownerUserId: true, name: true, owner: { select: { email: true } } },
        });
        const boostTitle = 'Promotion boost active';
        const boostBody = `"${promo.title}" is now boosted for ${venue?.name || 'your venue'}.`;
        const payerId = String(priorPay.userId || userId || venue?.ownerUserId || '');
        const payerEmail =
          email && email !== 'unknown@secnightlife.app' ? email : venue?.owner?.email || null;
        await notifyPaymentSuccess({
          userId: payerId,
          email: payerEmail,
          title: boostTitle,
          body: boostBody,
          actionUrl: '/BusinessPromotions',
          referenceId: promo.id,
          referenceType: 'PROMOTION',
          emailSubject: `${boostTitle} — ${promo.title}`,
        });
      }
    }
    if (amount > 0) {
      await recordSecPlatformRevenue(reference, amount);
    }
  }

  const housePartyIdMeta = metadata.housePartyId || metadata.house_party_id;
  if (metadata.type === 'HOUSE_PARTY_PUBLISH' && housePartyIdMeta && userId) {
    const party = await prisma.houseParty.findFirst({ where: { id: String(housePartyIdMeta) } });
    if (party && party.hostUserId === userId) {
      await prisma.houseParty.update({
        where: { id: party.id },
        data: {
          status: 'PUBLISHED',
          publishedAt: new Date(),
          publishPaystackRef: reference,
        },
      });
      await createInAppNotification({
        userId: party.hostUserId,
        type: 'EVENT_JOINED',
        title: 'Party live',
        body: 'Your house party is now live!',
        referenceId: party.id,
        referenceType: 'HOUSE_PARTY',
      });
      if (amount > 0) {
        await recordSecPlatformRevenue(reference, amount);
      }
    }
  }

  if (metadata.type === 'HOUSE_PARTY_BOOST' && housePartyIdMeta && userId) {
    const boostExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const party = await prisma.houseParty.findFirst({ where: { id: String(housePartyIdMeta) } });
    if (party && party.hostUserId === userId) {
      await prisma.houseParty.update({
        where: { id: party.id },
        data: {
          boosted: true,
          boostedAt: new Date(),
          boostExpiresAt: boostExpiry,
          boostPaystackRef: reference,
        },
      });
      await createInAppNotification({
        userId: party.hostUserId,
        type: 'EVENT_JOINED',
        title: 'Boost active',
        body: 'Your house party boost is active for 7 days!',
        referenceId: party.id,
        referenceType: 'HOUSE_PARTY',
      });
      if (amount > 0) {
        await recordSecPlatformRevenue(reference, amount);
      }
    }
  }

  const hostedTableBoostId = metadata.hostedTableId || metadata.hosted_table_id;
  if (metadata.type === 'TABLE_BOOST' && hostedTableBoostId && userId) {
    const boostExpiry = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    const ht = await prisma.hostedTable.findFirst({ where: { id: String(hostedTableBoostId) } });
    if (ht && ht.hostUserId === userId) {
      await prisma.hostedTable.update({
        where: { id: ht.id },
        data: {
          boosted: true,
          boostedAt: new Date(),
          boostExpiresAt: boostExpiry,
          boostPaystackRef: reference,
        },
      });
      if (amount > 0) {
        await recordSecPlatformRevenue(reference, amount);
      }
    }
  }

  if (metadata.type === 'HOSTED_TABLE_MENU' && userId) {
    const htid = metadata.hosted_table_id || metadata.hostedTableId;
    const memberId = metadata.hosted_table_member_id || metadata.hostedTableMemberId;
    const menuZar = Number(metadata.menu_zar || amount || 0);
    if (htid && memberId && menuZar > 0) {
      const mem = await prisma.hostedTableMember.findFirst({
        where: { id: String(memberId), hostedTableId: String(htid), userId: String(userId) },
        include: { hostedTable: { include: { event: true } } },
      });
      const alreadyMenu = await prisma.payoutLedger.findFirst({
        where: { paymentReference: reference },
      });
      if (mem && mem.status === 'GOING' && !alreadyMenu) {
        const added = metadata.selected_menu_items || metadata.selectedMenuItems || [];
        const merged = mergeMemberMenuItems(mem.selectedMenuItems, added);
        await prisma.$transaction(async (tx) => {
          await tx.hostedTableMember.update({
            where: { id: mem.id },
            data: {
              selectedMenuItems: merged,
              menuSpendPaid: { increment: menuZar },
            },
          });
          await tx.hostedTable.update({
            where: { id: mem.hostedTableId },
            data: { menuSpendTotal: { increment: menuZar } },
          });
        });
        const { secAmount, recipientAmount: venueAmount } = splitSecPlatform(menuZar);
        const venueId = mem.hostedTable?.event?.venueId;
        if (venueId) {
          const venueCode = await resolveRecipientCodeForVenue(venueId);
          await recordPayoutAndMaybeTransfer({
            paymentReference: reference,
            grossZar: menuZar,
            secAmount,
            recipientAmount: venueAmount,
            recipientType: 'VENUE',
            recipientVenueId: venueId,
            recipientUserId: null,
            paystackRecipientCode: venueCode,
          });
        }
        if (venueId && mem.hostedTable?.eventId) {
          const role = mem.userId === mem.hostedTable.hostUserId ? 'HOST' : 'GUEST';
          await recordEventVenueTableBooking({
            venueId,
            eventId: mem.hostedTable.eventId,
            hostedTableId: mem.hostedTableId,
            userId: String(userId),
            role,
            paystackReference: reference,
            amountTotal: menuZar,
            componentZar: menuZar,
            selectedMenuItems: merged,
            hostingTierName: mem.hostedTable.tierIncludedItems?.tier_name || null,
            hostingCategory: mem.hostedTable.hostingCategory,
            menuTotalZar: menuZar,
          });
        }
        const ht = mem.hostedTable;
        const hostUser = await prisma.user.findUnique({
          where: { id: ht.hostUserId },
          select: { email: true, fullName: true, username: true, userProfile: { select: { username: true } } },
        });
        const payer = await prisma.user.findUnique({
          where: { id: String(userId) },
          select: { email: true, fullName: true, username: true, userProfile: { select: { username: true } } },
        });
        const vis = ht.event ? visibleUntilAfterEventDate(ht.event.date) : visibleUntilAfterHostedTable(ht);
        const eventStartsAt = ht.event
          ? eventStartsAtFromEvent(ht.event)
          : eventStartsAtFromHostedTable(ht);
        const eventEndsAt = ht.event ? eventEndsAtFromEvent(ht.event) : null;
        let menuItemsForSummary = merged;
        if (venueId && Array.isArray(merged) && merged.length) {
          const resolved = await resolveVenueMenuSelections(
            merged.map((line) => ({
              menuItemId: line.menuItemId,
              quantity: line.quantity,
            })),
            venueId,
          );
          menuItemsForSummary = resolved.items;
        }
        const menuSummary = buildHostedTableMenuTicketSummary({
          hostedTable: ht,
          hostUser,
          guestUser: payer,
          menuItems: menuItemsForSummary,
        });
        await issueTicketAndNotify(prisma, {
          userId: String(userId),
          email: payer?.email || email,
          paystackReference: reference,
          kind: 'HOSTED_TABLE_JOIN',
          title: `${ht.tableName} — Your menu order`,
          subtitle: ht.venueName,
          visibleUntil: vis,
          hostedTableId: ht.id,
          eventId: ht.eventId || null,
          quantity: 1,
          holderDisplayName: holderDisplayNameFromUser(payer),
          tableSpecsSummary: menuSummary,
          eventStartsAt,
          eventEndsAt,
        });
        await createInAppNotification({
          userId: String(userId),
          type: 'TABLE_JOINED',
          title: 'Menu order confirmed',
          body: `Your items for "${mem.hostedTable.tableName}" were added to the table. Show your menu QR to staff.`,
          referenceId: mem.hostedTableId,
          referenceType: 'HOSTED_TABLE',
        });
      }
    }
  }

  const venueTableId = metadata.venueTableId || metadata.venue_table_id;
  const venueTableMemberId = metadata.venueTableMemberId || metadata.venue_table_member_id;
  if (
    (metadata.type === 'VENUE_TABLE_JOIN' || metadata.type === 'TABLE_CHECKOUT') &&
    venueTableId &&
    venueTableMemberId &&
    userId
  ) {
    await prisma.$transaction(async (tx) => {
      const member = await tx.venueTableMember.findFirst({
        where: { id: String(venueTableMemberId), venueTableId: String(venueTableId), userId: String(userId) },
        include: { venueTable: { include: { venue: true } } },
      });
      if (!member) return;
      if (member.status === 'CONFIRMED') return;
      const table = member.venueTable;
      const totalPaid = Number(amount || 0);
      const { secAmount, recipientAmount: venueAmount } = splitSecPlatform(totalPaid);

      const currentOccupancy = table.currentOccupancy + 1;
      const amountContributed = table.amountContributed + totalPaid;
      const nextStatus =
        currentOccupancy >= table.guestCapacity
          ? 'LOCKED'
          : (amountContributed >= table.minimumSpend ? 'PARTIALLY_FILLED' : 'AVAILABLE');

      await tx.venueTableMember.update({
        where: { id: member.id },
        data: {
          status: 'CONFIRMED',
          amountPaid: totalPaid,
          selectedMenuItems: metadata.selectedMenuItems || member.selectedMenuItems,
          paidAt: new Date(),
          paystackReference: reference,
        },
      });
      try {
        const { ensureVenueTableThread } = await import('./venueTableMessages.js');
        await ensureVenueTableThread(member.id);
      } catch (threadErr) {
        console.warn('ensureVenueTableThread after payment failed', threadErr?.message);
      }
      await tx.venueTable.update({
        where: { id: table.id },
        data: {
          amountContributed: { increment: totalPaid },
          currentOccupancy: { increment: 1 },
          status: nextStatus,
        },
      });
      await tx.splitPaymentLog.create({
        data: {
          venueTableId: table.id,
          memberId: member.id,
          totalAmount: totalPaid,
          secAmount,
          venueAmount,
          reference,
        },
      });

      const bookingMode = metadata.booking_mode || metadata.bookingMode;
      const isHostPayment = bookingMode === 'host' || bookingMode === 'custom_host' || member.memberRole === 'HOST';
      if (isHostPayment && table.eventId && !table.hostedTableId) {
        await ensureHostedTableFromVenueHostPayment({
          tx,
          venueTable: table,
          userId: String(userId),
          paystackReference: reference,
          amountTotal: totalPaid,
          selectedMenuItems: metadata.selectedMenuItems || member.selectedMenuItems,
          settlementMode: metadata.settlement_mode || member.settlementMode,
        });
      }

      const user = await tx.user.findUnique({
        where: { id: String(userId) },
        include: { userProfile: { select: { username: true } } },
      });
      const username = user?.userProfile?.username || user?.username || 'someone';
      await createInAppNotification({
        userId: table.venue.ownerUserId,
        type: 'TABLE_JOINED',
        title: isHostPayment ? 'New table host' : 'Venue table joined',
        body: isHostPayment
          ? `@${username} is now hosting ${table.tableName} (R${totalPaid.toFixed(2)} paid).`
          : `@${username} joined your table ${table.tableName} and contributed R${totalPaid.toFixed(2)}`,
        referenceId: table.id,
        referenceType: 'VENUE_TABLE',
      });
    });

    const bookingModeRepair = metadata.booking_mode || metadata.bookingMode;
    const memberForRepair = await prisma.venueTableMember.findFirst({
      where: {
        id: String(venueTableMemberId),
        venueTableId: String(venueTableId),
        userId: String(userId),
      },
    });
    const isHostRepair =
      bookingModeRepair === 'host' ||
      bookingModeRepair === 'custom_host' ||
      memberForRepair?.memberRole === 'HOST';
    if (isHostRepair && memberForRepair?.status === 'CONFIRMED') {
      const tableForRepair = await prisma.venueTable.findUnique({ where: { id: String(venueTableId) } });
      if (tableForRepair?.eventId && !tableForRepair.hostedTableId) {
        await prisma.$transaction(async (tx) => {
          const freshTable = await tx.venueTable.findUnique({ where: { id: String(venueTableId) } });
          if (freshTable?.eventId && !freshTable.hostedTableId) {
            await ensureHostedTableFromVenueHostPayment({
              tx,
              venueTable: freshTable,
              userId: String(userId),
              paystackReference: reference,
              amountTotal: Number(amount || 0),
              selectedMenuItems: metadata.selectedMenuItems || memberForRepair.selectedMenuItems,
              settlementMode: metadata.settlement_mode || memberForRepair.settlementMode,
            });
          }
        });
      }
    }

    const vtMember = await prisma.venueTableMember.findFirst({
      where: {
        id: String(venueTableMemberId),
        venueTableId: String(venueTableId),
        userId: String(userId),
      },
      include: {
        venueTable: {
          select: { id: true, tableName: true, eventId: true, hostUserId: true },
        },
      },
    });
    if (vtMember?.venueTable) {
      const vtEv = vtMember.venueTable.eventId
        ? await prisma.event.findFirst({
            where: { id: vtMember.venueTable.eventId },
            select: { title: true },
          })
        : null;
      const isHostRole =
        (metadata.booking_mode || metadata.bookingMode) === 'host' ||
        (metadata.booking_mode || metadata.bookingMode) === 'custom_host' ||
        vtMember.memberRole === 'HOST';
      recordTableHistory({
        userId: String(userId),
        role: isHostRole ? 'HOST' : 'JOINED',
        venueTableId: vtMember.venueTable.id,
        eventId: vtMember.venueTable.eventId || null,
        tableName: vtMember.venueTable.tableName,
        eventTitle: vtEv?.title || null,
      });
    }
    const bookingModePaid = metadata.booking_mode || metadata.bookingMode;
    const isHostPaymentPaid =
      bookingModePaid === 'host' ||
      bookingModePaid === 'custom_host' ||
      vtMember?.memberRole === 'HOST';
    const payerRow = await prisma.user.findUnique({
      where: { id: String(userId) },
      select: { email: true },
    });
    const payerEmail = payerRow?.email || email;
    if (isHostPaymentPaid) {
      await notifyPaymentSuccess({
        userId: String(userId),
        email: payerEmail,
        title: 'Table host payment confirmed',
        body: `You're now hosting ${vtMember?.venueTable?.tableName || 'your table'}. Open Host Dashboard to approve join requests and set table rules.`,
        actionUrl: '/HostDashboard?tab=tables&manage=1',
        referenceId: String(venueTableId),
        referenceType: 'VENUE_TABLE',
        emailSubject: `You're hosting ${vtMember?.venueTable?.tableName || 'your table'}`,
      });
    } else {
      await notifyPaymentSuccess({
        userId: String(userId),
        email: payerEmail,
        title: 'Table booking confirmed',
        body: `Your payment for ${vtMember?.venueTable?.tableName || 'your table'} was successful.`,
        actionUrl: `/TableDetails?id=${venueTableId}&source=venue`,
        referenceId: String(venueTableId),
        referenceType: 'VENUE_TABLE',
        emailSubject: `Booking confirmed — ${vtMember?.venueTable?.tableName || 'table'}`,
      });
    }

    const vt = await prisma.venueTable.findUnique({
      where: { id: String(venueTableId) },
      include: { event: true, venue: true },
    });
    if (vt && userId) {
      const member = await prisma.venueTableMember.findFirst({
        where: {
          id: String(venueTableMemberId),
          venueTableId: String(venueTableId),
          userId: String(userId),
        },
      });
      const vu = await prisma.user.findUnique({
        where: { id: String(userId) },
        select: { email: true, fullName: true, username: true, userProfile: { select: { username: true } } },
      });
      const visFallback = vt.event?.date
        ? visibleUntilForVenueTableMember(vt, vt.event)
        : visibleUntilAfterEventDate(new Date());
      const eventStartsAt = vt.event ? eventStartsAtFromEvent(vt.event) : null;
      const eventEndsAt = vt.event ? eventEndsAtFromEvent(vt.event) : null;
      const bookingMode = metadata.booking_mode || metadata.bookingMode;
      const settlementMode = metadata.settlement_mode || metadata.settlementMode || member?.settlementMode;
      const isHostMode = bookingMode === 'host' || bookingMode === 'custom_host' || member?.memberRole === 'HOST';
      const minSpendZar = isHostMode
        ? Number(vt.hostMinimumSpend ?? vt.minimumSpend ?? 0)
        : Number(vt.minimumSpend ?? 0);
      let menuResolved = null;
      const menuSel = metadata.selectedMenuItems || member?.selectedMenuItems;
      if (Array.isArray(menuSel) && menuSel.length && vt.venueId) {
        menuResolved = await resolveVenueMenuSelections(menuSel, vt.venueId);
      }
      const tableSpecsSummary = await buildVenueTableMemberTicketSummary(prisma, {
        member,
        table: vt,
        venue: vt.venue,
        bookingMode,
        settlementMode,
        minSpendZar,
        menuItemsResolved: menuResolved,
      });
      await issueTicketAndNotify(prisma, {
        userId: String(userId),
        email: vu?.email || email,
        paystackReference: reference,
        kind: 'VENUE_TABLE_JOIN',
        title: vt.event?.title ? `${vt.tableName} — ${vt.event.title}` : vt.tableName,
        subtitle: vt.venue?.name || null,
        visibleUntil: visFallback,
        venueTableId: vt.id,
        eventId: vt.eventId || null,
        quantity: 1,
        holderDisplayName: holderDisplayNameFromUser(vu),
        tableSpecsSummary,
        eventStartsAt,
        eventEndsAt,
      });
      const { secAmount: sAmt, recipientAmount: vAmt } = splitSecPlatform(Number(amount || 0));
      const venueCode = await resolveRecipientCodeForVenue(vt.venueId);
      await recordPayoutAndMaybeTransfer({
        paymentReference: reference,
        grossZar: Number(amount || 0),
        secAmount: sAmt,
        recipientAmount: vAmt,
        recipientType: 'VENUE',
        recipientVenueId: vt.venueId,
        recipientUserId: null,
        paystackRecipientCode: venueCode,
      });
    }
  }

  if (metadata.type === 'TABLE_HOST_FEE' && userId) {
    const hostedTableId = metadata.hosted_table_id || metadata.hostedTableId;
    if (hostedTableId) {
      const hosted = await prisma.hostedTable.findFirst({
        where: { id: String(hostedTableId), hostUserId: String(userId) },
        include: { event: { include: { venue: { select: { id: true, ownerUserId: true, name: true } } } } },
      });
      if (hosted && hosted.status === 'DRAFT' && !hosted.hostFeePaystackRef) {
        const entranceZar = Number(metadata.entrance_zar || 0);
        const hostFeeZar = Number(metadata.host_fee_zar || 0);
        const menuZar = Number(metadata.menu_zar ?? metadata.min_spend_zar ?? metadata.minSpendZar ?? 0) || 0;
        const minSpendZar = Number(metadata.min_spend_zar ?? 0) || 0;
        const expected = entranceZar + hostFeeZar + menuZar;
        const selectedMenuItems = metadata.selected_menu_items || metadata.selectedMenuItems || null;
        const tierIncludedItems = metadata.tier_included_items || metadata.tierIncludedItems || null;
        if (expected > 0 && Math.abs(Number(amount || 0) - expected) < 0.01) {
          const includedTotal = Array.isArray(tierIncludedItems?.items)
            ? tierIncludedItems.items.reduce(
                (s, i) => s + Number(i.price || 0) * Number(i.quantity || 0),
                0
              )
            : 0;
          const menuSpendTotal = Number((menuZar + includedTotal).toFixed(2));
          await prisma.hostedTable.update({
            where: { id: hosted.id },
            data: {
              status: 'ACTIVE',
              hostFeePaystackRef: reference,
              menuSpendTotal,
              ...(tierIncludedItems ? { tierIncludedItems } : {}),
            },
          });
          await ensureHostedTableLiveAfterListingPayment(hosted.id);
          const hostMem = await prisma.hostedTableMember.findFirst({
            where: { hostedTableId: hosted.id, userId: String(userId) },
          });
          if (hostMem) {
            await prisma.hostedTableMember.update({
              where: { id: hostMem.id },
              data: {
                selectedMenuItems: selectedMenuItems || hostMem.selectedMenuItems,
                menuSpendPaid: menuZar,
              },
            });
          }
          logFriendActivity({
            userId: String(userId),
            activityType: 'HOSTED_TABLE',
            referenceId: hosted.id,
            referenceType: 'HOSTED_TABLE',
            description: 'hosted a table',
          });
          recordTableHistory({
            userId: String(userId),
            role: 'HOST',
            hostedTableId: hosted.id,
            eventId: hosted.eventId || null,
            tableName: hosted.tableName,
            eventTitle: hosted.event?.title || null,
          });
          const venueCode = hosted.event?.venueId ? await resolveRecipientCodeForVenue(hosted.event.venueId) : null;
          if (hostFeeZar > 0) {
            await recordSecPlatformRevenue(`${reference}:hostfee`, hostFeeZar);
          }
          const venueShareZar = entranceZar + menuZar;
          if (venueShareZar > 0 && hosted.event?.venueId) {
            const { secAmount: secVenue, recipientAmount: venueTotal } = splitSecPlatform(venueShareZar);
            await recordPayoutAndMaybeTransfer({
              paymentReference: `${reference}:venue_share`,
              grossZar: venueShareZar,
              secAmount: secVenue,
              recipientAmount: venueTotal,
              recipientType: 'VENUE',
              recipientVenueId: hosted.event.venueId,
              recipientUserId: null,
              paystackRecipientCode: venueCode,
            });
          }
          const vis = hosted.event ? visibleUntilAfterEventDate(hosted.event.date) : visibleUntilAfterHostedTable(hosted);
          const eventStartsAt = hosted.event
            ? eventStartsAtFromEvent(hosted.event)
            : eventStartsAtFromHostedTable(hosted);
          const eventEndsAt = hosted.event ? eventEndsAtFromEvent(hosted.event) : null;
          const payer = await prisma.user.findUnique({
            where: { id: String(userId) },
            select: { email: true, fullName: true, username: true, userProfile: { select: { username: true } } },
          });
          const settlementMode = metadata.settlement_mode || metadata.settlementMode || null;
          let menuItemsForHost = selectedMenuItems;
          if (hosted.event?.venueId && Array.isArray(selectedMenuItems) && selectedMenuItems.length) {
            const resolved = await resolveVenueMenuSelections(selectedMenuItems, hosted.event.venueId);
            menuItemsForHost = resolved.items;
          }
          const hostTicketSummary = buildHostedTableHostTicketSummary({
            hostedTable: hosted,
            menuItems: menuItemsForHost,
            minSpendPrepaidZar: minSpendZar,
            settlementMode,
          });
          const hostPromoterId = promoterUserIdFromMetadata(metadata);
          await issueTicketAndNotify(prisma, {
            userId: String(userId),
            email: payer?.email || email,
            paystackReference: reference,
            kind: 'TABLE_HOST_FEE',
            title: `${hosted.tableName} — SEC host ticket`,
            subtitle: hosted.venueName,
            visibleUntil: vis,
            hostedTableId: hosted.id,
            eventId: hosted.eventId || null,
            quantity: 1,
            holderDisplayName: holderDisplayNameFromUser(payer),
            tableSpecsSummary: hostTicketSummary,
            eventStartsAt,
            eventEndsAt,
            promoterUserId: hostPromoterId,
          });
          await notifyPaymentSuccess({
            userId: String(userId),
            email: payer?.email || email,
            title: 'Hosted table payment confirmed',
            body: `Your payment for "${hosted.tableName}" was successful. Open Host Dashboard to manage join requests and table rules.`,
            actionUrl: '/HostDashboard?tab=tables&manage=1',
            referenceId: hosted.id,
            referenceType: 'HOSTED_TABLE',
            emailSubject: `Table host payment — ${hosted.tableName}`,
          });
          if (hosted.event?.venueId && hosted.eventId) {
            await recordEventVenueTableBooking({
              venueId: hosted.event.venueId,
              eventId: hosted.eventId,
              hostedTableId: hosted.id,
              userId: String(userId),
              role: 'HOST',
              paystackReference: reference,
              amountTotal: totalZar,
              entranceZar: entranceZar || 0,
              componentZar: (hostFeeZar || 0) + (menuZar || 0),
              selectedMenuItems: selectedMenuItems || undefined,
              hostingTierName: metadata.hosting_tier_name || tierIncludedItems?.tier_name || null,
              hostingCategory: metadata.hosting_category || hosted.hostingCategory || null,
              menuTotalZar: menuZar || null,
              promoterUserId: hostPromoterId,
            });
            await applyPromoterAttribution({
              metadata,
              eventId: hosted.eventId,
              buyerUserId: userId,
              conversionType: 'TABLE_HOST',
              amountZar: totalZar,
              reference,
            });
          }
          await refreshHostedTableTickets(prisma, hosted.id);
          if (hosted.event?.venue?.ownerUserId) {
            await createInAppNotification({
              userId: hosted.event.venue.ownerUserId,
              type: 'TABLE_JOINED',
              title: 'Hosted table live',
              body: `${hosted.tableName} — host payment completed for ${hosted.event?.title || 'your event'}.`,
              referenceId: hosted.eventId,
              referenceType: 'EVENT',
            });
          }
        }
      }
    } else {
      const dup = await prisma.table.findFirst({ where: { hostFeePaystackRef: reference, deletedAt: null } });
      if (!dup) {
        const raw = metadata.table_create || metadata.tableCreate;
        const parsed = tableCreateFromPaymentSchema.safeParse(raw);
        if (parsed.success) {
          const d = parsed.data;
          const category = d.table_category === 'vip' ? 'vip' : 'general';
          const event = await prisma.event.findFirst({
            where: { id: d.event_id, deletedAt: null },
            include: { venue: { select: { id: true, ownerUserId: true, name: true } } },
          });
          if (event && event.venueId === d.venue_id) {
            const hosting = normalizeHostingConfig(event.hostingConfig);
            const fee = hosting[category]?.host_table_fee_zar ?? null;
            const entranceZar = getEventEntranceZar(event);
            const expected = Number(fee || 0) + entranceZar;
            if (fee != null && fee > 0 && Math.abs(Number(amount) - expected) < 0.01) {
              const pref = normalizeGuestGenderPreference(d.guest_gender_preference);
              const created = await prisma.table.create({
                data: {
                  eventId: d.event_id,
                  venueId: d.venue_id,
                  hostUserId: String(userId),
                  name: d.name,
                  tableCategory: category,
                  maxGuests: d.max_guests,
                  minSpend: d.min_spend ?? null,
                  joiningFee: d.joining_fee ?? null,
                  isPublic: d.is_public !== undefined ? d.is_public : true,
                  guestGenderPreference: pref,
                  hostFeePaystackRef: reference,
                },
              });
              const venueCode = await resolveRecipientCodeForVenue(event.venueId);
              const hostCode = await resolveRecipientCodeForUser(String(userId));
              if (entranceZar > 0) {
                const { secAmount: sEnt, recipientAmount: rEnt } = splitSecPlatform(entranceZar);
                await recordPayoutAndMaybeTransfer({
                  paymentReference: `${reference}:entrance`,
                  grossZar: entranceZar,
                  secAmount: sEnt,
                  recipientAmount: rEnt,
                  recipientType: 'VENUE',
                  recipientVenueId: event.venueId,
                  recipientUserId: null,
                  paystackRecipientCode: venueCode,
                });
              }
              const { secAmount: sHost, recipientAmount: rHost } = splitSecPlatform(Number(fee || 0));
              await recordPayoutAndMaybeTransfer({
                paymentReference: `${reference}:hostfee`,
                grossZar: Number(fee || 0),
                secAmount: sHost,
                recipientAmount: rHost,
                recipientType: 'USER',
                recipientUserId: String(userId),
                recipientVenueId: null,
                paystackRecipientCode: hostCode,
              });
              const vis = visibleUntilAfterEventDate(event.date);
              const eventStartsAt = eventStartsAtFromEvent(event);
              const eventEndsAt = eventEndsAtFromEvent(event);
              const payer = await prisma.user.findUnique({
                where: { id: String(userId) },
                select: { email: true, fullName: true, username: true, userProfile: { select: { username: true } } },
              });
              await issueTicketAndNotify(prisma, {
                userId: String(userId),
                email: payer?.email || email,
                paystackReference: reference,
                kind: 'TABLE_HOST_FEE',
                title: `${created.name} — SEC host ticket`,
                subtitle: event.title,
                visibleUntil: vis,
                tableId: created.id,
                eventId: event.id,
                quantity: 1,
                holderDisplayName: holderDisplayNameFromUser(payer),
                tableSpecsSummary: formatSpecsFromTable(created),
                eventStartsAt,
                eventEndsAt,
              });
            }
          }
        }
      }
    }
  }

  if (metadata.type === 'HOSTED_TABLE_EXTERNAL_LISTING' && userId) {
    const htid = metadata.hosted_table_id || metadata.hostedTableId;
    if (htid) {
      const ht = await prisma.hostedTable.findFirst({ where: { id: String(htid), hostUserId: String(userId) } });
      if (ht && ht.tableType === 'EXTERNAL_VENUE' && ht.status === 'DRAFT') {
        if (Math.abs(Number(amount) - EXTERNAL_HOSTED_LISTING_ZAR) < 0.01) {
          await prisma.hostedTable.update({
            where: { id: ht.id },
            data: {
              status: 'ACTIVE',
              externalListingPaystackRef: reference,
            },
          });
          await ensureHostedTableLiveAfterListingPayment(ht.id);
          logFriendActivity({
            userId: String(userId),
            activityType: 'HOSTED_TABLE',
            referenceId: ht.id,
            referenceType: 'HOSTED_TABLE',
            description: 'hosted a table',
          });
          recordTableHistory({
            userId: String(userId),
            role: 'HOST',
            hostedTableId: ht.id,
            eventId: ht.eventId || null,
            tableName: ht.tableName,
            eventTitle: null,
          });
          const payer = await prisma.user.findUnique({
            where: { id: String(userId) },
            select: { email: true, fullName: true, username: true, userProfile: { select: { username: true } } },
          });
          const vis = visibleUntilAfterHostedTable(ht);
          const eventStartsAt = eventStartsAtFromHostedTable(ht);
          await issueTicketAndNotify(prisma, {
            userId: String(userId),
            email: payer?.email || email,
            paystackReference: reference,
            kind: 'EXTERNAL_HOSTED_LISTING',
            title: `External table listing — ${ht.tableName}`,
            subtitle: ht.venueName,
            visibleUntil: vis,
            hostedTableId: ht.id,
            quantity: 1,
            holderDisplayName: holderDisplayNameFromUser(payer),
            tableSpecsSummary: formatSpecsFromHostedTable(ht),
            eventStartsAt,
          });
          await recordSecPlatformRevenue(reference, Number(amount || EXTERNAL_HOSTED_LISTING_ZAR));
        }
      }
    }
  }

  if (metadata.type === 'HOUSE_PARTY_ENTRANCE' && userId) {
    const partyId = metadata.house_party_id || metadata.housePartyId;
    const attendeeId = metadata.attendee_id || metadata.attendeeId;
    if (partyId && attendeeId) {
      const att = await prisma.housePartyAttendee.findFirst({
        where: { id: String(attendeeId), housePartyId: String(partyId), userId: String(userId) },
        include: { houseParty: true },
      });
      if (att && att.paystackReference !== reference && att.houseParty.hasEntranceFee && att.houseParty.entranceFeeAmount) {
        if (Math.abs(Number(amount) - att.houseParty.entranceFeeAmount) < 0.01) {
          await prisma.$transaction(async (tx) => {
            const cur = await tx.housePartyAttendee.findUnique({ where: { id: att.id } });
            if (!cur || cur.paystackReference === reference) return;
            await tx.housePartyAttendee.update({
              where: { id: att.id },
              data: { status: 'GOING', paystackReference: reference },
            });
            if (cur.status !== 'GOING') {
              await tx.houseParty.update({
                where: { id: String(partyId) },
                data: { spotsRemaining: { decrement: 1 } },
              });
            }
          });
          const freshAtt = await prisma.housePartyAttendee.findUnique({
            where: { id: att.id },
            include: { houseParty: true },
          });
          if (freshAtt?.paystackReference === reference) {
            const { secAmount: sAmt, recipientAmount: rAmt } = splitSecPlatform(Number(amount || 0));
            const hostCode = await resolveRecipientCodeForUser(freshAtt.houseParty.hostUserId);
            await recordPayoutAndMaybeTransfer({
              paymentReference: reference,
              grossZar: Number(amount || 0),
              secAmount: sAmt,
              recipientAmount: rAmt,
              recipientType: 'USER',
              recipientUserId: freshAtt.houseParty.hostUserId,
              recipientVenueId: null,
              paystackRecipientCode: hostCode,
            });
            const payer = await prisma.user.findUnique({
              where: { id: String(userId) },
              select: { email: true, fullName: true, username: true, userProfile: { select: { username: true } } },
            });
            const vis = visibleUntilAfterParty(freshAtt.houseParty);
            const eventStartsAt = freshAtt.houseParty.startTime;
            const partySpecs = freshAtt.houseParty.location
              ? `Location: ${freshAtt.houseParty.location}`
              : null;
            await issueTicketAndNotify(prisma, {
              userId: String(userId),
              email: payer?.email || email,
              paystackReference: reference,
              kind: 'HOUSE_PARTY',
              title: freshAtt.houseParty.title,
              subtitle: 'House party ticket',
              visibleUntil: vis,
              housePartyId: freshAtt.houseParty.id,
              quantity: 1,
              holderDisplayName: holderDisplayNameFromUser(payer),
              tableSpecsSummary: partySpecs,
              eventStartsAt,
            });
            await createInAppNotification({
              userId: freshAtt.houseParty.hostUserId,
              type: 'EVENT_JOINED',
              title: 'Paid guest',
              body: `Someone purchased a ticket for your party "${freshAtt.houseParty.title}".`,
              referenceId: freshAtt.houseParty.id,
              referenceType: 'HOUSE_PARTY',
            });
          }
        }
      }
    }
  }

  if (metadata.type === 'HOSTED_TABLE_JOIN' && userId) {
    const htid = metadata.hosted_table_id || metadata.hostedTableId;
    const memberId = metadata.hosted_table_member_id || metadata.hostedTableMemberId;
    if (htid && memberId) {
      const member = await prisma.hostedTableMember.findFirst({
        where: { id: String(memberId), hostedTableId: String(htid), userId: String(userId) },
        include: { hostedTable: true },
      });
      const htEvent = member?.hostedTable?.eventId
        ? await prisma.event.findFirst({
            where: { id: member.hostedTable.eventId, deletedAt: null },
            select: {
              id: true,
              title: true,
              venueId: true,
              date: true,
              startTime: true,
              endsAt: true,
              hasEntranceFee: true,
              entranceFeeAmount: true,
              venue: { select: { ownerUserId: true, name: true } },
            },
          })
        : null;
      const entranceZar = Number(metadata.entrance_zar || getEventEntranceZar(htEvent));
      const joinZar = Number(metadata.join_zar ?? member?.hostedTable?.joiningFee ?? 0) || 0;
      const menuZar = Number(metadata.menu_zar || metadata.menu_total_zar || 0) || 0;
      const expected = entranceZar + joinZar + menuZar;
      if (
        member &&
        member.paystackReference !== reference &&
        expected > 0 &&
        Math.abs(Number(amount) - expected) < 0.01
      ) {
          await prisma.$transaction(async (tx) => {
            const htRow = await tx.hostedTable.findUnique({ where: { id: String(htid) } });
            const mem = await tx.hostedTableMember.findUnique({ where: { id: member.id } });
            if (!htRow || !mem || mem.paystackReference === reference || htRow.spotsRemaining <= 0) return;
            await tx.hostedTableMember.update({
              where: { id: member.id },
              data: {
                status: 'GOING',
                paystackReference: reference,
                joinFeePaid: joinZar,
                hostReviewedAt: new Date(),
                ...(Array.isArray(metadata.selected_menu_items) && metadata.selected_menu_items.length
                  ? { selectedMenuItems: metadata.selected_menu_items }
                  : {}),
              },
            });
            const nextSpots = htRow.spotsRemaining - 1;
            await tx.hostedTable.update({
              where: { id: htRow.id },
              data: {
                spotsRemaining: { decrement: 1 },
                ...(nextSpots <= 0 ? { status: 'FULL' } : {}),
              },
            });
            await reconcileTableInvitesOnJoin(tx, htRow.id, String(userId));
          });
          const memFresh = await prisma.hostedTableMember.findUnique({
            where: { id: String(memberId) },
            include: { hostedTable: true },
          });
          if (memFresh?.paystackReference === reference) {
            const htFinal = memFresh.hostedTable;
            const hostCode = joinZar > 0 ? await resolveRecipientCodeForUser(htFinal.hostUserId) : null;
            if (entranceZar > 0 && htEvent?.venueId) {
              const venueCode = await resolveRecipientCodeForVenue(htEvent.venueId);
              const { secAmount: sEnt, recipientAmount: rEnt } = splitSecPlatform(entranceZar);
              await recordPayoutAndMaybeTransfer({
                paymentReference: `${reference}:entrance`,
                grossZar: entranceZar,
                secAmount: sEnt,
                recipientAmount: rEnt,
                recipientType: 'VENUE',
                recipientUserId: null,
                recipientVenueId: htEvent.venueId,
                paystackRecipientCode: venueCode,
              });
            }
            if (joinZar > 0 && hostCode) {
              const { secAmount: sAmt, recipientAmount: rAmt } = splitSecPlatform(joinZar);
              await recordPayoutAndMaybeTransfer({
                paymentReference: `${reference}:join`,
                grossZar: joinZar,
                secAmount: sAmt,
                recipientAmount: rAmt,
                recipientType: 'USER',
                recipientUserId: htFinal.hostUserId,
                recipientVenueId: null,
                paystackRecipientCode: hostCode,
              });
            }
            const payer = await prisma.user.findUnique({
              where: { id: String(userId) },
              select: { email: true, fullName: true, username: true, userProfile: { select: { username: true } } },
            });
            const hostUser = await prisma.user.findUnique({
              where: { id: htFinal.hostUserId },
              select: { fullName: true, username: true, userProfile: { select: { username: true } } },
            });
            const vis = visibleUntilAfterHostedTable(htFinal);
            const eventStartsAt =
              (htEvent && eventStartsAtFromEvent(htEvent)) || eventStartsAtFromHostedTable(htFinal);
            const eventEndsAt = htEvent ? eventEndsAtFromEvent(htEvent) : null;
            const joinMenuItems = Array.isArray(metadata.selected_menu_items)
              ? metadata.selected_menu_items
              : Array.isArray(metadata.selectedMenuItems)
                ? metadata.selectedMenuItems
                : [];
            const joinSummary = buildHostedTableJoinTicketSummary({
              hostedTable: htFinal,
              hostUser,
              entranceZar,
              joinZar,
              menuItems: joinMenuItems,
            });
            const joinPromoterId = promoterUserIdFromMetadata(metadata);
            await issueTicketAndNotify(prisma, {
              userId: String(userId),
              email: payer?.email || email,
              paystackReference: reference,
              kind: 'HOSTED_TABLE_JOIN',
              title: `${htFinal.tableName} — Join ticket`,
              subtitle: htFinal.venueName,
              visibleUntil: vis,
              hostedTableId: htFinal.id,
              eventId: htEvent?.id || null,
              quantity: 1,
              holderDisplayName: holderDisplayNameFromUser(payer),
              tableSpecsSummary: joinSummary,
              eventStartsAt,
              eventEndsAt,
              promoterUserId: joinPromoterId,
            });
            if (htEvent?.venueId && htEvent?.id) {
              await recordEventVenueTableBooking({
                venueId: htEvent.venueId,
                eventId: htEvent.id,
                hostedTableId: htFinal.id,
                userId: String(userId),
                role: 'GUEST',
                paystackReference: reference,
                amountTotal: Number(amount || 0),
                entranceZar,
                componentZar: joinZar,
                promoterUserId: joinPromoterId,
              });
              await applyPromoterAttribution({
                metadata,
                eventId: htEvent.id,
                buyerUserId: userId,
                conversionType: 'TABLE_JOIN',
                amountZar: amount,
                reference,
              });
            }
            const payerName = payer?.fullName || payer?.username || 'A guest';
            await addUserToHostedTableGroupChat(htFinal.id, String(userId));
            if (htEvent?.venue?.ownerUserId) {
              await createInAppNotification({
                userId: htEvent.venue.ownerUserId,
                type: 'TABLE_JOINED',
                title: 'Hosted table guest paid',
                body: `${payerName} joined "${htFinal.tableName}" after successful payment.`,
                referenceId: htEvent.id,
                referenceType: 'EVENT',
              });
            }
            if (htFinal.hostUserId && String(htFinal.hostUserId) !== String(userId)) {
              await createInAppNotification({
                userId: htFinal.hostUserId,
                type: 'TABLE_JOINED',
                title: 'Guest joined your table',
                body: `${payerName} completed payment and is going to "${htFinal.tableName}".`,
                referenceId: htFinal.id,
                referenceType: 'HOSTED_TABLE',
              });
            }
            recordTableHistory({
              userId: String(userId),
              role: 'JOINED',
              hostedTableId: htFinal.id,
              eventId: htEvent?.id || htFinal.eventId || null,
              tableName: htFinal.tableName,
              eventTitle: htEvent?.title || null,
            });
          }
        }
      }
    }

  const tableId = metadata.table_id;
  if (tableId && userId && metadata.type !== 'TABLE_HOST_FEE') {
    const table = await prisma.table.findFirst({
      where: { id: tableId, deletedAt: null },
      include: { venue: { select: { ownerUserId: true, name: true } } },
    });
    if (table) {
      const members = Array.isArray(table.members) ? [...table.members] : [];
      const memberIdx = members.findIndex((m) => m?.user_id === userId);
      const contribution = amount || (memberIdx >= 0 ? members[memberIdx]?.contribution : 0) || table.joiningFee || 0;
      if (memberIdx >= 0) {
        members[memberIdx] = { ...members[memberIdx], status: 'confirmed', contribution };
      } else {
        members.push({ user_id: userId, status: 'confirmed', contribution, joined_at: new Date().toISOString() });
      }
      const pendingRequests = Array.isArray(table.pendingRequests) ? table.pendingRequests.filter((id) => id !== userId) : [];
      const updated = await prisma.table.update({
        where: { id: tableId },
        data: {
          members,
          pendingRequests,
          currentGuests: members.length,
        },
      });

      const payer = await prisma.user.findUnique({ where: { id: userId }, select: { fullName: true } });
      const payerName = payer?.fullName || 'Someone';

      await createNotifications({
        userIds: [table.hostUserId, table.venue?.ownerUserId],
        type: 'payment',
        title: 'Table payment confirmed',
        body: `${payerName} completed payment to join "${table.name}".`,
        actionUrl: `/ManageTable?id=${tableId}`,
      });

      await createNotification({
        userId,
        type: 'payment',
        title: 'Payment confirmed',
        body: `Your payment for "${table.name}" was confirmed.`,
        actionUrl: `/TableDetails?id=${tableId}`,
      });

      logFriendActivity({
        userId,
        activityType: 'JOINED_TABLE',
        referenceId: tableId,
        referenceType: 'TABLE',
        description: 'joined a table',
      });
      const joinEv = table.eventId
        ? await prisma.event.findFirst({ where: { id: table.eventId }, select: { title: true } })
        : null;
      recordTableHistory({
        userId,
        role: 'JOINED',
        tableId,
        eventId: table.eventId,
        tableName: table.name,
        eventTitle: joinEv?.title || null,
      });
      await upsertConfirmedAttendance(userId, table.eventId);

      if (updated.status === 'full') {
        await createNotifications({
          userIds: [table.hostUserId, table.venue?.ownerUserId],
          type: 'table_full',
          title: 'Table is fully booked',
          body: `"${table.name}" has reached max capacity.`,
          actionUrl: `/ManageTable?id=${tableId}`,
        });
      }

      const { secAmount: tSec, recipientAmount: tRec } = splitSecPlatform(Number(amount || 0));
      const hostPayCode = await resolveRecipientCodeForUser(table.hostUserId);
      await recordPayoutAndMaybeTransfer({
        paymentReference: reference,
        grossZar: Number(amount || 0),
        secAmount: tSec,
        recipientAmount: tRec,
        recipientType: 'USER',
        recipientUserId: table.hostUserId,
        recipientVenueId: null,
        paystackRecipientCode: hostPayCode,
      });
      const evRow = await prisma.event.findFirst({ where: { id: table.eventId, deletedAt: null } });
      const visT = evRow ? eventEndsAtFromEvent(evRow) || visibleUntilAfterEventDate(evRow.date) : new Date(Date.now() + 48 * 60 * 60 * 1000);
      const eventStartsAt = evRow ? eventStartsAtFromEvent(evRow) : null;
      const eventEndsAt = evRow ? eventEndsAtFromEvent(evRow) : null;
      const payerU = await prisma.user.findUnique({
        where: { id: String(userId) },
        select: { email: true, fullName: true, username: true, userProfile: { select: { username: true } } },
      });
      await issueTicketAndNotify(prisma, {
        userId: String(userId),
        email: payerU?.email || email,
        paystackReference: reference,
        kind: 'TABLE_JOIN',
        title: evRow?.title ? `${table.name} — ${evRow.title}` : table.name,
        subtitle: 'Table ticket',
        visibleUntil: visT,
        tableId,
        eventId: table.eventId,
        quantity: 1,
        holderDisplayName: holderDisplayNameFromUser(payerU),
        tableSpecsSummary: formatSpecsFromTable(table),
        eventStartsAt,
        eventEndsAt,
      });
    }
  }

  if (
    userId &&
    (type === 'ticket' || type === 'event') &&
    (metadata.ticket_tier_name || metadata.ticketTierName)
  ) {
    await issueEventTicketsFromPayment(prisma, {
      reference,
      userId,
      email,
      amount,
      metadata,
    });
  }

  const payType = PAYMENT_TYPES.includes(type) ? type : 'other';
  const refreshedPay = await prisma.payment.findUnique({
    where: { reference },
    select: { metadata: true },
  });
  const rawFinalMeta =
    refreshedPay?.metadata && typeof refreshedPay.metadata === 'object' ? refreshedPay.metadata : metadata;
  const { side_effects_processing: _sp, side_effects_processing_at: _spa, ...finalMetaBase } = rawFinalMeta;
  const fulfillmentComplete = await isPaymentFulfillmentComplete(reference, {
    ...finalMetaBase,
    type: finalMetaBase.type || type,
  });
  const finalMeta = {
    ...finalMetaBase,
    side_effects_applied: fulfillmentComplete,
    side_effects_processing: false,
  };
  const pmUp = await prisma.payment.updateMany({
    where: { reference },
    data: {
      status: 'success',
      amount,
      type: payType,
      metadata: finalMeta,
    },
  });
  if (pmUp.count === 0) {
    await prisma.payment.create({
      data: {
        userId: userId || priorPay.userId || 'unknown',
        email,
        amount,
        reference,
        status: 'success',
        type: payType,
        metadata: finalMeta,
      },
    });
  }
  } catch (sideEffectErr) {
    console.error('applyReferenceSideEffects failed:', sideEffectErr?.message);
    await prisma.payment.updateMany({
      where: { reference },
      data: {
        status: 'success',
        metadata: {
          ...metadata,
          side_effects_applied: false,
          side_effects_processing: false,
          side_effects_error: String(sideEffectErr?.message || sideEffectErr).slice(0, 500),
        },
      },
    });
  }
}

async function runPaymentRepairPaths(reference, paystackData) {
  await ensureEventTicketsForPayment(reference, paystackData).catch((e) => {
    console.warn('ensureEventTicketsForPayment repair failed', e?.message);
  });
  await ensureVenueTableFulfillmentForPayment(reference, paystackData).catch((e) => {
    console.warn('ensureVenueTableFulfillmentForPayment repair failed', e?.message);
  });
  await finalizePaymentIfFulfilled(reference, paystackData);
}

async function isPaymentFulfillmentComplete(reference, paidMeta) {
  if (paidMeta.side_effects_applied) return true;

  const type = paidMeta.type || '';
  if (
    (type === 'ticket' || type === 'event') &&
    (paidMeta.ticket_tier_name || paidMeta.ticketTierName)
  ) {
    const qty = Math.max(1, parseInt(String(paidMeta.quantity || '1'), 10) || 1);
    const refs =
      qty <= 1
        ? [reference]
        : Array.from({ length: qty }, (_, i) => `${reference}-${i + 1}`);
    const count = await prisma.ticket.count({ where: { paystackReference: { in: refs } } });
    return count >= qty;
  }

  if (type === 'TABLE_CHECKOUT' || type === 'VENUE_TABLE_JOIN') {
    const memberId = paidMeta.venueTableMemberId || paidMeta.venue_table_member_id;
    if (!memberId) return false;
    const member = await prisma.venueTableMember.findUnique({ where: { id: String(memberId) } });
    if (member?.status !== 'CONFIRMED') return false;
    const ticket = await prisma.ticket.findUnique({ where: { paystackReference: reference } });
    return Boolean(ticket);
  }

  if (type === 'TABLE_HOST_FEE' || type === 'HOSTED_TABLE_JOIN') {
    const ticket = await prisma.ticket.findUnique({ where: { paystackReference: reference } });
    return Boolean(ticket);
  }

  return Boolean(paidMeta.side_effects_applied);
}

async function buildPaymentVerifyResponse(reference, paystackStatus) {
  const mapped =
    paystackStatus === 'success' ? 'paid' : paystackStatus === 'failed' ? 'failed' : 'pending';
  if (mapped !== 'paid') {
    return { status: mapped, paystack_status: paystackStatus };
  }

  const paidRow = await prisma.payment.findUnique({
    where: { reference },
    select: { metadata: true, type: true },
  });
  const paidMeta = flattenPaymentMetadata(paidRow?.metadata);
  const fulfillmentApplied = await isPaymentFulfillmentComplete(reference, paidMeta);
  const responseStatus = fulfillmentApplied ? 'paid' : 'processing';

  return {
    status: responseStatus,
    paystack_status: paystackStatus,
    fulfillment: {
      applied: fulfillmentApplied,
      error: paidMeta.side_effects_error || null,
    },
    payment_type: paidMeta.type || paidRow?.type || null,
  };
}

async function assertPaymentOwnership(reference, userId) {
  const payment = await prisma.payment.findUnique({
    where: { reference },
    select: { userId: true },
  });
  if (!payment) return { ok: false, code: 404, error: 'Payment reference not found' };
  if (!payment.userId || String(payment.userId) !== String(userId)) {
    return { ok: false, code: 403, error: 'Not authorized to verify this payment' };
  }
  return { ok: true };
}

/** Paystack charge.failed: mark Payment/Transaction failed and notify payer, venue, and table host when applicable. */
async function applyChargeFailedEffects(reference, payload) {
  const data = payload?.data || {};
  const metaFromCharge = data.metadata && typeof data.metadata === 'object' ? data.metadata : {};
  const prior = await prisma.payment.findUnique({
    where: { reference },
    select: { metadata: true, userId: true },
  });
  const priorMeta = prior?.metadata && typeof prior.metadata === 'object' ? prior.metadata : {};
  const mergedMeta = {
    ...priorMeta,
    ...metaFromCharge,
    charge_failed: {
      message: data.gateway_response || data.message || 'Payment failed',
      at: new Date().toISOString(),
    },
  };
  await prisma.payment.updateMany({
    where: { reference },
    data: { status: 'failed', metadata: mergedMeta },
  });
  await prisma.transaction.updateMany({
    where: { stripeId: reference },
    data: { status: 'failed', metadata: data },
  });

  const userId = String(metaFromCharge.user_id || prior?.userId || mergedMeta.user_id || '').trim();
  const ptype = metaFromCharge.type || mergedMeta.type;
  const failReason =
    data.gateway_response || data.message || 'Your bank or card issuer declined the payment.';

  if (userId) {
    await createNotification({
      userId,
      type: 'system',
      title: 'Payment did not go through',
      body: `${failReason} Try again or use another card. If this keeps happening, contact support.`,
      actionUrl: '/HostDashboard',
    });
    const failRefId = metaFromCharge.hosted_table_id || metaFromCharge.hostedTableId;
    await createInAppNotification({
      userId,
      type: 'TABLE_JOINED',
      title: 'Payment failed',
      body: failReason,
      referenceId: failRefId ? String(failRefId) : null,
      referenceType: failRefId ? 'HOSTED_TABLE' : null,
    });
  }

  if (ptype === 'TABLE_HOST_FEE') {
    const htid = metaFromCharge.hosted_table_id || metaFromCharge.hostedTableId;
    if (htid) {
      const ht = await prisma.hostedTable.findFirst({
        where: { id: String(htid) },
        include: { event: { include: { venue: { select: { ownerUserId: true } } } } },
      });
      const ownerId = ht?.event?.venue?.ownerUserId;
      if (ownerId && ht?.tableName) {
        await createNotification({
          userId: ownerId,
          type: 'system',
          title: 'Hosted table payment failed',
          body: `A host listing payment for "${ht.tableName}" did not complete. No card data is stored.`,
          actionUrl: '/BusinessBookings',
        });
      }
      if (
        ht?.status === 'DRAFT' &&
        ((ht.tableType === 'IN_APP_EVENT' && !ht.hostFeePaystackRef) ||
          (ht.tableType === 'EXTERNAL_VENUE' && !ht.externalListingPaystackRef))
      ) {
        await prisma.hostedTable.delete({ where: { id: ht.id } });
      }
    }
  }

  if (ptype === 'HOSTED_TABLE_JOIN') {
    const memberId = metaFromCharge.hosted_table_member_id || metaFromCharge.hostedTableMemberId;
    if (memberId) {
      const mem = await prisma.hostedTableMember.findUnique({ where: { id: String(memberId) } });
      if (mem?.status === 'PENDING' && !mem.paystackReference && !mem.hostReviewedAt) {
        await prisma.hostedTableMember.delete({ where: { id: mem.id } }).catch(() => {});
      }
    }
    const htid = metaFromCharge.hosted_table_id || metaFromCharge.hostedTableId;
    if (htid) {
      const ht = await prisma.hostedTable.findFirst({
        where: { id: String(htid) },
        include: { event: { include: { venue: { select: { ownerUserId: true } } } } },
      });
      const ownerId = ht?.event?.venue?.ownerUserId;
      if (ownerId) {
        await createNotification({
          userId: ownerId,
          type: 'system',
          title: 'Table join payment failed',
          body: `A guest payment to join "${ht?.tableName || 'a hosted table'}" was not completed.`,
          actionUrl: '/BusinessBookings',
        });
      }
      if (ht?.hostUserId && String(ht.hostUserId) !== userId) {
        await createNotification({
          userId: ht.hostUserId,
          type: 'system',
          title: 'Join payment incomplete',
          body: `A payment to join your table "${ht.tableName}" did not succeed. The guest can try again.`,
          actionUrl: '/HostDashboard',
        });
      }
    }
  }
}

const initSchema = z.object({
  amount: z.number().positive().max(1_000_000),
  email: z.string().email().optional(),
  description: z.string().max(2000).optional().nullable(),
  /** Venue/event IDs may be UUID or Cuid depending on DB row; do not over-restrict. */
  venue_id: z.union([z.string().min(1).max(64), z.null()]).optional(),
  event_id: z.union([z.string().min(1).max(64), z.null()]).optional(),
  metadata: z.record(z.any()).optional().nullable(),
});

const payoutRecipientSchema = z.object({
  holder_type: z.enum(['USER', 'VENUE']),
  venue_id: z.string().optional().nullable(),
  account_name: z.string().min(2).max(120),
  account_number: z.string().min(6).max(20),
  bank_code: z.string().min(2).max(20),
  currency: z.string().default('ZAR'),
});

// GET /api/payments/paystack-public-key — no auth; SPA inline checkout when VITE_PAYSTACK_PUBLIC_KEY is unset
router.get('/paystack-public-key', (_req, res) => {
  const pk = getPaystackPublicKeyForClient();
  if (!pk || !pk.startsWith('pk_')) {
    return res.status(503).json({
      error:
        'Paystack public key is not configured on the API. Set PAYSTACK_PUBLIC_KEY (pk_test_… or pk_live_…) in the backend environment next to PAYSTACK_SECRET_KEY.',
    });
  }
  res.set('Cache-Control', 'public, max-age=300');
  res.json({ public_key: pk });
});

router.post('/payout-recipient', authenticateToken, async (req, res, next) => {
  try {
    const parsed = payoutRecipientSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    const d = parsed.data;

    let recipientUserId = req.userId;
    let recipientVenueId = null;
    if (d.holder_type === 'VENUE') {
      if (!d.venue_id) return res.status(400).json({ error: 'venue_id is required for venue payout setup' });
      const venue = await prisma.venue.findFirst({
        where: { id: String(d.venue_id), deletedAt: null },
        select: { id: true, ownerUserId: true },
      });
      if (!venue) return res.status(404).json({ error: 'Venue not found' });
      if (venue.ownerUserId !== req.userId) return res.status(403).json({ error: 'Not authorized for this venue' });
      recipientVenueId = venue.id;
      recipientUserId = null;
    }

    const recipientResp = await paystackFetch('/transferrecipient', {
      method: 'POST',
      body: {
        type: 'nuban',
        name: d.account_name,
        account_number: d.account_number,
        bank_code: d.bank_code,
        currency: d.currency || 'ZAR',
      },
    });
    const recipientCode = recipientResp?.data?.recipient_code;
    if (!recipientCode) return res.status(502).json({ error: 'Paystack did not return a recipient code' });

    if (d.holder_type === 'VENUE') {
      await prisma.venue.update({
        where: { id: recipientVenueId },
        data: { paystackRecipientCode: recipientCode },
      });
    } else {
      await prisma.user.update({
        where: { id: req.userId },
        data: { paystackRecipientCode: recipientCode },
      });
      await prisma.userProfile.upsert({
        where: { userId: req.userId },
        create: { userId: req.userId, paymentSetupComplete: true },
        update: { paymentSetupComplete: true },
      });
    }

    return res.json({
      success: true,
      holder_type: d.holder_type,
      recipient_code: recipientCode,
      recipient_name: recipientResp?.data?.name || d.account_name,
      details: recipientResp?.data?.details || null,
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/payments/initialize — primary endpoint (spec-compliant)
router.post('/initialize', authenticateToken, async (req, res, next) => {
  try {
    const parsed = initSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    const d = parsed.data;

    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { email: true },
    });
    const email = d.email || user?.email || 'user@secnightlife.app';

    const amountInCents = Math.round(d.amount * 100);
    const reference = crypto.randomBytes(16).toString('hex');
    let meta = { ...(d.metadata || {}) };
    const type = meta.type || (d.venue_id && meta.promotion_id ? 'promotion' : d.event_id ? 'event' : 'table') || 'other';

    if (type === 'ticket') {
      const computed = await computeTicketCheckout(prisma, {
        eventId: meta.event_id,
        ticketTierName: meta.ticket_tier_name,
        quantity: meta.quantity || 1,
        selectedMenuItems: parseTicketMenuItems(meta),
      });
      if (!computed.ok) return res.status(400).json({ error: computed.error });
      if (Math.abs(Number(d.amount) - computed.total) >= 0.02) {
        return res.status(400).json({
          error: 'Payment amount does not match checkout total.',
          expected_zar: computed.total,
        });
      }
      meta = buildTicketPaymentMetadata(meta, computed);
    } else if (['table', 'VENUE_TABLE_JOIN', 'TABLE_CHECKOUT', 'HOSTED_TABLE_JOIN', 'TABLE_HOST_FEE'].includes(type)) {
      const expected = expectedTotalFromMetadata(meta);
      if (expected > 0 && Math.abs(Number(d.amount) - expected) >= 0.02) {
        return res.status(400).json({
          error: 'Payment amount does not match checkout total.',
          expected_zar: expected,
        });
      }
    }

    if (type === 'table' && !(await userHasIdentityVerified(req.userId))) {
      return res.status(403).json({
        error: 'Identity verification required to pay for table bookings.',
        code: 'IDENTITY_NOT_VERIFIED',
      });
    }

    if (type === 'ticket' || type === 'event') {
      await abandonSupersededPendingPayments(prisma, {
        userId: req.userId,
        paymentType: PAYMENT_TYPES.includes(type) ? type : 'ticket',
        eventId: meta.event_id || meta.eventId || d.event_id || null,
        ticketTier: meta.ticket_tier_name || meta.ticketTierName || null,
      });
    }

    // Create Payment (pending)
    await prisma.payment.create({
      data: {
        userId: req.userId,
        email,
        amount: d.amount,
        reference,
        status: 'pending',
        type: PAYMENT_TYPES.includes(type) ? type : 'other',
        metadata: { description: d.description, venue_id: d.venue_id, event_id: d.event_id, ...meta },
      },
    });

    // Legacy Transaction for backward compat
    await prisma.transaction.create({
      data: {
        userId: req.userId,
        venueId: d.venue_id || null,
        eventId: d.event_id || null,
        amount: d.amount,
        currency: 'ZAR',
        type: 'paystack',
        status: 'pending',
        stripeId: reference,
        metadata: { provider: 'paystack', reference, description: d.description, ...meta },
      },
    });

    const paystackResp = await paystackFetch('/transaction/initialize', {
      method: 'POST',
      body: buildPaystackInitializeBody({
        email,
        amountInCents,
        reference,
        userId: req.userId,
        metadata: { type, description: d.description, ...meta },
      }),
    });

    res.json({
      reference,
      authorization_url: paystackResp.data.authorization_url,
      access_code: paystackResp.data.access_code,
    });
  } catch (err) {
    next(err);
  }
});

// Backward compat: /paystack/initialize
router.post('/paystack/initialize', authenticateToken, async (req, res, next) => {
  try {
    const parsed = initSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    const d = parsed.data;
    const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { email: true } });
    const email = d.email || user?.email || 'user@secnightlife.app';
    const amountInCents = Math.round(d.amount * 100);
    const reference = crypto.randomBytes(16).toString('hex');
    let meta = { ...(d.metadata || {}) };
    const type = meta.type || (meta.promotion_id ? 'promotion' : d.event_id ? 'event' : 'table') || 'other';
    if (type === 'ticket') {
      const computed = await computeTicketCheckout(prisma, {
        eventId: meta.event_id,
        ticketTierName: meta.ticket_tier_name,
        quantity: meta.quantity || 1,
        selectedMenuItems: parseTicketMenuItems(meta),
      });
      if (!computed.ok) return res.status(400).json({ error: computed.error });
      if (Math.abs(Number(d.amount) - computed.total) >= 0.02) {
        return res.status(400).json({
          error: 'Payment amount does not match checkout total.',
          expected_zar: computed.total,
        });
      }
      meta = buildTicketPaymentMetadata(meta, computed);
    } else if (['table', 'VENUE_TABLE_JOIN', 'TABLE_CHECKOUT', 'HOSTED_TABLE_JOIN', 'TABLE_HOST_FEE'].includes(type)) {
      const expected = expectedTotalFromMetadata(meta);
      if (expected > 0 && Math.abs(Number(d.amount) - expected) >= 0.02) {
        return res.status(400).json({
          error: 'Payment amount does not match checkout total.',
          expected_zar: expected,
        });
      }
    }
    if (type === 'table' && !(await userHasIdentityVerified(req.userId))) {
      return res.status(403).json({
        error: 'Identity verification required to pay for table bookings.',
        code: 'IDENTITY_NOT_VERIFIED',
      });
    }
    if (type === 'ticket' || type === 'event') {
      await abandonSupersededPendingPayments(prisma, {
        userId: req.userId,
        paymentType: PAYMENT_TYPES.includes(type) ? type : 'ticket',
        eventId: meta.event_id || meta.eventId || d.event_id || null,
        ticketTier: meta.ticket_tier_name || meta.ticketTierName || null,
      });
    }
    await prisma.payment.create({
      data: { userId: req.userId, email, amount: d.amount, reference, status: 'pending', type: PAYMENT_TYPES.includes(type) ? type : 'other', metadata: { description: d.description, venue_id: d.venue_id, event_id: d.event_id, ...meta } },
    });
    await prisma.transaction.create({
      data: { userId: req.userId, venueId: d.venue_id || null, eventId: d.event_id || null, amount: d.amount, currency: 'ZAR', type: 'paystack', status: 'pending', stripeId: reference, metadata: { provider: 'paystack', reference, description: d.description, ...meta } },
    });
    const paystackResp = await paystackFetch('/transaction/initialize', {
      method: 'POST',
      body: buildPaystackInitializeBody({
        email,
        amountInCents,
        reference,
        userId: req.userId,
        metadata: { type, description: d.description, ...meta },
      }),
    });
    res.json({ reference, authorization_url: paystackResp.data.authorization_url, access_code: paystackResp.data.access_code });
  } catch (err) {
    next(err);
  }
});

// GET /api/payments/verify/:reference — primary (spec-compliant)
router.get('/verify/:reference', authenticateToken, async (req, res, next) => {
  try {
    const reference = req.params.reference;
    const ownership = await assertPaymentOwnership(reference, req.userId);
    if (!ownership.ok) return res.status(ownership.code).json({ error: ownership.error });
    const paystackResp = await paystackFetch(`/transaction/verify/${encodeURIComponent(reference)}`);
    const status = paystackResp.data.status;
    const mapped = status === 'success' ? 'paid' : status === 'failed' ? 'failed' : 'pending';

    // Update Transaction
    await prisma.transaction.updateMany({
      where: { userId: req.userId, stripeId: reference },
      data: { status: mapped, metadata: paystackResp.data },
    });

    if (mapped === 'paid') {
      await applyReferenceSideEffects(reference, paystackResp.data);
      await runPaymentRepairPaths(reference, paystackResp.data);
      const paidRow = await prisma.payment.findUnique({
        where: { reference },
        select: { metadata: true, type: true, userId: true, email: true },
      });
      const paidMeta = flattenPaymentMetadata(paidRow?.metadata);
      const paidPromoId = resolvePromotionIdFromMetadata(paidMeta);
      if (paidPromoId && isPromotionPublishPayment(paidMeta, paidRow?.type)) {
        await activatePromotionAfterPublishPayment({
          promoId: paidPromoId,
          metadata: paidMeta,
          reference,
          payerUserId: paidRow?.userId || req.userId,
          payerEmail: paidRow?.email,
          sendNotification: false,
        });
      }
    } else {
      const existing = await prisma.payment.findUnique({
        where: { reference },
        select: { metadata: true },
      });
      const mergedMeta = mergePaymentMetadataFromVerify(
        flattenPaymentMetadata(existing?.metadata),
        paystackResp.data,
      );
      await prisma.payment.updateMany({
        where: { reference },
        data: { status: mapped, metadata: mergedMeta },
      });
    }

    res.json(await buildPaymentVerifyResponse(reference, status));
  } catch (err) {
    next(err);
  }
});

// Backward compat: /paystack/verify/:reference
router.get('/paystack/verify/:reference', authenticateToken, async (req, res, next) => {
  try {
    const reference = req.params.reference;
    const ownership = await assertPaymentOwnership(reference, req.userId);
    if (!ownership.ok) return res.status(ownership.code).json({ error: ownership.error });
    const paystackResp = await paystackFetch(`/transaction/verify/${encodeURIComponent(reference)}`);
    const status = paystackResp.data.status;
    const mapped = status === 'success' ? 'paid' : status === 'failed' ? 'failed' : 'pending';
    await prisma.transaction.updateMany({ where: { userId: req.userId, stripeId: reference }, data: { status: mapped, metadata: paystackResp.data } });
    if (mapped === 'paid') {
      await applyReferenceSideEffects(reference, paystackResp.data);
      await runPaymentRepairPaths(reference, paystackResp.data);
      const paidRow = await prisma.payment.findUnique({
        where: { reference },
        select: { metadata: true, type: true, userId: true, email: true },
      });
      const paidMeta = flattenPaymentMetadata(paidRow?.metadata);
      const paidPromoId = resolvePromotionIdFromMetadata(paidMeta);
      if (paidPromoId && isPromotionPublishPayment(paidMeta, paidRow?.type)) {
        await activatePromotionAfterPublishPayment({
          promoId: paidPromoId,
          metadata: paidMeta,
          reference,
          payerUserId: paidRow?.userId || req.userId,
          payerEmail: paidRow?.email,
          sendNotification: false,
        });
      }
    } else {
      const existing = await prisma.payment.findUnique({
        where: { reference },
        select: { metadata: true },
      });
      const mergedMeta = mergePaymentMetadataFromVerify(
        flattenPaymentMetadata(existing?.metadata),
        paystackResp.data,
      );
      await prisma.payment.updateMany({ where: { reference }, data: { status: mapped, metadata: mergedMeta } });
    }
    res.json(await buildPaymentVerifyResponse(reference, status));
  } catch (err) {
    next(err);
  }
});

// Paystack webhook handler — used by BOTH /api/webhooks/paystack and /api/payments/paystack/webhook
export async function paystackWebhookHandler(req, res) {
  const sig = req.headers['x-paystack-signature'];
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!sig || !key) return res.status(400).send('bad request');
  const hash = crypto.createHmac('sha512', key).update(req.body).digest('hex');
  if (hash !== sig) return res.status(401).send('invalid signature');

  let payload;
  try {
    payload = JSON.parse(req.body.toString('utf8'));
  } catch {
    return res.status(400).send('invalid json');
  }

  const event = payload?.event;
  const data = payload?.data;
  const reference = data?.reference;
  if (!reference) return res.status(200).send('ok');

  if (event === 'charge.success') {
    try {
      const verified = await paystackFetch(`/transaction/verify/${encodeURIComponent(reference)}`);
      if (verified?.data?.status === 'success') {
        await applyReferenceSideEffects(reference, verified.data);
        await runPaymentRepairPaths(reference, verified.data);
      }
    } catch (e) {
      // Log but don't fail — Paystack may retry
      console.error('Paystack webhook applyReferenceSideEffects error:', e?.message);
    }
  }

  if (event === 'charge.failed') {
    try {
      await applyChargeFailedEffects(reference, payload);
    } catch (e) {
      console.error('Paystack webhook charge.failed error:', e?.message);
    }
  }

  return res.status(200).send('ok');
}

export default router;
