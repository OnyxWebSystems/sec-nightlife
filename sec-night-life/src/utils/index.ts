export function createPageUrl(pageName: string | null | undefined) {
    const name = pageName == null ? '' : String(pageName);
    return '/' + name.replace(/ /g, '-');
}

/** Canonical web origin for share links (not the API URL). */
export function getPublicAppOrigin(): string {
    const raw = import.meta.env.VITE_PUBLIC_APP_URL || 'https://sec-nightlife.vercel.app';
    return String(raw).replace(/\/+$/, '');
}

const VN_MAX = 56;

function truncateVenueHint(name: string | null | undefined): string | null {
    if (name == null || typeof name !== 'string') return null;
    const s = name.trim();
    if (!s) return null;
    if (s.length <= VN_MAX) return s;
    return `${s.slice(0, VN_MAX - 1)}…`;
}

function eventAtHintIso(eventStartsAt: string | Date | null | undefined): string | null {
    if (!eventStartsAt) return null;
    const d = eventStartsAt instanceof Date ? eventStartsAt : new Date(eventStartsAt);
    if (Number.isNaN(d.getTime())) return null;
    return d.toISOString();
}

/**
 * Full URL for ticket QR (optional venue + event time hints match server-issued tickets).
 */
export function getTicketVerifyUrl(
    qrToken: string,
    hints?: { venueName?: string | null; eventStartsAt?: string | Date | null },
): string {
    const base = getPublicAppOrigin();
    const parts = [`token=${encodeURIComponent(qrToken)}`];
    const vn = truncateVenueHint(hints?.venueName ?? null);
    if (vn) parts.push(`vn=${encodeURIComponent(vn)}`);
    const at = eventAtHintIso(hints?.eventStartsAt ?? null);
    if (at) parts.push(`at=${encodeURIComponent(at)}`);
    return `${base}/TicketVerify?${parts.join('&')}`;
}

export function getVenueProfileShareUrl(venueId: string): string {
    return `${getPublicAppOrigin()}/VenueProfile?id=${encodeURIComponent(venueId)}`;
}

export function getEventDetailsShareUrl(eventId: string): string {
    return `${getPublicAppOrigin()}/EventDetails?id=${encodeURIComponent(eventId)}`;
}