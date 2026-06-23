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

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [userProfile, setUserProfile] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
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
    } catch (err) {
      setUser(null);
      setUserProfile(null);
      setIsAuthenticated(false);
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
