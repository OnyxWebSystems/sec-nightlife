/**
 * Refresh session when the app returns from background (Capacitor native + web tab).
 * Only refreshes when the access token is near expiry — keepalive owns the timer loop.
 */
import { Capacitor } from '@capacitor/core';
import { accessTokenNeedsRefresh, getRefreshToken, refreshAccessToken } from '@/api/client';

let resumeCallback = null;

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
  resumeCallback?.();
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
    removeNative();
  };
}
