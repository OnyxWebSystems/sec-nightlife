/** Coerce API payloads that may be a bare array or `{ items: [...] }`. */
export function asArray<T>(value: unknown, itemsKey = 'items'): T[] {
    if (Array.isArray(value)) return value as T[];
    if (value && typeof value === 'object') {
        const nested = (value as Record<string, unknown>)[itemsKey];
        if (Array.isArray(nested)) return nested as T[];
    }
    return [];
}

export function createPageUrl(pageName: string | null | undefined) {
    const name = pageName == null ? '' : String(pageName);
    return '/' + name.replace(/ /g, '-');
}

/** Build a page path with query params (preferred over embedding ? in createPageUrl). */
export function buildPageUrl(
    pageName: string,
    params?: Record<string, string | number | boolean | null | undefined>,
): string {
    const base = createPageUrl(pageName);
    if (!params) return base;
    const search = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value == null || value === '') continue;
        search.set(key, String(value));
    }
    const qs = search.toString();
    return qs ? `${base}?${qs}` : base;
}

/** Canonical web origin for share links (not the API URL). */
export function getPublicAppOrigin(): string {
    const raw = import.meta.env.VITE_PUBLIC_APP_URL || 'https://secnightlife.com';
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
    hints?: { eventCode?: string | null; venueName?: string | null; eventStartsAt?: string | Date | null },
): string {
    const base = getPublicAppOrigin();
    const parts: string[] = [];
    const ec = hints?.eventCode != null ? String(hints.eventCode).trim().toUpperCase() : '';
    if (ec) parts.push(`ec=${encodeURIComponent(ec)}`);
    parts.push(`token=${encodeURIComponent(qrToken)}`);
    const vn = truncateVenueHint(hints?.venueName ?? null);
    if (vn) parts.push(`vn=${encodeURIComponent(vn)}`);
    const at = eventAtHintIso(hints?.eventStartsAt ?? null);
    if (at) parts.push(`at=${encodeURIComponent(at)}`);
    return `${base}/TicketVerify?${parts.join('&')}`;
}

/** True when a verify URL points at the API host (not the public SPA). */
export function isApiLikeVerifyHost(url: string): boolean {
    try {
        const u = new URL(url);
        const h = u.hostname.toLowerCase();
        return h.startsWith('api.') || h.includes('.api.') || u.pathname.startsWith('/api');
    } catch {
        return false;
    }
}

/** True when a verify URL is not a canonical production SPA host (preview, localhost, API). */
export function isNonProductionVerifyHost(url: string): boolean {
    if (isApiLikeVerifyHost(url)) return true;
    try {
        const h = new URL(url).hostname.toLowerCase();
        if (h === 'localhost' || h === '127.0.0.1') return true;
        if (h.endsWith('.vercel.app')) return true;
    } catch {
        return true;
    }
    return false;
}

/** Prefer a public-app verify URL; ignore server URLs that target non-canonical hosts. */
export function resolveTicketVerifyUrl(ticket: {
    verify_url?: string | null;
    qr_token?: string | null;
    venue_name?: string | null;
    event_starts_at?: string | null;
    event_code?: string | null;
}): string | null {
    const token = ticket?.qr_token;
    if (!token) return null;
    const hints = {
        venueName: ticket.venue_name,
        eventStartsAt: ticket.event_starts_at,
        eventCode: ticket.event_code,
    };
    const fromServer = ticket.verify_url?.trim();
    if (fromServer && !isNonProductionVerifyHost(fromServer)) return fromServer;
    return getTicketVerifyUrl(token, hints);
}

export function getVenueProfileShareUrl(venueId: string): string {
    return `${getPublicAppOrigin()}/VenueProfile?id=${encodeURIComponent(venueId)}`;
}

export function getEventDetailsShareUrl(eventId: string): string {
    return `${getPublicAppOrigin()}/EventDetails?id=${encodeURIComponent(eventId)}`;
}

export function getPromoterEventShareUrl(eventId: string, promoterUserId: string): string {
    return `${getPublicAppOrigin()}/EventDetails?id=${encodeURIComponent(eventId)}&ref=${encodeURIComponent(promoterUserId)}`;
}

export const PROMOTER_REF_STORAGE_PREFIX = 'sec_promoter_ref_';

export function storePromoterRef(eventId: string, promoterUserId: string): void {
    if (!eventId || !promoterUserId) return;
    try {
        sessionStorage.setItem(`${PROMOTER_REF_STORAGE_PREFIX}${eventId}`, promoterUserId);
    } catch {
        /* ignore */
    }
}

export function getStoredPromoterRef(eventId: string): string | null {
    if (!eventId) return null;
    try {
        return sessionStorage.getItem(`${PROMOTER_REF_STORAGE_PREFIX}${eventId}`);
    } catch {
        return null;
    }
}