import { Loader } from '@googlemaps/js-api-loader';

let loadPromise = null;
let authFailureInitialized = false;

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

  if (!authFailureInitialized && typeof window !== 'undefined') {
    authFailureInitialized = true;
    window.__googleMapsAuthFailure = false;
    window.gm_authFailure = () => {
      window.__googleMapsAuthFailure = true;
    };
  }

  const loader = new Loader({
    apiKey,
    version: 'weekly',
    libraries: ['places'],
  });

  loadPromise = loader.load();
  return loadPromise;
}

