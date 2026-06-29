/**
 * Auth service - uses backend API for registration, login, and session.
 */
import { apiGet, apiPost, setTokens, clearTokens, refreshAccessToken } from '@/api/client';
import { writeSessionCache, clearSessionCache } from '@/lib/sessionCache';

export async function getAuthSession() {
  const data = await apiGet('/api/auth/me');
  const user = {
    id: data.id,
    email: data.email,
    full_name: data.full_name,
    role: data.role,
    verified: data.verified,
    verification_status: data.verification_status ?? 'pending',
    identity_verified: Boolean(data.identity_verified),
    can_admin_dashboard: Boolean(data.can_admin_dashboard),
  };
  return { user, userProfile: data.user_profile ?? null };
}

export async function getCurrentUser() {
  const { user } = await getAuthSession();
  return user;
}

/** Cache session before a full-page redirect so the next load is instant. */
export async function persistSessionCache() {
  const { user, userProfile } = await getAuthSession();
  writeSessionCache(user, userProfile);
  return { user, userProfile };
}

async function cacheSessionAfterTokens(apiUser) {
  if (apiUser?.id) {
    const profile = apiUser.user_profile ?? null;
    writeSessionCache(apiUser, profile);
    return;
  }
  try {
    await persistSessionCache();
  } catch {}
}

export async function ensureSession() {
  const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
  if (token) return true;
  const refreshToken = localStorage.getItem('refresh_token') || sessionStorage.getItem('refresh_token');
  if (!refreshToken) return false;
  return refreshAccessToken();
}

export class AuthRequiredError extends Error {
  constructor(message = 'Authentication required') {
    super(message);
    this.name = 'AuthRequiredError';
  }
}

function buildLoginUrl(returnUrl) {
  const base = window.location.origin;
  const loginPath = '/Login';
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
  return target;
}

/** Navigate to login without clearing stored tokens (preserves refresh token for auto-login). */
export function redirectToLogin(returnUrl, { clearSession = false } = {}) {
  if (clearSession) {
    clearTokens();
    clearSessionCache();
  }
  window.location.href = buildLoginUrl(returnUrl);
}

/** Require a valid session; redirect to login only when no refresh token remains. */
export async function requireAuthOrLogin(returnUrl) {
  const hasRefresh =
    localStorage.getItem('refresh_token') || sessionStorage.getItem('refresh_token');
  if (!hasRefresh) {
    redirectToLogin(returnUrl);
    throw new AuthRequiredError();
  }
  const ok = await ensureSession();
  if (!ok) {
    const stillHasRefresh =
      localStorage.getItem('refresh_token') || sessionStorage.getItem('refresh_token');
    if (!stillHasRefresh) {
      redirectToLogin(returnUrl);
      throw new AuthRequiredError();
    }
  }
  try {
    return await getAuthSession();
  } catch (err) {
    if (err?.status === 401 || err?.status === 403) {
      const stillHasRefresh =
        localStorage.getItem('refresh_token') || sessionStorage.getItem('refresh_token');
      if (!stillHasRefresh) {
        redirectToLogin(returnUrl);
        throw new AuthRequiredError();
      }
    }
    throw err;
  }
}

/** Load current user; redirect to login only if refresh token is gone. */
export async function loadUserOrLogin(returnUrl) {
  const { user } = await requireAuthOrLogin(returnUrl ?? window.location.href);
  return user;
}

export function logout(shouldRedirect) {
  const rt = localStorage.getItem('refresh_token') || sessionStorage.getItem('refresh_token');
  if (rt) apiPost('/api/auth/logout', { refreshToken: rt }).catch(() => {});
  clearTokens();
  clearSessionCache();
  if (shouldRedirect !== false) window.location.href = window.location.origin + '/';
}

export async function deleteAccount() {
  const { apiDelete } = await import('@/api/client');
  await apiDelete('/api/auth/account');
  clearTokens();
  clearSessionCache();
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
  const data = await apiPost('/api/auth/register', body, { skipAuth: true });
  if (data.accessToken) {
    setTokens(data.accessToken, data.refreshToken);
    await cacheSessionAfterTokens(data.user);
  }
  return data.user;
}

export async function login(email, password, role) {
  const body = { email, password };
  if (role) body.role = role;
  const data = await apiPost('/api/auth/login', body, { skipAuth: true });
  if (data.requiresOtp) {
    return {
      requiresOtp: true,
      loginChallengeToken: data.loginChallengeToken,
      resendAvailableInSeconds: data.resendAvailableInSeconds ?? 60,
    };
  }
  setTokens(data.accessToken, data.refreshToken);
  await cacheSessionAfterTokens(data.user);
  return { user: data.user };
}

export async function verifyLoginOtp(loginChallengeToken, otp) {
  const data = await apiPost('/api/auth/verify-login-otp', { loginChallengeToken, otp }, { skipAuth: true });
  setTokens(data.accessToken, data.refreshToken);
  await cacheSessionAfterTokens(data.user);
  return data.user;
}

export async function resendLoginOtp(loginChallengeToken) {
  return apiPost('/api/auth/resend-login-otp', { loginChallengeToken }, { skipAuth: true });
}

export async function cancelLoginOtp(loginChallengeToken) {
  return apiPost('/api/auth/cancel-login-otp', { loginChallengeToken }, { skipAuth: true });
}

export async function resendVerificationEmail(email) {
  return apiPost('/api/auth/resend-verification', { email: email.trim().toLowerCase() }, { skipAuth: true });
}
