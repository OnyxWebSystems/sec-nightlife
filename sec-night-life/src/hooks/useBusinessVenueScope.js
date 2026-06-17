import { useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useActiveVenueOptional } from '@/context/ActiveVenueContext';
import { useStaffVenueOptional } from '@/context/StaffVenueContext';
import { businessVenueQuery } from '@/lib/businessVenueQuery';
import { staffHasPermission } from '@/hooks/useVenueStaffAccess';

/**
 * Unified business venue scope for owner dashboard vs staff session.
 * Staff sessions use opaque tokens — venue ID is never exposed client-side.
 */
export function useBusinessVenueScope() {
  const activeVenueCtx = useActiveVenueOptional();
  const staffCtx = useStaffVenueOptional();
  const [searchParams] = useSearchParams();

  const urlStaffToken = searchParams.get('staff_ctx')?.trim() || null;
  const staffContextToken = urlStaffToken || staffCtx?.staffContextToken || null;
  const inStaffSession = Boolean(staffContextToken);

  const ownedVenueId = inStaffSession ? null : activeVenueCtx?.activeVenueId ?? null;
  const venueQuery = businessVenueQuery({
    staffCtx: staffContextToken,
    venueId: ownedVenueId,
  });

  const isOwner = inStaffSession ? false : (activeVenueCtx?.isOwner ?? true);
  const isStaffAccess = inStaffSession || (activeVenueCtx?.isStaffAccess ?? false);
  const isStaffOnly = isStaffAccess && !isOwner;
  const staffPermissions = inStaffSession
    ? staffCtx?.staffVenueMeta?.permissions ?? {}
    : activeVenueCtx?.staffPermissions ?? null;

  const venueName = inStaffSession
    ? staffCtx?.staffVenueMeta?.venueName || 'Venue'
    : activeVenueCtx?.activeVenue?.name || null;

  const can = useMemo(
    () => (permission) => {
      if (!isStaffOnly) return true;
      return staffHasPermission(staffPermissions, permission);
    },
    [isStaffOnly, staffPermissions],
  );

  return {
    inStaffSession,
    staffContextToken,
    venueId: ownedVenueId,
    venueQuery,
    venueName,
    isOwner,
    isStaffOnly,
    isStaffAccess,
    staffPermissions,
    can,
    venuesLoading: activeVenueCtx?.isLoading ?? false,
  };
}
