import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useAuth } from '@/lib/AuthContext';
import SecLoadingScreen from '@/components/ui/SecLoadingScreen';

export default function RequireOnboardingComplete({ children }) {
  const navigate = useNavigate();
  const { user, userProfile, isLoadingAuth, isAuthenticated, navigateToLogin } = useAuth();

  useEffect(() => {
    if (isLoadingAuth) return;
    if (!isAuthenticated || !user) {
      navigateToLogin();
      return;
    }
    if (userProfile && userProfile.onboarding_complete === false) {
      navigate(createPageUrl('ProfileSetup'), { replace: true });
    }
  }, [isLoadingAuth, isAuthenticated, user, userProfile, navigate, navigateToLogin]);

  if (isLoadingAuth) {
    return <SecLoadingScreen />;
  }
  if (!isAuthenticated) return null;
  if (userProfile && userProfile.onboarding_complete === false) return null;
  return children;
}
