import React, { createContext, useState, useContext, useEffect } from 'react';
import * as authService from '@/services/authService';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authError, setAuthError] = useState(null);

  const checkAuth = async () => {
    const token = localStorage.getItem('access_token') || sessionStorage.getItem('access_token');
    if (!token) {
      setUser(null);
      setIsAuthenticated(false);
      setIsLoadingAuth(false);
      return;
    }
    try {
      setAuthError(null);
      const currentUser = await authService.getCurrentUser();
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
    } catch (err) {
      setUser(null);
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
    setIsAuthenticated(false);
    authService.logout(shouldRedirect);
  };

  const navigateToLogin = () => {
    authService.redirectToLogin(window.location.href);
  };

  return (
    <AuthContext.Provider value={{
      user,
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
