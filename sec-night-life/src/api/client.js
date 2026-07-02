/**
 * API client for SEC Nightlife backend.
 * All requests go to VITE_API_URL (default http://localhost:4000).
 */
const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

const REFRESH_LOCK_KEY = 'sec_refresh_lock';
const REFRESH_CHANNEL = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('sec-auth-refresh') : null;

function getToken() {
  try {
    return localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
  } catch {
    return null;
  }
}

function getRefreshToken() {
  try {
    return localStorage.getItem('refresh_token') || sessionStorage.getItem('refresh_token');
  } catch {
    return null;
  }
}

export { getRefreshToken };

function getTokenStorage() {
  try {
    if (localStorage.getItem('access_token') || localStorage.getItem('refresh_token')) {
      return localStorage;
    }
    if (sessionStorage.getItem('access_token') || sessionStorage.getItem('refresh_token')) {
      return sessionStorage;
    }
  } catch {}
  return localStorage;
}

function getHeaders(includeAuth = true) {
  const headers = { 'Content-Type': 'application/json' };
  if (includeAuth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function readRefreshLock() {
  try {
    const raw = localStorage.getItem(REFRESH_LOCK_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.until || parsed.until < Date.now()) {
      localStorage.removeItem(REFRESH_LOCK_KEY);
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

function setRefreshLock(ms = 8000) {
  try {
    localStorage.setItem(REFRESH_LOCK_KEY, JSON.stringify({ until: Date.now() + ms }));
  } catch {}
}

function clearRefreshLock() {
  try {
    localStorage.removeItem(REFRESH_LOCK_KEY);
  } catch {}
}

async function waitForPeerRefresh(maxMs = 6000) {
  const started = Date.now();
  while (Date.now() - started < maxMs) {
    const lock = readRefreshLock();
    if (!lock) return Boolean(getToken());
    await sleep(200);
  }
  return Boolean(getToken());
}

let refreshInFlight = null;

async function doRefreshAccessToken(opts = {}) {
  const attempt = opts._attempt ?? 0;
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  const peerLock = readRefreshLock();
  if (peerLock && !opts._ownsLock) {
    return waitForPeerRefresh();
  }

  if (!opts._ownsLock) {
    setRefreshLock();
    opts = { ...opts, _ownsLock: true };
  }

  let res;
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 20000);
  try {
    res = await fetch(`${API_BASE}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ refreshToken }),
      signal: controller.signal,
    });
  } catch {
    clearRefreshLock();
    return false;
  } finally {
    window.clearTimeout(timeoutId);
  }

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {}

  if (!res.ok || !data?.accessToken) {
    if (res.status === 401 || res.status === 403) {
      if (attempt < 3) {
        await sleep(350 * (attempt + 1));
        const latest = getRefreshToken();
        if (latest) {
          return doRefreshAccessToken({ ...opts, _attempt: attempt + 1, refreshToken: latest });
        }
      }
      if (!opts._storageRetry) {
        await sleep(400);
        const latest = getRefreshToken();
        if (latest && latest !== refreshToken) {
          return doRefreshAccessToken({ ...opts, _storageRetry: true, _attempt: 0 });
        }
        await waitForPeerRefresh(3000);
        const afterPeer = getRefreshToken();
        if (afterPeer && afterPeer !== refreshToken) {
          return doRefreshAccessToken({ ...opts, _storageRetry: true, _attempt: 0 });
        }
      }
      clearRefreshLock();
      const stillCurrent = getRefreshToken() === refreshToken;
      if (stillCurrent) {
        clearTokens();
      }
    } else {
      clearRefreshLock();
    }
    return false;
  }

  const storage = getTokenStorage();
  storage.setItem('access_token', data.accessToken);
  if (data.refreshToken) storage.setItem('refresh_token', data.refreshToken);
  try {
    sessionStorage.removeItem('access_token');
    sessionStorage.removeItem('refresh_token');
    localStorage.setItem('sec_tokens_updated', String(Date.now()));
    REFRESH_CHANNEL?.postMessage({ type: 'tokens_updated' });
  } catch {}
  clearRefreshLock();
  return true;
}

export async function refreshAccessToken() {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = doRefreshAccessToken().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

function accessTokenExpiresWithinMs(withinMs) {
  const token = getToken();
  if (!token) return false;
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    const expMs = Number(payload.exp) * 1000;
    return Number.isFinite(expMs) && expMs <= Date.now() + withinMs;
  } catch {
    return false;
  }
}

/** True when access token is missing or expires within the given window (default 10 min). */
export function accessTokenNeedsRefresh(withinMs = 10 * 60 * 1000) {
  const token = getToken();
  if (!token) return Boolean(getRefreshToken());
  return accessTokenExpiresWithinMs(withinMs);
}

if (REFRESH_CHANNEL) {
  REFRESH_CHANNEL.onmessage = (event) => {
    if (event?.data?.type === 'tokens_updated') {
      // Another tab rotated tokens — localStorage already has the new values; no action needed.
      void getToken();
    }
  };
}

export async function api(method, path, body = null, opts = {}) {
  const p = path.startsWith('/') ? path : '/' + path;
  const url = path.startsWith('http') ? path : `${API_BASE}${p}`;
  if (opts.skipAuth !== true && p !== '/api/auth/refresh' && getRefreshToken() && accessTokenExpiresWithinMs(10 * 60 * 1000)) {
    await refreshAccessToken();
  }
  const timeoutMs = Number(opts.timeoutMs) || 0;
  const controller = timeoutMs > 0 ? new AbortController() : null;
  const timeoutId =
    controller && timeoutMs > 0 ? window.setTimeout(() => controller.abort(), timeoutMs) : null;

  const { timeoutMs: _t, skipAuth: _s, _retriedAfterRefresh: _r, ...fetchOpts } = opts;
  const options = {
    method,
    headers: getHeaders(opts.skipAuth !== true),
    credentials: 'include',
    ...fetchOpts,
  };
  if (controller) {
    options.signal = controller.signal;
  }
  if (body && method !== 'GET') {
    options.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(url, options);
  } catch (networkErr) {
    if (networkErr?.name === 'AbortError') {
      const err = new Error('Request timed out. Check your connection and try again.');
      err.data = { code: 'REQUEST_TIMEOUT' };
      throw err;
    }
    const msg = networkErr?.message || 'Network error';
    const friendly = msg.includes('fetch') || msg.includes('ECONNRESET') || msg.includes('Failed')
      ? 'Cannot reach server. Make sure the backend is running (npm run dev in sec-night-life/backend).'
      : msg;
    throw new Error(friendly);
  } finally {
    if (timeoutId) window.clearTimeout(timeoutId);
  }
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    const trimmed = (text || '').trim();
    if (trimmed.startsWith('<!') || trimmed.startsWith('<html')) {
      const err = new Error(
        'Received a web page instead of API data. Set VITE_API_URL in your Vercel (or hosting) environment to your backend URL so /api calls reach the API, then redeploy.'
      );
      err.data = { code: 'HTML_INSTEAD_OF_JSON' };
      throw err;
    }
    data = null;
  }
  const tokenExpired = (res.status === 401 || res.status === 403) && (
    data?.error === 'Invalid or expired token' ||
    data?.error === 'Authentication required'
  );
  const canRetryWithRefresh = opts.skipAuth !== true && opts._retriedAfterRefresh !== true && p !== '/api/auth/refresh';
  if (tokenExpired && canRetryWithRefresh) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      return api(method, path, body, { ...opts, _retriedAfterRefresh: true });
    }
  }
  if (!res.ok) {
    const err = new Error(data?.error || res.statusText || 'Request failed');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const apiGet = (path, opts) => api('GET', path, null, opts);
export const apiPost = (path, body, opts) => api('POST', path, body, opts);
export const apiPut = (path, body, opts) => api('PUT', path, body, opts);
export const apiPatch = (path, body, opts) => api('PATCH', path, body, opts);
export const apiDelete = (path, opts) => api('DELETE', path, null, opts);

export function setTokens(accessToken, refreshToken, persist = true) {
  const storage = persist ? localStorage : sessionStorage;
  storage.setItem('access_token', accessToken);
  if (refreshToken) storage.setItem('refresh_token', refreshToken);
  if (persist) {
    try {
      sessionStorage.removeItem('access_token');
      sessionStorage.removeItem('refresh_token');
    } catch {}
  }
}

export function clearTokens() {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  sessionStorage.removeItem('access_token');
  sessionStorage.removeItem('refresh_token');
}

import { uploadToCloudinary } from '@/lib/cloudinaryUpload';

export async function uploadFile(file, options) {
  return uploadToCloudinary(file, options);
}
