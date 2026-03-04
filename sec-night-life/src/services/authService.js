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
    verified: data.verified
  };
}

export function redirectToLogin(returnUrl) {
  clearTokens();
  const base = window.location.origin;
  const loginPath = '/Login'; // Must match route in pages.config
  const target = returnUrl ? base + loginPath + '?returnUrl=' + encodeURIComponent(returnUrl) : base + loginPath;
  window.location.href = target;
}

export function logout(shouldRedirect) {
  const rt = localStorage.getItem('refresh_token') || sessionStorage.getItem('refresh_token');
  if (rt) apiPost('/api/auth/logout', { refreshToken: rt }).catch(() => {});
  clearTokens();
  if (shouldRedirect !== false) window.location.href = window.location.origin + '/';
}

export async function register(email, password, fullName, role) {
  const data = await apiPost('/api/auth/register', { email, password, full_name: fullName, role: role || 'USER' });
  setTokens(data.accessToken, data.refreshToken);
  return data.user;
}

export async function login(email, password) {
  const data = await apiPost('/api/auth/login', { email, password });
  setTokens(data.accessToken, data.refreshToken);
  return data.user;
}
