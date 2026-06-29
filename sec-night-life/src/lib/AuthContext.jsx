import React, { createContext, useState, useContext, useEffect, useRef, useCallback } from 'react';
import * as authService from '@/services/authService';
import { getRefreshToken } from '@/api/client';
import {
  readSessionCache,
  writeSessionCache,
  clearSessionCache,
  userFromSessionCache,
} from '@/lib/sessionCache';
import { setSessionResumeCallback, startSessionResume } from '@/lib/sessionResume';

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

function mapUser(currentUser) {
  return {
    id: currentUser.id,
    email: currentUser.email,
    full_name: currentUser.full_name,
    role: currentUser.role,
    verified: currentUser.verified,
    verification_status: currentUser.verification_status,
    identity_verified: currentUser.identity_verified,
    can_admin_dashboard: currentUser.can_admin_dashboard,
  };
}

function restoreCachedSession(setUser, setUserProfile, setIsAuthenticated) {
  const cached = readSessionCache();
  const restored = userFromSessionCache(cached);
  if (!restored.user) return false;
  setUser(restored.user);
  setUserProfile(restored.profile);
  setIsAuthenticated(true);
  return true;
}

export const AuthProvider = ({ children }) => {
  const hasTokens = hasStoredAuthTokens();
  const initialCache = hasTokens ? readSessionCache() : null;
  const initialSession = userFromSessionCache(initialCache);

  const [user, setUser] = useState(initialSession.user);
  const [userProfile, setUserProfile] = useState(initialSession.profile);
  const [isAuthenticated, setIsAuthenticated] = useState(
    Boolean(initialSession.user) || hasTokens,
  );
  /** True only when we have tokens but no cached user to show yet (first open after login). */
  const [isLoadingAuth, setIsLoadingAuth] = useState(hasTokens && !initialSession.user);
  const [authError, setAuthError] = useState(null);
  const checkInFlight = useRef(false);

  const checkAuth = useCallback(async () => {
    if (checkInFlight.current) return;
    checkInFlight.current = true;

    const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
    const refreshToken = localStorage.getItem('refresh_token') || sessionStorage.getItem('refresh_token');

    if (!token && !refreshToken) {
      setUser(null);
      setUserProfile(null);
      setIsAuthenticated(false);
      setIsLoadingAuth(false);
      checkInFlight.current = false;
      return;
    }

    if (!token && refreshToken) {
      try {
        await withTimeout(authService.ensureSession(), 20000, 'Session refresh');
      } catch {
        // Offline or slow network — keep tokens and cached user; never force logout here.
      }
    }

    try {
      setAuthError(null);
      const { user: currentUser, userProfile: profile } = await withTimeout(
        authService.getAuthSession(),
        20000,
        'Session check',
      );
      const nextUser = mapUser(currentUser);
      setUser(nextUser);
      setIsAuthenticated(true);
      setUserProfile(profile);
      writeSessionCache(currentUser, profile);
    } catch (err) {
      const refreshStillValid = Boolean(getRefreshToken());
      const hadCachedUser = restoreCachedSession(setUser, setUserProfile, setIsAuthenticated);

      if ((err?.status === 401 || err?.status === 403) && !refreshStillValid && !hadCachedUser) {
        clearSessionCache();
        setUser(null);
        setUserProfile(null);
        setIsAuthenticated(false);
        setAuthError({ type: 'auth_required', message: 'Please sign in' });
      } else if (hadCachedUser || refreshStillValid) {
        setAuthError(null);
      } else {
        setAuthError({ type: 'unknown', message: err?.message || 'Auth check failed' });
      }
    } finally {
      setIsLoadingAuth(false);
      checkInFlight.current = false;
    }
  }, []);

  useEffect(() => {
    if (hasTokens) {
      void checkAuth();
    } else {
      setIsLoadingAuth(false);
    }
  }, [checkAuth, hasTokens]);

  useEffect(() => {
    setSessionResumeCallback(() => {
      void checkAuth();
    });
    return startSessionResume();
  }, [checkAuth]);

  const logout = (shouldRedirect = true) => {
    setUser(null);
    setUserProfile(null);
    setIsAuthenticated(false);
    clearSessionCache();
    authService.logout(shouldRedirect);
  };

  const navigateToLogin = () => {
    authService.redirectToLogin(window.location.href, { clearSession: false });
  };

  const isRestoringSession = hasStoredAuthTokens() && !user && isLoadingAuth;

  return (
    <AuthContext.Provider
      value={{
        user,
        userProfile,
        isAuthenticated,
        isLoadingAuth,
        isRestoringSession,
        isLoadingPublicSettings: isLoadingAuth,
        authError,
        appPublicSettings: null,
        logout,
        navigateToLogin,
        checkAppState: checkAuth,
      }}
    >
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
