/**
 * Whether an event has finished for listing / venue manager rules.
 * Prefer canonical `ends_at`; otherwise end of calendar `date` (UTC day boundary).
 */
export function isEventEnded(evt) {
  const endsAtRaw = evt?.ends_at ?? evt?.endsAt;
  if (endsAtRaw) {
    const t = new Date(endsAtRaw);
    if (!Number.isNaN(t.getTime())) return t.getTime() < Date.now();
  }
  const dateStr = evt?.date;
  if (dateStr && typeof dateStr === 'string') {
    const d = new Date(`${dateStr}T23:59:59.999Z`);
    if (!Number.isNaN(d.getTime())) return d.getTime() < Date.now();
  }
  return false;
}
