import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import * as authService from '@/services/authService';
import { apiGet } from '@/api/client';

export default function RequireOnboardingComplete({ children }) {
  const navigate = useNavigate();
  const [allowed, setAllowed] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const user = await authService.getCurrentUser();
        if (!user) {
          authService.redirectToLogin();
          return;
        }
        const profile = await apiGet('/api/users/profile');
        const row = Array.isArray(profile) ? profile[0] : profile;
        if (cancelled) return;
        if (!row?.onboarding_complete) {
          navigate(createPageUrl('ProfileSetup'), { replace: true });
          return;
        }
        setAllowed(true);
      } catch {
        if (!cancelled) authService.redirectToLogin();
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  if (checking) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin" />
      </div>
    );
  }
  if (!allowed) return null;
  return children;
}
