import { Capacitor } from '@capacitor/core';

/**
 * Build map deep links for Apple Maps and Google Maps.
 * @param {{ address?: string|null, lat?: number|null, lng?: number|null }} opts
 */
export function buildMapUrls({ address, lat, lng } = {}) {
  const hasCoords =
    typeof lat === 'number' &&
    typeof lng === 'number' &&
    Number.isFinite(lat) &&
    Number.isFinite(lng);
  const q = (address && String(address).trim()) || (hasCoords ? `${lat},${lng}` : '');

  const apple = new URL('https://maps.apple.com/');
  if (hasCoords) {
    apple.searchParams.set('ll', `${lat},${lng}`);
    if (address && String(address).trim()) apple.searchParams.set('q', String(address).trim());
  } else if (q) {
    apple.searchParams.set('q', q);
  }

  const google = new URL('https://maps.google.com/');
  if (q) google.searchParams.set('q', q);

  return {
    apple: apple.toString(),
    google: google.toString(),
    query: q,
  };
}

export function isIosPlatform() {
  try {
    if (Capacitor.getPlatform() === 'ios') return true;
  } catch {
    /* ignore */
  }
  if (typeof navigator !== 'undefined') {
    return /iPad|iPhone|iPod/i.test(navigator.userAgent || '');
  }
  return false;
}

/**
 * Open directions — Apple Maps first on iOS, Google Maps elsewhere.
 * @param {{ address?: string|null, lat?: number|null, lng?: number|null }} opts
 */
export function openDirections(opts = {}) {
  const { apple, google, query } = buildMapUrls(opts);
  if (!query) return;
  const url = isIosPlatform() ? apple : google;
  if (typeof window !== 'undefined') {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

/**
 * Labels for dual map actions (primary + secondary).
 */
export function getDirectionsActions(opts = {}) {
  const urls = buildMapUrls(opts);
  const ios = isIosPlatform();
  return {
    primary: {
      label: ios ? 'Open in Apple Maps' : 'Open in Google Maps',
      href: ios ? urls.apple : urls.google,
    },
    secondary: {
      label: ios ? 'Open in Google Maps' : 'Open in Apple Maps',
      href: ios ? urls.google : urls.apple,
    },
    ...urls,
  };
}
