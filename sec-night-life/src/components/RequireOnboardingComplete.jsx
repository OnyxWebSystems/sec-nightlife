import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useAuth } from '@/lib/AuthContext';
import {
  isOnboardingMarkedComplete,
  markOnboardingComplete,
  readSessionCache,
  userFromSessionCache,
} from '@/lib/sessionCache';
import RoutePageFallback from '@/components/RoutePageFallback';

function onboardingDestination(user) {
  const role = user?.role;
  if (role === 'VENUE' || role === 'BUSINESS') return createPageUrl('VenueOnboarding');
  return createPageUrl('ProfileSetup');
}

function sessionSaysOnboardingDone(userId) {
  if (!userId) return false;
  if (isOnboardingMarkedComplete(userId)) return true;
  const restored = userFromSessionCache(readSessionCache());
  return (
    restored.user?.id === userId && restored.profile?.onboarding_complete === true
  );
}

export default function RequireOnboardingComplete({ children }) {
  const navigate = useNavigate();
  const {
    user,
    userProfile,
    isLoadingAuth,
    isAuthenticated,
    navigateToLogin,
    isRestoringSession,
    checkAppState,
  } = useAuth();
  const [hydrating, setHydrating] = useState(false);
  // After a soft hydrate that cannot confirm incomplete (e.g. screen-recording resume blip),
  // do not block the route forever or force onboarding.
  const [allowThrough, setAllowThrough] = useState(false);
  const hydrateAttempted = useRef(false);

  const stickyDone = Boolean(user?.id) && isOnboardingMarkedComplete(user.id);
  const profileDone = userProfile?.onboarding_complete === true;
  const profileExplicitlyIncomplete = userProfile?.onboarding_complete === false;
  const onboardingDone = Boolean(user?.id) && (stickyDone || profileDone);

  useEffect(() => {
    if (isLoadingAuth || isRestoringSession) return;
    if (!isAuthenticated || !user) {
      navigateToLogin();
      return;
    }
    if (onboardingDone) {
      markOnboardingComplete(user.id);
      setAllowThrough(true);
      return;
    }

    if (profileExplicitlyIncomplete) {
      navigate(onboardingDestination(user), { replace: true });
      return;
    }

    // Profile unknown — revalidate /me, then decide from fresh session cache (not stale React state).
    if (!hydrateAttempted.current) {
      hydrateAttempted.current = true;
      setHydrating(true);
      let cancelled = false;
      void Promise.resolve(checkAppState({ soft: true }))
        .then(() => {
          if (cancelled) return;
          if (sessionSaysOnboardingDone(user.id)) {
            markOnboardingComplete(user.id);
            setAllowThrough(true);
            return;
          }
          // Only bounce when the session explicitly says incomplete.
          // Unknown/null after a resume blip (e.g. screen recording) must not force onboarding.
          const restored = userFromSessionCache(readSessionCache());
          if (
            restored.user?.id === user.id &&
            restored.profile?.onboarding_complete === false
          ) {
            navigate(onboardingDestination(user), { replace: true });
            return;
          }
          setAllowThrough(true);
        })
        .finally(() => {
          if (!cancelled) setHydrating(false);
        });
      return () => {
        cancelled = true;
      };
    }
  }, [
    isLoadingAuth,
    isRestoringSession,
    isAuthenticated,
    user,
    onboardingDone,
    profileExplicitlyIncomplete,
    navigate,
    navigateToLogin,
    checkAppState,
  ]);

  if (isLoadingAuth || isRestoringSession || hydrating) return <RoutePageFallback />;
  if (!isAuthenticated || !user) return <RoutePageFallback />;
  if (!onboardingDone && !allowThrough) return <RoutePageFallback />;
  return children;
}
