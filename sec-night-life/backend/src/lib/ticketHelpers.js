import crypto from 'crypto';

const MS_DAY = 24 * 60 * 60 * 1000;

export function generateQrToken() {
  return crypto.randomBytes(24).toString('hex');
}

/** Assume event ends same calendar day as `date` at 04:00 local if no better signal. */
export function visibleUntilAfterEventDate(eventDate) {
  const d = eventDate instanceof Date ? eventDate : new Date(eventDate);
  const end = new Date(d.getTime());
  end.setUTCHours(4, 0, 0, 0);
  if (end < d) end.setUTCDate(end.getUTCDate() + 1);
  return new Date(end.getTime() + MS_DAY);
}

export function visibleUntilAfterParty(party) {
  const end = party?.endTime instanceof Date ? party.endTime : new Date(party?.endTime);
  return new Date(end.getTime() + MS_DAY);
}

export function visibleUntilAfterHostedTable(t) {
  const d = t.eventDate instanceof Date ? t.eventDate : new Date(t.eventDate);
  const end = new Date(d.getTime());
  const parts = String(t.eventTime || '').split(':');
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (Number.isFinite(h) && Number.isFinite(m)) {
    end.setUTCHours(h, m || 0, 0, 0);
  }
  end.setUTCHours(end.getUTCHours() + 8);
  return new Date(end.getTime() + MS_DAY);
}

export function visibleUntilForVenueTableMember(table, event) {
  const evDate = event?.date ? (event.date instanceof Date ? event.date : new Date(event.date)) : new Date();
  return visibleUntilAfterEventDate(evDate);
}

/** When the ticketed experience starts (UTC), for expiry = start + 24h. */
export function eventStartsAtFromEvent(event) {
  if (!event?.date) return null;
  const d = event.date instanceof Date ? new Date(event.date) : new Date(event.date);
  const st = event.startTime ?? event.start_time;
  if (st && typeof st === 'string') {
    const parts = st.split(':');
    const h = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    if (Number.isFinite(h) && Number.isFinite(m)) {
      const x = new Date(d.getTime());
      x.setUTCHours(h, m || 0, 0, 0);
      return x;
    }
  }
  return d;
}

/** Hosted table calendar + clock (UTC hours from eventTime string). */
export function eventStartsAtFromHostedTable(t) {
  if (!t?.eventDate) return null;
  const d = t.eventDate instanceof Date ? new Date(t.eventDate) : new Date(t.eventDate);
  const start = new Date(d.getTime());
  const parts = String(t.eventTime || '').split(':');
  const h = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10);
  if (Number.isFinite(h) && Number.isFinite(m)) {
    start.setUTCHours(h, m || 0, 0, 0);
  }
  return start;
}

/** Ticket scan + Profile “active” until this instant (legacy: start + 24h). */
export function visibleUntilFromEventStartsAt(eventStartsAt) {
  if (!eventStartsAt) return null;
  const s = eventStartsAt instanceof Date ? eventStartsAt : new Date(eventStartsAt);
  return new Date(s.getTime() + MS_DAY);
}

/**
 * Canonical end instant for an SEC Event row (Prisma `endsAt` or legacy start + 24h).
 * Accepts camelCase or snake_case from JSON/API.
 */
export function eventEndsAtFromEvent(event) {
  if (!event) return null;
  const raw = event.endsAt ?? event.ends_at;
  if (raw) {
    const e = raw instanceof Date ? raw : new Date(raw);
    return Number.isNaN(e.getTime()) ? null : e;
  }
  const start = eventStartsAtFromEvent(event);
  if (start) return new Date(start.getTime() + MS_DAY);
  if (event?.date) return visibleUntilAfterEventDate(event.date);
  return null;
}

/** Expiry for API + UI (legacy rows use visible_until only). */
export function ticketExpiresAtFromRow(row) {
  const visRaw = row.visibleUntil ?? row.visible_until;
  if (visRaw) {
    const v = visRaw instanceof Date ? visRaw : new Date(visRaw);
    if (!Number.isNaN(v.getTime())) return v;
  }
  if (row.eventStartsAt || row.event_starts_at) {
    const s = row.eventStartsAt ?? row.event_starts_at;
    const st = s instanceof Date ? s : new Date(s);
    return new Date(st.getTime() + MS_DAY);
  }
  return visRaw ? new Date(visRaw) : new Date();
}

export function holderDisplayNameFromUser(user) {
  if (!user) return 'Guest';
  return (
    user.fullName ||
    user.full_name ||
    user.userProfile?.username ||
    user.username ||
    'Guest'
  );
}

export function formatSpecsFromTable(table) {
  if (!table) return null;
  const parts = [];
  const cat = table.tableCategory ?? table.table_category;
  if (cat) parts.push(String(cat).replace(/^./, (c) => c.toUpperCase()));
  if (table.maxGuests != null) parts.push(`max ${table.maxGuests} guests`);
  if (table.minSpend != null && Number(table.minSpend) > 0) parts.push(`min spend R${Number(table.minSpend)}`);
  if (table.joiningFee != null && Number(table.joiningFee) > 0) parts.push(`join fee R${Number(table.joiningFee)}`);
  return parts.length ? parts.join(' · ') : null;
}

export function formatSpecsFromVenueTable(vt) {
  if (!vt) return null;
  const parts = [];
  if (vt.tableName) parts.push(vt.tableName);
  if (vt.guestCapacity != null) parts.push(`capacity ${vt.guestCapacity}`);
  if (vt.minimumSpend != null) parts.push(`min spend R${Number(vt.minimumSpend)}`);
  return parts.join(' · ');
}

export function formatSpecsFromHostedTable(ht, members) {
  if (!ht) return null;
  const parts = [];
  if (ht.hostingCategory) {
    const tierName =
      ht.tierIncludedItems && typeof ht.tierIncludedItems === 'object' && ht.tierIncludedItems.tier_name
        ? ht.tierIncludedItems.tier_name
        : null;
    parts.push(tierName || ht.hostingCategory);
  }
  if (ht.guestQuantity != null) parts.push(`up to ${ht.guestQuantity} guests`);
  if (ht.tierMinSpend != null && Number(ht.tierMinSpend) > 0) {
    parts.push(`min spend R${Number(ht.tierMinSpend)}`);
  }
  if (ht.menuSpendTotal != null && Number(ht.menuSpendTotal) > 0) {
    parts.push(`table menu R${Number(ht.menuSpendTotal)}`);
  }
  if (ht.hasJoiningFee && ht.joiningFee) parts.push(`join R${Number(ht.joiningFee)}`);
  const hostMem = Array.isArray(members)
    ? members.find((m) => m.userId === ht.hostUserId)
    : null;
  const hostLines = hostMem?.selectedMenuItems;
  if (Array.isArray(hostLines) && hostLines.length) {
    const brief = hostLines
      .slice(0, 3)
      .map((l) => `${l.quantity}× ${l.name}`)
      .join(', ');
    parts.push(brief);
  }
  return parts.length ? parts.join(' · ') : null;
}

/**
 * @deprecated Do not overwrite all guest join tickets with table-wide menu text.
 * Menu orders get their own ticket per payment (see payments HOSTED_TABLE_MENU).
 */
export async function refreshHostedTableTickets(prisma, hostedTableId) {
  const ht = await prisma.hostedTable.findUnique({
    where: { id: String(hostedTableId) },
    include: { members: true },
  });
  if (!ht) return;
  const hostMem = ht.members?.find((m) => m.userId === ht.hostUserId);
  if (!hostMem) return;
  const summary = formatSpecsFromHostedTable(ht, [hostMem]);
  if (!summary) return;
  await prisma.ticket.updateMany({
    where: {
      hostedTableId: ht.id,
      userId: ht.hostUserId,
      kind: 'TABLE_HOST_FEE',
    },
    data: { tableSpecsSummary: summary },
  });
}
