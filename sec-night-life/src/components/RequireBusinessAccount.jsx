import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { createPageUrl } from '@/utils';
import * as authService from '@/services/authService';
import { apiGet } from '@/api/client';
import { dataService } from '@/services/dataService';

export default function RequireBusinessAccount({ children }) {
  const navigate = useNavigate();
  const [allowed, setAllowed] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const user = await authService.getCurrentUser();
        let hasBusiness = user?.role === 'VENUE';
        try {
          const roles = await apiGet('/api/user-roles/me');
          if (roles?.business) hasBusiness = true;
        } catch {}
        if (!hasBusiness) {
          try {
            const venues = await dataService.Venue.mine();
            hasBusiness = Array.isArray(venues) && venues.length > 0;
          } catch {}
        }
        if (!hasBusiness) {
          try {
            const staffVenues = await apiGet('/api/staff/venues');
            const staffList = Array.isArray(staffVenues) ? staffVenues : (staffVenues?.items || []);
            hasBusiness = staffList.length > 0;
          } catch {}
        }
        if (cancelled) return;
        if (!hasBusiness) {
          navigate(createPageUrl('VenueOnboarding'), { replace: true });
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
        <div className="w-8 h-8 border-4 border-slate-200 border-t-slate-800 rounded-full animate-spin"></div>
      </div>
    );
  }
  if (!allowed) return null;
  return children;
}
