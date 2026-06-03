import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticateToken } from '../middleware/auth.js';
import { normalizeHostingConfig } from '../lib/hostingConfig.js';

const router = Router();

/** Prefer entrance + component when present so UI matches stored line items. */
function bookingDisplayTotalZar(r) {
  const ent = Number(r.entranceZar ?? 0) || 0;
  const comp = Number(r.componentZar ?? 0) || 0;
  const tot = Number(r.amountTotal ?? 0) || 0;
  if (ent > 0 || comp > 0) return ent + comp;
  return tot;
}

function rollBookingStats(rows) {
  return {
    bookingRowCount: rows.length,
    totalPaidZar: rows.reduce((s, r) => s + bookingDisplayTotalZar(r), 0),
  };
}

function emptyEventTableBookingsSummary() {
  return {
    configuredTableSlots: 0,
    hostedTablesOpen: 0,
    hostedTablesFull: 0,
    totalGoingHeadcount: 0,
    pendingJoinRequests: 0,
    statsByRole: {
      all: { bookingRowCount: 0, totalPaidZar: 0 },
      HOST: { bookingRowCount: 0, totalPaidZar: 0 },
      GUEST: { bookingRowCount: 0, totalPaidZar: 0 },
    },
  };
}

/** Calendar day start UTC — event.date is compared the same way as listing “today’s” events. */
function startOfUtcToday() {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function eventDateIsPast(eventDate, startToday) {
  const t = new Date(eventDate);
  t.setUTCHours(0, 0, 0, 0);
  return t < startToday;
}

router.get('/event-table-bookings', authenticateToken, async (req, res, next) => {
  try {
    const ownedVenues = await prisma.venue.findMany({
      where: { ownerUserId: req.userId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!ownedVenues.length) {
      return res.json({
        items: [],
        eventSummaries: [],
        summary: emptyEventTableBookingsSummary(),
      });
    }
    const venueIds = ownedVenues.map((v) => v.id);
    const eventIdFilter = typeof req.query.event_id === 'string' && req.query.event_id.trim()
      ? req.query.event_id.trim()
      : null;

    const scopeRaw = String(req.query.event_scope || 'active').toLowerCase();
    const eventScope = ['active', 'past', 'all'].includes(scopeRaw) ? scopeRaw : 'active';
    const startToday = startOfUtcToday();

    const dateWhere =
      eventScope === 'active' ? { gte: startToday } : eventScope === 'past' ? { lt: startToday } : undefined;

    let eventsInScope = [];
    let eventSummaries = [];

    if (eventIdFilter) {
      const ev = await prisma.event.findFirst({
        where: { id: eventIdFilter, venueId: { in: venueIds }, deletedAt: null },
        select: { id: true, title: true, date: true, hostingConfig: true },
      });
      if (!ev) {
        return res.status(404).json({ error: 'Event not found' });
      }
      const isPast = eventDateIsPast(ev.date, startToday);
      if (eventScope === 'active' && isPast) {
        return res.json({
          items: [],
          eventSummaries: [],
          summary: emptyEventTableBookingsSummary(),
          eventScope,
          notice: 'past_event_use_past_scope',
        });
      }
      if (eventScope === 'past' && !isPast) {
        return res.json({
          items: [],
          eventSummaries: [],
          summary: emptyEventTableBookingsSummary(),
          eventScope,
          notice: 'upcoming_event_use_active_scope',
        });
      }
      eventsInScope = [ev];
      eventSummaries = [{ id: ev.id, title: ev.title, date: ev.date }];
    } else {
      const allVenueEvents = await prisma.event.findMany({
        where: {
          venueId: { in: venueIds },
          deletedAt: null,
          ...(dateWhere ? { date: dateWhere } : {}),
        },
        select: { id: true, title: true, date: true, hostingConfig: true },
      });
      eventsInScope = allVenueEvents;
      eventSummaries = allVenueEvents
        .map((e) => ({
          id: e.id,
          title: e.title,
          date: e.date,
        }))
        .sort((a, b) => (a.title || '').localeCompare(b.title || ''));
    }

    const eventIds = eventsInScope.map((e) => e.id);

    if (eventIds.length === 0) {
      return res.json({
        items: [],
        eventSummaries,
        summary: emptyEventTableBookingsSummary(),
        eventScope,
      });
    }

    let configuredTableSlots = 0;
    for (const ev of eventsInScope) {
      const c = normalizeHostingConfig(ev.hostingConfig);
      const g = Number(c.general?.max_tables);
      const v = Number(c.vip?.max_tables);
      configuredTableSlots += (Number.isFinite(g) && g > 0 ? g : 0) + (Number.isFinite(v) && v > 0 ? v : 0);
    }

    const hostedInScope = await prisma.hostedTable.findMany({
      where: { eventId: { in: eventIds }, tableType: 'IN_APP_EVENT' },
      select: { id: true, status: true },
    });
    const hostedTablesOpen = hostedInScope.filter((h) => h.status === 'ACTIVE').length;
    const hostedTablesFull = hostedInScope.filter((h) => h.status === 'FULL').length;
    const hostedIds = hostedInScope.map((h) => h.id);

    let totalGoingHeadcount = 0;
    let pendingJoinRequests = 0;
    if (hostedIds.length) {
      const goingRows = await prisma.hostedTableMember.groupBy({
        by: ['hostedTableId'],
        where: { hostedTableId: { in: hostedIds }, status: 'GOING' },
        _count: true,
      });
      totalGoingHeadcount = goingRows.reduce((s, r) => s + r._count, 0);
      const pendRows = await prisma.hostedTableMember.groupBy({
        by: ['hostedTableId'],
        where: { hostedTableId: { in: hostedIds }, status: 'PENDING' },
        _count: true,
      });
      pendingJoinRequests = pendRows.reduce((s, r) => s + r._count, 0);
    }

    const rows = await prisma.eventVenueTableBooking.findMany({
      where: {
        venueId: { in: venueIds },
        ...(eventIdFilter ? { eventId: eventIdFilter } : { eventId: { in: eventIds } }),
      },
      include: {
        venue: { select: { id: true, name: true } },
        event: { select: { id: true, title: true, date: true, city: true } },
        hostedTable: {
          select: {
            id: true,
            tableName: true,
            status: true,
            hostUserId: true,
            hostingCategory: true,
            hostingTierIndex: true,
            tierMinSpend: true,
            menuSpendTotal: true,
            tierIncludedItems: true,
            guestQuantity: true,
            spotsRemaining: true,
          },
        },
        user: { select: { id: true, fullName: true, username: true, userProfile: { select: { username: true } } } },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    const mapped = rows.map((r) => ({
      id: r.id,
      role: r.role,
      paystackReference: r.paystackReference,
      amountTotal: r.amountTotal,
      entranceZar: r.entranceZar,
      componentZar: r.componentZar,
      lineTotalZar: bookingDisplayTotalZar(r),
      createdAt: r.createdAt,
      venue: r.venue,
      event: r.event,
      hostedTable: r.hostedTable,
      user: {
        id: r.user.id,
        username: r.user.userProfile?.username || r.user.username || r.user.fullName || 'User',
      },
      selectedMenuItems: r.selectedMenuItems,
      hostingTierName: r.hostingTierName,
      hostingCategory: r.hostingCategory,
      menuTotalZar: r.menuTotalZar,
    }));

    const rawForStats = rows.map((r) => ({
      role: r.role,
      amountTotal: r.amountTotal,
      entranceZar: r.entranceZar,
      componentZar: r.componentZar,
    }));

    const summary = {
      configuredTableSlots,
      hostedTablesOpen,
      hostedTablesFull,
      totalGoingHeadcount,
      pendingJoinRequests,
      statsByRole: {
        all: rollBookingStats(rawForStats),
        HOST: rollBookingStats(rawForStats.filter((x) => x.role === 'HOST')),
        GUEST: rollBookingStats(rawForStats.filter((x) => x.role === 'GUEST')),
      },
    };

    res.json({ items: mapped, eventSummaries, summary, eventScope });
  } catch (e) {
    next(e);
  }
});

router.get('/venue-analytics', authenticateToken, async (req, res, next) => {
  try {
    const venueId = String(req.query.venue_id || '').trim();
    const days = Math.min(366, Math.max(1, parseInt(String(req.query.days || '30'), 10) || 30));
    const eventId = typeof req.query.event_id === 'string' && req.query.event_id.trim() ? req.query.event_id.trim() : null;
    if (!venueId) return res.status(400).json({ error: 'venue_id is required' });

    const venue = await prisma.venue.findFirst({
      where: { id: venueId, ownerUserId: req.userId, deletedAt: null },
      select: { id: true },
    });
    if (!venue) return res.status(403).json({ error: 'Forbidden' });

    const events = await prisma.event.findMany({
      where: { venueId, deletedAt: null, ...(eventId ? { id: eventId } : {}) },
      select: { id: true },
    });
    const eventIds = events.map((e) => e.id);
    if (eventId && eventIds.length === 0) return res.status(400).json({ error: 'Event not found for this venue' });

    const cutoff = new Date(Date.now() - days * 86400000);

    const payments = await prisma.payment.findMany({
      where: { status: 'success', createdAt: { gte: cutoff } },
      select: { amount: true, type: true, metadata: true, createdAt: true, reference: true },
      take: 12000,
    });

    const eventIdSet = new Set(eventIds);

    const matchesVenueScope = (meta) => {
      if (!meta || typeof meta !== 'object') return false;
      const vid = meta.venue_id ?? meta.venueId;
      if (vid != null && String(vid) === venueId) return true;
      const eid = meta.event_id ?? meta.eventId;
      if (eid != null && eventIdSet.has(String(eid))) return true;
      return false;
    };

    const matchesEventFilter = (meta) => {
      if (!eventId) return true;
      if (!meta || typeof meta !== 'object') return false;
      const eid = meta.event_id ?? meta.eventId;
      return eid != null && String(eid) === eventId;
    };

    let grossTotal = 0;
    let ticketPaymentZar = 0;
    let hostedTablePaymentZar = 0;
    let otherPaymentZar = 0;
    const revenueByDay = {};
    const matchedPaymentRefs = new Set();

    for (const p of payments) {
      const meta = p.metadata && typeof p.metadata === 'object' ? p.metadata : {};
      if (!matchesVenueScope(meta) || !matchesEventFilter(meta)) continue;
      if (p.reference) matchedPaymentRefs.add(p.reference);
      const amt = Number(p.amount) || 0;
      grossTotal += amt;
      const dayKey = p.createdAt.toISOString().slice(0, 10);
      revenueByDay[dayKey] = (revenueByDay[dayKey] || 0) + amt;

      const mtype = String(meta.type || '');
      if (mtype === 'HOSTED_TABLE_JOIN' || mtype === 'TABLE_HOST_FEE' || mtype === 'HOSTED_TABLE_EXTERNAL_LISTING') {
        hostedTablePaymentZar += amt;
      } else if (p.type === 'ticket' || mtype.includes('TICKET') || mtype === 'event') {
        ticketPaymentZar += amt;
      } else {
        otherPaymentZar += amt;
      }
    }

    const paidTx = await prisma.transaction.findMany({
      where: {
        venueId,
        status: 'paid',
        createdAt: { gte: cutoff },
        ...(eventId ? { eventId } : {}),
      },
      select: { amount: true, createdAt: true, stripeId: true, metadata: true },
      take: 8000,
    });

    for (const t of paidTx) {
      const ref = t.stripeId || (t.metadata && typeof t.metadata === 'object' ? t.metadata.reference : null);
      if (ref && matchedPaymentRefs.has(String(ref))) continue;
      const amt = Number(t.amount) || 0;
      grossTotal += amt;
      const dayKey = t.createdAt.toISOString().slice(0, 10);
      revenueByDay[dayKey] = (revenueByDay[dayKey] || 0) + amt;
      otherPaymentZar += amt;
    }

    const ticketSalesCount =
      eventIds.length === 0
        ? 0
        : await prisma.ticket.count({
            where: {
              eventId: { in: eventIds },
              createdAt: { gte: cutoff },
              hiddenFromHistoryAt: null,
            },
          });

    const revenueByDaySorted = Object.entries(revenueByDay)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, gross]) => ({ date, gross: Number(gross.toFixed(2)) }));

    res.json({
      venueId,
      days,
      cutoff: cutoff.toISOString(),
      grossRevenueZar: Number(grossTotal.toFixed(2)),
      netRevenueZar: Number((grossTotal * 0.85).toFixed(2)),
      ticketSalesCount,
      ticketPaymentZar: Number(ticketPaymentZar.toFixed(2)),
      hostedTablePaymentZar: Number(hostedTablePaymentZar.toFixed(2)),
      otherPaymentZar: Number(otherPaymentZar.toFixed(2)),
      revenueByDay: revenueByDaySorted,
    });
  } catch (e) {
    next(e);
  }
});

router.get('/venue-table-reservations', authenticateToken, async (req, res, next) => {
  try {
    const ownedVenues = await prisma.venue.findMany({
      where: { ownerUserId: req.userId, deletedAt: null },
      select: { id: true },
    });
    if (!ownedVenues.length) return res.json({ items: [] });
    const venueIds = ownedVenues.map((v) => v.id);
    const statusFilter = String(req.query.status || 'pending').toLowerCase();
    const statuses =
      statusFilter === 'all'
        ? ['PENDING_VENUE_REVIEW', 'APPROVED', 'DECLINED', 'PENDING_PAYMENT', 'CONFIRMED']
        : statusFilter === 'pending'
          ? ['PENDING_VENUE_REVIEW']
          : ['APPROVED', 'CONFIRMED', 'PENDING_PAYMENT'];
    const members = await prisma.venueTableMember.findMany({
      where: {
        status: { in: statuses },
        venueTable: { venueId: { in: venueIds } },
      },
      include: {
        user: { select: { id: true, fullName: true, userProfile: { select: { username: true, avatarUrl: true } } } },
        venueTable: {
          include: {
            event: { select: { id: true, title: true, date: true } },
            venue: { select: { id: true, name: true } },
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
      take: 100,
    });
    res.json({
      items: members.map((m) => ({
        id: m.id,
        status: m.status,
        userSpecs: m.userSpecs,
        selectedMenuItems: m.selectedMenuItems,
        declineReason: m.declineReason,
        amountPaid: m.amountPaid,
        joinedAt: m.joinedAt,
        user: {
          id: m.user.id,
          username: m.user.userProfile?.username,
          fullName: m.user.fullName,
          avatarUrl: m.user.userProfile?.avatarUrl,
        },
        table: {
          id: m.venueTable.id,
          tableName: m.venueTable.tableName,
          minimumSpend: m.venueTable.minimumSpend,
          bookingFeeZar: m.venueTable.bookingFeeZar,
          event: m.venueTable.event,
          venue: m.venueTable.venue,
        },
      })),
    });
  } catch (e) {
    next(e);
  }
});

/** Paid venue & day table bookings (incl. custom tables after guest checkout). */
router.get('/venue-table-bookings', authenticateToken, async (req, res, next) => {
  try {
    const ownedVenues = await prisma.venue.findMany({
      where: { ownerUserId: req.userId, deletedAt: null },
      select: { id: true },
    });
    if (!ownedVenues.length) return res.json({ items: [] });
    const venueIds = ownedVenues.map((v) => v.id);
    const members = await prisma.venueTableMember.findMany({
      where: {
        status: 'CONFIRMED',
        venueTable: { venueId: { in: venueIds } },
      },
      include: {
        user: { select: { id: true, fullName: true, userProfile: { select: { username: true } } } },
        venueTable: {
          include: {
            event: { select: { id: true, title: true, date: true } },
            venue: { select: { id: true, name: true, city: true } },
          },
        },
      },
      orderBy: { paidAt: 'desc' },
      take: 120,
    });
    res.json({
      items: members.map((m) => ({
        id: m.id,
        status: m.status,
        amountPaid: m.amountPaid,
        settlementMode: m.settlementMode,
        selectedMenuItems: m.selectedMenuItems,
        userSpecs: m.userSpecs,
        joinedAt: m.joinedAt,
        paidAt: m.paidAt,
        user: {
          id: m.user.id,
          username: m.user.userProfile?.username,
          fullName: m.user.fullName,
        },
        table: {
          id: m.venueTable.id,
          tableName: m.venueTable.tableName,
          minimumSpend: m.venueTable.minimumSpend,
          isCustomListing: m.venueTable.isCustomListing,
          event: m.venueTable.event,
          venue: m.venueTable.venue,
        },
      })),
    });
  } catch (e) {
    next(e);
  }
});

export default router;
