import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/AuthContext';
import { dataService } from '@/services/dataService';

const ActiveVenueContext = createContext(null);

function storageKey(userId) {
  return `sec_active_venue_id_${userId}`;
}

export function ActiveVenueProvider({ children }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [activeVenueId, setActiveVenueIdState] = useState(null);

  const { data: venues = [], isLoading, refetch } = useQuery({
    queryKey: ['biz-venues', user?.id],
    queryFn: () => dataService.Venue.mine(),
    enabled: !!user?.id,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!user?.id) {
      setActiveVenueIdState(null);
      return;
    }
    const key = storageKey(user.id);
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
  }, [user?.id, venues]);

  const setActiveVenueId = useCallback(
    (venueId) => {
      if (!user?.id || !venueId) return;
      const id = String(venueId);
      setActiveVenueIdState(id);
      localStorage.setItem(storageKey(user.id), id);
    },
    [user?.id],
  );

  const activeVenue = useMemo(
    () => venues.find((v) => String(v.id) === String(activeVenueId)) || venues[0] || null,
    [venues, activeVenueId],
  );

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
