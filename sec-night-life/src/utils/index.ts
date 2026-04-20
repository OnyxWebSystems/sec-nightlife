export function createPageUrl(pageName: string | null | undefined) {
    const name = pageName == null ? '' : String(pageName);
    return '/' + name.replace(/ /g, '-');
}

/** Canonical web origin for share links (not the API URL). */
export function getPublicAppOrigin(): string {
    const raw = import.meta.env.VITE_PUBLIC_APP_URL || 'https://secnightlife.vercel.app';
    return String(raw).replace(/\/+$/, '');
}

export function getVenueProfileShareUrl(venueId: string): string {
    return `${getPublicAppOrigin()}/VenueProfile?id=${encodeURIComponent(venueId)}`;
}

export function getEventDetailsShareUrl(eventId: string): string {
    return `${getPublicAppOrigin()}/EventDetails?id=${encodeURIComponent(eventId)}`;
}