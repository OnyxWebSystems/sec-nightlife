import * as React from 'react';
import { loadGoogleMapsApi } from '@/lib/googleMapsApi';

const listeners = new Set();
let shared = { status: 'idle', error: null };
let loadStarted = false;
let authPollId = null;

function emit() {
  listeners.forEach((fn) => {
    try {
      fn();
    } catch {}
  });
}

function startLoad() {
  if (loadStarted) return;
  loadStarted = true;
  shared = { status: 'loading', error: null };
  emit();

  loadGoogleMapsApi()
    .then(() => {
      shared = { status: 'ready', error: null };
      emit();
      let tick = 0;
      authPollId = window.setInterval(() => {
        tick += 1;
        if (typeof window !== 'undefined' && window.__googleMapsAuthFailure) {
          shared = { status: 'error', error: new Error('Google Maps authentication failed.') };
          emit();
          if (authPollId) window.clearInterval(authPollId);
          authPollId = null;
          return;
        }
        if (tick >= 120 && authPollId) {
          window.clearInterval(authPollId);
          authPollId = null;
        }
      }, 500);
    })
    .catch((err) => {
      shared = { status: 'error', error: err };
      emit();
    });
}

/**
 * Loads the Maps JS API on first subscription (not at app boot).
 */
export function useGoogleMaps() {
  const [state, setState] = React.useState(() => ({ ...shared }));

  React.useEffect(() => {
    const onUpdate = () => setState({ ...shared });
    listeners.add(onUpdate);
    startLoad();
    setState({ ...shared });
    return () => {
      listeners.delete(onUpdate);
    };
  }, []);

  return state;
}

/** No-op wrapper — maps load lazily via `useGoogleMaps`. Kept for optional nesting. */
export function GoogleMapsProvider({ children }) {
  return children;
}
