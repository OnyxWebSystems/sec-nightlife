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

function getRefreshToken() {
  try {
    return localStorage.getItem('refresh_token') || sessionStorage.getItem('refresh_token');
  } catch {
    return null;
  }
}

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

async function refreshAccessToken() {
  const refreshToken = getRefreshToken();
  if (!refreshToken) return false;

  const res = await fetch(`${API_BASE}/api/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ refreshToken }),
  });

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {}

  if (!res.ok || !data?.accessToken) {
    clearTokens();
    return false;
  }

  const storage = getTokenStorage();
  storage.setItem('access_token', data.accessToken);
  if (data.refreshToken) storage.setItem('refresh_token', data.refreshToken);
  return true;
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
}

export function clearTokens() {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  sessionStorage.removeItem('access_token');
  sessionStorage.removeItem('refresh_token');
}

export async function uploadFile(file) {
  const token = getToken();
  const isLikelyLarge = typeof file?.size === 'number' && file.size > 4 * 1024 * 1024;
  let signatureAttempted = false;
  // Try direct Cloudinary upload first to avoid Vercel request-size limits (413).
  if (token) {
    try {
      signatureAttempted = true;
      const sigRes = await fetch(`${API_BASE}/api/upload/signature`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (sigRes.ok) {
        const sig = await sigRes.json();
        const cloudForm = new FormData();
        cloudForm.append('file', file);
        cloudForm.append('api_key', sig.api_key);
        cloudForm.append('timestamp', String(sig.timestamp));
        cloudForm.append('signature', sig.signature);
        cloudForm.append('folder', sig.folder || 'sec-nightlife');
        cloudForm.append('resource_type', sig.resource_type || 'auto');
        const cloudRes = await fetch(`https://api.cloudinary.com/v1_1/${sig.cloud_name}/auto/upload`, {
          method: 'POST',
          body: cloudForm,
        });
        const cloudData = await cloudRes.json();
        if (!cloudRes.ok) throw new Error(cloudData?.error?.message || 'Cloudinary upload failed');
        return { file_url: cloudData.secure_url };
      }
    } catch {
      // Fall back to backend upload endpoint.
    }
  }

  // Vercel often rejects large multipart bodies before Express handles them.
  if (isLikelyLarge && signatureAttempted) {
    throw new Error('Upload could not start direct Cloudinary transfer. Please refresh and try again, or use a smaller file.');
  }

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
