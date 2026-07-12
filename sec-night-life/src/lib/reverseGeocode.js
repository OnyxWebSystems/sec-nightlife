import { loadGoogleMapsApi } from '@/lib/googleMapsApi';
import { apiGet } from '@/api/client';

function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function coordFallback(latN, lngN) {
  return `${latN.toFixed(5)}, ${lngN.toFixed(5)}`;
}

async function reverseViaGoogle(latN, lngN) {
  if (typeof window !== 'undefined' && window.__googleMapsAuthFailure) {
    throw new Error('Google Maps authentication failed.');
  }

  await withTimeout(loadGoogleMapsApi(), 6000, 'Google Maps load timed out');

  if (typeof window !== 'undefined' && window.__googleMapsAuthFailure) {
    throw new Error('Google Maps authentication failed.');
  }
  if (!window.google?.maps?.Geocoder) {
    throw new Error('Geocoder unavailable');
  }

  const geocoder = new window.google.maps.Geocoder();
  return withTimeout(
    new Promise((resolve, reject) => {
      geocoder.geocode({ location: { lat: latN, lng: lngN } }, (results, status) => {
        if (status === 'OK' && results?.[0]?.formatted_address) {
          resolve(results[0].formatted_address);
          return;
        }
        reject(new Error(status || 'Geocode failed'));
      });
    }),
    5000,
    'Google reverse geocode timed out'
  );
}

async function reverseViaApi(latN, lngN) {
  const data = await apiGet(
    `/api/map/reverse-geocode?lat=${encodeURIComponent(latN)}&lng=${encodeURIComponent(lngN)}`,
    { timeoutMs: 10000, skipAuth: true }
  );
  const label = typeof data?.label === 'string' ? data.label.trim() : '';
  if (!label) throw new Error('No label from API');
  return label;
}

/**
 * Reverse-geocode lat/lng to a human-readable address.
 * Tries Google Maps first, then server Nominatim fallback.
 * Never hangs: always returns a string (coords as last resort).
 */
export async function reverseGeocodeLatLng(lat, lng) {
  const latN = Number(lat);
  const lngN = Number(lng);
  const fallback = coordFallback(latN, lngN);
  if (!Number.isFinite(latN) || !Number.isFinite(lngN)) return '';

  try {
    return (await reverseViaGoogle(latN, lngN)) || fallback;
  } catch {
    // Maps key/referrer issues are common on prod — don't block live GPS.
  }

  try {
    return (await reverseViaApi(latN, lngN)) || fallback;
  } catch {
    return fallback;
  }
}
