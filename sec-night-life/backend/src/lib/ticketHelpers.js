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

/** Ticket scan + Profile “active” until this instant. */
export function visibleUntilFromEventStartsAt(eventStartsAt) {
  if (!eventStartsAt) return null;
  const s = eventStartsAt instanceof Date ? eventStartsAt : new Date(eventStartsAt);
  return new Date(s.getTime() + MS_DAY);
}

/** Expiry for API + UI (legacy rows use visible_until only). */
export function ticketExpiresAtFromRow(row) {
  if (row.eventStartsAt) {
    const s = row.eventStartsAt instanceof Date ? row.eventStartsAt : new Date(row.eventStartsAt);
    return new Date(s.getTime() + MS_DAY);
  }
  const v = row.visibleUntil instanceof Date ? row.visibleUntil : new Date(row.visibleUntil);
  return v;
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

export function formatSpecsFromHostedTable(ht) {
  if (!ht) return null;
  const parts = [];
  if (ht.guestQuantity != null) parts.push(`up to ${ht.guestQuantity} guests`);
  if (ht.hasJoiningFee && ht.joiningFee) parts.push(`join R${Number(ht.joiningFee)}`);
  return parts.length ? parts.join(' · ') : null;
}
