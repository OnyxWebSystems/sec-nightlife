import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useAuth } from '@/lib/AuthContext';
import { isOnboardingMarkedComplete } from '@/lib/sessionCache';

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

  if (isLoadingAuth || isRestoringSession) return null;
  if (!isAuthenticated || !user) return null;
  if (isOnboardingMarkedComplete(user.id)) return children;
  if (userProfile != null && userProfile.onboarding_complete === false) return null;
  return children;
}
