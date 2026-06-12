import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticateToken } from '../middleware/auth.js';
import { normalizeHostingConfig } from '../lib/hostingConfig.js';
import { splitPlatformGross } from '../lib/platformSplit.js';
import {
  flattenPaymentMetadata,
  basePaymentReference,
  classifyVenuePaymentRevenue,
} from '../lib/paymentMetadata.js';
import { normalizeTicketTiers } from '../lib/issueEventTickets.js';

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

function tableInUse(table, hostedTable = null) {
  if (!table) return false;
  if (table.currentOccupancy > 0) return true;
  if (table.hostUserId) return true;
  if (table.hostedTableId) return true;
  if (hostedTable && hostedTable.status !== 'CLOSED') return true;
  return false;
}

function canHideTableFromListings(table, hostedTable = null) {
  if (!table?.isActive) return false;
  if (table.isCustomListing) return false;
  return !tableInUse(table, hostedTable);
}

function computeCanRelease(table, hostedTable) {
  if (!table) return false;
  if (table.currentOccupancy > 0) return true;
  if (table.status !== 'AVAILABLE') return true;
  if (table.hostUserId) return true;
  if (table.hostedTableId) return true;
  if (hostedTable && hostedTable.status !== 'CLOSED') return true;
  return false;
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
    let venueIds = ownedVenues.map((v) => v.id);
    const venueIdFilter =
      typeof req.query.venue_id === 'string' && req.query.venue_id.trim()
        ? req.query.venue_id.trim()
        : null;
    if (venueIdFilter) {
      if (!venueIds.includes(venueIdFilter)) {
        return res.status(404).json({ error: 'Venue not found' });
      }
      venueIds = [venueIdFilter];
    }
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
      select: { id: true, date: true },
    });
    const eventIds = events.map((e) => e.id);
    if (eventId && eventIds.length === 0) return res.status(400).json({ error: 'Event not found for this venue' });

    const cutoff = new Date(Date.now() - days * 86400000);
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);
    const eventsInPeriod = events.filter((e) => e.date && new Date(e.date) >= cutoff).length;
    const upcomingEventsCount = events.filter((e) => e.date && new Date(e.date) >= todayStart).length;

    const ledgerRows = await prisma.payoutLedger.findMany({
      where: {
        recipientVenueId: venueId,
        recipientType: 'VENUE',
        createdAt: { gte: cutoff },
      },
      select: {
        paymentReference: true,
        grossAmount: true,
        recipientAmount: true,
        createdAt: true,
      },
      take: 15000,
    });

    const ledgerRefs = [...new Set(ledgerRows.map((r) => r.paymentReference).filter(Boolean))];
    const ledgerBaseRefs = [...new Set(ledgerRefs.map((r) => basePaymentReference(r)).filter(Boolean))];
    const ledgerLookupRefs = [...new Set([...ledgerRefs, ...ledgerBaseRefs])];
    const ledgerPayments =
      ledgerLookupRefs.length > 0
        ? await prisma.payment.findMany({
            where: { reference: { in: ledgerLookupRefs } },
            select: { reference: true, metadata: true, type: true },
          })
        : [];
    const paymentMetaByRef = new Map();
    const paymentTypeByRef = new Map();
    for (const p of ledgerPayments) {
      paymentMetaByRef.set(p.reference, flattenPaymentMetadata(p.metadata));
      paymentTypeByRef.set(p.reference, p.type);
    }

    const resolveLedgerPaymentMeta = (ref) => {
      const base = basePaymentReference(ref);
      return paymentMetaByRef.get(ref) || paymentMetaByRef.get(base) || {};
    };
    const resolveLedgerPaymentType = (ref) => {
      const base = basePaymentReference(ref);
      return paymentTypeByRef.get(ref) ?? paymentTypeByRef.get(base) ?? null;
    };

    const matchesEventFilterMeta = (meta) => {
      if (!eventId) return true;
      if (!meta || typeof meta !== 'object') return false;
      const eid = meta.event_id ?? meta.eventId;
      return eid != null && String(eid) === eventId;
    };

    let grossTotal = 0;
    let netTotal = 0;
    const revenueCounters = {
      ticketPaymentZar: 0,
      hostedTablePaymentZar: 0,
      venueTablePaymentZar: 0,
      otherPaymentZar: 0,
    };
    const revenueByDay = {};
    const matchedPaymentRefs = new Set();

    for (const row of ledgerRows) {
      const meta = resolveLedgerPaymentMeta(row.paymentReference);
      if (!matchesEventFilterMeta(meta)) continue;
      const gross = Number(row.grossAmount) || 0;
      const net = Number(row.recipientAmount) || 0;
      grossTotal += gross;
      netTotal += net;
      if (row.paymentReference) {
        matchedPaymentRefs.add(row.paymentReference);
        matchedPaymentRefs.add(basePaymentReference(row.paymentReference));
      }
      const dayKey = row.createdAt.toISOString().slice(0, 10);
      revenueByDay[dayKey] = (revenueByDay[dayKey] || 0) + gross;

      classifyVenuePaymentRevenue(
        meta?.type,
        resolveLedgerPaymentType(row.paymentReference),
        gross,
        revenueCounters,
      );
    }

    const venuePaymentOr = [
      { metadata: { path: ['venue_id'], equals: venueId } },
      { metadata: { path: ['venueId'], equals: venueId } },
      ...eventIds.flatMap((id) => [
        { metadata: { path: ['event_id'], equals: id } },
        { metadata: { path: ['eventId'], equals: id } },
      ]),
    ];

    const payments = await prisma.payment.findMany({
      where: {
        status: 'success',
        createdAt: { gte: cutoff },
        ...(venuePaymentOr.length ? { OR: venuePaymentOr } : {}),
      },
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

    for (const p of payments) {
      const meta = flattenPaymentMetadata(p.metadata);
      if (!matchesVenueScope(meta) || !matchesEventFilter(meta)) continue;
      if (p.reference && matchedPaymentRefs.has(p.reference)) continue;
      const amt = Number(p.amount) || 0;
      const { recipientAmount } = splitPlatformGross(amt);
      grossTotal += amt;
      netTotal += recipientAmount;
      const dayKey = p.createdAt.toISOString().slice(0, 10);
      revenueByDay[dayKey] = (revenueByDay[dayKey] || 0) + amt;

      classifyVenuePaymentRevenue(meta.type, p.type, amt, revenueCounters);
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
      const { recipientAmount } = splitPlatformGross(amt);
      grossTotal += amt;
      netTotal += recipientAmount;
      const dayKey = t.createdAt.toISOString().slice(0, 10);
      revenueByDay[dayKey] = (revenueByDay[dayKey] || 0) + amt;
      const txMeta = flattenPaymentMetadata(t.metadata);
      if (txMeta && Object.keys(txMeta).length) {
        classifyVenuePaymentRevenue(txMeta.type, null, amt, revenueCounters);
      } else {
        revenueCounters.otherPaymentZar += amt;
      }
    }

    const { ticketPaymentZar, hostedTablePaymentZar, venueTablePaymentZar, otherPaymentZar } = revenueCounters;

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
      .map(([date, gross]) => {
        const g = Number(gross.toFixed(2));
        const dayNet = grossTotal > 0 ? (g / grossTotal) * netTotal : 0;
        return { date, gross: g, net: Number(dayNet.toFixed(2)) };
      });

    res.json({
      venueId,
      days,
      cutoff: cutoff.toISOString(),
      grossRevenueZar: Number(grossTotal.toFixed(2)),
      netRevenueZar: Number(netTotal.toFixed(2)),
      ticketSalesCount,
      ticketPaymentZar: Number(ticketPaymentZar.toFixed(2)),
      hostedTablePaymentZar: Number(hostedTablePaymentZar.toFixed(2)),
      venueTablePaymentZar: Number(venueTablePaymentZar.toFixed(2)),
      otherPaymentZar: Number(otherPaymentZar.toFixed(2)),
      eventsInPeriod,
      upcomingEventsCount,
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
    let venueIds = ownedVenues.map((v) => v.id);
    const venueIdFilter =
      typeof req.query.venue_id === 'string' && req.query.venue_id.trim()
        ? req.query.venue_id.trim()
        : null;
    if (venueIdFilter) {
      if (!venueIds.includes(venueIdFilter)) return res.status(404).json({ error: 'Venue not found' });
      venueIds = [venueIdFilter];
    }
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

    const hostedTableIds = [
      ...new Set(members.map((m) => m.venueTable.hostedTableId).filter(Boolean)),
    ];
    const hostedById = new Map();
    if (hostedTableIds.length) {
      const hostedRows = await prisma.hostedTable.findMany({
        where: { id: { in: hostedTableIds } },
        select: { id: true, status: true },
      });
      for (const ht of hostedRows) hostedById.set(ht.id, ht);
    }

    res.json({
      items: members.map((m) => {
        const hostedTable = m.venueTable.hostedTableId
          ? hostedById.get(m.venueTable.hostedTableId) || null
          : null;
        return {
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
            status: m.venueTable.status,
            currentOccupancy: m.venueTable.currentOccupancy,
            hostedTableId: m.venueTable.hostedTableId,
            event: m.venueTable.event,
            venue: m.venueTable.venue,
            canRelease: computeCanRelease(m.venueTable, hostedTable),
          },
        };
      }),
    });
  } catch (e) {
    next(e);
  }
});

function basePaystackRef(ref) {
  return String(ref || '').replace(/-\d+$/, '');
}

/** Ticket purchases for ticketing events at owned venues. */
router.get('/ticket-bookings', authenticateToken, async (req, res, next) => {
  try {
    const ownedVenues = await prisma.venue.findMany({
      where: { ownerUserId: req.userId, deletedAt: null },
      select: { id: true, name: true },
    });
    if (!ownedVenues.length) {
      return res.json({
        items: [],
        eventSummaries: [],
        summary: { orderCount: 0, ticketCount: 0, admittedCount: 0, totalRevenueZar: 0, totalVenueShareZar: 0, totalGrossZar: 0 },
      });
    }
    const venueIds = ownedVenues.map((v) => v.id);
    const venueIdFilter =
      typeof req.query.venue_id === 'string' && req.query.venue_id.trim()
        ? req.query.venue_id.trim()
        : null;
    const scopedVenueIds = venueIdFilter && venueIds.includes(venueIdFilter) ? [venueIdFilter] : venueIds;

    const eventIdFilter =
      typeof req.query.event_id === 'string' && req.query.event_id.trim()
        ? req.query.event_id.trim()
        : null;
    const scopeRaw = String(req.query.event_scope || 'active').toLowerCase();
    const eventScope = ['active', 'past', 'all'].includes(scopeRaw) ? scopeRaw : 'active';
    const startToday = startOfUtcToday();
    const dateWhere =
      eventScope === 'active' ? { gte: startToday } : eventScope === 'past' ? { lt: startToday } : undefined;

    let eventsInScope = [];
    if (eventIdFilter) {
      const ev = await prisma.event.findFirst({
        where: {
          id: eventIdFilter,
          venueId: { in: scopedVenueIds },
          deletedAt: null,
        },
        select: {
          id: true,
          title: true,
          date: true,
          startTime: true,
          city: true,
          ticketTiers: true,
          eventFormat: true,
        },
      });
      if (!ev) return res.status(404).json({ error: 'Event not found' });
      const isPast = eventDateIsPast(ev.date, startToday);
      if (eventScope === 'active' && isPast) {
        return res.json({
          items: [],
          eventSummaries: [],
          summary: { orderCount: 0, ticketCount: 0, admittedCount: 0, totalRevenueZar: 0 },
          eventScope,
          notice: 'past_event_use_past_scope',
        });
      }
      if (eventScope === 'past' && !isPast) {
        return res.json({
          items: [],
          eventSummaries: [],
          summary: { orderCount: 0, ticketCount: 0, admittedCount: 0, totalRevenueZar: 0 },
          eventScope,
          notice: 'upcoming_event_use_active_scope',
        });
      }
      eventsInScope = [ev];
    } else {
      eventsInScope = await prisma.event.findMany({
        where: {
          venueId: { in: scopedVenueIds },
          deletedAt: null,
          ...(dateWhere ? { date: dateWhere } : {}),
        },
        select: {
          id: true,
          title: true,
          date: true,
          startTime: true,
          city: true,
          ticketTiers: true,
          eventFormat: true,
        },
      });
    }

    const soldEventRows = await prisma.ticket.findMany({
      where: {
        kind: 'EVENT_TICKET',
        hiddenFromHistoryAt: null,
        event: {
          venueId: { in: scopedVenueIds },
          deletedAt: null,
          ...(dateWhere ? { date: dateWhere } : {}),
        },
      },
      select: { eventId: true },
      distinct: ['eventId'],
    });
    const soldEventIds = new Set(soldEventRows.map((row) => row.eventId).filter(Boolean));

    eventsInScope = eventsInScope.filter((ev) => {
      if (ev.eventFormat === 'TICKETING_ONLY') return true;
      if (soldEventIds.has(ev.id)) return true;
      return normalizeTicketTiers(ev.ticketTiers).length > 0;
    });

    const eventIds = eventsInScope.map((e) => e.id);
    const eventSummaries = eventsInScope
      .map((e) => ({ id: e.id, title: e.title, date: e.date, startTime: e.startTime, city: e.city }))
      .sort((a, b) => (a.title || '').localeCompare(b.title || ''));

    if (!eventIds.length) {
      return res.json({
        items: [],
        eventSummaries,
        summary: { orderCount: 0, ticketCount: 0, admittedCount: 0, totalRevenueZar: 0 },
        eventScope,
      });
    }

    const ticketWhere = {
      kind: 'EVENT_TICKET',
      eventId: { in: eventIds },
      hiddenFromHistoryAt: null,
    };

    const [ticketCount, admittedCount] = await Promise.all([
      prisma.ticket.count({ where: ticketWhere }),
      prisma.ticket.count({ where: { ...ticketWhere, admittedAt: { not: null } } }),
    ]);

    const tickets = await prisma.ticket.findMany({
      where: ticketWhere,
      include: {
        user: {
          select: {
            id: true,
            fullName: true,
            username: true,
            userProfile: { select: { username: true, avatarUrl: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 2000,
    });

    function venueShareFromPayment(pay) {
      const meta = pay?.metadata && typeof pay.metadata === 'object' ? pay.metadata : {};
      if (meta.venue_share_zar != null) return Number(meta.venue_share_zar) || 0;
      if (meta.recipient_amount != null) return Number(meta.recipient_amount) || 0;
      const gross = Number(pay?.amount) || 0;
      return splitPlatformGross(gross).recipientAmount;
    }

    function platformFeeFromPayment(pay) {
      const meta = pay?.metadata && typeof pay.metadata === 'object' ? pay.metadata : {};
      if (meta.platform_fee_zar != null) return Number(meta.platform_fee_zar) || 0;
      if (meta.sec_amount != null) return Number(meta.sec_amount) || 0;
      const gross = Number(pay?.amount) || 0;
      return splitPlatformGross(gross).secAmount;
    }

    const eventById = new Map(eventsInScope.map((e) => [e.id, e]));
    const refs = [...new Set(tickets.map((t) => basePaystackRef(t.paystackReference)).filter(Boolean))];
    const payments =
      refs.length > 0
        ? await prisma.payment.findMany({
            where: { reference: { in: refs }, status: 'success' },
            select: { reference: true, amount: true, metadata: true, createdAt: true },
          })
        : [];
    const paymentByRef = new Map(payments.map((p) => [p.reference, p]));

    const groups = new Map();
    for (const t of tickets) {
      const baseRef = basePaystackRef(t.paystackReference);
      const ev = t.eventId ? eventById.get(t.eventId) : null;
      if (!groups.has(baseRef)) {
        const pay = paymentByRef.get(baseRef);
        const meta = pay?.metadata && typeof pay.metadata === 'object' ? pay.metadata : {};
        groups.set(baseRef, {
          id: baseRef,
          paystackReference: baseRef,
          event: ev
            ? { id: ev.id, title: ev.title, date: ev.date, startTime: ev.startTime, city: ev.city }
            : { id: t.eventId, title: t.title, date: null, startTime: null, city: null },
          tierName: t.subtitle || meta.ticket_tier_name || 'Ticket',
          purchaser: {
            id: t.user.id,
            username: t.user.userProfile?.username || t.user.username,
            fullName: t.user.fullName,
            avatarUrl: t.user.userProfile?.avatarUrl || null,
          },
          tickets: [],
          quantity: 0,
          admittedCount: 0,
          grossPaidZar: pay ? Number(pay.amount) || 0 : 0,
          venueShareZar: pay ? venueShareFromPayment(pay) : 0,
          platformFeeZar: pay ? platformFeeFromPayment(pay) : 0,
          amountPaidZar: pay ? Number(pay.amount) || 0 : 0,
          purchasedAt: pay?.createdAt || t.createdAt,
          menuAddons: [],
        });
      }
      const g = groups.get(baseRef);
      g.tickets.push({
        id: t.id,
        holderDisplayName: t.holderDisplayName,
        admittedAt: t.admittedAt,
        qrToken: t.qrToken,
      });
      g.quantity += 1;
      if (t.admittedAt) g.admittedCount += 1;
    }

    const items = [...groups.values()].sort(
      (a, b) => new Date(b.purchasedAt).getTime() - new Date(a.purchasedAt).getTime(),
    );

    const summary = {
      orderCount: items.length,
      ticketCount,
      admittedCount,
      totalRevenueZar: items.reduce((s, i) => s + Number(i.grossPaidZar || 0), 0),
      totalGrossZar: items.reduce((s, i) => s + Number(i.grossPaidZar || 0), 0),
      totalVenueShareZar: items.reduce((s, i) => s + Number(i.venueShareZar || 0), 0),
    };

    res.json({ items, eventSummaries, summary, eventScope });
  } catch (e) {
    next(e);
  }
});

router.post('/venue-tables/:tableId/release', authenticateToken, async (req, res, next) => {
  try {
    const table = await prisma.venueTable.findUnique({
      where: { id: req.params.tableId },
      include: { venue: { select: { id: true, ownerUserId: true } } },
    });
    if (!table) return res.status(404).json({ error: 'Table not found' });
    if (table.venue.ownerUserId !== req.userId) return res.status(403).json({ error: 'Forbidden' });

    let hostedTable = null;
    if (table.hostedTableId) {
      hostedTable = await prisma.hostedTable.findUnique({
        where: { id: table.hostedTableId },
        select: { id: true, status: true },
      });
    }
    if (!computeCanRelease(table, hostedTable)) {
      return res.status(400).json({ error: 'Table is already available' });
    }

    await prisma.$transaction(async (tx) => {
      if (table.hostedTableId) {
        await tx.hostedTable.update({
          where: { id: table.hostedTableId },
          data: { status: 'CLOSED' },
        });
      }
      await tx.venueTable.update({
        where: { id: table.id },
        data: {
          currentOccupancy: 0,
          status: 'AVAILABLE',
          amountContributed: 0,
          hostUserId: null,
          hostedTableId: null,
        },
      });
    });

    res.json({ released: true, tableId: table.id });
  } catch (e) {
    next(e);
  }
});

/** Live event table slots — which are in use vs available to hide from listings. */
router.get('/event-venue-tables', authenticateToken, async (req, res, next) => {
  try {
    const eventId = typeof req.query.event_id === 'string' ? req.query.event_id.trim() : '';
    if (!eventId) return res.status(400).json({ error: 'event_id is required' });

    const event = await prisma.event.findFirst({
      where: { id: eventId, deletedAt: null, venue: { ownerUserId: req.userId } },
      select: { id: true, title: true, status: true, date: true },
    });
    if (!event) return res.status(404).json({ error: 'Event not found' });

    const tables = await prisma.venueTable.findMany({
      where: { eventId, isCustomListing: false },
      orderBy: [{ tierLabel: 'asc' }, { tableName: 'asc' }],
    });

    const hostedIds = tables.map((t) => t.hostedTableId).filter(Boolean);
    const hostedRows =
      hostedIds.length > 0
        ? await prisma.hostedTable.findMany({
            where: { id: { in: hostedIds } },
            select: { id: true, status: true, tableName: true, hostUserId: true, spotsRemaining: true },
          })
        : [];
    const hostedById = new Map(hostedRows.map((h) => [h.id, h]));

    res.json({
      event: { id: event.id, title: event.title, status: event.status, date: event.date },
      items: tables.map((t) => {
        const hosted = t.hostedTableId ? hostedById.get(t.hostedTableId) : null;
        const inUse = tableInUse(t, hosted);
        return {
          id: t.id,
          tableName: t.tableName,
          tierLabel: t.tierLabel,
          hostingTierKey: t.hostingTierKey,
          isActive: t.isActive,
          currentOccupancy: t.currentOccupancy,
          guestCapacity: t.guestCapacity,
          status: t.status,
          inUse,
          usageLabel: inUse
            ? t.currentOccupancy > 0
              ? `In use · ${t.currentOccupancy}/${t.guestCapacity} guests`
              : t.hostUserId || t.hostedTableId
                ? 'Hosted — active'
                : 'In use'
            : t.isActive
              ? 'Available'
              : 'Hidden from listings',
          canHideFromListings: canHideTableFromListings(t, hosted),
          canRestoreToListings: !t.isActive && !inUse,
        };
      }),
    });
  } catch (e) {
    next(e);
  }
});

router.post('/venue-tables/:tableId/hide-from-listings', authenticateToken, async (req, res, next) => {
  try {
    const table = await prisma.venueTable.findUnique({
      where: { id: req.params.tableId },
      include: { venue: { select: { ownerUserId: true } } },
    });
    if (!table) return res.status(404).json({ error: 'Table not found' });
    if (table.venue.ownerUserId !== req.userId) return res.status(403).json({ error: 'Forbidden' });
    if (table.isCustomListing) return res.status(400).json({ error: 'Cannot hide the custom request listing' });

    let hostedTable = null;
    if (table.hostedTableId) {
      hostedTable = await prisma.hostedTable.findUnique({
        where: { id: table.hostedTableId },
        select: { id: true, status: true },
      });
    }
    if (!canHideTableFromListings(table, hostedTable)) {
      return res.status(400).json({
        error: tableInUse(table, hostedTable)
          ? 'This table is in use — only empty tables can be removed from listings'
          : 'Table is already hidden',
      });
    }

    await prisma.venueTable.update({
      where: { id: table.id },
      data: { isActive: false },
    });
    res.json({ hidden: true, tableId: table.id });
  } catch (e) {
    next(e);
  }
});

router.post('/venue-tables/:tableId/restore-to-listings', authenticateToken, async (req, res, next) => {
  try {
    const table = await prisma.venueTable.findUnique({
      where: { id: req.params.tableId },
      include: { venue: { select: { ownerUserId: true } } },
    });
    if (!table) return res.status(404).json({ error: 'Table not found' });
    if (table.venue.ownerUserId !== req.userId) return res.status(403).json({ error: 'Forbidden' });

    let hostedTable = null;
    if (table.hostedTableId) {
      hostedTable = await prisma.hostedTable.findUnique({
        where: { id: table.hostedTableId },
        select: { id: true, status: true },
      });
    }
    if (table.isActive) return res.status(400).json({ error: 'Table is already listed' });
    if (tableInUse(table, hostedTable)) {
      return res.status(400).json({ error: 'Cannot restore a table that is currently in use' });
    }

    await prisma.venueTable.update({
      where: { id: table.id },
      data: { isActive: true },
    });
    res.json({ restored: true, tableId: table.id });
  } catch (e) {
    next(e);
  }
});

export default router;
