import { Router } from 'express';
import crypto from 'crypto';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { authenticateToken, optionalAuth } from '../middleware/auth.js';
import { buildTableCheckoutMetadata } from '../lib/checkoutLines.js';
import { computeVenueCheckout, computeChargeableMenuTotal, computeFullMenuTotal } from '../lib/venueCheckout.js';
import { createInAppNotification } from '../lib/inAppNotifications.js';
import { sendEmail } from '../lib/email.js';
import { ensureDayCustomVenueTable } from '../lib/ensureDayCustomVenueTable.js';
import { ensureHostedTableFromVenueHostPayment } from '../lib/venueTableHostAfterPayment.js';
import { notifyPaymentSuccess } from '../lib/paymentNotifications.js';
import { buildPaystackInitializeBody } from '../lib/paystackInitialize.js';

const router = Router();

function requireVenueOwner(req, res) {
  if (req.userRole !== 'VENUE') {
    res.status(403).json({ error: 'Business owner account required' });
    return false;
  }
  return true;
}

async function assertVenueOwnedByUser(venueId, userId) {
  return prisma.venue.findFirst({ where: { id: venueId, ownerUserId: userId, deletedAt: null } });
}

async function initializePaystackPayment({ userId, amountZar, metadata }) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { email: true } });
  const key = process.env.PAYSTACK_SECRET_KEY;
  if (!key) throw new Error('Paystack is not configured');
  const reference = crypto.randomBytes(16).toString('hex');
  const email = user?.email || 'user@secnightlife.app';
  await prisma.payment.create({
    data: { userId, email, amount: amountZar, reference, status: 'pending', type: 'other', metadata: { user_id: userId, ...metadata } },
  });
  const res = await fetch('https://api.paystack.co/transaction/initialize', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(
      buildPaystackInitializeBody({
        email,
        amountInCents: Math.round(amountZar * 100),
        reference,
        userId,
        metadata,
      }),
    ),
  });
  const data = await res.json().catch(() => null);
  if (!res.ok || !data?.status) throw new Error(data?.message || 'Could not initialize payment');
  return { reference, authorization_url: data.data.authorization_url, access_code: data.data.access_code };
}

const createTableSchema = z.object({
  venueId: z.string().min(1),
  eventId: z.string().optional().nullable(),
  tableName: z.string().trim().min(1).max(60),
  description: z.string().trim().max(500).optional().nullable(),
  guestCapacity: z.number().int().min(1).max(100),
  minimumSpend: z.number().min(0),
  hostMinimumSpend: z.number().min(0).optional().nullable(),
  bookingFeeZar: z.number().min(0).optional(),
  hostTableFeeZar: z.number().min(0).optional(),
  minSpendSettlement: z.enum(['PREPAY_MENU', 'PREPAY_LUMP', 'PAY_ON_ARRIVAL']).optional(),
  serviceDate: z.coerce.date().optional().nullable(),
  startTime: z.string().optional().nullable(),
  endTime: z.string().optional().nullable(),
  partySize: z.number().int().min(1).optional().nullable(),
  isCustomListing: z.boolean().optional(),
  allowsCustomRequests: z.boolean().optional(),
  tierLabel: z.string().optional().nullable(),
});

router.post('/', authenticateToken, async (req, res, next) => {
  try {
    if (!requireVenueOwner(req, res)) return;
    const parsed = createTableSchema.safeParse(req.body || {});
    if (!parsed.success) return res.status(400).json({ error: 'Invalid input', details: parsed.error.flatten() });
    const d = parsed.data;
    const owned = await assertVenueOwnedByUser(d.venueId, req.userId);
    if (!owned) return res.status(403).json({ error: 'Forbidden' });
    if (d.eventId) {
      const event = await prisma.event.findFirst({ where: { id: d.eventId, venueId: d.venueId, deletedAt: null } });
      if (!event) return res.status(404).json({ error: 'Event not found' });
    }
    const table = await prisma.venueTable.create({
      data: {
        venueId: d.venueId,
        eventId: d.eventId ?? null,
        tableName: d.tableName,
        description: d.description ?? null,
        guestCapacity: d.guestCapacity,
        minimumSpend: d.minimumSpend,
        hostMinimumSpend: d.hostMinimumSpend ?? null,
        bookingFeeZar: d.bookingFeeZar ?? 0,
        hostTableFeeZar: d.hostTableFeeZar ?? 0,
        minSpendSettlement: d.minSpendSettlement ?? 'PAY_ON_ARRIVAL',
        serviceDate: d.serviceDate ?? null,
        startTime: d.startTime ?? null,
        endTime: d.endTime ?? null,
        partySize: d.partySize ?? null,
        isCustomListing: d.isCustomListing ?? false,
        allowsCustomRequests: d.allowsCustomRequests ?? false,
        tierLabel: d.tierLabel ?? null,
        amountContributed: 0,
        currentOccupancy: 0,
        status: 'AVAILABLE',
        isActive: true,
      },
    });
    res.status(201).json(table);
  } catch (e) {
    next(e);
  }
});

router.post('/:tableId/menu-items', authenticateToken, async (req, res, next) => {
  try {
    if (!requireVenueOwner(req, res)) return;
    const items = z.array(z.object({
      name: z.string().trim().min(1),
      category: z.string().trim().min(1),
      price: z.number().min(1),
      isAvailable: z.boolean().optional(),
    })).min(1).parse(req.body || []);
    const table = await prisma.venueTable.findUnique({ where: { id: req.params.tableId }, include: { venue: true } });
    if (!table) return res.status(404).json({ error: 'Table not found' });
    if (table.venue.ownerUserId !== req.userId) return res.status(403).json({ error: 'Forbidden' });
    await prisma.venueTableMenuItem.createMany({
      data: items.map((i) => ({ venueTableId: table.id, name: i.name, category: i.category, price: i.price, isAvailable: i.isAvailable ?? true })),
    });
    const all = await prisma.venueTableMenuItem.findMany({ where: { venueTableId: table.id } });
    res.status(201).json(all);
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: 'Invalid input' });
    next(e);
  }
});

router.patch('/:tableId/menu-items/:itemId', authenticateToken, async (req, res, next) => {
  try {
    if (!requireVenueOwner(req, res)) return;
    const payload = z.object({
      name: z.string().trim().min(1).optional(),
      category: z.string().trim().min(1).optional(),
      price: z.number().min(1).optional(),
      isAvailable: z.boolean().optional(),
    }).parse(req.body || {});
    const item = await prisma.venueTableMenuItem.findFirst({
      where: { id: req.params.itemId, venueTableId: req.params.tableId },
      include: { venueTable: { include: { venue: true } } },
    });
    if (!item) return res.status(404).json({ error: 'Menu item not found' });
    if (item.venueTable.venue.ownerUserId !== req.userId) return res.status(403).json({ error: 'Forbidden' });
    const updated = await prisma.venueTableMenuItem.update({ where: { id: item.id }, data: payload });
    res.json(updated);
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: 'Invalid input' });
    next(e);
  }
});

router.delete('/:tableId/menu-items/:itemId', authenticateToken, async (req, res, next) => {
  try {
    if (!requireVenueOwner(req, res)) return;
    const item = await prisma.venueTableMenuItem.findFirst({
      where: { id: req.params.itemId, venueTableId: req.params.tableId },
      include: { venueTable: { include: { venue: true } } },
    });
    if (!item) return res.status(404).json({ error: 'Menu item not found' });
    if (item.venueTable.venue.ownerUserId !== req.userId) return res.status(403).json({ error: 'Forbidden' });
    await prisma.venueTableMenuItem.delete({ where: { id: item.id } });
    res.json({ deleted: true });
  } catch (e) {
    next(e);
  }
});

router.get('/venue/:venueId', authenticateToken, async (req, res, next) => {
  try {
    if (!requireVenueOwner(req, res)) return;
    const owned = await assertVenueOwnedByUser(req.params.venueId, req.userId);
    if (!owned) return res.status(403).json({ error: 'Forbidden' });
    const dayOnly = req.query.dayOnly === 'true' || req.query.dayOnly === '1';
    const tables = await prisma.venueTable.findMany({
      where: {
        venueId: req.params.venueId,
        ...(dayOnly ? { eventId: null } : {}),
      },
      include: { menuItems: true, _count: { select: { members: true } } },
      orderBy: { createdAt: 'desc' },
    });
    const out = tables.map((t) => ({
      ...t,
      memberCount: t._count.members,
      progressPercentage: t.minimumSpend > 0 ? Number(((t.amountContributed / t.minimumSpend) * 100).toFixed(1)) : 0,
    }));
    res.json(out);
  } catch (e) {
    next(e);
  }
});

/** Idempotent day custom listing id for Book on Sec (no POST to /venues required). */
router.get('/day-custom-listing', optionalAuth, async (req, res, next) => {
  try {
    const venueId = typeof req.query.venueId === 'string' ? req.query.venueId : '';
    if (!venueId) return res.status(400).json({ error: 'venueId is required' });
    const venue = await prisma.venue.findFirst({ where: { id: venueId, deletedAt: null } });
    if (!venue) return res.status(404).json({ error: 'Venue not found' });
    if (!venue.acceptsDayBookings) {
      return res.status(400).json({ error: 'This venue has not enabled day table bookings' });
    }
    const listing = await ensureDayCustomVenueTable(venueId);
    if (!listing?.id) {
      return res.status(500).json({ error: 'Could not create custom table listing' });
    }
    res.json({
      tableId: listing.id,
      id: listing.id,
      venueId: venue.id,
      isCustomListing: true,
    });
  } catch (e) {
    next(e);
  }
});

router.get('/available', optionalAuth, async (req, res, next) => {
  try {
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, parseInt(req.query.limit) || 20);
    const venueId = typeof req.query.venueId === 'string' ? req.query.venueId : undefined;
    const eventId = typeof req.query.eventId === 'string' ? req.query.eventId : undefined;
    const dayOnly = req.query.dayOnly === 'true' || req.query.dayOnly === '1';
    if (dayOnly && venueId) {
      const v = await prisma.venue.findFirst({ where: { id: venueId, deletedAt: null } });
      if (!v?.acceptsDayBookings) {
        return res.json({ items: [], page: 1, limit: 20, total: 0 });
      }
      await ensureDayCustomVenueTable(venueId);
    }
    const where = {
      isActive: true,
      status: { in: ['AVAILABLE', 'PARTIALLY_FILLED'] },
      ...(venueId ? { venueId } : {}),
      ...(eventId ? { eventId } : {}),
      ...(dayOnly ? { eventId: null } : {}),
    };
    if (venueId && !eventId && !dayOnly) {
      const venue = await prisma.venue.findFirst({ where: { id: venueId, deletedAt: null } });
      if (venue && !venue.acceptsDayBookings) {
        where.eventId = { not: null };
      }
    }
    const rows = await prisma.venueTable.findMany({
      where,
      include: {
        venue: { select: { id: true, name: true, city: true, venueType: true, coverImageUrl: true, logoUrl: true, acceptsDayBookings: true } },
        event: { select: { id: true, title: true, date: true, hasEntranceFee: true, entranceFeeAmount: true } },
        menuItems: { where: { isAvailable: true } },
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    });
    const availableRows = rows.filter((t) => t.currentOccupancy < t.guestCapacity);
    const paged = availableRows.slice((page - 1) * limit, page * limit);
    res.json({
      items: paged.map((t) => ({
        ...t,
        spotsRemaining: Math.max(0, t.guestCapacity - t.currentOccupancy),
        progressPercentage: t.minimumSpend > 0 ? Number(((t.amountContributed / t.minimumSpend) * 100).toFixed(1)) : 0,
      })),
      page,
      limit,
      total: availableRows.length,
    });
  } catch (e) {
    next(e);
  }
});

async function hydrateTableMenu(table) {
  const { fetchGuestVenueMenuItems, guestMenuItemToTableShape } = await import('../lib/menuHelpers.js');
  const items = await fetchGuestVenueMenuItems(table.venueId);
  return items.map((item) => guestMenuItemToTableShape(item, table.id));
}

function resolveBookingMode(raw, table, specs) {
  if (raw === 'host' || raw === 'join' || raw === 'custom_host') return raw;
  if (table.isCustomListing || specs?.guestCount) return 'custom_host';
  return 'join';
}

async function buildVenueCheckoutForTable(table, venue, menuItems, payload, existing) {
  const specs = existing?.userSpecs || {};
  const bookingMode = resolveBookingMode(payload.bookingMode, table, specs);
  if (bookingMode === 'host' || bookingMode === 'custom_host') {
    if (table.hostedTableId || table.hostUserId) {
      return { error: 'This table is already hosted. Join the host\'s table instead.' };
    }
  }
  if (bookingMode === 'join' && table.hostedTableId) {
    return { error: 'This table is hosted. Use the join hosted table flow instead.' };
  }

  const selMap = {};
  for (const s of payload.selectedMenuItems || []) selMap[s.menuItemId] = s.quantity;
  const overrideMinSpend = specs.proposedMinimumSpend;
  const isHostMode = bookingMode === 'host' || bookingMode === 'custom_host';
  const minSpend =
    overrideMinSpend != null
      ? Number(overrideMinSpend)
      : isHostMode
        ? Number(table.hostMinimumSpend ?? table.minimumSpend ?? 0)
        : Number(table.minimumSpend || 0);
  const settlementMode =
    payload.settlementMode ??
    table.minSpendSettlement ??
    (minSpend > 0 ? 'PREPAY_MENU' : 'PREPAY_MENU');
  if (settlementMode === 'PAY_ON_ARRIVAL') {
    return { error: 'Pay on arrival is not supported for table checkout.' };
  }
  const menuTotal = computeChargeableMenuTotal(
    menuItems,
    selMap,
    Array.isArray(table.includedItems) ? table.includedItems : [],
  );

  const checkout = computeVenueCheckout(
    { ...table, event: table.event, minimumSpend: minSpend },
    {
      menuTotal,
      settlementMode,
      menuItems,
      venue,
      bookingMode,
      overrideMinSpend: specs.proposedMinimumSpend,
    },
  );
  return { checkout, bookingMode, settlementMode, menuSelections: payload.selectedMenuItems || [], menuTotal };
}

router.post('/:tableId/checkout-preview', optionalAuth, async (req, res, next) => {
  try {
    const payload = z
      .object({
        selectedMenuItems: z
          .array(z.object({ menuItemId: z.string().min(1), quantity: z.number().int().min(0) }))
          .optional(),
        settlementMode: z.enum(['PREPAY_MENU', 'PREPAY_LUMP', 'PAY_ON_ARRIVAL']).optional(),
        bookingMode: z.enum(['host', 'join', 'custom_host']).optional(),
      })
      .parse(req.body || {});
    const table = await prisma.venueTable.findUnique({
      where: { id: req.params.tableId },
      include: {
        venue: true,
        event: { select: { id: true, title: true, date: true, hasEntranceFee: true, entranceFeeAmount: true } },
        menuItems: { where: { isAvailable: true } },
      },
    });
    if (!table) return res.status(404).json({ error: 'Table not found' });
    const menuItems = await hydrateTableMenu(table);
    let myMembership = null;
    if (req.userId) {
      myMembership = await prisma.venueTableMember.findUnique({
        where: { venueTableId_userId: { venueTableId: table.id, userId: req.userId } },
      });
    }
    const result = await buildVenueCheckoutForTable(table, table.venue, menuItems, payload, myMembership);
    if (result.error) return res.status(400).json({ error: result.error });
    if (result.checkout.error) return res.status(400).json({ error: result.checkout.error });
    res.json({ ...result.checkout, bookingMode: result.bookingMode });
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: 'Invalid input' });
    next(e);
  }
});

router.get('/:tableId', optionalAuth, async (req, res, next) => {
  try {
    const table = await prisma.venueTable.findUnique({
      where: { id: req.params.tableId },
      include: {
        venue: { select: { id: true, name: true, city: true, venueType: true, coverImageUrl: true, logoUrl: true } },
        event: { select: { id: true, title: true, date: true, hasEntranceFee: true, entranceFeeAmount: true } },
        menuItems: true,
        members: {
          where: { status: 'CONFIRMED' },
          include: { user: { select: { id: true, fullName: true, userProfile: { select: { username: true, avatarUrl: true } } } } },
        },
      },
    });
    if (!table) return res.status(404).json({ error: 'Table not found' });
    const menuItems = await hydrateTableMenu(table);
    let myMembership = null;
    if (req.userId) {
      myMembership = await prisma.venueTableMember.findUnique({
        where: { venueTableId_userId: { venueTableId: table.id, userId: req.userId } },
      });
    }
    res.json({
      ...table,
      menuItems,
      myMembership,
      spotsRemaining: Math.max(0, table.guestCapacity - table.currentOccupancy),
      progressPercentage: table.minimumSpend > 0 ? Number(((table.amountContributed / table.minimumSpend) * 100).toFixed(1)) : 0,
      members: table.members.map((m) => ({ id: m.id, userId: m.userId, avatarUrl: m.user.userProfile?.avatarUrl || null, username: m.user.userProfile?.username || m.user.fullName || 'member' })),
    });
  } catch (e) {
    next(e);
  }
});

router.post('/:tableId/request', authenticateToken, async (req, res, next) => {
  try {
    const payload = z
      .object({
        userSpecs: z.object({
          guestCount: z.number().int().min(1).max(500).optional(),
          proposedMinimumSpend: z.number().min(0).optional(),
          notes: z.string().max(2000).optional(),
          preferredDate: z.string().optional(),
          preferredTime: z.string().optional(),
          minSpendMode: z.enum(['menu', 'manual']).optional(),
          selectedMenuItems: z
            .array(z.object({ menuItemId: z.string().min(1), quantity: z.number().int().min(0) }))
            .optional(),
        }),
        isCustom: z.boolean().optional(),
      })
      .parse(req.body || {});
    const table = await prisma.venueTable.findUnique({
      where: { id: req.params.tableId },
      include: { venue: { include: { owner: { select: { id: true, email: true } } } } },
    });
    if (!table) return res.status(404).json({ error: 'Table not found' });
    if (!table.isActive) return res.status(400).json({ error: 'Table not available' });
    if (table.venue.ownerUserId === req.userId) return res.status(403).json({ error: 'Cannot request your own venue table' });
    if (payload.isCustom && !table.allowsCustomRequests && !table.isCustomListing) {
      return res.status(400).json({ error: 'Custom requests are not enabled for this listing' });
    }
    const member = await prisma.venueTableMember.upsert({
      where: { venueTableId_userId: { venueTableId: table.id, userId: req.userId } },
      create: {
        venueTableId: table.id,
        userId: req.userId,
        userSpecs: payload.userSpecs,
        selectedMenuItems: payload.userSpecs.selectedMenuItems || undefined,
        status: 'PENDING_VENUE_REVIEW',
      },
      update: {
        userSpecs: payload.userSpecs,
        selectedMenuItems: payload.userSpecs.selectedMenuItems || undefined,
        status: 'PENDING_VENUE_REVIEW',
        declineReason: null,
      },
    });
    await prisma.notification.create({
      data: {
        userId: table.venue.ownerUserId,
        type: 'TABLE_REQUEST',
        title: 'New table request',
        body: `A guest requested ${table.tableName}. Review in Tables & day bookings.`,
        actionUrl: '/BusinessVenueTables?tab=requests',
      },
    });
    const ownerEmail = table.venue.owner?.email;
    const reviewUrl = `${process.env.APP_URL || 'https://sec-nightlife.vercel.app'}/BusinessVenueTables?tab=requests`;
    if (ownerEmail) {
      try {
        await sendEmail({
          to: ownerEmail,
          subject: `New custom table request — ${table.tableName}`,
          text: `A guest submitted a custom table request for ${table.tableName}.\n\nReview and approve or decline in SEC:\n${reviewUrl}`,
          html: `<p>A guest submitted a custom table request for <strong>${table.tableName}</strong>.</p><p><a href="${reviewUrl}">Review request in SEC</a></p>`,
        });
      } catch (err) {
        logger?.warn?.('table request venue email failed', { err: String(err?.message || err) });
      }
    }
    res.status(201).json({ member, status: 'PENDING_VENUE_REVIEW' });
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: 'Invalid input' });
    next(e);
  }
});

router.patch('/:tableId/reservations/:memberId', authenticateToken, async (req, res, next) => {
  try {
    if (!requireVenueOwner(req, res)) return;
    const { VENUE_DECLINE_TEMPLATE_KEYS, validateDeclinePayload } =
      await import('../lib/venueTableMessageTemplates.js');
    const payload = z
      .object({
        action: z.enum(['approve', 'decline']),
        declineReason: z.string().trim().min(1).max(500).optional(),
        declineTemplateKey: z
          .string()
          .optional()
          .refine((k) => !k || VENUE_DECLINE_TEMPLATE_KEYS.includes(k), { message: 'Invalid decline template' }),
        declineTemplateKeys: z.array(z.string()).optional(),
        declineParams: z
          .object({
            preferredMinimumSpend: z.number().optional(),
            preferredMenuTotal: z.number().optional(),
            availableDate: z.string().optional(),
            availableTime: z.string().optional(),
            maxGuestCount: z.number().int().optional(),
          })
          .optional(),
      })
      .parse(req.body || {});
    const member = await prisma.venueTableMember.findFirst({
      where: { id: req.params.memberId, venueTableId: req.params.tableId },
      include: {
        venueTable: { include: { venue: true } },
        user: { select: { id: true, email: true, fullName: true } },
      },
    });
    if (!member) return res.status(404).json({ error: 'Request not found' });
    if (member.venueTable.venue.ownerUserId !== req.userId) return res.status(403).json({ error: 'Forbidden' });
    const guestEmail = member.user?.email;
    const tableLabel = member.venueTable.tableName;
    const payUrl = `${process.env.APP_URL || 'https://sec-nightlife.vercel.app'}/TableDetails?id=${member.venueTableId}&source=venue&checkout=1`;
    if (payload.action === 'decline') {
      const templateKeys =
        payload.declineTemplateKeys?.length
          ? payload.declineTemplateKeys
          : payload.declineTemplateKey
            ? [payload.declineTemplateKey]
            : [];
      let declineLabel = payload.declineReason?.trim() || null;
      let declineMessages = [];
      if (templateKeys.length) {
        const validated = validateDeclinePayload({
          templateKeys,
          params: payload.declineParams || {},
        });
        if (!validated.ok) return res.status(400).json({ error: validated.error });
        declineMessages = templateKeys.map((key, i) => ({
          templateKey: key,
          displayLabel: validated.messages[i],
        }));
        declineLabel = validated.combinedLabel;
      }
      if (!declineLabel) {
        return res.status(400).json({ error: 'Select a decline reason' });
      }
      await prisma.venueTableMember.update({
        where: { id: member.id },
        data: {
          status: 'DECLINED',
          declineReason: declineLabel,
          reviewedAt: new Date(),
          reviewedByUserId: req.userId,
        },
      });
      const { ensureVenueTableThread } = await import('./venueTableMessages.js');
      const thread = await ensureVenueTableThread(member.id);
      for (const msg of declineMessages) {
        await prisma.venueTableMessage.create({
          data: {
            threadId: thread.id,
            senderUserId: req.userId,
            templateKey: msg.templateKey,
            displayLabel: msg.displayLabel,
          },
        });
      }
      const threadUrl = `${process.env.APP_URL || 'https://sec-nightlife.vercel.app'}/Messages?venueTableThread=${thread.id}`;
      await prisma.notification.create({
        data: {
          userId: member.userId,
          type: 'TABLE_DECLINED',
          title: 'Table request declined',
          body: declineLabel,
          actionUrl: `/Messages?venueTableThread=${thread.id}`,
        },
      });
      if (guestEmail) {
        try {
          await sendEmail({
            to: guestEmail,
            subject: `Table request declined — ${tableLabel}`,
            text: `Your custom table request for ${tableLabel} was declined.\n\n${declineLabel}\n\nReply in SEC: ${threadUrl}`,
            html: `<p>Your custom table request for <strong>${tableLabel}</strong> was declined.</p><p>${declineLabel}</p><p><a href="${threadUrl}">Open conversation in SEC</a></p>`,
          });
        } catch (err) {
          logger?.warn?.('custom table decline email failed', { err: String(err?.message || err) });
        }
      }
      return res.json({ status: 'DECLINED', threadId: thread.id });
    }
    await prisma.venueTableMember.update({
      where: { id: member.id },
      data: { status: 'APPROVED', reviewedAt: new Date(), reviewedByUserId: req.userId },
    });
    const { ensureVenueTableThread } = await import('./venueTableMessages.js');
    await ensureVenueTableThread(member.id);
    await prisma.notification.create({
      data: {
        userId: member.userId,
        type: 'TABLE_APPROVED',
        title: 'Table request approved',
        body: `You can now complete payment for ${tableLabel}.`,
        actionUrl: `/TableDetails?id=${member.venueTableId}&source=venue&checkout=1`,
      },
    });
    if (guestEmail) {
      try {
        await sendEmail({
          to: guestEmail,
          subject: `Table request approved — ${tableLabel}`,
          text: `Your custom table request for ${tableLabel} was approved. Complete checkout in the SEC app.\n\n${payUrl}`,
          html: `<p>Your custom table request for <strong>${tableLabel}</strong> was approved.</p><p><a href="${payUrl}">Complete checkout in SEC</a></p>`,
        });
      } catch (err) {
        logger?.warn?.('custom table approve email failed', { err: String(err?.message || err) });
      }
    }
    res.json({ status: 'APPROVED' });
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: 'Invalid input' });
    next(e);
  }
});

router.post('/:tableId/join', authenticateToken, async (req, res, next) => {
  try {
    if (!['USER', 'VENUE'].includes(req.userRole)) return res.status(403).json({ error: 'Forbidden' });
    const payload = z
      .object({
        selectedMenuItems: z
          .array(z.object({ menuItemId: z.string().min(1), quantity: z.number().int().min(1) }))
          .optional(),
        settlementMode: z.enum(['PREPAY_MENU', 'PREPAY_LUMP', 'PAY_ON_ARRIVAL']).optional(),
        bookingMode: z.enum(['host', 'join', 'custom_host']).optional(),
      })
      .parse(req.body || {});
    const table = await prisma.venueTable.findUnique({
      where: { id: req.params.tableId },
      include: {
        venue: true,
        menuItems: true,
        event: { select: { id: true, title: true, date: true, hasEntranceFee: true, entranceFeeAmount: true } },
      },
    });
    if (!table) return res.status(404).json({ error: 'Table not found' });
    if (!['AVAILABLE', 'PARTIALLY_FILLED'].includes(table.status) || !table.isActive) {
      return res.status(400).json({ error: 'Table not available' });
    }
    if (table.currentOccupancy >= table.guestCapacity) return res.status(400).json({ error: 'Table is full' });
    if (table.venue.ownerUserId === req.userId) return res.status(403).json({ error: 'Venue owners cannot join their own table' });
    const existing = await prisma.venueTableMember.findUnique({
      where: { venueTableId_userId: { venueTableId: table.id, userId: req.userId } },
    });
    if (existing?.status === 'CONFIRMED') {
      return res.status(400).json({ error: 'Already joined' });
    }
    if (existing?.status === 'PENDING_VENUE_REVIEW') {
      return res.status(400).json({ error: 'Awaiting venue approval before checkout' });
    }
    if (existing?.status === 'DECLINED') {
      return res.status(400).json({ error: 'Request was declined by the venue' });
    }
    const specsForGate =
      existing?.userSpecs && typeof existing.userSpecs === 'object' && !Array.isArray(existing.userSpecs)
        ? existing.userSpecs
        : {};
    const bookingModeForGate = resolveBookingMode(payload.bookingMode, table, specsForGate);
    // Inventory "host this table" checkout must not require a prior venue custom-table approval.
    const needsVenueApproval =
      (table.allowsCustomRequests || table.isCustomListing) && bookingModeForGate !== 'host';
    if (needsVenueApproval) {
      if (!existing || existing.status === 'PENDING_VENUE_REVIEW') {
        return res.status(400).json({ error: 'Submit a table request and wait for venue approval before checkout' });
      }
      if (existing.status !== 'APPROVED' && existing.status !== 'LEFT') {
        return res.status(400).json({ error: 'Venue approval required before checkout' });
      }
    }

    const menuItems = await hydrateTableMenu(table);
    const menuMap = new Map(menuItems.map((i) => [i.id, i]));
    for (const sel of payload.selectedMenuItems || []) {
      const item = menuMap.get(sel.menuItemId);
      if (!item || !item.isAvailable) {
        return res.status(400).json({ error: 'Invalid menu item selection' });
      }
    }

    const result = await buildVenueCheckoutForTable(table, table.venue, menuItems, payload, existing);
    if (result.error) return res.status(400).json({ error: result.error });
    const { checkout, bookingMode, settlementMode, menuSelections, menuTotal } = result;
    if (checkout.error) return res.status(400).json({ error: checkout.error });

    const isHost = bookingMode === 'host' || bookingMode === 'custom_host';

    if (checkout.total <= 0) {
      await prisma.$transaction(async (tx) => {
        await tx.venueTableMember.upsert({
          where: { venueTableId_userId: { venueTableId: table.id, userId: req.userId } },
          create: {
            venueTableId: table.id,
            userId: req.userId,
            selectedMenuItems: menuSelections.length ? menuSelections : undefined,
            settlementMode,
            memberRole: isHost ? 'HOST' : 'GUEST',
            status: 'CONFIRMED',
          },
          update: {
            selectedMenuItems: menuSelections.length ? menuSelections : undefined,
            settlementMode,
            memberRole: isHost ? 'HOST' : 'GUEST',
            status: 'CONFIRMED',
          },
        });
        const nextOccupancy = table.currentOccupancy + 1;
        const nextStatus =
          nextOccupancy >= table.guestCapacity ? 'FULL' : nextOccupancy > 0 ? 'PARTIALLY_FILLED' : table.status;
        await tx.venueTable.update({
          where: { id: table.id },
          data: { currentOccupancy: { increment: 1 }, status: nextStatus },
        });
        if (isHost && table.eventId && !table.hostedTableId) {
          await ensureHostedTableFromVenueHostPayment({
            tx,
            venueTable: table,
            userId: req.userId,
            paystackReference: `free_host_${table.id}_${req.userId}`,
            amountTotal: 0,
            selectedMenuItems: menuSelections.length ? menuSelections : undefined,
            settlementMode,
          });
        }
      });
      if (isHost) {
        const payer = await prisma.user.findUnique({
          where: { id: req.userId },
          select: { email: true },
        });
        await notifyPaymentSuccess({
          userId: req.userId,
          email: payer?.email,
          title: 'Table host booking confirmed',
          body: `You're now hosting ${table.tableName}. Open Host Dashboard to approve join requests and set table rules.`,
          actionUrl: '/HostDashboard?tab=tables&manage=1',
          referenceId: table.id,
          referenceType: 'VENUE_TABLE',
          emailSubject: `You're hosting ${table.tableName}`,
        });
      }
      return res.status(201).json({
        confirmed: true,
        memberId: (await prisma.venueTableMember.findUnique({
          where: { venueTableId_userId: { venueTableId: table.id, userId: req.userId } },
          select: { id: true },
        }))?.id,
        checkout: { lines: checkout.lines, settlement_mode: settlementMode, total: 0 },
        hostDashboardUrl: isHost ? '/HostDashboard?tab=tables&manage=1' : undefined,
      });
    }

    const member = await prisma.venueTableMember.upsert({
      where: { venueTableId_userId: { venueTableId: table.id, userId: req.userId } },
      create: {
        venueTableId: table.id,
        userId: req.userId,
        selectedMenuItems: menuSelections.length ? menuSelections : undefined,
        settlementMode,
        memberRole: isHost ? 'HOST' : 'GUEST',
        status: 'PENDING_PAYMENT',
      },
      update: {
        selectedMenuItems: menuSelections.length ? menuSelections : undefined,
        settlementMode,
        memberRole: isHost ? 'HOST' : 'GUEST',
        status: 'PENDING_PAYMENT',
      },
    });

    const metadata = buildTableCheckoutMetadata({
      userId: req.userId,
      venueTableId: table.id,
      eventId: table.eventId,
      settlementMode,
      lines: checkout.lines,
    });
    metadata.venueTableMemberId = member.id;
    metadata.venueId = table.venueId;
    metadata.selectedMenuItems = menuSelections;
    metadata.booking_mode = bookingMode;
    metadata.booking_fee_zar = Number(table.bookingFeeZar || 0);
    metadata.host_table_fee_zar = Number(table.hostTableFeeZar || 0);
    metadata.minimum_spend_zar = Number(table.minimumSpend || 0);
    metadata.menu_zar = menuTotal;

    const pay = await initializePaystackPayment({
      userId: req.userId,
      amountZar: checkout.total,
      metadata,
    });
    res.status(201).json({
      ...pay,
      memberId: member.id,
      amount: checkout.total,
      checkout: { lines: checkout.lines, settlement_mode: settlementMode },
    });
  } catch (e) {
    if (e instanceof z.ZodError) return res.status(400).json({ error: 'Invalid input' });
    next(e);
  }
});

router.delete('/:tableId/join', authenticateToken, async (req, res, next) => {
  try {
    const table = await prisma.venueTable.findUnique({ where: { id: req.params.tableId } });
    if (!table) return res.status(404).json({ error: 'Table not found' });
    const member = await prisma.venueTableMember.findUnique({
      where: { venueTableId_userId: { venueTableId: table.id, userId: req.userId } },
    });
    if (!member || member.status !== 'CONFIRMED') return res.status(400).json({ error: 'Only confirmed members can leave' });

    const nextOccupancy = Math.max(0, table.currentOccupancy - 1);
    const nextStatus =
      table.status === 'LOCKED' && table.amountContributed >= table.minimumSpend
        ? 'LOCKED'
        : (nextOccupancy > 0 || table.amountContributed > 0 ? 'PARTIALLY_FILLED' : 'AVAILABLE');
    await prisma.$transaction([
      prisma.venueTableMember.update({ where: { id: member.id }, data: { status: 'LEFT' } }),
      prisma.venueTable.update({ where: { id: table.id }, data: { currentOccupancy: { decrement: 1 }, status: nextStatus } }),
    ]);
    res.json({ left: true, refund: false });
  } catch (e) {
    next(e);
  }
});

export default router;
