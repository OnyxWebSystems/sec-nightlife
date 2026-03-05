/**
 * API client for SEC Nightlife backend.
 * All requests go to VITE_API_URL (default http://localhost:4000).
 */
const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

function getToken() {
  try {
    return localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
  } catch {
    return null;
  }
}

function getHeaders(includeAuth = true) {
  const headers = { 'Content-Type': 'application/json' };
  if (includeAuth) {
    const token = getToken();
    if (token) headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

export async function api(method, path, body = null, opts = {}) {
  const p = path.startsWith('/') ? path : '/' + path;
  const url = path.startsWith('http') ? path : `${API_BASE}${p}`;
  const options = {
    method,
    headers: getHeaders(opts.skipAuth !== true),
    credentials: 'include',
    ...opts
  };
  if (body && method !== 'GET') {
    options.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(url, options);
  } catch (networkErr) {
    const msg = networkErr?.message || 'Network error';
    const friendly = msg.includes('fetch') || msg.includes('ECONNRESET') || msg.includes('Failed')
      ? 'Cannot reach server. Make sure the backend is running (npm run dev in sec-night-life/backend).'
      : msg;
    throw new Error(friendly);
  }
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
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
}

export function clearTokens() {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  sessionStorage.removeItem('access_token');
  sessionStorage.removeItem('refresh_token');
}

export async function uploadFile(file) {
  const token = getToken();
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_BASE}/api/upload`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: form
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error || 'Upload failed');
  return data;
}
