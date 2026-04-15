/**
 * Auth service - uses backend API for registration, login, and session.
 */
import { apiGet, apiPost, setTokens, clearTokens } from '@/api/client';

export async function getCurrentUser() {
  const data = await apiGet('/api/auth/me');
  return {
    id: data.id,
    email: data.email,
    full_name: data.full_name,
    role: data.role,
    verified: data.verified,
    verification_status: data.verification_status ?? 'pending',
    identity_verified: Boolean(data.identity_verified),
  };
}

export function redirectToLogin(returnUrl) {
  clearTokens();
  const base = window.location.origin;
  const loginPath = '/Login'; // Must match route in pages.config
  let pathOnly = null;
  if (returnUrl && typeof returnUrl === 'string') {
    if (returnUrl.startsWith('http')) {
      try {
        const u = new URL(returnUrl);
        pathOnly = u.pathname + (u.search || '');
      } catch {
        pathOnly = '/Home';
      }
    } else {
      pathOnly = returnUrl.startsWith('/') ? returnUrl : '/' + returnUrl;
    }
  }
  let target = pathOnly ? base + loginPath + '?returnUrl=' + encodeURIComponent(pathOnly) : base + loginPath;
  try {
    const intent = localStorage.getItem('sec-role-intent');
    if (intent) target += (target.includes('?') ? '&' : '?') + 'role=' + encodeURIComponent(intent);
  } catch {}
  window.location.href = target;
}

export function logout(shouldRedirect) {
  const rt = localStorage.getItem('refresh_token') || sessionStorage.getItem('refresh_token');
  if (rt) apiPost('/api/auth/logout', { refreshToken: rt }).catch(() => {});
  clearTokens();
  if (shouldRedirect !== false) window.location.href = window.location.origin + '/';
}

export async function deleteAccount() {
  const { apiDelete } = await import('@/api/client');
  await apiDelete('/api/auth/account');
  clearTokens();
  window.location.href = window.location.origin + '/';
}

export async function register(email, password, fullName, role, username) {
  const body = {
    email,
    password,
    full_name: fullName,
    role: role || 'USER',
    username,
  };
  const data = await apiPost('/api/auth/register', body);
  setTokens(data.accessToken, data.refreshToken);
  return data.user;
}

export async function login(email, password, role) {
  const body = { email, password };
  if (role) body.role = role;
  const data = await apiPost('/api/auth/login', body);
  setTokens(data.accessToken, data.refreshToken);
  return data.user;
}
