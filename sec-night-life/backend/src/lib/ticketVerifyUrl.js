/** Max venue name chars in QR URL (readability + scan reliability). */
const VN_MAX = 56;

export function ticketVerifyPublicOrigin() {
  return String(process.env.APP_URL || process.env.PUBLIC_APP_URL || process.env.VITE_PUBLIC_APP_URL || '').replace(
    /\/+$/,
    '',
  );
}

export function truncateVenueHint(name) {
  if (name == null || typeof name !== 'string') return null;
  const s = name.trim();
  if (!s) return null;
  if (s.length <= VN_MAX) return s;
  return `${s.slice(0, VN_MAX - 1)}…`;
}

export function eventAtHintIso(eventStartsAt) {
  if (!eventStartsAt) return null;
  const d = eventStartsAt instanceof Date ? eventStartsAt : new Date(eventStartsAt);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/**
 * Full TicketVerify URL including optional human-readable hints (event code, venue + event time).
 * @param {string} baseUrl — e.g. https://secnightlife.com (no trailing slash)
 * @param {string} qrToken
 * @param {{ eventCode?: string | null; venueName?: string | null; eventStartsAt?: Date | string | null }} [hints]
 */
export function buildTicketVerifyUrlWithHints(baseUrl, qrToken, hints = {}) {
  const base = String(baseUrl || '').replace(/\/+$/, '');
  const tokenQ = encodeURIComponent(qrToken);
  const parts = [];
  const ec = hints.eventCode != null ? String(hints.eventCode).trim().toUpperCase() : '';
  if (ec) parts.push(`ec=${encodeURIComponent(ec)}`);
  parts.push(`token=${tokenQ}`);
  const vn = truncateVenueHint(hints.venueName);
  if (vn) parts.push(`vn=${encodeURIComponent(vn)}`);
  const at = eventAtHintIso(hints.eventStartsAt);
  if (at) parts.push(`at=${encodeURIComponent(at)}`);
  const path = `/TicketVerify?${parts.join('&')}`;
  if (base) return `${base}${path}`;
  return path;
}
