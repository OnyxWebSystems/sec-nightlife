import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useAuth } from '@/lib/AuthContext';
import { isOnboardingMarkedComplete } from '@/lib/sessionCache';
import RoutePageFallback from '@/components/RoutePageFallback';

export default function RequireOnboardingComplete({ children }) {
  const navigate = useNavigate();
  const { user, userProfile, isLoadingAuth, isAuthenticated, navigateToLogin, isRestoringSession } = useAuth();

  useEffect(() => {
    if (isLoadingAuth || isRestoringSession) return;
    if (!isAuthenticated || !user) {
      navigateToLogin();
      return;
    }
    if (isOnboardingMarkedComplete(user.id)) return;
    if (userProfile != null && userProfile.onboarding_complete === false) {
      navigate(createPageUrl('ProfileSetup'), { replace: true });
    }
  }, [isLoadingAuth, isRestoringSession, isAuthenticated, user, userProfile, navigate, navigateToLogin]);

  if (isLoadingAuth || isRestoringSession) return <RoutePageFallback />;
  if (!isAuthenticated || !user) return <RoutePageFallback />;
  if (isOnboardingMarkedComplete(user.id)) return children;
  if (userProfile != null && userProfile.onboarding_complete === false) return <RoutePageFallback />;
  return children;
}
