import { loadGoogleMapsApi } from '@/lib/googleMapsApi';

/**
 * Reverse-geocode lat/lng to a human-readable address via Google Maps Geocoder.
 * Falls back to a rounded "lat, lng" string if Maps is unavailable.
 */
export async function reverseGeocodeLatLng(lat, lng) {
  const latN = Number(lat);
  const lngN = Number(lng);
  const fallback = `${latN.toFixed(5)}, ${lngN.toFixed(5)}`;
  if (!Number.isFinite(latN) || !Number.isFinite(lngN)) return '';

  try {
    await loadGoogleMapsApi();
    if (!window.google?.maps?.Geocoder) return fallback;

    const geocoder = new window.google.maps.Geocoder();
    const result = await new Promise((resolve, reject) => {
      geocoder.geocode({ location: { lat: latN, lng: lngN } }, (results, status) => {
        if (status === 'OK' && results?.[0]?.formatted_address) {
          resolve(results[0].formatted_address);
          return;
        }
        reject(new Error(status || 'Geocode failed'));
      });
    });
    return result || fallback;
  } catch {
    return fallback;
  }
}
