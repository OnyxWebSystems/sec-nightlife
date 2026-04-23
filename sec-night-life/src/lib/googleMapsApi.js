import { Loader } from '@googlemaps/js-api-loader';

let loadPromise = null;
let authFailureInitialized = false;

function withHelpfulMessage(err) {
  const raw = String(err?.message || err || '');

  if (/RefererNotAllowedMapError/i.test(raw)) {
    return new Error(
      'Google Maps blocked this domain (RefererNotAllowedMapError). Ensure your key allows https://sec-nightlife.vercel.app/* and redeploy after env updates.'
    );
  }
  if (/InvalidKeyMapError/i.test(raw)) {
    return new Error('Google Maps rejected the API key (InvalidKeyMapError). Confirm VITE_GOOGLE_MAPS_API_KEY is the exact active browser key.');
  }
  if (/ApiNotActivatedMapError/i.test(raw)) {
    return new Error('A required API is disabled (ApiNotActivatedMapError). Enable Maps JavaScript API and Places API on the same Google project.');
  }
  if (/BillingNotEnabledMapError/i.test(raw)) {
    return new Error('Google Maps billing is not enabled (BillingNotEnabledMapError). Enable billing for this Google Cloud project.');
  }

  return err instanceof Error ? err : new Error(raw || 'Google Maps failed to load.');
}

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

  loadPromise = loader
    .load()
    .then(async () => {
      // Ensures Places is actually available, not just script-loaded.
      if (window.google?.maps?.importLibrary) {
        await window.google.maps.importLibrary('places');
      }
      return window.google;
    })
    .catch((err) => {
      // Allow retry on transient failures without hard refresh.
      loadPromise = null;
      throw withHelpfulMessage(err);
    });
  return loadPromise;
}

