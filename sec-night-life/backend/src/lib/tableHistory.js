import { prisma } from './prisma.js';
import { logger } from './logger.js';

/**
 * Record or refresh a table participation row (awaitable).
 * @param {object} opts
 * @param {string} opts.userId
 * @param {'HOST'|'JOINED'} opts.role
 * @param {string} opts.tableName
 * @param {string} [opts.eventTitle]
 * @param {string} [opts.eventId]
 * @param {string} [opts.tableId]
 * @param {string} [opts.hostedTableId]
 * @param {string} [opts.venueTableId]
 * @param {Date} [opts.occurredAt]
 */
export async function recordTableHistoryAwait(opts) {
  const {
    userId,
    role,
    tableName,
    eventTitle = null,
    eventId = null,
    tableId = null,
    hostedTableId = null,
    venueTableId = null,
    occurredAt = new Date(),
  } = opts;

  if (!userId || !tableName || !role) return;

  const where = {
    userId,
    role,
    hiddenAt: null,
    ...(tableId ? { tableId } : {}),
    ...(hostedTableId ? { hostedTableId } : {}),
    ...(venueTableId ? { venueTableId } : {}),
  };

  const existing = await prisma.userTableHistory.findFirst({
    where,
    orderBy: { occurredAt: 'desc' },
  });

  if (existing) {
    await prisma.userTableHistory.update({
      where: { id: existing.id },
      data: {
        tableName,
        eventTitle,
        eventId,
        occurredAt,
      },
    });
    return;
  }

  await prisma.userTableHistory.create({
    data: {
      userId,
      role,
      tableName,
      eventTitle,
      eventId,
      tableId,
      hostedTableId,
      venueTableId,
      occurredAt,
    },
  });
}

/** Fire-and-forget wrapper for runtime payment/join flows. */
export function recordTableHistory(opts) {
  if (!opts.userId || !opts.tableName || !opts.role) return;
  recordTableHistoryAwait(opts).catch((e) => {
    logger?.warn?.('table history record failed', { err: e?.message, userId: opts.userId, role: opts.role });
  });
}

export function mapTableHistoryRow(row) {
  const role =
    row.role === 'HOST' || row.role === 'host'
      ? 'host'
      : row.role === 'ATTENDED' || row.role === 'attended'
        ? 'attended'
        : 'joined';
  return {
    id: row.id,
    userId: row.userId,
    role,
    tableName: row.tableName,
    eventTitle: row.eventTitle,
    eventId: row.eventId,
    tableId: row.tableId,
    hostedTableId: row.hostedTableId,
    venueTableId: row.venueTableId,
    occurredAt: row.occurredAt,
    ticketId: row.ticketId ?? null,
  };
}

/** Stable dedupe key for a table participation entry. */
export function participationKey(role, ids = {}) {
  const r = role === 'HOST' || role === 'host' ? 'HOST' : 'JOINED';
  return `${r}:${ids.tableId || ''}:${ids.hostedTableId || ''}:${ids.venueTableId || ''}`;
}

function ticketRoleFromKind(kind) {
  if (kind === 'EVENT_TICKET') return 'ATTENDED';
  if (kind === 'TABLE_HOST_FEE') return 'HOST';
  return 'JOINED';
}

function ticketHistoryKey(ticket) {
  if (ticket.kind === 'EVENT_TICKET' && ticket.eventId) {
    return `ATTENDED:${ticket.eventId}`;
  }
  const role = ticketRoleFromKind(ticket.kind);
  return participationKey(role, {
    tableId: ticket.tableId,
    hostedTableId: ticket.hostedTableId,
    venueTableId: ticket.venueTableId,
  });
}

function ticketToHistoryRow(ticket, userId) {
  const role = ticketRoleFromKind(ticket.kind);
  const isEventTicket = ticket.kind === 'EVENT_TICKET';
  return {
    id: `ticket-${ticket.id}`,
    userId,
    role,
    tableName: isEventTicket ? null : ticket.title,
    eventTitle: isEventTicket ? ticket.title : (ticket.subtitle || ticket.title),
    eventId: ticket.eventId,
    tableId: ticket.tableId,
    hostedTableId: ticket.hostedTableId,
    venueTableId: ticket.venueTableId,
    occurredAt: ticket.eventStartsAt || ticket.createdAt,
    ticketId: ticket.id,
  };
}

/**
 * Build event history items from issued tickets (QR-backed participation).
 * @param {string} userId
 */
export async function gatherTicketEventHistory(userId) {
  const tickets = await prisma.ticket.findMany({
    where: {
      userId,
      hiddenFromHistoryAt: null,
    },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      kind: true,
      title: true,
      subtitle: true,
      eventId: true,
      tableId: true,
      hostedTableId: true,
      venueTableId: true,
      createdAt: true,
      eventStartsAt: true,
    },
  });

  const byKey = new Map();
  for (const ticket of tickets) {
    const key = ticketHistoryKey(ticket);
    if (!byKey.has(key)) {
      byKey.set(key, ticketToHistoryRow(ticket, userId));
    }
  }
  return [...byKey.values()];
}

function synthRow(role, data) {
  return {
    id: null,
    userId: data.userId,
    role: role === 'HOST' ? 'HOST' : 'JOINED',
    tableName: data.tableName,
    eventTitle: data.eventTitle ?? null,
    eventId: data.eventId ?? null,
    tableId: data.tableId ?? null,
    hostedTableId: data.hostedTableId ?? null,
    venueTableId: data.venueTableId ?? null,
    occurredAt: data.occurredAt ?? new Date(),
  };
}

async function fetchLegacyJoinRows(userId) {
  try {
    return await prisma.$queryRaw`
      SELECT DISTINCT t.id, t.name, t.event_id AS "eventId", t.created_at AS "createdAt", e.title AS "eventTitle"
      FROM tables t
      INNER JOIN events e ON e.id = t.event_id
      WHERE t.deleted_at IS NULL
        AND t.host_user_id::text != ${userId}
        AND e.deleted_at IS NULL
        AND e.status = 'published'
        AND EXISTS (
          SELECT 1 FROM jsonb_array_elements(
            CASE
              WHEN jsonb_typeof(t.members::jsonb) = 'array' THEN t.members::jsonb
              ELSE '[]'::jsonb
            END
          ) AS elem
          WHERE elem #>> '{}' = ${userId}
             OR elem->>'user_id' = ${userId}
             OR elem->>'userId' = ${userId}
        )
    `;
  } catch (e) {
    logger?.warn?.('legacy table join history failed', { err: e?.message, userId });
    return [];
  }
}

/**
 * Build table history items from live DB participation (fills gaps in user_table_history).
 * @param {string} userId
 */
export async function gatherLiveTableParticipation(userId) {
  const [
    legacyHosted,
    hostedTables,
    venueHosted,
    hostedJoins,
    venueJoins,
    legacyJoinRows,
  ] = await Promise.all([
    prisma.table.findMany({
      where: {
        hostUserId: userId,
        deletedAt: null,
        event: { deletedAt: null, status: 'published' },
      },
      select: { id: true, name: true, eventId: true, createdAt: true, event: { select: { title: true } } },
    }),
    prisma.hostedTable.findMany({
      where: { hostUserId: userId, status: { not: 'DRAFT' } },
      select: { id: true, tableName: true, eventId: true, createdAt: true, event: { select: { title: true } } },
    }),
    prisma.venueTable.findMany({
      where: { hostUserId: userId },
      select: { id: true, tableName: true, eventId: true, createdAt: true, event: { select: { title: true } } },
    }),
    prisma.hostedTableMember.findMany({
      where: {
        userId,
        status: 'GOING',
        hostedTable: { NOT: { hostUserId: userId } },
      },
      select: {
        joinedAt: true,
        hostedTable: {
          select: { id: true, tableName: true, eventId: true, event: { select: { title: true } } },
        },
      },
    }),
    prisma.venueTableMember.findMany({
      where: {
        userId,
        status: { in: ['CONFIRMED', 'LEFT'] },
        venueTable: { NOT: { hostUserId: userId } },
      },
      select: {
        joinedAt: true,
        paidAt: true,
        venueTable: {
          select: { id: true, tableName: true, eventId: true, event: { select: { title: true } } },
        },
      },
    }),
    fetchLegacyJoinRows(userId),
  ]);

  const items = [];

  for (const t of legacyHosted) {
    items.push(synthRow('HOST', {
      userId,
      tableId: t.id,
      eventId: t.eventId,
      tableName: t.name,
      eventTitle: t.event?.title || null,
      occurredAt: t.createdAt,
    }));
  }
  for (const ht of hostedTables) {
    items.push(synthRow('HOST', {
      userId,
      hostedTableId: ht.id,
      eventId: ht.eventId,
      tableName: ht.tableName,
      eventTitle: ht.event?.title || null,
      occurredAt: ht.createdAt,
    }));
  }
  for (const vt of venueHosted) {
    items.push(synthRow('HOST', {
      userId,
      venueTableId: vt.id,
      eventId: vt.eventId,
      tableName: vt.tableName,
      eventTitle: vt.event?.title || null,
      occurredAt: vt.createdAt,
    }));
  }
  for (const m of hostedJoins) {
    const ht = m.hostedTable;
    items.push(synthRow('JOINED', {
      userId,
      hostedTableId: ht.id,
      eventId: ht.eventId,
      tableName: ht.tableName,
      eventTitle: ht.event?.title || null,
      occurredAt: m.joinedAt,
    }));
  }
  for (const m of venueJoins) {
    const vt = m.venueTable;
    items.push(synthRow('JOINED', {
      userId,
      venueTableId: vt.id,
      eventId: vt.eventId,
      tableName: vt.tableName,
      eventTitle: vt.event?.title || null,
      occurredAt: m.paidAt || m.joinedAt,
    }));
  }
  for (const row of legacyJoinRows || []) {
    items.push(synthRow('JOINED', {
      userId,
      tableId: row.id,
      eventId: row.eventId,
      tableName: row.name,
      eventTitle: row.eventTitle || null,
      occurredAt: row.createdAt,
    }));
  }

  return items;
}

/**
 * Merge persisted history with live participation; respect soft-deleted keys.
 * @param {object[]} persistedRows - user_table_history rows (visible only)
 * @param {Set<string>} hiddenKeys - participation keys user removed
 * @param {number} limit
 */
export async function mergeTableHistoryForUser(userId, persistedRows, hiddenKeys, limit = 20) {
  const [liveResult, ticketResult] = await Promise.allSettled([
    gatherLiveTableParticipation(userId),
    gatherTicketEventHistory(userId),
  ]);

  const live = liveResult.status === 'fulfilled' ? liveResult.value : [];
  const ticketRows = ticketResult.status === 'fulfilled' ? ticketResult.value : [];

  if (liveResult.status === 'rejected') {
    logger?.warn?.('gatherLiveTableParticipation failed', {
      err: liveResult.reason?.message,
      userId,
    });
  }
  if (ticketResult.status === 'rejected') {
    logger?.warn?.('gatherTicketEventHistory failed', {
      err: ticketResult.reason?.message,
      userId,
    });
  }

  const byKey = new Map();
  const coveredEventIds = new Set();

  const rememberEvent = (row) => {
    if (row.eventId) coveredEventIds.add(row.eventId);
  };

  for (const row of persistedRows) {
    const key = participationKey(row.role, row);
    if (hiddenKeys.has(key)) continue;
    byKey.set(key, row);
    rememberEvent(row);
  }

  for (const row of live) {
    const key = participationKey(row.role, row);
    if (hiddenKeys.has(key) || byKey.has(key)) continue;
    byKey.set(key, row);
    rememberEvent(row);
  }

  for (const row of ticketRows) {
    if (row.role === 'ATTENDED' && row.eventId && coveredEventIds.has(row.eventId)) {
      continue;
    }
    const key =
      row.role === 'ATTENDED' && row.eventId
        ? `ATTENDED:${row.eventId}`
        : participationKey(row.role, row);
    if (hiddenKeys.has(key) || byKey.has(key)) continue;
    byKey.set(key, row);
    rememberEvent(row);
  }

  const merged = [...byKey.values()].sort(
    (a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime()
  );

  return merged.slice(0, limit).map((row) => {
    if (row.id) return mapTableHistoryRow(row);
    return { ...mapTableHistoryRow(row), id: `synth-${participationKey(row.role, row)}` };
  });
}

const STATS_MERGE_LIMIT = 500;

/**
 * Distinct hosted/joined table counts aligned with Activity event history sources.
 * @param {string} userId
 */
export async function countParticipationStats(userId) {
  const [persistedRows, hiddenRows] = await Promise.all([
    prisma.userTableHistory.findMany({
      where: { userId, hiddenAt: null },
    }),
    prisma.userTableHistory.findMany({
      where: { userId, hiddenAt: { not: null } },
      select: { role: true, tableId: true, hostedTableId: true, venueTableId: true },
    }),
  ]);

  const hiddenKeys = new Set(hiddenRows.map((r) => participationKey(r.role, r)));
  const items = await mergeTableHistoryForUser(userId, persistedRows, hiddenKeys, STATS_MERGE_LIMIT);

  const hostKeys = new Set();
  const joinedKeys = new Set();

  for (const item of items) {
    if (item.role === 'host') {
      hostKeys.add(participationKey('HOST', item));
    } else if (item.role === 'joined') {
      joinedKeys.add(participationKey('JOINED', item));
    }
  }

  return {
    tablesHosted: hostKeys.size,
    tablesJoined: joinedKeys.size,
  };
}
