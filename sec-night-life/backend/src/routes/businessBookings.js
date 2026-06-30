import { Router } from 'express';
import { prisma } from '../lib/prisma.js';
import { authenticateToken } from '../middleware/auth.js';
import { normalizeHostingConfig } from '../lib/hostingConfig.js';
import { splitPlatformGross } from '../lib/platformSplit.js';
import {
  flattenPaymentMetadata,
  basePaymentReference,
  classifyVenuePaymentRevenue,
  isTicketPaymentMeta,
} from '../lib/paymentMetadata.js';
import { normalizeTicketTiers } from '../lib/issueEventTickets.js';
import {
  resolveAccessibleVenueIds,
  resolveBusinessVenueScope,
  staffCtxFromQuery,
  staffHasVenuePermission,
  venueIdFromQuery,
} from '../lib/access.js';
import { eventEndsAtFromEvent } from '../lib/ticketHelpers.js';
import { repairGuestEventVenueTableBookingsForEvents } from '../lib/eventVenueBooking.js';
import { resolveVenueMenuSelections } from '../lib/menuHelpers.js';
import {
  isRefundedPaymentRef,
  loadRefundedPaymentRefs,
  loadRefundedMetricsForPeriod,
} from '../lib/refunds.js';
import { releaseVenueTableSlot, computeCanReleaseTable } from '../lib/venueTableSlotRelease.js';

const router = Router();

async function requireVenueScope(req, res, permission) {
  const scope = await resolveBusinessVenueScope(req.userId, {
    staffCtx: staffCtxFromQuery(req.query),
    venueIdFilter: venueIdFromQuery(req.query),
    permission,
  });
  if (!scope.ok) {
    res.status(scope.status).json({ error: scope.error });
    return null;
  }
  if (venueIdFromQuery(req.query) && !scope.venueIds.length) {
    res.status(404).json({ error: 'Venue not found' });
    return null;
  }
  return scope;
}

function bookingsVenueScope(req) {
  return {
    venueIdFilter: venueIdFromQuery(req.query),
    staffCtx: staffCtxFromQuery(req.query),
    permission: 'bookings',
  };
}

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

function bookingGroupKey(row) {
  if (row.hostedTable?.id) return String(row.hostedTable.id);
  if (row.venueTableId) {
    return `direct-vt-${row.venueTableId}-s${row.tableSessionNumber || 1}`;
  }
  return null;
}

function syntheticHostedTableFromVenueRow(vt, sessionNumber = 1) {
  if (!vt) return null;
  return {
    id: `direct-vt-${vt.id}-s${sessionNumber}`,
    tableName: vt.tableName,
    status: 'ACTIVE',
    hostUserId: null,
    hostingCategory: null,
    hostingTierIndex: null,
    tierMinSpend: vt.minimumSpend,
    menuSpendTotal: null,
    tierIncludedItems: null,
    guestQuantity: vt.guestCapacity,
    spotsRemaining: Math.max(0, Number(vt.guestCapacity) - Number(vt.currentOccupancy)),
  };
}

function groupEventTableBookingsByTable(mapped) {
  const groups = new Map();
  for (const row of mapped) {
    const tableId = bookingGroupKey(row);
    if (!tableId) continue;
    if (!groups.has(tableId)) {
      groups.set(tableId, {
        id: tableId,
        hostedTable: row.hostedTable,
        event: row.event,
        venue: row.venue,
        totalPaidZar: 0,
        transactionCount: 0,
        lastActivityAt: row.createdAt,
        transactions: [],
        rolesSummary: { hosts: 0, guests: 0 },
        isDirectVenueSlot: Boolean(row.isDirectVenueSlot),
      });
    }
    const g = groups.get(tableId);
    const lineTotal = Number(row.lineTotalZar || 0);
    g.totalPaidZar = Math.round((g.totalPaidZar + lineTotal) * 100) / 100;
    g.transactionCount += 1;
    if (new Date(row.createdAt) > new Date(g.lastActivityAt)) g.lastActivityAt = row.createdAt;
    g.transactions.push(row);
    if (row.role === 'HOST') g.rolesSummary.hosts += 1;
    else if (row.role === 'GUEST') g.rolesSummary.guests += 1;
  }
  for (const g of groups.values()) {
    g.transactions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }
  return [...groups.values()].sort(
    (a, b) => new Date(b.lastActivityAt).getTime() - new Date(a.lastActivityAt).getTime(),
  );
}

/** Include paid venue-table guests missing from EventVenueTableBooking (e.g. direct event slot joins). */
async function supplementEventTableBookingsFromVenueMembers({ eventIds, venueIds, existingMapped, refundedRefs = null }) {
  if (!eventIds.length || !venueIds.length) return existingMapped;

  const existingKeys = new Set(
    existingMapped.map((r) => {
      const gk = bookingGroupKey(r);
      return gk ? `${gk}:${r.user?.id}:${r.role}` : null;
    }).filter(Boolean),
  );
  const existingRefs = new Set(
    existingMapped.map((r) => r.paystackReference).filter(Boolean),
  );

  const members = await prisma.venueTableMember.findMany({
    where: {
      memberRole: 'GUEST',
      paystackReference: { not: null },
      status: { in: ['CONFIRMED', 'LEFT', 'REFUNDED'] },
      venueTable: {
        eventId: { in: eventIds },
        venueId: { in: venueIds },
      },
    },
    include: {
      venueTable: {
        include: {
          event: { select: { id: true, title: true, date: true, city: true } },
          venue: { select: { id: true, name: true } },
        },
      },
      user: {
        select: {
          id: true,
          fullName: true,
          username: true,
          userProfile: { select: { username: true } },
        },
      },
    },
    orderBy: { paidAt: 'desc' },
    take: 500,
  });

  const hostedIds = [
    ...new Set(members.map((m) => m.venueTable?.hostedTableId).filter(Boolean)),
  ];
  const hostedById = new Map();
  if (hostedIds.length) {
    const hostedRows = await prisma.hostedTable.findMany({
      where: { id: { in: hostedIds } },
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
    });
    for (const ht of hostedRows) hostedById.set(ht.id, ht);
  }

  const supplemental = [];
  for (const m of members) {
    const vt = m.venueTable;
    if (!vt?.event) continue;

    let hostedTable = vt.hostedTableId ? hostedById.get(vt.hostedTableId) || null : null;
    let isDirectVenueSlot = false;
    let sessionNumber = Number(vt.tableSessionNumber) || 1;
    if (!hostedTable) {
      isDirectVenueSlot = true;
      if (m.status === 'LEFT') sessionNumber = Math.max(1, sessionNumber - 1);
      hostedTable = syntheticHostedTableFromVenueRow(vt, sessionNumber);
    }

    const role = 'GUEST';
    if (m.paystackReference && existingRefs.has(m.paystackReference)) continue;
    const key = `${bookingGroupKey({ hostedTable, venueTableId: vt.id, tableSessionNumber: sessionNumber })}:${m.userId}:${role}`;
    if (existingKeys.has(key)) continue;
    existingKeys.add(key);
    if (m.paystackReference) existingRefs.add(m.paystackReference);

    const isRefunded =
      m.status === 'REFUNDED' ||
      (refundedRefs && isRefundedPaymentRef(m.paystackReference, refundedRefs));
    const paidAmount = isRefunded ? 0 : Number(m.amountPaid || 0);

    supplemental.push({
      id: `vtm-${m.id}`,
      role,
      paystackReference: m.paystackReference,
      refundStatus: isRefunded ? 'APPROVED' : null,
      amountTotal: paidAmount,
      entranceZar: null,
      componentZar: paidAmount,
      lineTotalZar: paidAmount,
      createdAt: m.paidAt || m.createdAt,
      venue: vt.venue,
      event: vt.event,
      hostedTable,
      venueTableId: isDirectVenueSlot ? vt.id : null,
      tableSessionNumber: isDirectVenueSlot ? sessionNumber : null,
      isDirectVenueSlot,
      user: {
        id: m.user.id,
        username: m.user.userProfile?.username || m.user.username || m.user.fullName || 'User',
      },
      selectedMenuItems: m.selectedMenuItems,
      hostingTierName: vt.tierLabel,
      hostingCategory: null,
      menuTotalZar: m.amountPaid,
    });
  }

  return [...existingMapped, ...supplemental];
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

function eventSelectForBookings() {
  return {
    id: true,
    title: true,
    date: true,
    startTime: true,
    endsAt: true,
    hostingConfig: true,
    eventFormat: true,
    ticketTiers: true,
  };
}

/** Active/past scope uses event end instant when available (matches Events Manager lifecycle). */
function eventIsPastByEndsAt(ev, now = new Date()) {
  const end = eventEndsAtFromEvent(ev);
  if (end && !Number.isNaN(end.getTime())) return end.getTime() <= now.getTime();
  return eventDateIsPast(ev.date, startOfUtcToday());
}

function eventIsActiveByEndsAt(ev, now = new Date()) {
  return !eventIsPastByEndsAt(ev, now);
}

/** Table-hosting events only — excludes ticketed-only experiences from event table bookings. */
function eventSupportsTableBookings(ev) {
  if (!ev) return false;
  if (ev.eventFormat === 'TABLE_HOSTING') return true;
  if (ev.eventFormat === 'TICKETING_ONLY') return false;

  const hosting = normalizeHostingConfig(ev.hostingConfig);
  const tableTierCount =
    (Array.isArray(hosting.general?.tiers) ? hosting.general.tiers.length : 0) +
    (Array.isArray(hosting.vip?.tiers) ? hosting.vip.tiers.length : 0);
  const maxG = Number(hosting.general?.max_tables);
  const maxV = Number(hosting.vip?.max_tables);
  const hasTableHosting =
    tableTierCount > 0 ||
    (Number.isFinite(maxG) && maxG > 0) ||
    (Number.isFinite(maxV) && maxV > 0) ||
    Boolean(hosting.general?.allows_custom_requests) ||
    Boolean(hosting.vip?.allows_custom_requests);
  const hasTicketTiers = normalizeTicketTiers(ev.ticketTiers).length > 0;

  if (hasTicketTiers && !hasTableHosting) return false;
  return hasTableHosting;
}

function eventQualifiesForTableBookings(ev, eventIdsWithVenueTables) {
  if (eventSupportsTableBookings(ev)) return true;
  return eventIdsWithVenueTables?.has(ev.id) ?? false;
}

function tableInUse(table, hostedTable = null) {
  if (!table) return false;
  if (hostedTable && hostedTable.status !== 'CLOSED') return true;
  if (table.currentOccupancy > 0) return true;
  if (table.hostUserId) return true;
  if (table.hostedTableId) return true;
  return false;
}

/** Guest count for event table manager — hosted tables use live member totals, not venue slot occupancy alone. */
function resolveEventTableGuestStats(table, hostedTable = null, goingMemberCount = null) {
  const capacity = Math.max(
    1,
    Number(hostedTable?.guestQuantity) || Number(table?.guestCapacity) || 1,
  );
  if (hostedTable && hostedTable.status !== 'CLOSED') {
    const fromMembers =
      goingMemberCount != null ? Number(goingMemberCount) : null;
    const fromSpots = Math.max(
      0,
      capacity - Math.max(0, Number(hostedTable.spotsRemaining) || 0),
    );
    const memberCount = Math.max(0, fromMembers != null ? fromMembers : fromSpots);
    return { memberCount, capacity, isHosted: true };
  }
  return {
    memberCount: Math.max(0, Number(table?.currentOccupancy) || 0),
    capacity,
    isHosted: false,
  };
}

function canDeleteDayTier(table, hostedTable = null) {
  if (!table || table.isCustomListing) return false;
  if (!String(table.hostingTierKey || '').startsWith('day:')) return false;
  if (tableInUse(table, hostedTable)) return false;
  return tierIndexFromHostingKey(table.hostingTierKey) != null;
}

function tierIndexFromHostingKey(key) {
  const parts = String(key || '').split(':');
  if (parts[0] !== 'day') return null;
  const idx = Number(parts[1]);
  return Number.isFinite(idx) ? idx : null;
}

function canHideTableFromListings(table, hostedTable = null) {
  if (!table?.isActive) return false;
  if (table.isCustomListing) return false;
  return !tableInUse(table, hostedTable);
}

function isSyntheticHostedId(id) {
  return String(id || '').startsWith('direct-vt-');
}

function inferMemberSessionNumber(member, venueTable) {
  if (member.tableSessionNumber != null) return Number(member.tableSessionNumber) || 1;
  const vtSession = Number(venueTable?.tableSessionNumber) || 1;
  if (member.status === 'LEFT') return Math.max(1, vtSession - 1);
  return vtSession;
}

function mapUserBrief(u) {
  if (!u) return null;
  return {
    id: u.id,
    username: u.userProfile?.username || u.username || u.fullName || 'User',
    fullName: u.fullName,
  };
}

async function resolveMenuLinesForVenue(selectedMenuItems, venueId) {
  if (!Array.isArray(selectedMenuItems) || !selectedMenuItems.length || !venueId) return [];
  const resolved = await resolveVenueMenuSelections(selectedMenuItems, venueId);
  return (resolved.items || []).map((item) => ({
    name: item.name || 'Item',
    quantity: Number(item.quantity) || 1,
    lineTotal: (Number(item.price) || 0) * (Number(item.quantity) || 1),
  }));
}

function computeCanRelease(table, hostedTable) {
  return computeCanReleaseTable(table, hostedTable);
}

function mapVenueTableManagementItem(t, hosted, goingCount = null) {
  const { memberCount, capacity, isHosted } = resolveEventTableGuestStats(t, hosted, goingCount);
  const inUse = tableInUse(t, hosted);
  const spotsLeft = Math.max(0, capacity - memberCount);
  const fillPercent = capacity > 0 ? Math.min(100, Math.round((memberCount / capacity) * 100)) : 0;
  const hostLabel = hosted?.host
    ? hosted.host.userProfile?.username || hosted.host.username || hosted.host.fullName || 'Host'
    : null;
  let usageLabel;
  if (inUse) {
    usageLabel =
      memberCount > 0
        ? `${memberCount}/${capacity} guest${memberCount === 1 ? '' : 's'}`
        : isHosted
          ? 'Hosted — awaiting guests'
          : 'In use';
  } else if (t.isActive) {
    usageLabel = 'Available';
  } else {
    usageLabel = 'Hidden from listings';
  }
  return {
    id: t.id,
    tableName: t.tableName,
    tierLabel: t.tierLabel,
    hostingTierKey: t.hostingTierKey,
    isActive: t.isActive,
    isCustomListing: Boolean(t.isCustomListing),
    currentOccupancy: memberCount,
    guestCapacity: capacity,
    spotsRemaining: spotsLeft,
    fillPercent,
    status: t.status,
    inUse,
    isHosted,
    hostLabel,
    hostingCategory: hosted?.hostingCategory || null,
    hasJoiningFee: Boolean(hosted?.hasJoiningFee),
    joiningFee: hosted?.hasJoiningFee ? Number(hosted.joiningFee || 0) : 0,
    usageLabel,
    canHideFromListings: canHideTableFromListings(t, hosted),
    canDeleteTier: canDeleteDayTier(t, hosted),
    canRestoreToListings: !t.isActive && !inUse,
    canResetTable: inUse,
    tableSessionNumber: t.tableSessionNumber ?? 1,
    minimumSpend: t.minimumSpend,
    hostMinimumSpend: t.hostMinimumSpend,
    bookingFeeZar: t.bookingFeeZar,
    hostTableFeeZar: t.hostTableFeeZar,
    serviceDate: t.serviceDate,
    serviceEndDate: t.serviceEndDate,
    serviceSchedule: t.serviceSchedule,
    startTime: t.startTime,
    endTime: t.endTime,
    description: t.description,
  };
}

async function loadHostedContextForVenueTables(tables) {
  const hostedIds = tables.map((t) => t.hostedTableId).filter(Boolean);
  const hostedRows =
    hostedIds.length > 0
      ? await prisma.hostedTable.findMany({
          where: { id: { in: hostedIds } },
          select: {
            id: true,
            status: true,
            tableName: true,
            hostUserId: true,
            spotsRemaining: true,
            guestQuantity: true,
            hostingCategory: true,
            hasJoiningFee: true,
            joiningFee: true,
            host: {
              select: {
                fullName: true,
                username: true,
                userProfile: { select: { username: true } },
              },
            },
          },
        })
      : [];
  const hostedById = new Map(hostedRows.map((h) => [h.id, h]));

  const goingByHostedId = new Map();
  if (hostedIds.length > 0) {
    const goingRows = await prisma.hostedTableMember.groupBy({
      by: ['hostedTableId'],
      where: { hostedTableId: { in: hostedIds }, status: 'GOING' },
      _count: { _all: true },
    });
    for (const row of goingRows) {
      goingByHostedId.set(row.hostedTableId, row._count._all);
    }
  }

  return { hostedById, goingByHostedId };
}

router.get('/event-table-bookings', authenticateToken, async (req, res, next) => {
  try {
    const venueIdFilter = venueIdFromQuery(req.query);
    let venueIds = await resolveAccessibleVenueIds(req.userId, bookingsVenueScope(req));
    if (!venueIds.length) {
      if (venueIdFilter) return res.status(404).json({ error: 'Venue not found' });
      return res.json({
        items: [],
        eventSummaries: [],
        summary: emptyEventTableBookingsSummary(),
      });
    }
    const eventIdFilter = typeof req.query.event_id === 'string' && req.query.event_id.trim()
      ? req.query.event_id.trim()
      : null;

    const scopeRaw = String(req.query.event_scope || 'active').toLowerCase();
    const eventScope = ['active', 'past', 'all'].includes(scopeRaw) ? scopeRaw : 'active';
    const now = new Date();

    const venueTableEventRows = await prisma.venueTable.findMany({
      where: { venueId: { in: venueIds }, eventId: { not: null } },
      select: { eventId: true },
      distinct: ['eventId'],
    });
    const eventIdsWithVenueTables = new Set(
      venueTableEventRows.map((r) => r.eventId).filter(Boolean),
    );

    let eventsInScope = [];
    let eventSummaries = [];

    if (eventIdFilter) {
      const ev = await prisma.event.findFirst({
        where: { id: eventIdFilter, venueId: { in: venueIds }, deletedAt: null },
        select: eventSelectForBookings(),
      });
      if (!ev) {
        return res.status(404).json({ error: 'Event not found' });
      }
      if (!eventQualifiesForTableBookings(ev, eventIdsWithVenueTables)) {
        return res.json({
          items: [],
          eventSummaries: [],
          summary: emptyEventTableBookingsSummary(),
          eventScope,
        });
      }
      const isPast = eventIsPastByEndsAt(ev, now);
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
        },
        select: eventSelectForBookings(),
      });
      let tableHostingEvents = allVenueEvents.filter((e) =>
        eventQualifiesForTableBookings(e, eventIdsWithVenueTables),
      );
      if (eventScope === 'active') {
        tableHostingEvents = tableHostingEvents.filter((e) => eventIsActiveByEndsAt(e, now));
      } else if (eventScope === 'past') {
        tableHostingEvents = tableHostingEvents.filter((e) => eventIsPastByEndsAt(e, now));
      }
      eventsInScope = tableHostingEvents;
      eventSummaries = tableHostingEvents
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

    await repairGuestEventVenueTableBookingsForEvents(eventIds);

    const refundedRefs = await loadRefundedPaymentRefs(venueIds);

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
    const activeHostedIds = hostedInScope
      .filter((h) => h.status === 'ACTIVE' || h.status === 'FULL')
      .map((h) => h.id);
    const hostedTablesOpen = hostedInScope.filter((h) => h.status === 'ACTIVE').length;
    const hostedTablesFull = hostedInScope.filter((h) => h.status === 'FULL').length;

    let totalGoingHeadcount = 0;
    let pendingJoinRequests = 0;
    if (activeHostedIds.length) {
      const goingRows = await prisma.hostedTableMember.groupBy({
        by: ['hostedTableId'],
        where: { hostedTableId: { in: activeHostedIds }, status: 'GOING' },
        _count: true,
      });
      totalGoingHeadcount = goingRows.reduce((s, r) => s + r._count, 0);
      const pendRows = await prisma.hostedTableMember.groupBy({
        by: ['hostedTableId'],
        where: { hostedTableId: { in: activeHostedIds }, status: 'PENDING' },
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
        venueTable: {
          select: {
            id: true,
            tableName: true,
            guestCapacity: true,
            currentOccupancy: true,
            minimumSpend: true,
            tierLabel: true,
            tableSessionNumber: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 500,
    });

    const mapped = rows.map((r) => {
      const sessionNumber = r.tableSessionNumber || r.venueTable?.tableSessionNumber || 1;
      const hostedTable =
        r.hostedTable ||
        (r.venueTableId && r.venueTable
          ? syntheticHostedTableFromVenueRow(r.venueTable, sessionNumber)
          : null);
      return {
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
      hostedTable,
      venueTableId: r.venueTableId,
      tableSessionNumber: r.venueTableId ? sessionNumber : null,
      isDirectVenueSlot: Boolean(r.venueTableId && !r.hostedTableId),
      user: {
        id: r.user.id,
        username: r.user.userProfile?.username || r.user.username || r.user.fullName || 'User',
      },
      selectedMenuItems: r.selectedMenuItems,
      hostingTierName: r.hostingTierName,
      hostingCategory: r.hostingCategory,
      menuTotalZar: r.menuTotalZar,
    };
    });

    const mappedWithVenueGuests = await supplementEventTableBookingsFromVenueMembers({
      eventIds,
      venueIds,
      existingMapped: mapped,
      refundedRefs,
    });

    const rawForStats = [
      ...rows.map((r) => ({
        role: r.role,
        amountTotal: r.amountTotal,
        entranceZar: r.entranceZar,
        componentZar: r.componentZar,
      })),
      ...mappedWithVenueGuests
        .filter((r) => String(r.id).startsWith('vtm-'))
        .map((r) => ({
          role: r.role,
          amountTotal: r.amountTotal,
          entranceZar: r.entranceZar,
          componentZar: r.componentZar,
        })),
    ];

    const groupedItems = groupEventTableBookingsByTable(mappedWithVenueGuests);

    const summary = {
      configuredTableSlots,
      hostedTablesOpen,
      hostedTablesFull,
      totalGoingHeadcount,
      pendingJoinRequests,
      tableCount: groupedItems.length,
      totalPaidZar: groupedItems.reduce((s, g) => s + Number(g.totalPaidZar || 0), 0),
      statsByRole: {
        all: rollBookingStats(rawForStats),
        HOST: rollBookingStats(rawForStats.filter((x) => x.role === 'HOST')),
        GUEST: rollBookingStats(rawForStats.filter((x) => x.role === 'GUEST')),
      },
    };

    res.json({ items: groupedItems, eventSummaries, summary, eventScope });
  } catch (e) {
    next(e);
  }
});

function paymentMatchesVenueScope(meta, venueId, eventIdSet) {
  if (!meta || typeof meta !== 'object') return false;
  const vid = meta.venue_id ?? meta.venueId;
  if (vid != null && String(vid) === venueId) return true;
  const eid = meta.event_id ?? meta.eventId;
  return eid != null && eventIdSet.has(String(eid));
}

function paymentMatchesEventFilter(meta, eventId) {
  if (!eventId) return true;
  if (!meta || typeof meta !== 'object') return false;
  const eid = meta.event_id ?? meta.eventId;
  return eid != null && String(eid) === eventId;
}

function netAmountFromPayment(meta, gross) {
  if (meta?.venue_share_zar != null) return Number(meta.venue_share_zar) || 0;
  if (meta?.recipient_amount != null) return Number(meta.recipient_amount) || 0;
  return splitPlatformGross(gross).recipientAmount;
}

function ticketQuantityFromMeta(meta) {
  return Math.max(1, parseInt(String(meta?.quantity || '1'), 10) || 1);
}

router.get('/venue-analytics', authenticateToken, async (req, res, next) => {
  try {
    const scope = await requireVenueScope(req, res, 'analytics');
    if (!scope) return;
    const venueId = scope.venueIds[0];
    if (!venueId) return res.status(400).json({ error: 'venue_id or staff_ctx is required' });
    const days = Math.min(366, Math.max(1, parseInt(String(req.query.days || '30'), 10) || 30));
    const eventId = typeof req.query.event_id === 'string' && req.query.event_id.trim() ? req.query.event_id.trim() : null;

    await repairTicketPaymentsForVenues([venueId]);

    const cutoff = new Date(Date.now() - days * 86400000);

    const refundedRefs = await loadRefundedPaymentRefs([venueId]);
    const refundedMetrics = await loadRefundedMetricsForPeriod([venueId], cutoff);

    const events = await prisma.event.findMany({
      where: { venueId, deletedAt: null, ...(eventId ? { id: eventId } : {}) },
      select: { id: true, date: true },
    });
    const eventIds = events.map((e) => e.id);
    if (eventId && eventIds.length === 0) return res.status(400).json({ error: 'Event not found for this venue' });

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
      dayBookingHostPaymentZar: 0,
      venueTablePaymentZar: 0,
      otherPaymentZar: 0,
    };
    const revenueByDay = {};
    const matchedPaymentRefs = new Set();

    for (const row of ledgerRows) {
      const meta = resolveLedgerPaymentMeta(row.paymentReference);
      if (!matchesEventFilterMeta(meta)) continue;
      if (isRefundedPaymentRef(row.paymentReference, refundedRefs)) continue;
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
        meta,
      );
    }

    const platformLedgerRows = await prisma.payoutLedger.findMany({
      where: {
        recipientType: 'PLATFORM',
        createdAt: { gte: cutoff },
      },
      select: {
        paymentReference: true,
        grossAmount: true,
        recipientAmount: true,
        createdAt: true,
      },
      take: 5000,
    });

    for (const row of platformLedgerRows) {
      if (!row.paymentReference || matchedPaymentRefs.has(row.paymentReference)) continue;
      const meta = resolveLedgerPaymentMeta(row.paymentReference);
      const metaVenueId = meta.venue_id ?? meta.venueId;
      if (metaVenueId == null || String(metaVenueId) !== String(venueId)) continue;
      if (!matchesEventFilterMeta(meta)) continue;
      if (isRefundedPaymentRef(row.paymentReference, refundedRefs)) continue;
      const gross = Number(row.grossAmount) || 0;
      const net = Number(row.recipientAmount) || 0;
      grossTotal += gross;
      netTotal += net;
      matchedPaymentRefs.add(row.paymentReference);
      matchedPaymentRefs.add(basePaymentReference(row.paymentReference));
      const dayKey = row.createdAt.toISOString().slice(0, 10);
      revenueByDay[dayKey] = (revenueByDay[dayKey] || 0) + gross;
      classifyVenuePaymentRevenue(
        meta?.type,
        resolveLedgerPaymentType(row.paymentReference),
        gross,
        revenueCounters,
        meta,
      );
    }

    const splitLogs = await prisma.splitPaymentLog.findMany({
      where: {
        createdAt: { gte: cutoff },
        venueTable: { venueId },
      },
      select: {
        reference: true,
        totalAmount: true,
        venueAmount: true,
        createdAt: true,
      },
      take: 15000,
    });

    const splitRefsToLoad = [
      ...new Set(
        splitLogs
          .map((s) => s.reference)
          .filter((ref) => ref && !paymentMetaByRef.has(ref) && !matchedPaymentRefs.has(ref)),
      ),
    ];
    if (splitRefsToLoad.length > 0) {
      const splitPayments = await prisma.payment.findMany({
        where: { reference: { in: splitRefsToLoad } },
        select: { reference: true, metadata: true, type: true },
      });
      for (const p of splitPayments) {
        paymentMetaByRef.set(p.reference, flattenPaymentMetadata(p.metadata));
        paymentTypeByRef.set(p.reference, p.type);
      }
    }

    for (const log of splitLogs) {
      if (!log.reference || matchedPaymentRefs.has(log.reference)) continue;
      const meta = resolveLedgerPaymentMeta(log.reference);
      if (!matchesEventFilterMeta(meta)) continue;
      if (isRefundedPaymentRef(log.reference, refundedRefs)) continue;
      const gross = Number(log.totalAmount) || 0;
      const net = Number(log.venueAmount) || 0;
      grossTotal += gross;
      netTotal += net;
      matchedPaymentRefs.add(log.reference);
      matchedPaymentRefs.add(basePaymentReference(log.reference));
      const dayKey = log.createdAt.toISOString().slice(0, 10);
      revenueByDay[dayKey] = (revenueByDay[dayKey] || 0) + gross;
      classifyVenuePaymentRevenue(meta?.type, resolveLedgerPaymentType(log.reference), gross, revenueCounters, meta);
    }

    const eventIdSet = new Set(eventIds.map(String));

    const payments = await prisma.payment.findMany({
      where: {
        status: 'success',
        createdAt: { gte: cutoff },
      },
      select: { amount: true, type: true, metadata: true, createdAt: true, reference: true },
      orderBy: { createdAt: 'desc' },
      take: 2500,
    });

    let ticketSalesFromPayments = 0;

    for (const p of payments) {
      const meta = flattenPaymentMetadata(p.metadata);
      if (!paymentMatchesVenueScope(meta, venueId, eventIdSet)) continue;
      if (!paymentMatchesEventFilter(meta, eventId)) continue;
      if (p.reference && matchedPaymentRefs.has(p.reference)) continue;
      if (isRefundedPaymentRef(p.reference, refundedRefs)) continue;
      const amt = Number(p.amount) || 0;
      grossTotal += amt;
      netTotal += netAmountFromPayment(meta, amt);
      const dayKey = p.createdAt.toISOString().slice(0, 10);
      revenueByDay[dayKey] = (revenueByDay[dayKey] || 0) + amt;

      classifyVenuePaymentRevenue(meta.type, p.type, amt, revenueCounters, meta);

      if (p.reference) {
        matchedPaymentRefs.add(p.reference);
        matchedPaymentRefs.add(basePaymentReference(p.reference));
      }

      if (isTicketPaymentMeta(meta, p.type) && !isRefundedPaymentRef(p.reference, refundedRefs)) {
        ticketSalesFromPayments += ticketQuantityFromMeta(meta);
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
      const baseRef = ref ? basePaymentReference(String(ref)) : null;
      if (ref && (matchedPaymentRefs.has(String(ref)) || (baseRef && matchedPaymentRefs.has(baseRef)))) {
        continue;
      }
      if (isRefundedPaymentRef(ref, refundedRefs)) continue;
      const txMeta = flattenPaymentMetadata(t.metadata);
      if (!paymentMatchesVenueScope(txMeta, venueId, eventIdSet)) continue;
      if (!paymentMatchesEventFilter(txMeta, eventId)) continue;
      const amt = Number(t.amount) || 0;
      grossTotal += amt;
      netTotal += netAmountFromPayment(txMeta, amt);
      const dayKey = t.createdAt.toISOString().slice(0, 10);
      revenueByDay[dayKey] = (revenueByDay[dayKey] || 0) + amt;
      if (txMeta && Object.keys(txMeta).length) {
        classifyVenuePaymentRevenue(txMeta.type, null, amt, revenueCounters, txMeta);
        if (isTicketPaymentMeta(txMeta, null) && !isRefundedPaymentRef(ref, refundedRefs)) {
          ticketSalesFromPayments += ticketQuantityFromMeta(txMeta);
        }
      } else {
        revenueCounters.otherPaymentZar += amt;
      }
      if (ref) {
        matchedPaymentRefs.add(String(ref));
        if (baseRef) matchedPaymentRefs.add(baseRef);
      }
    }

    const { ticketPaymentZar, hostedTablePaymentZar, dayBookingHostPaymentZar, venueTablePaymentZar, otherPaymentZar } =
      revenueCounters;

    const ticketSalesCountFromRows =
      eventIds.length === 0
        ? 0
        : await prisma.ticket.count({
            where: {
              kind: 'EVENT_TICKET',
              eventId: { in: eventIds },
              createdAt: { gte: cutoff },
              hiddenFromHistoryAt: null,
              refundedAt: null,
            },
          });

    const ticketSalesCount = Math.max(ticketSalesCountFromRows, ticketSalesFromPayments);

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
      dayBookingHostPaymentZar: Number((dayBookingHostPaymentZar || 0).toFixed(2)),
      venueTablePaymentZar: Number(venueTablePaymentZar.toFixed(2)),
      otherPaymentZar: Number(otherPaymentZar.toFixed(2)),
      refundedGrossZar: Number(refundedMetrics.refundedGrossZar.toFixed(2)),
      refundedVenueShareZar: Number(refundedMetrics.refundedVenueShareZar.toFixed(2)),
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
    const venueIds = await resolveAccessibleVenueIds(req.userId, bookingsVenueScope(req));
    if (!venueIds.length) return res.json({ items: [] });
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

/** Dashboard table booking totals (event + venue/day tables). */
router.get('/dashboard-booking-stats', authenticateToken, async (req, res, next) => {
  try {
    const scope = await requireVenueScope(req, res, 'bookings');
    if (!scope) return;
    const venueIds = scope.venueIds;
    const venueIdFilter = venueIdFromQuery(req.query);
    if (!venueIds.length) {
      if (venueIdFilter || staffCtxFromQuery(req.query)) {
        return res.status(404).json({ error: 'Venue not found' });
      }
      return res.json({
        totalBookings: 0,
        activeBookings: 0,
        totalGuests: 0,
        recentBookings: [],
      });
    }

    const eventsInScope = await prisma.event.findMany({
      where: { venueId: { in: venueIds }, deletedAt: null },
      select: { id: true },
    });
    const eventIds = eventsInScope.map((e) => e.id);

    let eventTableCount = 0;
    let eventGoingHeadcount = 0;
    let eventActiveBookings = 0;
    let recentEventBookings = [];

    if (eventIds.length) {
      const hostedInScope = await prisma.hostedTable.findMany({
        where: { eventId: { in: eventIds }, tableType: 'IN_APP_EVENT' },
        select: { id: true, status: true, tableName: true, guestQuantity: true, spotsRemaining: true },
      });
      const hostedIds = hostedInScope.map((h) => h.id);
      const hostedById = new Map(hostedInScope.map((h) => [h.id, h]));

      eventActiveBookings = hostedInScope.filter((h) => h.status === 'ACTIVE' || h.status === 'FULL').length;

      if (hostedIds.length) {
        eventGoingHeadcount = await prisma.hostedTableMember.count({
          where: { hostedTableId: { in: hostedIds }, status: 'GOING' },
        });
        const pendingJoin = await prisma.hostedTableMember.count({
          where: { hostedTableId: { in: hostedIds }, status: 'PENDING' },
        });
        eventActiveBookings += pendingJoin;
      }

      const bookingRows = await prisma.eventVenueTableBooking.findMany({
        where: { venueId: { in: venueIds }, eventId: { in: eventIds } },
        select: {
          id: true,
          role: true,
          createdAt: true,
          hostedTableId: true,
          event: { select: { title: true } },
        },
        orderBy: { createdAt: 'desc' },
        take: 500,
      });
      eventTableCount = new Set(bookingRows.map((r) => r.hostedTableId).filter(Boolean)).size;

      const eventGroups = groupEventTableBookingsByTable(
        bookingRows
          .filter((r) => r.hostedTableId)
          .map((r) => {
            const ht = hostedById.get(r.hostedTableId);
            return {
              id: r.id,
              role: r.role,
              createdAt: r.createdAt,
              lineTotalZar: 0,
              hostedTable: ht
                ? {
                    id: ht.id,
                    tableName: ht.tableName,
                    status: ht.status,
                    guestQuantity: ht.guestQuantity,
                    spotsRemaining: ht.spotsRemaining,
                  }
                : { id: r.hostedTableId },
              event: r.event,
            };
          }),
      );
      recentEventBookings = eventGroups.slice(0, 5).map((g) => ({
        id: g.id,
        type: 'event',
        tableName: g.hostedTable?.tableName || 'Event table',
        guestCount: (g.rolesSummary?.hosts || 0) + (g.rolesSummary?.guests || 0),
        capacity: g.hostedTable?.guestQuantity || null,
        status: g.hostedTable?.status || 'ACTIVE',
        subLabel: g.event?.title || 'Event',
        sortAt: g.lastActivityAt,
      }));
    }

    const venueConfirmedMembers = await prisma.venueTableMember.findMany({
      where: {
        status: 'CONFIRMED',
        venueTable: { venueId: { in: venueIds } },
      },
      select: {
        id: true,
        paidAt: true,
        joinedAt: true,
        venueTable: {
          select: {
            id: true,
            tableName: true,
            minimumSpend: true,
            status: true,
            currentOccupancy: true,
            guestCapacity: true,
          },
        },
      },
      orderBy: { paidAt: 'desc' },
      take: 120,
    });

    const venueTableIds = new Set(venueConfirmedMembers.map((m) => m.venueTable.id));
    const venueGuestCount = venueConfirmedMembers.length;

    const venuePendingCount = await prisma.venueTableMember.count({
      where: {
        status: { in: ['PENDING_VENUE_REVIEW', 'PENDING_PAYMENT', 'APPROVED'] },
        venueTable: { venueId: { in: venueIds } },
      },
    });

    const venueActiveTables = await prisma.venueTable.count({
      where: {
        venueId: { in: venueIds },
        status: { in: ['PARTIALLY_FILLED', 'FULL'] },
      },
    });

    const tableOccupancy = new Map();
    for (const m of venueConfirmedMembers) {
      const tid = m.venueTable.id;
      tableOccupancy.set(tid, (tableOccupancy.get(tid) || 0) + 1);
    }

    const recentVenueBookings = [...tableOccupancy.entries()]
      .map(([tableId, count]) => {
        const member = venueConfirmedMembers.find((m) => m.venueTable.id === tableId);
        const table = member?.venueTable;
        if (!table) return null;
        return {
          id: tableId,
          type: 'venue',
          tableName: table.tableName || 'Table',
          guestCount: count,
          capacity: table.guestCapacity || null,
          status: table.status,
          subLabel: table.minimumSpend ? `Min spend: R${table.minimumSpend}` : 'Venue table',
          sortAt: member.paidAt || member.joinedAt,
        };
      })
      .filter(Boolean);

    // Unified cap: merge event + venue/day bookings, sort by latest activity, return top 5 only.
    const recentBookings = [...recentEventBookings, ...recentVenueBookings]
      .sort((a, b) => new Date(b.sortAt).getTime() - new Date(a.sortAt).getTime())
      .slice(0, 5)
      .map(({ sortAt, ...rest }) => rest);

    res.json({
      totalBookings: eventTableCount + venueTableIds.size,
      activeBookings: eventActiveBookings + venueActiveTables + venuePendingCount,
      totalGuests: eventGoingHeadcount + venueGuestCount,
      recentBookings,
    });
  } catch (e) {
    next(e);
  }
});

const MONTH_LABELS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function emptyMonthlyBuckets() {
  return MONTH_LABELS.map((label, i) => ({
    month: i + 1,
    label,
    events: 0,
    bookings: 0,
    guests: 0,
  }));
}

/** Bucket a date into 1–12; when year is set, returns null if the date is outside that year. */
function bucketMonth(dateValue, year = null) {
  if (!dateValue) return null;
  let y;
  let m;
  if (dateValue instanceof Date) {
    y = dateValue.getUTCFullYear();
    m = dateValue.getUTCMonth() + 1;
  } else {
    const s = String(dateValue);
    const match = s.match(/^(\d{4})-(\d{2})/);
    if (match) {
      y = parseInt(match[1], 10);
      m = parseInt(match[2], 10);
    } else {
      const d = new Date(dateValue);
      if (Number.isNaN(d.getTime())) return null;
      y = d.getUTCFullYear();
      m = d.getUTCMonth() + 1;
    }
  }
  if (year != null && y !== year) return null;
  return m;
}

/** Venue dashboard stats — aligned with dashboard-booking-stats, with monthly buckets. */
async function computeVenueDashboardStats(venueIds, year) {
  const months = emptyMonthlyBuckets();
  const allTime = { events: 0, bookings: 0, guests: 0 };

  const bump = (month, field, amount = 1) => {
    if (month && month >= 1 && month <= 12) months[month - 1][field] += amount;
  };

  const eventsInScope = await prisma.event.findMany({
    where: { venueId: { in: venueIds }, deletedAt: null },
    select: { id: true, date: true },
  });
  const eventIds = eventsInScope.map((e) => e.id);

  allTime.events = eventsInScope.length;
  for (const ev of eventsInScope) {
    bump(bucketMonth(ev.date, year), 'events');
  }

  const allEventTableIds = new Set();
  const eventTablesByMonth = Array.from({ length: 12 }, () => new Set());

  if (eventIds.length) {
    const hostedInScope = await prisma.hostedTable.findMany({
      where: { eventId: { in: eventIds }, tableType: 'IN_APP_EVENT' },
      select: { id: true },
    });
    const hostedIds = hostedInScope.map((h) => h.id);

    const bookingRows = await prisma.eventVenueTableBooking.findMany({
      where: { venueId: { in: venueIds }, eventId: { in: eventIds } },
      select: { hostedTableId: true, createdAt: true },
    });

    for (const row of bookingRows) {
      if (!row.hostedTableId) continue;
      allEventTableIds.add(row.hostedTableId);
      const m = bucketMonth(row.createdAt, year);
      if (m) eventTablesByMonth[m - 1].add(row.hostedTableId);
    }

    if (hostedIds.length) {
      const goingMembers = await prisma.hostedTableMember.findMany({
        where: { hostedTableId: { in: hostedIds }, status: 'GOING' },
        select: { joinedAt: true },
      });
      for (const g of goingMembers) {
        allTime.guests += 1;
        bump(bucketMonth(g.joinedAt, year), 'guests');
      }
    }
  }

  const allVenueTableIds = new Set();
  const venueTablesByMonth = Array.from({ length: 12 }, () => new Set());

  const venueMembers = await prisma.venueTableMember.findMany({
    where: {
      status: 'CONFIRMED',
      venueTable: { venueId: { in: venueIds } },
    },
    select: { venueTableId: true, paidAt: true, joinedAt: true },
  });

  for (const member of venueMembers) {
    allVenueTableIds.add(member.venueTableId);
    allTime.guests += 1;
    const at = member.paidAt || member.joinedAt;
    const m = bucketMonth(at, year);
    if (m) venueTablesByMonth[m - 1].add(member.venueTableId);
    bump(bucketMonth(at, year), 'guests');
  }

  allTime.bookings = allEventTableIds.size + allVenueTableIds.size;

  for (let i = 0; i < 12; i++) {
    months[i].bookings = eventTablesByMonth[i].size + venueTablesByMonth[i].size;
  }

  const yearTotal = {
    events: months.reduce((sum, m) => sum + m.events, 0),
    bookings: months.reduce((sum, m) => sum + m.bookings, 0),
    guests: months.reduce((sum, m) => sum + m.guests, 0),
  };

  const reviewAgg = await prisma.venueReview.aggregate({
    where: { venueId: { in: venueIds } },
    _avg: { rating: true },
    _count: { id: true },
  });

  return {
    months,
    yearTotal,
    allTime,
    averageRating: reviewAgg._avg.rating != null ? Number(reviewAgg._avg.rating) : null,
    reviewCount: reviewAgg._count.id ?? 0,
  };
}

/** Monthly venue stats (Jan–Dec) for dashboard month picker; average rating is all-time. */
router.get('/dashboard-monthly-stats', authenticateToken, async (req, res, next) => {
  try {
    const scopeOpts = {
      staffCtx: staffCtxFromQuery(req.query),
      venueIdFilter: venueIdFromQuery(req.query),
    };
    let scope = await resolveBusinessVenueScope(req.userId, { ...scopeOpts, permission: 'bookings' });
    if (!scope.ok) {
      scope = await resolveBusinessVenueScope(req.userId, { ...scopeOpts, permission: 'events' });
    }
    if (!scope.ok) {
      scope = await resolveBusinessVenueScope(req.userId, { ...scopeOpts, permission: 'analytics' });
    }
    if (!scope.ok) {
      return res.status(scope.status).json({ error: scope.error });
    }
    const venueIds = scope.venueIds;
    const venueIdFilter = venueIdFromQuery(req.query);
    const year = Math.min(2100, Math.max(2000, parseInt(req.query.year, 10) || new Date().getFullYear()));

    if (!venueIds.length) {
      if (venueIdFilter || staffCtxFromQuery(req.query)) {
        return res.status(404).json({ error: 'Venue not found' });
      }
      return res.json({
        year,
        months: emptyMonthlyBuckets(),
        yearTotal: { events: 0, bookings: 0, guests: 0 },
        allTime: { events: 0, bookings: 0, guests: 0 },
        averageRating: null,
        reviewCount: 0,
      });
    }

    const stats = await computeVenueDashboardStats(venueIds, year);

    res.json({
      year,
      ...stats,
    });
  } catch (e) {
    next(e);
  }
});

/** Paid day table bookings (incl. custom tables after guest checkout). */
router.get('/venue-table-bookings', authenticateToken, async (req, res, next) => {
  try {
    const venueIdFilter = venueIdFromQuery(req.query);
    const venueIds = await resolveAccessibleVenueIds(req.userId, bookingsVenueScope(req));
    if (!venueIds.length) {
      if (venueIdFilter) return res.status(404).json({ error: 'Venue not found' });
      return res.json({ items: [] });
    }
    const members = await prisma.venueTableMember.findMany({
      where: {
        paystackReference: { not: null },
        status: { in: ['CONFIRMED', 'LEFT', 'REFUNDED'] },
        venueTable: { venueId: { in: venueIds }, eventId: null },
      },
      include: {
        user: { select: { id: true, fullName: true, userProfile: { select: { username: true } } } },
        venueTable: {
          include: {
            venue: { select: { id: true, name: true, city: true } },
          },
        },
      },
      orderBy: { paidAt: 'desc' },
      take: 200,
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

    const refundedRefs = await loadRefundedPaymentRefs(venueIds);

    res.json({
      items: members.map((m) => {
        const sessionNumber = inferMemberSessionNumber(m, m.venueTable);
        const hostedTable = m.venueTable.hostedTableId
          ? hostedById.get(m.venueTable.hostedTableId) || null
          : null;
        const isRefunded =
          m.status === 'REFUNDED' ||
          (m.paystackReference && isRefundedPaymentRef(m.paystackReference, refundedRefs));
        return {
          id: m.id,
          status: m.status,
          refundStatus: isRefunded ? 'APPROVED' : null,
          amountPaid: isRefunded ? 0 : m.amountPaid,
          settlementMode: m.settlementMode,
          selectedMenuItems: m.selectedMenuItems,
          userSpecs: m.userSpecs,
          joinedAt: m.joinedAt,
          paidAt: m.paidAt,
          memberRole: m.memberRole,
          paystackReference: m.paystackReference,
          sessionNumber,
          user: mapUserBrief(m.user),
          table: {
            id: m.venueTable.id,
            tableName: m.venueTable.tableName,
            minimumSpend: m.venueTable.minimumSpend,
            isCustomListing: m.venueTable.isCustomListing,
            status: m.venueTable.status,
            currentOccupancy: m.venueTable.currentOccupancy,
            serviceDate: m.venueTable.serviceDate,
            serviceEndDate: m.venueTable.serviceEndDate,
            startTime: m.venueTable.startTime,
            endTime: m.venueTable.endTime,
            hostUserId: m.venueTable.hostUserId,
            hostedTableId: m.venueTable.hostedTableId,
            tableSessionNumber: m.venueTable.tableSessionNumber ?? 1,
            venue: m.venueTable.venue,
            canRelease: m.status === 'CONFIRMED' && computeCanRelease(m.venueTable, hostedTable),
          },
        };
      }),
    });
  } catch (e) {
    next(e);
  }
});

/** Business read-only session detail for event/day table bookings (past, reset, or live). */
router.get('/table-booking-detail', authenticateToken, async (req, res, next) => {
  try {
    const hostedTableId =
      typeof req.query.hosted_table_id === 'string' ? req.query.hosted_table_id.trim() : '';
    const venueTableId =
      typeof req.query.venue_table_id === 'string' ? req.query.venue_table_id.trim() : '';
    const sessionNumber = Math.max(1, Number(req.query.session) || 1);

    if (hostedTableId && isSyntheticHostedId(hostedTableId)) {
      return res.status(400).json({ error: 'Invalid hosted table id' });
    }
    if (!hostedTableId && !venueTableId) {
      return res.status(400).json({ error: 'hosted_table_id or venue_table_id is required' });
    }

    let venueId = null;
    let tableName = 'Table';
    let eventTitle = null;
    let eventId = null;
    let status = 'ENDED';
    let canManageLive = false;
    let host = null;
    const members = [];
    const transactions = [];

    if (hostedTableId) {
      const ht = await prisma.hostedTable.findUnique({
        where: { id: hostedTableId },
        include: {
          event: { select: { id: true, title: true, venueId: true, date: true, endsAt: true } },
          members: {
            include: {
              user: {
                select: { id: true, fullName: true, username: true, userProfile: { select: { username: true } } },
              },
            },
          },
        },
      });
      if (!ht) return res.status(404).json({ error: 'Table not found' });
      venueId = ht.event?.venueId;
      if (!venueId) return res.status(404).json({ error: 'Table not found' });
      const canManage = await staffHasVenuePermission(req.userId, venueId, 'bookings');
      if (!canManage) return res.status(403).json({ error: 'Forbidden' });

      tableName = ht.tableName;
      eventTitle = ht.event?.title || null;
      eventId = ht.eventId;
      status = ht.status === 'ACTIVE' || ht.status === 'FULL' ? 'ACTIVE' : 'ENDED';
      canManageLive = status === 'ACTIVE' && !isSyntheticHostedId(ht.id);

      const hostUser = ht.members.find((m) => m.userId === ht.hostUserId);
      if (hostUser) {
        host = {
          ...mapUserBrief(hostUser.user),
          role: 'HOST',
          amountPaid: Number(hostUser.menuSpendPaid || 0),
          menuItems: await resolveMenuLinesForVenue(hostUser.selectedMenuItems, venueId),
        };
      }

      const ledgerRows = await prisma.eventVenueTableBooking.findMany({
        where: { hostedTableId: ht.id },
        include: {
          user: { select: { id: true, fullName: true, username: true, userProfile: { select: { username: true } } } },
        },
        orderBy: { createdAt: 'desc' },
      });

      for (const row of ledgerRows) {
        const lineTotal = bookingDisplayTotalZar(row);
        const menuItems = await resolveMenuLinesForVenue(row.selectedMenuItems, venueId);
        transactions.push({
          id: row.id,
          role: row.role,
          user: mapUserBrief(row.user),
          lineTotalZar: lineTotal,
          createdAt: row.createdAt,
          settlementMode: row.settlementMode,
          menuItems,
          hostingTierName: row.hostingTierName,
        });
        if (row.role !== 'HOST') {
          members.push({
            role: 'GUEST',
            user: mapUserBrief(row.user),
            amountPaid: lineTotal,
            settlementMode: row.settlementMode,
            menuItems,
            paidAt: row.createdAt,
          });
        }
      }

      for (const m of ht.members.filter((x) => x.status === 'GOING' || x.status === 'CANCELLED')) {
        const already = transactions.some((t) => t.user?.id === m.userId);
        if (already || m.userId === ht.hostUserId) continue;
        const menuItems = await resolveMenuLinesForVenue(m.selectedMenuItems, venueId);
        const amt = Number(m.menuSpendPaid || m.joinFeePaid || 0);
        members.push({
          role: 'GUEST',
          user: mapUserBrief(m.user),
          amountPaid: amt,
          settlementMode: null,
          menuItems,
          paidAt: m.joinedAt,
          memberStatus: m.status,
        });
      }
    } else {
      const vt = await prisma.venueTable.findUnique({
        where: { id: venueTableId },
        include: {
          venue: { select: { id: true, name: true } },
          event: { select: { id: true, title: true } },
        },
      });
      if (!vt) return res.status(404).json({ error: 'Table not found' });
      venueId = vt.venueId;
      const canManage = await staffHasVenuePermission(req.userId, venueId, 'bookings');
      if (!canManage) return res.status(403).json({ error: 'Forbidden' });

      tableName = vt.tableName;
      eventTitle = vt.event?.title || null;
      eventId = vt.eventId;
      const currentSession = Number(vt.tableSessionNumber) || 1;
      const isPastSession = sessionNumber < currentSession;
      status = isPastSession ? 'RESET' : vt.currentOccupancy > 0 || vt.hostUserId ? 'ACTIVE' : 'ENDED';
      canManageLive = false;

      const ledgerRows = vt.eventId
        ? await prisma.eventVenueTableBooking.findMany({
            where: { venueTableId: vt.id, tableSessionNumber: sessionNumber },
            include: {
              user: { select: { id: true, fullName: true, username: true, userProfile: { select: { username: true } } } },
            },
            orderBy: { createdAt: 'desc' },
          })
        : [];

      for (const row of ledgerRows) {
        const lineTotal = bookingDisplayTotalZar(row);
        const menuItems = await resolveMenuLinesForVenue(row.selectedMenuItems, venueId);
        transactions.push({
          id: row.id,
          role: row.role,
          user: mapUserBrief(row.user),
          lineTotalZar: lineTotal,
          createdAt: row.createdAt,
          settlementMode: row.settlementMode,
          menuItems,
          hostingTierName: row.hostingTierName,
        });
        if (row.role === 'HOST' && !host) {
          host = {
            ...mapUserBrief(row.user),
            role: 'HOST',
            amountPaid: lineTotal,
            menuItems,
          };
        } else if (row.role === 'GUEST') {
          members.push({
            role: 'GUEST',
            user: mapUserBrief(row.user),
            amountPaid: lineTotal,
            settlementMode: row.settlementMode,
            menuItems,
            paidAt: row.createdAt,
          });
        }
      }

      const vtMembers = await prisma.venueTableMember.findMany({
        where: {
          venueTableId: vt.id,
          paystackReference: { not: null },
          status: { in: ['CONFIRMED', 'LEFT'] },
        },
        include: {
          user: { select: { id: true, fullName: true, userProfile: { select: { username: true } } } },
        },
        orderBy: { paidAt: 'desc' },
      });

      for (const m of vtMembers) {
        const memberSession = inferMemberSessionNumber(m, vt);
        if (memberSession !== sessionNumber) continue;
        const menuItems = await resolveMenuLinesForVenue(m.selectedMenuItems, venueId);
        const amt = Number(m.amountPaid || 0);
        const entry = {
          role: m.memberRole === 'HOST' ? 'HOST' : 'GUEST',
          user: mapUserBrief(m.user),
          amountPaid: amt,
          settlementMode: m.settlementMode,
          menuItems,
          paidAt: m.paidAt || m.joinedAt,
          memberStatus: m.status,
        };
        if (m.memberRole === 'HOST') {
          if (!host) host = entry;
        } else {
          const dup = members.some((x) => x.user?.id === m.userId);
          if (!dup) members.push(entry);
        }
        if (!transactions.some((t) => t.user?.id === m.userId)) {
          transactions.push({
            id: `vtm-${m.id}`,
            role: m.memberRole === 'HOST' ? 'HOST' : 'GUEST',
            user: mapUserBrief(m.user),
            lineTotalZar: amt,
            createdAt: m.paidAt || m.joinedAt,
            settlementMode: m.settlementMode,
            menuItems,
          });
        }
      }

      if (vt.hostedTableId && !host) {
        const ht = await prisma.hostedTable.findUnique({
          where: { id: vt.hostedTableId },
          include: {
            members: {
              include: {
                user: { select: { id: true, fullName: true, username: true, userProfile: { select: { username: true } } } },
              },
            },
          },
        });
        if (ht?.hostUserId) {
          const hostMem = ht.members.find((x) => x.userId === ht.hostUserId);
          if (hostMem) {
            host = {
              ...mapUserBrief(hostMem.user),
              role: 'HOST',
              amountPaid: Number(hostMem.menuSpendPaid || 0),
              menuItems: await resolveMenuLinesForVenue(hostMem.selectedMenuItems, venueId),
            };
          }
        }
      }
    }

    totalPaidZar = Math.round(
      transactions.reduce((s, t) => s + Number(t.lineTotalZar || 0), 0) * 100,
    ) / 100;

    res.json({
      tableName,
      eventTitle,
      eventId,
      sessionNumber: hostedTableId ? null : sessionNumber,
      status,
      host,
      members,
      transactions: transactions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)),
      totalPaidZar,
      canManageLive,
      hostedTableId: hostedTableId || null,
      venueTableId: venueTableId || null,
    });
  } catch (e) {
    next(e);
  }
});

function basePaystackRef(ref) {
  return basePaymentReference(ref).replace(/-\d+$/, '');
}

function emptyTicketBookingsSummary() {
  return {
    orderCount: 0,
    ticketCount: 0,
    admittedCount: 0,
    totalRevenueZar: 0,
    totalVenueShareZar: 0,
    totalGrossZar: 0,
  };
}

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

function paymentEventId(meta) {
  const m = flattenPaymentMetadata(meta);
  return m.event_id || m.eventId || null;
}

async function repairTicketPaymentsForVenues(venueIds) {
  if (!venueIds.length) return;
  const { ensureEventTicketsForPayment } = await import('../lib/issueEventTickets.js');
  const events = await prisma.event.findMany({
    where: { venueId: { in: venueIds }, deletedAt: null },
    select: { id: true },
  });
  const eventIds = new Set(events.map((e) => e.id));
  if (!eventIds.size) return;

  const payments = await prisma.payment.findMany({
    where: {
      status: { in: ['success', 'pending'] },
      type: { in: ['ticket', 'event'] },
    },
    orderBy: { createdAt: 'desc' },
    take: 80,
    select: { reference: true, metadata: true },
  });

  const toRepair = payments.filter((p) => {
    const eid = paymentEventId(p.metadata);
    return eid && eventIds.has(String(eid));
  });

  await Promise.all(
    toRepair.map((p) =>
      ensureEventTicketsForPayment(p.reference, { status: 'success' }).catch(() => null),
    ),
  );
}

/** Ticket purchases for events at venues the user owns or staffs. */
router.get('/ticket-bookings', authenticateToken, async (req, res, next) => {
  try {
    const venueIdFilter = venueIdFromQuery(req.query);
    const scopedVenueIds = await resolveAccessibleVenueIds(req.userId, bookingsVenueScope(req));
    if (!scopedVenueIds.length) {
      if (venueIdFilter) return res.status(404).json({ error: 'Venue not found' });
      return res.json({ items: [], eventSummaries: [], summary: emptyTicketBookingsSummary() });
    }

    await repairTicketPaymentsForVenues(scopedVenueIds);

    const refundedRefs = await loadRefundedPaymentRefs(scopedVenueIds);

    const eventIdFilter =
      typeof req.query.event_id === 'string' && req.query.event_id.trim()
        ? req.query.event_id.trim()
        : null;
    const scopeRaw = String(req.query.event_scope || 'active').toLowerCase();
    const eventScope = ['active', 'past', 'all'].includes(scopeRaw) ? scopeRaw : 'active';
    const startToday = startOfUtcToday();
    const dateWhere =
      eventScope === 'active' ? { gte: startToday } : eventScope === 'past' ? { lt: startToday } : undefined;

    const eventWhere = {
      venueId: { in: scopedVenueIds },
      deletedAt: null,
      ...(eventIdFilter ? { id: eventIdFilter } : {}),
      ...(dateWhere ? { date: dateWhere } : {}),
    };

    if (eventIdFilter) {
      const ev = await prisma.event.findFirst({
        where: eventWhere,
        select: { id: true, date: true },
      });
      if (!ev) return res.status(404).json({ error: 'Event not found' });
      const isPast = eventDateIsPast(ev.date, startToday);
      if (eventScope === 'active' && isPast) {
        return res.json({
          items: [],
          eventSummaries: [],
          summary: emptyTicketBookingsSummary(),
          eventScope,
          notice: 'past_event_use_past_scope',
        });
      }
      if (eventScope === 'past' && !isPast) {
        return res.json({
          items: [],
          eventSummaries: [],
          summary: emptyTicketBookingsSummary(),
          eventScope,
          notice: 'upcoming_event_use_active_scope',
        });
      }
    }

    const eventsAtVenue = await prisma.event.findMany({
      where: eventWhere,
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
    const eventIds = eventsAtVenue.map((e) => e.id);

    const ticketWhere =
      eventIds.length > 0
        ? {
            kind: 'EVENT_TICKET',
            hiddenFromHistoryAt: null,
            refundedAt: null,
            eventId: { in: eventIds },
          }
        : null;

    const [ticketCount, admittedCount, tickets] = ticketWhere
      ? await Promise.all([
          prisma.ticket.count({ where: ticketWhere }),
          prisma.ticket.count({ where: { ...ticketWhere, admittedAt: { not: null } } }),
          prisma.ticket.findMany({
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
          }),
        ])
      : [0, 0, []];

    const eventById = new Map(eventsAtVenue.map((e) => [e.id, e]));
    const ticketEventIds = new Set(tickets.map((t) => t.eventId).filter(Boolean));

    const refs = [...new Set(tickets.map((t) => basePaystackRef(t.paystackReference)).filter(Boolean))];
    const paymentsByRef =
      refs.length > 0
        ? await prisma.payment.findMany({
            where: { reference: { in: refs }, status: 'success' },
            select: {
              reference: true,
              amount: true,
              metadata: true,
              createdAt: true,
              userId: true,
              email: true,
            },
          })
        : [];
    const paymentByRef = new Map(paymentsByRef.map((p) => [p.reference, p]));

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
          fulfillmentPending: false,
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

    const scopedEventIds = new Set(eventsAtVenue.map((e) => e.id));
    const recentPayments = await prisma.payment.findMany({
      where: { status: 'success', type: { in: ['ticket', 'event'] } },
      orderBy: { createdAt: 'desc' },
      take: 400,
      select: {
        reference: true,
        amount: true,
        metadata: true,
        createdAt: true,
        userId: true,
        email: true,
      },
    });

    const paymentOnlyRefs = recentPayments.filter((pay) => {
      if (groups.has(pay.reference)) return false;
      const eid = paymentEventId(pay.metadata);
      return eid && scopedEventIds.has(String(eid));
    });

    const payerIds = [...new Set(paymentOnlyRefs.map((p) => p.userId).filter(Boolean))];
    const payers =
      payerIds.length > 0
        ? await prisma.user.findMany({
            where: { id: { in: payerIds } },
            select: {
              id: true,
              fullName: true,
              username: true,
              email: true,
              userProfile: { select: { username: true, avatarUrl: true } },
            },
          })
        : [];
    const payerById = new Map(payers.map((u) => [u.id, u]));

    for (const pay of paymentOnlyRefs) {
      const eid = paymentEventId(pay.metadata);
      const ev = eid ? eventById.get(String(eid)) : null;
      if (!ev) continue;
      const meta = flattenPaymentMetadata(pay.metadata);
      const payer = payerById.get(pay.userId);
      const qty = Math.max(1, parseInt(String(meta.quantity || '1'), 10) || 1);
      groups.set(pay.reference, {
        id: pay.reference,
        paystackReference: pay.reference,
        event: {
          id: ev.id,
          title: ev.title,
          date: ev.date,
          startTime: ev.startTime,
          city: ev.city,
        },
        tierName: meta.ticket_tier_name || meta.ticketTierName || 'Ticket',
        purchaser: {
          id: pay.userId,
          username: payer?.userProfile?.username || payer?.username || pay.email,
          fullName: payer?.fullName || null,
          avatarUrl: payer?.userProfile?.avatarUrl || null,
        },
        tickets: [],
        quantity: qty,
        admittedCount: 0,
        grossPaidZar: Number(pay.amount) || 0,
        venueShareZar: venueShareFromPayment(pay),
        platformFeeZar: platformFeeFromPayment(pay),
        amountPaidZar: Number(pay.amount) || 0,
        purchasedAt: pay.createdAt,
        menuAddons: [],
        fulfillmentPending: true,
      });
      ticketEventIds.add(ev.id);
    }

    const eventSummaries = eventsAtVenue
      .filter(
        (ev) =>
          ticketEventIds.has(ev.id) ||
          ev.eventFormat === 'TICKETING_ONLY' ||
          normalizeTicketTiers(ev.ticketTiers).length > 0,
      )
      .map((e) => ({ id: e.id, title: e.title, date: e.date, startTime: e.startTime, city: e.city }))
      .sort((a, b) => (a.title || '').localeCompare(b.title || ''));

    const items = [...groups.values()].sort(
      (a, b) => new Date(b.purchasedAt).getTime() - new Date(a.purchasedAt).getTime(),
    );

    for (const item of items) {
      if (isRefundedPaymentRef(item.paystackReference, refundedRefs)) {
        item.refundStatus = 'APPROVED';
        item.grossPaidZar = 0;
        item.venueShareZar = 0;
        item.platformFeeZar = 0;
        item.amountPaidZar = 0;
      }
    }

    const refundedOrders = await prisma.refundRequest.findMany({
      where: {
        venueId: { in: scopedVenueIds },
        refundType: 'TICKET',
        status: { in: ['APPROVED', 'PAID_BY_VENUE', 'PENDING', 'REJECTED'] },
      },
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
      take: 200,
    });

    const itemRefs = new Set(items.map((i) => i.paystackReference));
    for (const rr of refundedOrders) {
      if (itemRefs.has(rr.paymentReference)) continue;
      if (eventIdFilter && rr.eventId && rr.eventId !== eventIdFilter) continue;
      const ev = rr.eventId ? eventById.get(rr.eventId) : null;
      items.push({
        id: rr.paymentReference,
        paystackReference: rr.paymentReference,
        refundStatus: rr.status === 'PENDING' ? 'PENDING' : rr.status === 'REJECTED' ? 'REJECTED' : 'APPROVED',
        event: ev
          ? { id: ev.id, title: ev.title, date: ev.date, startTime: ev.startTime, city: ev.city }
          : { id: rr.eventId, title: 'Event', date: null, startTime: null, city: null },
        tierName: 'Ticket',
        purchaser: {
          id: rr.user.id,
          username: rr.user.userProfile?.username || rr.user.username,
          fullName: rr.user.fullName,
          avatarUrl: rr.user.userProfile?.avatarUrl || null,
        },
        tickets: [],
        quantity: Array.isArray(rr.ticketIds) ? rr.ticketIds.length : 1,
        admittedCount: 0,
        grossPaidZar: rr.status === 'APPROVED' || rr.status === 'PAID_BY_VENUE' ? 0 : rr.grossAmountZar,
        venueShareZar: rr.status === 'APPROVED' || rr.status === 'PAID_BY_VENUE' ? 0 : rr.venueRefundDueZar,
        platformFeeZar: rr.platformFeeKeptZar,
        amountPaidZar: rr.status === 'APPROVED' || rr.status === 'PAID_BY_VENUE' ? 0 : rr.grossAmountZar,
        purchasedAt: rr.createdAt,
        menuAddons: [],
        fulfillmentPending: false,
      });
    }

    items.sort((a, b) => new Date(b.purchasedAt).getTime() - new Date(a.purchasedAt).getTime());

    const activeItems = items.filter((i) => i.refundStatus !== 'APPROVED' && i.refundStatus !== 'REJECTED');

    const summary = {
      orderCount: activeItems.length,
      ticketCount: ticketCount || activeItems.reduce((s, i) => s + Number(i.quantity || 0), 0),
      admittedCount,
      totalRevenueZar: activeItems.reduce((s, i) => s + Number(i.grossPaidZar || 0), 0),
      totalGrossZar: activeItems.reduce((s, i) => s + Number(i.grossPaidZar || 0), 0),
      totalVenueShareZar: activeItems.reduce((s, i) => s + Number(i.venueShareZar || 0), 0),
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
      include: {
        venue: { select: { id: true, ownerUserId: true } },
        event: { select: { id: true, date: true, endsAt: true, startTime: true, deletedAt: true } },
      },
    });
    if (!table) return res.status(404).json({ error: 'Table not found' });
    const canManage = await staffHasVenuePermission(req.userId, table.venue.id, 'bookings');
    if (!canManage) return res.status(403).json({ error: 'Forbidden' });

    if (table.eventId && table.event && !table.event.deletedAt) {
      const endAt = eventEndsAtFromEvent(table.event);
      if (endAt && endAt.getTime() <= Date.now()) {
        return res.status(400).json({ error: 'This event has ended — tables cannot be reset.' });
      }
    }

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

    const nextSessionNumber = (Number(table.tableSessionNumber) || 1) + 1;

    const releaseResult = await prisma.$transaction(async (tx) =>
      releaseVenueTableSlot(tx, table.id, { bumpSession: true }),
    );

    res.json({
      released: true,
      tableId: table.id,
      sessionNumber: releaseResult.sessionNumber ?? nextSessionNumber,
    });
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
      where: { id: eventId, deletedAt: null },
      select: { id: true, title: true, status: true, date: true, venueId: true },
    });
    if (!event) return res.status(404).json({ error: 'Event not found' });
    const canView = await staffHasVenuePermission(req.userId, event.venueId, 'bookings');
    if (!canView) return res.status(403).json({ error: 'Forbidden' });

    const tables = await prisma.venueTable.findMany({
      where: { eventId, isCustomListing: false },
      orderBy: [{ tierLabel: 'asc' }, { tableName: 'asc' }],
    });

    const { hostedById, goingByHostedId } = await loadHostedContextForVenueTables(tables);

    const items = tables.map((t) => {
      const hosted = t.hostedTableId ? hostedById.get(t.hostedTableId) : null;
      const goingCount = hosted ? goingByHostedId.get(hosted.id) ?? null : null;
      return mapVenueTableManagementItem(t, hosted, goingCount);
    });

    const summary = {
      total: items.length,
      inUse: items.filter((i) => i.inUse).length,
      available: items.filter((i) => i.isActive && !i.inUse).length,
      hidden: items.filter((i) => !i.isActive).length,
    };

    res.json({
      event: { id: event.id, title: event.title, status: event.status, date: event.date },
      summary,
      items,
    });
  } catch (e) {
    next(e);
  }
});

/** Day & venue table slots (non-event) — hide empty listings or reset in-use tables. */
router.get('/day-venue-tables', authenticateToken, async (req, res, next) => {
  try {
    const venueId = venueIdFromQuery(req.query);
    if (!venueId) return res.status(400).json({ error: 'venue_id is required' });
    const canView = await staffHasVenuePermission(req.userId, venueId, 'bookings');
    if (!canView) return res.status(403).json({ error: 'Forbidden' });

    const venue = await prisma.venue.findFirst({
      where: { id: venueId, deletedAt: null },
      select: { id: true, name: true, acceptsDayBookings: true },
    });
    if (!venue) return res.status(404).json({ error: 'Venue not found' });

    const { repairLegacyDayVenueTables } = await import('../lib/syncDayVenueTables.js');
    await repairLegacyDayVenueTables(venueId);

    const tables = await prisma.venueTable.findMany({
      where: { venueId, eventId: null },
      orderBy: [{ isCustomListing: 'asc' }, { serviceDate: 'desc' }, { tableName: 'asc' }],
    });

    const { hostedById, goingByHostedId } = await loadHostedContextForVenueTables(tables);

    const items = tables.map((t) => {
      const hosted = t.hostedTableId ? hostedById.get(t.hostedTableId) : null;
      const goingCount = hosted ? goingByHostedId.get(hosted.id) ?? null : null;
      return mapVenueTableManagementItem(t, hosted, goingCount);
    });

    const summary = {
      total: items.length,
      inUse: items.filter((i) => i.inUse).length,
      available: items.filter((i) => i.isActive && !i.inUse).length,
      hidden: items.filter((i) => !i.isActive).length,
    };

    res.json({
      venue: { id: venue.id, name: venue.name, acceptsDayBookings: venue.acceptsDayBookings },
      summary,
      items,
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
    const canManageHide = await staffHasVenuePermission(req.userId, table.venueId, 'bookings');
    if (!canManageHide) return res.status(403).json({ error: 'Forbidden' });
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
    const canManageRestore = await staffHasVenuePermission(req.userId, table.venueId, 'bookings');
    if (!canManageRestore) return res.status(403).json({ error: 'Forbidden' });

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
