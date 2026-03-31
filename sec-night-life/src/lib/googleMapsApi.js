import { Loader } from '@googlemaps/js-api-loader';

let loadPromise = null;

/**
 * App-level singleton loader for Google Maps JS API.
 * Uses `VITE_` env var (client-exposed), but never hardcodes the key.
 */
export function loadGoogleMapsApi() {
  if (loadPromise) return loadPromise;

  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    loadPromise = Promise.reject(
      new Error('Missing VITE_GOOGLE_MAPS_API_KEY; Google Maps can not be loaded.')
    );
    return loadPromise;
  }

  const loader = new Loader({
    apiKey,
    version: 'weekly',
    libraries: ['places'],
  });

  loadPromise = loader.load();
  return loadPromise;
}

