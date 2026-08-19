/** Per-tier ticket cap helpers. Kept separate so issuance/dashboard code does not import checkout. */

/** Integer >= 1, or null when the venue left the cap blank / unlimited. */
export function parseMaxPerUser(tierOrRaw) {
  const raw = tierOrRaw && typeof tierOrRaw === 'object' ? tierOrRaw.max_per_user : tierOrRaw;
  if (raw == null || raw === '') return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return null;
  return Math.floor(n);
}

export function userEventTierTicketWhere(userId, eventId, ticketTier) {
  return {
    userId: String(userId),
    eventId: String(eventId),
    kind: 'EVENT_TICKET',
    subtitle: ticketTier,
    refundedAt: null,
    hiddenFromHistoryAt: null,
  };
}

export async function countUserEventTierTickets(db, { userId, eventId, ticketTier }) {
  if (!userId || !eventId || !ticketTier) return 0;
  return db.ticket.count({
    where: userEventTierTicketWhere(userId, eventId, ticketTier),
  });
}

export async function countUserEventTicketsByTier(db, { userId, eventId }) {
  if (!userId || !eventId) return {};
  const rows = await db.ticket.groupBy({
    by: ['subtitle'],
    where: {
      userId: String(userId),
      eventId: String(eventId),
      kind: 'EVENT_TICKET',
      refundedAt: null,
      hiddenFromHistoryAt: null,
    },
    _count: { _all: true },
  });
  const out = {};
  for (const r of rows) {
    if (r.subtitle) out[r.subtitle] = r._count._all;
  }
  return out;
}
