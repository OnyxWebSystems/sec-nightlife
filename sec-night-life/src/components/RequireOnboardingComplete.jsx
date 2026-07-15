import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useAuth } from '@/lib/AuthContext';
import { isOnboardingMarkedComplete } from '@/lib/sessionCache';
import RoutePageFallback from '@/components/RoutePageFallback';

function onboardingDestination(user) {
  const role = user?.role;
  if (role === 'VENUE' || role === 'BUSINESS') return createPageUrl('VenueOnboarding');
  return createPageUrl('ProfileSetup');
}

export default function RequireOnboardingComplete({ children }) {
  const navigate = useNavigate();
  const { user, userProfile, isLoadingAuth, isAuthenticated, navigateToLogin, isRestoringSession } = useAuth();

  const onboardingDone =
    Boolean(user?.id) &&
    (isOnboardingMarkedComplete(user.id) || userProfile?.onboarding_complete === true);

  useEffect(() => {
    if (isLoadingAuth || isRestoringSession) return;
    if (!isAuthenticated || !user) {
      navigateToLogin();
      return;
    }
    if (onboardingDone) return;
    // Incomplete or unknown onboarding — keep users in setup, never open Profile/etc.
    navigate(onboardingDestination(user), { replace: true });
  }, [
    isLoadingAuth,
    isRestoringSession,
    isAuthenticated,
    user,
    onboardingDone,
    navigate,
    navigateToLogin,
  ]);

  if (isLoadingAuth || isRestoringSession) return <RoutePageFallback />;
  if (!isAuthenticated || !user) return <RoutePageFallback />;
  if (!onboardingDone) return <RoutePageFallback />;
  return children;
}
