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
