/**
 * Refresh session when the app returns from background (Capacitor native + web tab).
 * Only refreshes when the access token is near expiry — keepalive owns the timer loop.
 *
 * Debounced: iOS Control Center / screen recording briefly hides the app and would
 * otherwise thrash soft auth revalidation (which used to bounce users to onboarding).
 */
import { Capacitor } from '@capacitor/core';
import { accessTokenNeedsRefresh, getRefreshToken, refreshAccessToken } from '@/api/client';

let resumeCallback = null;
let resumeTimer = null;
const RESUME_DEBOUNCE_MS = 800;

export function setSessionResumeCallback(fn) {
  resumeCallback = typeof fn === 'function' ? fn : null;
}

async function onAppResume() {
  if (!getRefreshToken()) return;
  try {
    if (accessTokenNeedsRefresh()) {
      await refreshAccessToken();
    }
  } catch {
    // Keep tokens on transient failure — AuthContext will retry.
  }

  if (resumeTimer) window.clearTimeout(resumeTimer);
  resumeTimer = window.setTimeout(() => {
    resumeTimer = null;
    resumeCallback?.();
  }, RESUME_DEBOUNCE_MS);
}

export function startSessionResume() {
  if (typeof window === 'undefined') return () => {};

  const onVisible = () => {
    if (document.visibilityState === 'visible') {
      void onAppResume();
    }
  };
  document.addEventListener('visibilitychange', onVisible);

  let removeNative = () => {};
  if (Capacitor.isNativePlatform()) {
    void import('@capacitor/app').then(({ App }) => {
      const sub = App.addListener('appStateChange', ({ isActive }) => {
        if (isActive) void onAppResume();
      });
      removeNative = () => sub.then((h) => h.remove());
    }).catch(() => {});
  }

  return () => {
    document.removeEventListener('visibilitychange', onVisible);
    if (resumeTimer) {
      window.clearTimeout(resumeTimer);
      resumeTimer = null;
    }
    removeNative();
  };
}
