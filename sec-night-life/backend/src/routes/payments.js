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
import { upsertConfirmedAttendance } from '../lib/eventAttendance.js';
import { sendEmail } from '../lib/email.js';
import { createInAppNotification } from '../lib/inAppNotifications.js';
import { normalizeHostingConfig } from '../lib/hostingConfig.js';
import { normalizeGuestGenderPreference } from '../lib/genderPreference.js';
import { getEventEntranceZar } from '../lib/hostedTableSecFees.js';
import { recordEventVenueTableBooking } from '../lib/eventVenueBooking.js';
import {
  visibleUntilAfterEventDate,
  visibleUntilAfterParty,
  visibleUntilAfterHostedTable,
  visibleUntilForVenueTableMember,
} from '../lib/ticketHelpers.js';
import { issueTicketAndNotify } from '../lib/issueTicket.js';
import { recordPayoutAndMaybeTransfer, resolveRecipientCodeForUser, resolveRecipientCodeForVenue, splitSecPlatform } from '../lib/paystackPayout.js';

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

async function applyReferenceSideEffects(reference, paystackData) {
  const priorPay = await prisma.payment.findUnique({
    where: { reference },
    select: { metadata: true },
  });
  const priorMeta = priorPay?.metadata && typeof priorPay.metadata === 'object' ? priorPay.metadata : {};
  if (priorMeta.side_effects_applied) return;

  const metadata = paystackData?.metadata || {};
  const userId = metadata.user_id || paystackData?.customer?.customer_code;
  const email = paystackData?.customer?.email || metadata.email || 'unknown@secnightlife.app';
  const amount = paystackData?.amount ? paystackData.amount / 100 : 0;
  const type = metadata.type || 'other';

  // Legacy: update Transaction if exists
  await prisma.transaction.updateMany({
    where: { stripeId: reference },
    data: { status: 'paid', metadata: paystackData },
  });

  // Type-specific side effects
  const isBoost = metadata.type === 'BOOST';
  const promoId = metadata.promotedPostId || metadata.promotion_id;
  if (promoId) {
    const boostExpiry = new Date(Date.now() + (7 * 24 * 60 * 60 * 1000));
    await prisma.promotion.updateMany({
      where: { id: promoId, deletedAt: null },
      data: isBoost
        ? {
            boosted: true,
            boostedAt: new Date(),
            boostExpiresAt: boostExpiry,
            boostPaystackRef: reference,
            status: 'ACTIVE',
          }
        : {
            boosted: true,
            boostedAt: new Date(),
            boostExpiresAt: boostExpiry,
            boostPaystackRef: reference,
          },
    });

    const promo = await prisma.promotion.findFirst({
      where: { id: promoId, deletedAt: null },
      select: { id: true, title: true, venueId: true, boostExpiresAt: true },
    });
    if (promo) {
      const venue = await prisma.venue.findFirst({
        where: { id: promo.venueId, deletedAt: null },
        select: { ownerUserId: true, name: true, owner: { select: { email: true } } },
      });
      await createNotification({
        userId: venue?.ownerUserId,
        type: 'payment',
        title: 'Promotion boost active',
        body: `"${promo.title}" is now boosted for ${venue?.name || 'your venue'}.`,
        actionUrl: `/BusinessPromotions`,
      });
      if (isBoost && venue?.owner?.email) {
        sendEmail({
          to: venue.owner.email,
          subject: `Boost activated — ${promo.title}`,
          text: `Your promotion "${promo.title}" is now boosted for 7 days. Boost expires on ${promo.boostExpiresAt?.toISOString() || 'N/A'}.`,
        }).catch(() => {});
      }
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
    }
  }

  const venueTableId = metadata.venueTableId || metadata.venue_table_id;
  const venueTableMemberId = metadata.venueTableMemberId || metadata.venue_table_member_id;
  if (metadata.type === 'VENUE_TABLE_JOIN' && venueTableId && venueTableMemberId && userId) {
    await prisma.$transaction(async (tx) => {
      const member = await tx.venueTableMember.findFirst({
        where: { id: String(venueTableMemberId), venueTableId: String(venueTableId), userId: String(userId) },
        include: { venueTable: { include: { venue: true } } },
      });
      if (!member) return;
      if (member.status === 'CONFIRMED') return;
      const table = member.venueTable;
      const totalPaid = Number(amount || 0);
      const secAmount = Number((totalPaid * 0.15).toFixed(2));
      const venueAmount = Number((totalPaid * 0.85).toFixed(2));

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
      const user = await tx.user.findUnique({
        where: { id: String(userId) },
        include: { userProfile: { select: { username: true } } },
      });
      const username = user?.userProfile?.username || user?.username || 'someone';
      await createInAppNotification({
        userId: table.venue.ownerUserId,
        type: 'TABLE_JOINED',
        title: 'Venue table joined',
        body: `@${username} joined your table ${table.tableName} and contributed R${totalPaid.toFixed(2)}`,
        referenceId: table.id,
        referenceType: 'VENUE_TABLE',
      });
      await createInAppNotification({
        userId: String(userId),
        type: 'TABLE_JOINED',
        title: 'Table confirmed',
        body: `You're confirmed at ${table.tableName}. Menu items are locked in. No refunds.`,
        referenceId: table.id,
        referenceType: 'VENUE_TABLE',
      });
    });
    const vt = await prisma.venueTable.findUnique({
      where: { id: String(venueTableId) },
      include: { event: true, venue: true },
    });
    if (vt && userId) {
      const vu = await prisma.user.findUnique({ where: { id: String(userId) }, select: { email: true } });
      const vis = vt.event?.date
        ? visibleUntilForVenueTableMember(vt, vt.event)
        : visibleUntilAfterEventDate(new Date());
      await issueTicketAndNotify(prisma, {
        userId: String(userId),
        email: vu?.email || email,
        paystackReference: reference,
        kind: 'VENUE_TABLE_JOIN',
        title: vt.event?.title ? `${vt.tableName} — ${vt.event.title}` : vt.tableName,
        subtitle: vt.venue?.name || null,
        visibleUntil: vis,
        venueTableId: vt.id,
        eventId: vt.eventId || null,
        quantity: 1,
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
        const hostFeeZar = Number(metadata.host_fee_zar || amount || 0);
        const expected = entranceZar + hostFeeZar;
        if (expected > 0 && Math.abs(Number(amount || 0) - expected) < 0.01) {
          await prisma.hostedTable.update({
            where: { id: hosted.id },
            data: { status: 'ACTIVE', hostFeePaystackRef: reference },
          });
          const venueCode = hosted.event?.venueId ? await resolveRecipientCodeForVenue(hosted.event.venueId) : null;
          const hostCode = await resolveRecipientCodeForUser(String(userId));
          if (entranceZar > 0 && hosted.event?.venueId) {
            const { secAmount: secEntrance, recipientAmount: venueEntrance } = splitSecPlatform(entranceZar);
            await recordPayoutAndMaybeTransfer({
              paymentReference: `${reference}:entrance`,
              grossZar: entranceZar,
              secAmount: secEntrance,
              recipientAmount: venueEntrance,
              recipientType: 'VENUE',
              recipientVenueId: hosted.event.venueId,
              recipientUserId: null,
              paystackRecipientCode: venueCode,
            });
          }
          if (hostFeeZar > 0) {
            const { secAmount: secHost, recipientAmount: hostShare } = splitSecPlatform(hostFeeZar);
            await recordPayoutAndMaybeTransfer({
              paymentReference: `${reference}:hostfee`,
              grossZar: hostFeeZar,
              secAmount: secHost,
              recipientAmount: hostShare,
              recipientType: 'USER',
              recipientUserId: String(userId),
              recipientVenueId: null,
              paystackRecipientCode: hostCode,
            });
          }
          const vis = hosted.event ? visibleUntilAfterEventDate(hosted.event.date) : visibleUntilAfterHostedTable(hosted);
          const payer = await prisma.user.findUnique({ where: { id: String(userId) }, select: { email: true } });
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
          });
          if (hosted.event?.venueId && hosted.eventId) {
            await recordEventVenueTableBooking({
              venueId: hosted.event.venueId,
              eventId: hosted.eventId,
              hostedTableId: hosted.id,
              userId: String(userId),
              role: 'HOST',
              paystackReference: reference,
              amountTotal: Number(amount || 0),
              entranceZar: entranceZar || 0,
              componentZar: hostFeeZar || 0,
            });
          }
          if (hosted.event?.venue?.ownerUserId) {
            await createNotification({
              userId: hosted.event.venue.ownerUserId,
              type: 'table_update',
              title: 'New hosted table',
              body: `${hosted.tableName} is now active for ${hosted.event?.title || 'your event'}.`,
              actionUrl: `/BusinessBookings`,
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
              const payer = await prisma.user.findUnique({ where: { id: String(userId) }, select: { email: true } });
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
          const payer = await prisma.user.findUnique({ where: { id: String(userId) }, select: { email: true } });
          const vis = visibleUntilAfterHostedTable(ht);
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
          });
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
            const payer = await prisma.user.findUnique({ where: { id: String(userId) }, select: { email: true } });
            const vis = visibleUntilAfterParty(freshAtt.houseParty);
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
      if (member && member.paystackReference !== reference && member.hostedTable.hasJoiningFee && member.hostedTable.joiningFee) {
        const htEvent = member.hostedTable.eventId
          ? await prisma.event.findFirst({
              where: { id: member.hostedTable.eventId, deletedAt: null },
              select: { id: true, venueId: true, hasEntranceFee: true, entranceFeeAmount: true },
            })
          : null;
        const entranceZar = Number(metadata.entrance_zar || getEventEntranceZar(htEvent));
        const joinZar = Number(metadata.join_zar || member.hostedTable.joiningFee || 0);
        const expected = entranceZar + joinZar;
        if (Math.abs(Number(amount) - expected) < 0.01) {
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
          });
          const memFresh = await prisma.hostedTableMember.findUnique({
            where: { id: String(memberId) },
            include: { hostedTable: true },
          });
          if (memFresh?.paystackReference === reference) {
            const htFinal = memFresh.hostedTable;
            const hostCode = await resolveRecipientCodeForUser(htFinal.hostUserId);
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
            const payer = await prisma.user.findUnique({ where: { id: String(userId) }, select: { email: true } });
            const vis = visibleUntilAfterHostedTable(htFinal);
            await issueTicketAndNotify(prisma, {
              userId: String(userId),
              email: payer?.email || email,
              paystackReference: reference,
              kind: 'HOSTED_TABLE_JOIN',
              title: `${htFinal.tableName} — Join ticket`,
              subtitle: htFinal.venueName,
              visibleUntil: vis,
              hostedTableId: htFinal.id,
              quantity: 1,
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
              });
            }
          }
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
      const visT = evRow ? visibleUntilAfterEventDate(evRow.date) : new Date(Date.now() + 48 * 60 * 60 * 1000);
      const payerU = await prisma.user.findUnique({ where: { id: String(userId) }, select: { email: true } });
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
      });
    }
  }

  const eventId = metadata.event_id;
  const ticketTier = metadata.ticket_tier_name;
  const qty = parseInt(metadata.quantity || '1', 10);
  if (eventId && ticketTier && qty > 0) {
    const event = await prisma.event.findFirst({
      where: { id: eventId, deletedAt: null },
      include: { venue: { select: { ownerUserId: true, name: true } } },
    });
    if (event?.ticketTiers && Array.isArray(event.ticketTiers)) {
      const tiers = event.ticketTiers.map((t) =>
        t.name === ticketTier ? { ...t, sold: (t.sold || 0) + qty } : t
      );
      await prisma.event.update({
        where: { id: eventId },
        data: { ticketTiers: tiers },
      });

      if (userId) {
        await createNotification({
          userId,
          type: 'payment',
          title: 'Tickets confirmed',
          body: `Your ticket purchase for "${event.title}" was confirmed.`,
          actionUrl: `/EventDetails?id=${eventId}`,
        });
        logFriendActivity({
          userId,
          activityType: 'JOINED_EVENT',
          referenceId: eventId,
          referenceType: 'EVENT',
          description: 'joined an event',
        });
        await upsertConfirmedAttendance(userId, eventId);
      }

      await createNotification({
        userId: event.venue?.ownerUserId,
        type: 'payment',
        title: 'Ticket purchase',
        body: `${qty} ticket(s) sold for "${event.title}" at ${event.venue?.name || 'your venue'}.`,
        actionUrl: `/BusinessEvents`,
      });

      if (userId) {
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
        const payerEv = await prisma.user.findUnique({ where: { id: String(userId) }, select: { email: true } });
        const visEv = visibleUntilAfterEventDate(event.date);
        await issueTicketAndNotify(prisma, {
          userId: String(userId),
          email: payerEv?.email || email,
          paystackReference: reference,
          kind: 'EVENT_TICKET',
          title: event.title,
          subtitle: `${ticketTier} ×${qty}`,
          visibleUntil: visEv,
          eventId,
          quantity: qty,
        });
      }
    }
  }

  const payType = PAYMENT_TYPES.includes(type) ? type : 'other';
  const mergedMeta =
    paystackData && typeof paystackData === 'object'
      ? { ...paystackData, side_effects_applied: true }
      : { side_effects_applied: true };
  const pmUp = await prisma.payment.updateMany({
    where: { reference },
    data: {
      status: 'success',
      amount,
      type: payType,
      metadata: mergedMeta,
    },
  });
  if (pmUp.count === 0) {
    await prisma.payment.create({
      data: {
        userId: userId || 'unknown',
        email,
        amount,
        reference,
        status: 'success',
        type: payType,
        metadata: mergedMeta,
      },
    });
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
    const meta = d.metadata || {};
    const type = meta.type || (d.venue_id && meta.promotion_id ? 'promotion' : d.event_id ? 'event' : 'table') || 'other';

    if (type === 'table' && !(await userHasIdentityVerified(req.userId))) {
      return res.status(403).json({
        error: 'Identity verification required to pay for table bookings.',
        code: 'IDENTITY_NOT_VERIFIED',
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
      body: {
        email,
        amount: amountInCents,
        reference,
        metadata: { user_id: req.userId, type, description: d.description, ...meta },
        callback_url: process.env.APP_URL ? `${process.env.APP_URL}/PaymentSuccess?ref=${reference}` : undefined,
      },
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
    const meta = d.metadata || {};
    const type = meta.type || (meta.promotion_id ? 'promotion' : d.event_id ? 'event' : 'table') || 'other';
    if (type === 'table' && !(await userHasIdentityVerified(req.userId))) {
      return res.status(403).json({
        error: 'Identity verification required to pay for table bookings.',
        code: 'IDENTITY_NOT_VERIFIED',
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
      body: { email, amount: amountInCents, reference, metadata: { user_id: req.userId, type, description: d.description, ...meta }, callback_url: process.env.APP_URL ? `${process.env.APP_URL}/PaymentSuccess?ref=${reference}` : undefined },
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
    } else {
      await prisma.payment.updateMany({
        where: { reference },
        data: { status: mapped, metadata: paystackResp.data },
      });
    }

    res.json({
      status: mapped,
      paystack_status: status,
    });
  } catch (err) {
    next(err);
  }
});

// Backward compat: /paystack/verify/:reference
router.get('/paystack/verify/:reference', authenticateToken, async (req, res, next) => {
  try {
    const reference = req.params.reference;
    const paystackResp = await paystackFetch(`/transaction/verify/${encodeURIComponent(reference)}`);
    const status = paystackResp.data.status;
    const mapped = status === 'success' ? 'paid' : status === 'failed' ? 'failed' : 'pending';
    await prisma.transaction.updateMany({ where: { userId: req.userId, stripeId: reference }, data: { status: mapped, metadata: paystackResp.data } });
    if (mapped === 'paid') await applyReferenceSideEffects(reference, paystackResp.data);
    else await prisma.payment.updateMany({ where: { reference }, data: { status: mapped, metadata: paystackResp.data } });
    res.json({ status: mapped, paystack_status: status });
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
      }
    } catch (e) {
      // Log but don't fail — Paystack may retry
      console.error('Paystack webhook applyReferenceSideEffects error:', e?.message);
    }
  }

  return res.status(200).send('ok');
}

export default router;
