import { flattenPaymentMetadata, basePaymentReference } from './paymentMetadata.js';
import { isStaff, staffHasVenuePermission } from './access.js';

const PREPAY_SETTLEMENTS = new Set(['PREPAY_MENU', 'PREPAY_LUMP']);

const userBriefSelect = {
  id: true,
  username: true,
  fullName: true,
  userProfile: { select: { username: true } },
};

export function canonicalOrderReference(ref) {
  return basePaymentReference(ref).replace(/-\d+$/, '');
}

export function normalizeGuestSearch(raw) {
  return String(raw || '').trim().replace(/^@+/, '').toLowerCase();
}

export function textMatchesGuestSearch(haystack, q) {
  if (!q) return true;
  return String(haystack || '').toLowerCase().includes(q);
}

export function guestRecordMatchesSearch(record, q) {
  if (!q) return true;
  return (
    textMatchesGuestSearch(record?.username, q) ||
    textMatchesGuestSearch(record?.fullName, q) ||
    textMatchesGuestSearch(record?.eventTitle, q) ||
    textMatchesGuestSearch(record?.tableName, q) ||
    textMatchesGuestSearch(record?.paystackReference, q)
  );
}

export function parseMenuItemLines(raw) {
  if (!Array.isArray(raw)) return [];
  const lines = [];
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const quantity = Math.max(0, parseInt(String(item.quantity ?? item.qty), 10) || 0);
    if (quantity <= 0) continue;
    const unit = Number(item.unitPrice ?? item.unit_price ?? item.price) || 0;
    const lineTotal =
      Number(item.lineTotal ?? item.lineTotalZar ?? item.line_total_zar ?? unit * quantity) || 0;
    lines.push({
      menuItemId: item.menuItemId || item.menu_item_id || item.id || null,
      name: String(item.name || item.label || 'Item'),
      quantity,
      lineTotal,
    });
  }
  return lines;
}

export function isServeableOrder({
  menuItems,
  menuZar,
  settlementMode,
  minimumSpendZar,
} = {}) {
  const items = Array.isArray(menuItems) ? menuItems : [];
  if (items.some((i) => (Number(i.quantity || i.qty) || 0) > 0)) return true;
  if (Number(menuZar) > 0) return true;
  const mode = String(settlementMode || '');
  if (PREPAY_SETTLEMENTS.has(mode) && Number(minimumSpendZar) > 0) return true;
  return false;
}

export function inferOrderKind({ paymentType, settlementMode, menuItems, menuZar, ticketKind } = {}) {
  const t = String(paymentType || '');
  const k = String(ticketKind || '');
  if (t === 'EVENT_ENTRANCE' || k === 'EVENT_ENTRANCE') return 'ENTRANCE_MENU';
  if (t === 'ticket' || k === 'EVENT_TICKET') return 'TICKET_MENU';
  const items = parseMenuItemLines(menuItems);
  if (
    String(settlementMode) === 'PREPAY_LUMP' &&
    items.length === 0 &&
    !(Number(menuZar) > 0)
  ) {
    return 'MIN_SPEND';
  }
  return 'TABLE_MENU';
}

function usernameOf(user) {
  if (!user) return '';
  return user.userProfile?.username || user.username || '';
}

function mapUser(user) {
  if (!user) return null;
  return {
    id: user.id,
    username: usernameOf(user),
    fullName: user.fullName || null,
  };
}

export async function fulfillmentMapForReferences(db, refs) {
  const canonical = [...new Set((refs || []).map(canonicalOrderReference).filter(Boolean))];
  if (!canonical.length) return new Map();
  const rows = await db.orderFulfillment.findMany({
    where: { paystackReference: { in: canonical } },
  });
  return new Map(rows.map((r) => [r.paystackReference, r]));
}

export async function assertOrderFulfillPermission(db, { userId, userRole, venueId }) {
  if (!userId) return { ok: false, reason: 'Not signed in' };
  if (isStaff(userRole)) return { ok: true };
  if (!venueId) return { ok: false, reason: 'Venue not found' };
  if (await staffHasVenuePermission(userId, venueId, 'bookings')) return { ok: true };
  return { ok: false, reason: 'You need bookings access to mark orders as fulfilled.' };
}

async function loadRelatedForReference(db, reference) {
  const orRefs = [reference, `${reference}-1`];
  const [payment, booking, member, tickets] = await Promise.all([
    db.payment.findFirst({
      where: { reference, status: 'success' },
      select: {
        reference: true,
        userId: true,
        amount: true,
        metadata: true,
        type: true,
        createdAt: true,
      },
    }),
    db.eventVenueTableBooking.findFirst({
      where: { paystackReference: { in: orRefs } },
      include: {
        user: { select: userBriefSelect },
        event: { select: { id: true, title: true, venueId: true } },
        hostedTable: { select: { id: true, tableName: true } },
        venueTable: { select: { id: true, tableName: true, venueId: true } },
      },
      orderBy: { createdAt: 'desc' },
    }),
    db.venueTableMember.findFirst({
      where: { paystackReference: { in: orRefs } },
      include: {
        user: { select: userBriefSelect },
        venueTable: {
          select: {
            id: true,
            tableName: true,
            venueId: true,
            eventId: true,
            event: { select: { id: true, title: true } },
            minimumSpend: true,
            hostMinimumSpend: true,
          },
        },
      },
    }),
    db.ticket.findMany({
      where: {
        OR: [{ paystackReference: reference }, { paystackReference: { startsWith: `${reference}-` } }],
        refundedAt: null,
        hiddenFromHistoryAt: null,
      },
      orderBy: { createdAt: 'asc' },
      take: 20,
    }),
  ]);
  return { payment, booking, member, tickets };
}

export async function resolveOrderContext(db, rawReference) {
  const reference = canonicalOrderReference(rawReference);
  if (!reference) return { ok: false, status: 400, error: 'Missing payment reference' };

  const { payment, booking, member, tickets } = await loadRelatedForReference(db, reference);
  const ticket = tickets[0] || null;
  const meta = flattenPaymentMetadata(payment?.metadata);

  let venueId =
    booking?.venueId ||
    member?.venueTable?.venueId ||
    (meta.venue_id ? String(meta.venue_id) : null) ||
    (meta.venueId ? String(meta.venueId) : null);

  if (!venueId && ticket?.eventId) {
    const ev = await db.event.findFirst({
      where: { id: ticket.eventId, deletedAt: null },
      select: { venueId: true, title: true, id: true },
    });
    if (ev) venueId = ev.venueId;
  }
  if (!venueId && ticket?.venueTableId) {
    const vt = await db.venueTable.findUnique({
      where: { id: ticket.venueTableId },
      select: { venueId: true },
    });
    if (vt) venueId = vt.venueId;
  }
  if (!venueId && ticket?.hostedTableId) {
    const ht = await db.hostedTable.findUnique({
      where: { id: ticket.hostedTableId },
      select: { event: { select: { venueId: true } } },
    });
    if (ht?.event?.venueId) venueId = ht.event.venueId;
  }

  const menuItems =
    parseMenuItemLines(meta.selected_menu_items ?? meta.selectedMenuItems).length
      ? parseMenuItemLines(meta.selected_menu_items ?? meta.selectedMenuItems)
      : parseMenuItemLines(booking?.selectedMenuItems || member?.selectedMenuItems);

  const menuZar =
    Number(meta.menu_zar ?? meta.menuZar ?? meta.menu_total_zar ?? 0) ||
    Number(booking?.menuTotalZar || 0) ||
    0;
  const settlementMode =
    meta.settlement_mode ?? meta.settlementMode ?? booking?.settlementMode ?? member?.settlementMode ?? null;
  const minimumSpendZar =
    Number(meta.minimum_spend_zar ?? meta.minimumSpendZar ?? 0) ||
    Number(booking?.minimumSpendZar || 0) ||
    (member?.memberRole === 'HOST'
      ? Number(member?.venueTable?.hostMinimumSpend || 0)
      : Number(member?.venueTable?.minimumSpend || 0));

  if (
    !isServeableOrder({
      menuItems,
      menuZar,
      settlementMode,
      minimumSpendZar,
    })
  ) {
    return {
      ok: false,
      status: 400,
      error: 'This payment has no prepaid menu or minimum spend to fulfill.',
      reference,
      venueId,
    };
  }

  if (!venueId) {
    return { ok: false, status: 404, error: 'Could not match this order to a venue.' };
  }

  const userId = payment?.userId || booking?.userId || member?.userId || ticket?.userId;
  const user = booking?.user || member?.user || null;
  const eventTitle =
    booking?.event?.title ||
    member?.venueTable?.event?.title ||
    ticket?.title ||
    null;
  const eventId =
    booking?.eventId ||
    member?.venueTable?.eventId ||
    ticket?.eventId ||
    (meta.event_id ? String(meta.event_id) : null);
  const tableName =
    booking?.hostedTable?.tableName ||
    booking?.venueTable?.tableName ||
    member?.venueTable?.tableName ||
    null;

  const kind = inferOrderKind({
    paymentType: meta.type || payment?.type,
    settlementMode,
    menuItems,
    menuZar,
    ticketKind: ticket?.kind,
  });

  const fulfillment = await db.orderFulfillment.findUnique({
    where: { paystackReference: reference },
  });

  return {
    ok: true,
    reference,
    venueId,
    userId,
    user: mapUser(user) || (userId ? { id: userId, username: '', fullName: null } : null),
    kind,
    menuItems,
    menuZar,
    minimumSpendZar,
    settlementMode,
    amountPaidZar: Number(payment?.amount || booking?.amountTotal || member?.amountPaid || 0),
    eventId,
    eventTitle,
    tableName,
    ticketId: ticket?.id || null,
    createdAt: payment?.createdAt || booking?.createdAt || member?.paidAt || ticket?.createdAt || null,
    fulfilled: Boolean(fulfillment),
    fulfilledAt: fulfillment?.fulfilledAt || null,
    fulfilledByUserId: fulfillment?.fulfilledByUserId || null,
  };
}

export async function fulfillOrderByReference(db, { rawReference, staffUserId, staffRole }) {
  const ctx = await resolveOrderContext(db, rawReference);
  if (!ctx.ok) return ctx;
  const perm = await assertOrderFulfillPermission(db, {
    userId: staffUserId,
    userRole: staffRole,
    venueId: ctx.venueId,
  });
  if (!perm.ok) return { ok: false, status: 403, error: perm.reason };
  if (!ctx.userId) return { ok: false, status: 400, error: 'Order has no guest user.' };

  const row = await db.orderFulfillment.upsert({
    where: { paystackReference: ctx.reference },
    create: {
      venueId: ctx.venueId,
      userId: ctx.userId,
      paystackReference: ctx.reference,
      kind: ctx.kind,
      fulfilledByUserId: staffUserId,
    },
    update: {
      fulfilledAt: new Date(),
      fulfilledByUserId: staffUserId,
      kind: ctx.kind,
    },
  });
  return { ok: true, fulfillment: row, order: { ...ctx, fulfilled: true, fulfilledAt: row.fulfilledAt } };
}

export async function unfulfillOrderByReference(db, { rawReference, staffUserId, staffRole }) {
  const ctx = await resolveOrderContext(db, rawReference);
  if (!ctx.ok) return ctx;
  const perm = await assertOrderFulfillPermission(db, {
    userId: staffUserId,
    userRole: staffRole,
    venueId: ctx.venueId,
  });
  if (!perm.ok) return { ok: false, status: 403, error: perm.reason };

  await db.orderFulfillment.deleteMany({ where: { paystackReference: ctx.reference } });
  return { ok: true, order: { ...ctx, fulfilled: false, fulfilledAt: null } };
}

function pushCandidate(map, candidate) {
  const ref = canonicalOrderReference(candidate.paystackReference);
  if (!ref) return;
  const existing = map.get(ref);
  if (!existing) {
    map.set(ref, { ...candidate, paystackReference: ref });
    return;
  }
  if ((candidate.menuItems || []).length > (existing.menuItems || []).length) {
    existing.menuItems = candidate.menuItems;
  }
  if (Number(candidate.menuZar) > Number(existing.menuZar || 0)) existing.menuZar = candidate.menuZar;
  if (Number(candidate.minimumSpendZar) > Number(existing.minimumSpendZar || 0)) {
    existing.minimumSpendZar = candidate.minimumSpendZar;
  }
  if (!existing.settlementMode && candidate.settlementMode) existing.settlementMode = candidate.settlementMode;
  if (!existing.tableName && candidate.tableName) existing.tableName = candidate.tableName;
  if (!existing.eventTitle && candidate.eventTitle) existing.eventTitle = candidate.eventTitle;
}

export async function listVenueServeableOrders(db, { venueIds, q = '', status = 'pending', take = 300 }) {
  const query = normalizeGuestSearch(q);
  const statusFilter = ['pending', 'fulfilled', 'all'].includes(String(status)) ? String(status) : 'pending';
  const ids = (venueIds || []).filter(Boolean);
  if (!ids.length) return { items: [], summary: { pending: 0, fulfilled: 0, total: 0 } };

  const userSearch = query
    ? {
        OR: [
          { username: { contains: query, mode: 'insensitive' } },
          { fullName: { contains: query, mode: 'insensitive' } },
          { userProfile: { is: { username: { contains: query, mode: 'insensitive' } } } },
        ],
      }
    : undefined;

  const events = await db.event.findMany({
    where: { venueId: { in: ids }, deletedAt: null },
    select: { id: true, title: true, venueId: true },
  });
  const eventIds = events.map((e) => e.id);
  const eventById = new Map(events.map((e) => [e.id, e]));

  const venueTables = await db.venueTable.findMany({
    where: { venueId: { in: ids } },
    select: { id: true, tableName: true, venueId: true, eventId: true },
  });
  const vtIds = venueTables.map((t) => t.id);
  const vtById = new Map(venueTables.map((t) => [t.id, t]));

  const hosted = eventIds.length
    ? await db.hostedTable.findMany({
        where: { eventId: { in: eventIds } },
        select: { id: true },
      })
    : [];
  const hostedIds = hosted.map((h) => h.id);

  const ticketOr = [];
  if (eventIds.length) ticketOr.push({ eventId: { in: eventIds } });
  if (vtIds.length) ticketOr.push({ venueTableId: { in: vtIds } });
  if (hostedIds.length) ticketOr.push({ hostedTableId: { in: hostedIds } });

  const [bookings, members, tickets] = await Promise.all([
    db.eventVenueTableBooking.findMany({
      where: {
        venueId: { in: ids },
        paystackReference: { not: null },
        ...(userSearch ? { user: userSearch } : {}),
      },
      include: {
        user: { select: userBriefSelect },
        event: { select: { id: true, title: true } },
        hostedTable: { select: { tableName: true } },
        venueTable: { select: { tableName: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 800,
    }),
    db.venueTableMember.findMany({
      where: {
        paystackReference: { not: null },
        status: { in: ['CONFIRMED', 'LEFT'] },
        venueTable: { venueId: { in: ids } },
        ...(userSearch ? { user: userSearch } : {}),
      },
      include: {
        user: { select: userBriefSelect },
        venueTable: {
          select: {
            id: true,
            tableName: true,
            venueId: true,
            eventId: true,
            event: { select: { title: true } },
            minimumSpend: true,
            hostMinimumSpend: true,
          },
        },
      },
      orderBy: { paidAt: 'desc' },
      take: 800,
    }),
    ticketOr.length
      ? db.ticket.findMany({
          where: {
            OR: ticketOr,
            refundedAt: null,
            hiddenFromHistoryAt: null,
            kind: { in: ['EVENT_TICKET', 'EVENT_ENTRANCE', 'HOSTED_TABLE_JOIN', 'VENUE_TABLE_JOIN', 'TABLE_JOIN'] },
            ...(userSearch ? { user: userSearch } : {}),
          },
          include: { user: { select: userBriefSelect } },
          orderBy: { createdAt: 'desc' },
          take: 800,
        })
      : [],
  ]);

  const refs = new Set();
  for (const row of bookings) if (row.paystackReference) refs.add(canonicalOrderReference(row.paystackReference));
  for (const row of members) if (row.paystackReference) refs.add(canonicalOrderReference(row.paystackReference));
  for (const row of tickets) if (row.paystackReference) refs.add(canonicalOrderReference(row.paystackReference));
  const refList = [...refs].filter(Boolean);

  const payments = refList.length
    ? await db.payment.findMany({
        where: { reference: { in: refList }, status: 'success' },
        select: { reference: true, amount: true, metadata: true, type: true, createdAt: true, userId: true },
      })
    : [];
  const paymentByRef = new Map(payments.map((p) => [p.reference, p]));

  const candidates = new Map();

  for (const row of bookings) {
    const pay = paymentByRef.get(canonicalOrderReference(row.paystackReference));
    const meta = flattenPaymentMetadata(pay?.metadata);
    const menuItems =
      parseMenuItemLines(row.selectedMenuItems).length
        ? parseMenuItemLines(row.selectedMenuItems)
        : parseMenuItemLines(meta.selected_menu_items ?? meta.selectedMenuItems);
    pushCandidate(candidates, {
      paystackReference: row.paystackReference,
      venueId: row.venueId,
      userId: row.userId,
      username: usernameOf(row.user),
      fullName: row.user?.fullName || null,
      eventId: row.eventId,
      eventTitle: row.event?.title || null,
      tableName: row.hostedTable?.tableName || row.venueTable?.tableName || null,
      source: row.eventId ? 'event_table' : 'table',
      menuItems,
      menuZar: Number(row.menuTotalZar || meta.menu_zar || 0),
      minimumSpendZar: Number(row.minimumSpendZar || 0),
      settlementMode: row.settlementMode || meta.settlement_mode || null,
      amountPaidZar: Number(pay?.amount || row.amountTotal || 0),
      kind: inferOrderKind({
        paymentType: meta.type || pay?.type,
        settlementMode: row.settlementMode,
        menuItems,
        menuZar: Number(row.menuTotalZar || 0),
      }),
      createdAt: row.createdAt,
    });
  }

  for (const row of members) {
    const pay = paymentByRef.get(canonicalOrderReference(row.paystackReference));
    const meta = flattenPaymentMetadata(pay?.metadata);
    const menuItems =
      parseMenuItemLines(row.selectedMenuItems).length
        ? parseMenuItemLines(row.selectedMenuItems)
        : parseMenuItemLines(meta.selected_menu_items ?? meta.selectedMenuItems);
    const minSpend =
      row.memberRole === 'HOST'
        ? Number(row.venueTable?.hostMinimumSpend || 0)
        : Number(row.venueTable?.minimumSpend || 0);
    pushCandidate(candidates, {
      paystackReference: row.paystackReference,
      venueId: row.venueTable?.venueId,
      userId: row.userId,
      username: usernameOf(row.user),
      fullName: row.user?.fullName || null,
      eventId: row.venueTable?.eventId || null,
      eventTitle: row.venueTable?.event?.title || null,
      tableName: row.venueTable?.tableName || null,
      source: row.venueTable?.eventId ? 'event_table' : 'day',
      menuItems,
      menuZar: Number(meta.menu_zar || 0),
      minimumSpendZar: minSpend,
      settlementMode: row.settlementMode || meta.settlement_mode || null,
      amountPaidZar: Number(pay?.amount || row.amountPaid || 0),
      kind: inferOrderKind({
        paymentType: meta.type || pay?.type,
        settlementMode: row.settlementMode,
        menuItems,
        menuZar: Number(meta.menu_zar || 0),
      }),
      createdAt: row.paidAt || row.joinedAt,
    });
  }

  for (const row of tickets) {
    const pay = paymentByRef.get(canonicalOrderReference(row.paystackReference));
    const meta = flattenPaymentMetadata(pay?.metadata);
    const menuItems = parseMenuItemLines(meta.selected_menu_items ?? meta.selectedMenuItems);
    const ev = row.eventId ? eventById.get(row.eventId) : null;
    const vt = row.venueTableId ? vtById.get(row.venueTableId) : null;
    pushCandidate(candidates, {
      paystackReference: row.paystackReference,
      venueId: ev?.venueId || vt?.venueId || null,
      userId: row.userId,
      username: usernameOf(row.user),
      fullName: row.user?.fullName || null,
      eventId: row.eventId,
      eventTitle: ev?.title || row.title,
      tableName: vt?.tableName || null,
      source: row.kind === 'EVENT_TICKET' || row.kind === 'EVENT_ENTRANCE' ? 'ticket' : 'table',
      menuItems,
      menuZar: Number(meta.menu_zar || meta.menu_total_zar || 0),
      minimumSpendZar: Number(meta.minimum_spend_zar || 0),
      settlementMode: meta.settlement_mode || null,
      amountPaidZar: Number(pay?.amount || 0),
      kind: inferOrderKind({
        paymentType: meta.type || pay?.type,
        settlementMode: meta.settlement_mode,
        menuItems,
        menuZar: Number(meta.menu_zar || 0),
        ticketKind: row.kind,
      }),
      createdAt: pay?.createdAt || row.createdAt,
    });
  }

  const serveable = [...candidates.values()].filter((c) =>
    isServeableOrder({
      menuItems: c.menuItems,
      menuZar: c.menuZar,
      settlementMode: c.settlementMode,
      minimumSpendZar: c.minimumSpendZar,
    }),
  );

  const fulfillMap = await fulfillmentMapForReferences(
    db,
    serveable.map((c) => c.paystackReference),
  );

  let items = serveable.map((c) => {
    const f = fulfillMap.get(c.paystackReference);
    return {
      ...c,
      id: c.paystackReference,
      fulfilled: Boolean(f),
      fulfilledAt: f?.fulfilledAt || null,
    };
  });

  if (query) items = items.filter((row) => guestRecordMatchesSearch(row, query));

  const pending = items.filter((i) => !i.fulfilled).length;
  const fulfilled = items.filter((i) => i.fulfilled).length;
  if (statusFilter === 'pending') items = items.filter((i) => !i.fulfilled);
  else if (statusFilter === 'fulfilled') items = items.filter((i) => i.fulfilled);

  items.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  items = items.slice(0, take);

  return {
    items,
    summary: { pending, fulfilled, total: pending + fulfilled },
  };
}

export function applyFulfillmentToParticipant(entry, fulfillMap) {
  if (!entry) return entry;
  const ref = canonicalOrderReference(entry.paystackReference);
  const f = ref ? fulfillMap.get(ref) : null;
  const serveable = isServeableOrder({
    menuItems: entry.menuItems,
    menuZar: entry.menuZar,
    settlementMode: entry.settlementMode,
    minimumSpendZar: entry.minimumSpendZar,
  });
  return {
    ...entry,
    paystackReference: ref || entry.paystackReference || null,
    hasServeableOrder: serveable,
    orderFulfilled: Boolean(f),
    orderFulfilledAt: f?.fulfilledAt || null,
  };
}

export function serializeOrderForClient(order) {
  if (!order) return null;
  return {
    id: order.id || order.paystackReference,
    paystackReference: order.paystackReference,
    venueId: order.venueId,
    userId: order.userId,
    username: order.username || order.user?.username || '',
    fullName: order.fullName || order.user?.fullName || null,
    kind: order.kind,
    source: order.source || null,
    eventId: order.eventId || null,
    eventTitle: order.eventTitle || null,
    tableName: order.tableName || null,
    menuItems: order.menuItems || [],
    menuZar: Number(order.menuZar || 0),
    minimumSpendZar: Number(order.minimumSpendZar || 0),
    settlementMode: order.settlementMode || null,
    amountPaidZar: Number(order.amountPaidZar || 0),
    fulfilled: Boolean(order.fulfilled),
    fulfilledAt: order.fulfilledAt || null,
    createdAt: order.createdAt || null,
  };
}

export async function buildTicketOrderPayload(db, ticket) {
  const ctx = await resolveOrderContext(db, ticket.paystackReference);
  if (!ctx.ok) {
    return {
      has_serveable_order: false,
      menu_items: [],
      menu_zar: 0,
      minimum_spend_zar: 0,
      settlement_mode: null,
      order_fulfilled: false,
      order_fulfilled_at: null,
      paystack_reference: canonicalOrderReference(ticket.paystackReference),
    };
  }
  return {
    has_serveable_order: true,
    menu_items: ctx.menuItems,
    menu_zar: ctx.menuZar,
    minimum_spend_zar: ctx.minimumSpendZar,
    settlement_mode: ctx.settlementMode,
    order_fulfilled: ctx.fulfilled,
    order_fulfilled_at: ctx.fulfilledAt,
    paystack_reference: ctx.reference,
    order_kind: ctx.kind,
  };
}
