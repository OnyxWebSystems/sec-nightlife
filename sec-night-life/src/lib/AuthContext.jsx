import React, { createContext, useState, useContext, useEffect } from 'react';
import * as authService from '@/services/authService';

const AuthContext = createContext();

export function hasStoredAuthTokens() {
  try {
    return Boolean(
      localStorage.getItem('access_token') ||
      sessionStorage.getItem('access_token') ||
      localStorage.getItem('refresh_token') ||
      sessionStorage.getItem('refresh_token'),
    );
  } catch {
    return false;
  }
}

function withTimeout(promise, ms, label = 'Request') {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error(`${label} timed out`)), ms);
    }),
  ]);
}

const SESSION_USER_CACHE_KEY = 'sec_session_user';

function readCachedSessionUser() {
  if (!hasStoredAuthTokens()) return null;
  try {
    const raw = sessionStorage.getItem(SESSION_USER_CACHE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeCachedSessionUser(user, profile) {
  if (!user?.id) return;
  try {
    sessionStorage.setItem(SESSION_USER_CACHE_KEY, JSON.stringify({
      id: user.id,
      email: user.email,
      full_name: user.full_name,
      role: user.role,
      verified: user.verified,
      verification_status: user.verification_status,
      identity_verified: user.identity_verified,
      can_admin_dashboard: user.can_admin_dashboard,
      profile,
    }));
  } catch {}
}

function clearCachedSessionUser() {
  try {
    sessionStorage.removeItem(SESSION_USER_CACHE_KEY);
  } catch {}
}

function hydrateFromCache() {
  const cached = readCachedSessionUser();
  if (!cached) return { user: null, profile: null };
  return {
    user: {
      id: cached.id,
      email: cached.email,
      full_name: cached.full_name,
      role: cached.role,
      verified: cached.verified,
      verification_status: cached.verification_status,
      identity_verified: cached.identity_verified,
      can_admin_dashboard: cached.can_admin_dashboard,
    },
    profile: cached.profile ?? null,
  };
}

export const AuthProvider = ({ children }) => {
  const cached = hydrateFromCache();
  const [user, setUser] = useState(cached.user);
  const [userProfile, setUserProfile] = useState(cached.profile);
  const [isAuthenticated, setIsAuthenticated] = useState(!!cached.user);
  const [isLoadingAuth, setIsLoadingAuth] = useState(() => hasStoredAuthTokens());
  const [authError, setAuthError] = useState(null);

  const checkAuth = async () => {
    const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
    const refreshToken = localStorage.getItem('refresh_token') || sessionStorage.getItem('refresh_token');
    if (!token && !refreshToken) {
      setUser(null);
      setUserProfile(null);
      setIsAuthenticated(false);
      setIsLoadingAuth(false);
      return;
    }
    if (!token && refreshToken) {
      const refreshed = await authService.ensureSession();
      if (!refreshed) {
        setUser(null);
        setUserProfile(null);
        setIsAuthenticated(false);
        setIsLoadingAuth(false);
        return;
      }
    }
    try {
      setAuthError(null);
      const { user: currentUser, userProfile: profile } = await withTimeout(
        authService.getAuthSession(),
        15000,
        'Session check',
      );
      setUser({
        id: currentUser.id,
        email: currentUser.email,
        full_name: currentUser.full_name,
        role: currentUser.role,
        verified: currentUser.verified,
        verification_status: currentUser.verification_status,
        identity_verified: currentUser.identity_verified,
        can_admin_dashboard: currentUser.can_admin_dashboard,
      });
      setIsAuthenticated(true);
      setUserProfile(profile);
      writeCachedSessionUser(currentUser, profile);
    } catch (err) {
      setUser(null);
      setUserProfile(null);
      setIsAuthenticated(false);
      clearCachedSessionUser();
      if (err?.status === 401 || err?.status === 403) {
        setAuthError({ type: 'auth_required', message: 'Please sign in' });
      } else {
        setAuthError({ type: 'unknown', message: err?.message || 'Auth check failed' });
      }
    } finally {
      setIsLoadingAuth(false);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  const logout = (shouldRedirect = true) => {
    setUser(null);
    setUserProfile(null);
    setIsAuthenticated(false);
    clearCachedSessionUser();
    authService.logout(shouldRedirect);
  };

  const navigateToLogin = () => {
    authService.redirectToLogin(window.location.href);
  };

  return (
    <AuthContext.Provider value={{
      user,
      userProfile,
      isAuthenticated,
      isLoadingAuth,
      isLoadingPublicSettings: isLoadingAuth,
      authError,
      appPublicSettings: null,
      logout,
      navigateToLogin,
      checkAppState: checkAuth
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
