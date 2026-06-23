import React, { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import { useAuth } from '@/lib/AuthContext';

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
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      </div>
    );
  }
  if (!isAuthenticated) return null;
  if (userProfile && userProfile.onboarding_complete === false) return null;
  return children;
}
