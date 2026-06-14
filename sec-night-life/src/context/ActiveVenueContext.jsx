import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { dataService } from '@/services/dataService';
import { asArray } from '@/utils';

const ActiveVenueContext = createContext(null);

function storageKey(userId) {
  return `sec_active_venue_id_${userId}`;
}

function normalizeVenueRow(v) {
  return {
    ...v,
    isOwner: v.is_owner ?? v.isOwner ?? true,
    isStaffAccess: v.is_staff_access ?? v.isStaffAccess ?? false,
    staffPermissions: v.staff_permissions ?? v.staffPermissions ?? null,
  };
}

export function ActiveVenueProvider({ children }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const location = useLocation();
  const [activeVenueId, setActiveVenueIdState] = useState(null);

  const urlVenueId = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const id = params.get('venue_id');
    return id && id.trim() ? id.trim() : null;
  }, [location.search]);

  const { data: venuesRaw, isLoading, refetch } = useQuery({
    queryKey: ['biz-venues', user?.id],
    queryFn: () => dataService.Venue.mine(),
    enabled: !!user?.id,
    staleTime: 5 * 60_000,
  });
  const venues = useMemo(() => asArray(venuesRaw).map(normalizeVenueRow), [venuesRaw]);

  useEffect(() => {
    if (!user?.id) {
      setActiveVenueIdState(null);
      return;
    }
    const key = storageKey(user.id);
    if (urlVenueId && venues.some((v) => String(v.id) === String(urlVenueId))) {
      setActiveVenueIdState(urlVenueId);
      localStorage.setItem(key, urlVenueId);
      return;
    }
    const saved = localStorage.getItem(key);
    if (saved && venues.some((v) => String(v.id) === String(saved))) {
      setActiveVenueIdState(saved);
      return;
    }
    if (venues.length > 0) {
      const first = String(venues[0].id);
      setActiveVenueIdState(first);
      localStorage.setItem(key, first);
    }
  }, [user?.id, venues, urlVenueId]);

  const setActiveVenueId = useCallback(
    (venueId) => {
      if (!user?.id || !venueId) return;
      const id = String(venueId);
      setActiveVenueIdState(id);
      localStorage.setItem(storageKey(user.id), id);
    },
    [user?.id],
  );

  const activeVenue = useMemo(() => {
    if (urlVenueId) {
      const fromUrl = venues.find((v) => String(v.id) === String(urlVenueId));
      if (fromUrl) return fromUrl;
    }
    return venues.find((v) => String(v.id) === String(activeVenueId)) || venues[0] || null;
  }, [venues, activeVenueId, urlVenueId]);

  const refreshVenues = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['biz-venues', user?.id] });
    return refetch();
  }, [queryClient, user?.id, refetch]);

  const value = useMemo(
    () => ({
      venues,
      activeVenue,
      activeVenueId: activeVenue?.id ?? activeVenueId,
      setActiveVenueId,
      isLoading,
      refreshVenues,
      isOwner: activeVenue?.isOwner ?? true,
      isStaffAccess: activeVenue?.isStaffAccess ?? false,
      staffPermissions: activeVenue?.staffPermissions ?? null,
    }),
    [venues, activeVenue, activeVenueId, setActiveVenueId, isLoading, refreshVenues],
  );

  return <ActiveVenueContext.Provider value={value}>{children}</ActiveVenueContext.Provider>;
}

export function useActiveVenue() {
  const ctx = useContext(ActiveVenueContext);
  if (!ctx) {
    throw new Error('useActiveVenue must be used within ActiveVenueProvider');
  }
  return ctx;
}

/** Safe hook for pages that may render outside business context */
export function useActiveVenueOptional() {
  return useContext(ActiveVenueContext);
}
