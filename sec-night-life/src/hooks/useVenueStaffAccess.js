import { useCallback, useMemo } from 'react';
import { useActiveVenueOptional } from '@/context/ActiveVenueContext';

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
  const ctx = useActiveVenueOptional();
  const isOwner = ctx?.isOwner ?? true;
  const isStaffAccess = ctx?.isStaffAccess ?? false;
  const staffPermissions = ctx?.staffPermissions ?? null;
  const venuesLoading = ctx?.isLoading ?? false;

  const isStaffOnly = isStaffAccess && !isOwner;

  const can = useCallback(
    (permission) => {
      if (!isStaffOnly) return true;
      return staffHasPermission(staffPermissions, permission);
    },
    [isStaffOnly, staffPermissions],
  );

  const canAccessPage = useCallback(
    (pageName) => {
      const perm = BUSINESS_PAGE_PERMISSIONS[pageName];
      if (!perm) return true;
      return can(perm);
    },
    [can],
  );

  return useMemo(
    () => ({
      isVenueOwner: isOwner,
      isStaffOnly,
      isStaffAccess,
      staffPermissions,
      venuesLoading,
      can,
      canAccessPage,
    }),
    [isOwner, isStaffOnly, isStaffAccess, staffPermissions, venuesLoading, can, canAccessPage],
  );
}
