export function createPageUrl(pageName: string) {
    return '/' + pageName.replace(/ /g, '-');
}

/** Canonical web origin for share links (not the API URL). */
export function getPublicAppOrigin(): string {
    const raw = import.meta.env.VITE_PUBLIC_APP_URL || 'https://secnightlife.vercel.app';
    return String(raw).replace(/\/+$/, '');
}

export function getVenueProfileShareUrl(venueId: string): string {
    return `${getPublicAppOrigin()}/VenueProfile?id=${encodeURIComponent(venueId)}`;
}