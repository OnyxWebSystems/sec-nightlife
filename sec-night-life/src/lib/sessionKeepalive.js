/**
 * Keeps users signed in by refreshing access tokens before they expire.
 * Refresh tokens last months (JWT_REFRESH_EXPIRY); access tokens are short-lived.
 */
import { getRefreshToken, refreshAccessToken } from '@/api/client';

const REFRESH_INTERVAL_MS = 10 * 60 * 1000; // 10 minutes (access token default 15m)
const TOKENS_UPDATED_KEY = 'sec_tokens_updated';

function notifyTokensUpdated() {
  try {
    localStorage.setItem(TOKENS_UPDATED_KEY, String(Date.now()));
  } catch {}
}

export function startSessionKeepalive() {
  if (typeof window === 'undefined') return () => {};

  const tick = () => {
    if (!getRefreshToken()) return;
    void refreshAccessToken().then((ok) => {
      if (ok) notifyTokensUpdated();
    });
  };

  tick();
  const intervalId = window.setInterval(tick, REFRESH_INTERVAL_MS);

  const onVisible = () => {
    if (document.visibilityState === 'visible') tick();
  };
  document.addEventListener('visibilitychange', onVisible);

  const onStorage = (e) => {
    if (e.key === TOKENS_UPDATED_KEY || e.key === 'refresh_token' || e.key === 'access_token') {
      // Another tab rotated tokens — localStorage already has the new values.
    }
  };
  window.addEventListener('storage', onStorage);

  return () => {
    clearInterval(intervalId);
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('storage', onStorage);
  };
}
