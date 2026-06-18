import { useCallback, useMemo } from 'react';
import { useBusinessVenueScope } from '@/hooks/useBusinessVenueScope';

/** Map business pages to required staff permission keys. */
export const BUSINESS_PAGE_PERMISSIONS = {
  BusinessDashboard: 'dashboard',
  VenueAnalytics: 'analytics',
  BusinessBookings: 'bookings',
  BusinessPromotions: 'promotions',
  BusinessPromotionBoost: 'promotions',
  BusinessEvents: 'events',
  BusinessMenu: 'menu',
  BusinessJobs: 'jobs',
  CreateJob: 'jobs',
  BusinessMessages: 'messages',
  BusinessVenueTables: 'bookings',
  VenueProfile: 'venue_page',
  FeedbackInsights: 'analytics',
};

export function staffHasPermission(staffPermissions, permission) {
  if (!permission) return false;
  const perms = staffPermissions && typeof staffPermissions === 'object' ? staffPermissions : {};
  if (perms[permission] === true) return true;
  if (permission === 'posts' && perms.promotions === true) return true;
  return false;
}

export function useVenueStaffAccess() {
  const scope = useBusinessVenueScope();

  const canAccessPage = useCallback(
    (pageName) => {
      const perm = BUSINESS_PAGE_PERMISSIONS[pageName];
      if (!perm) return true;
      return scope.can(perm);
    },
    [scope.can],
  );

  return useMemo(
    () => ({
      isVenueOwner: scope.isOwner,
      isStaffOnly: scope.isStaffOnly,
      isStaffAccess: scope.isStaffAccess,
      staffPermissions: scope.staffPermissions,
      staffContextToken: scope.staffContextToken,
      venuesLoading: scope.venuesLoading,
      inStaffSession: scope.inStaffSession,
      can: scope.can,
      canAccessPage,
    }),
    [scope, canAccessPage],
  );
}
