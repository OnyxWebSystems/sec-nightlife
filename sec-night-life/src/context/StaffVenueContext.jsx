import React, { createContext, useCallback, useContext, useEffect, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';

const StaffVenueContext = createContext(null);

const STORAGE_KEY = 'sec_staff_venue_ctx';

export function StaffVenueProvider({ children }) {
  const [searchParams] = useSearchParams();

  const urlToken = useMemo(() => {
    const t = searchParams.get('staff_ctx');
    return t && t.trim() ? t.trim() : null;
  }, [searchParams]);

  const [sessionMeta, setSessionMeta] = React.useState(() => {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  useEffect(() => {
    if (urlToken && sessionMeta?.accessToken !== urlToken) {
      setSessionMeta((cur) => ({ ...cur, accessToken: urlToken }));
    }
  }, [urlToken, sessionMeta?.accessToken]);

  const enterStaffContext = useCallback((accessToken, meta = {}) => {
    if (!accessToken) return;
    const next = {
      accessToken: String(accessToken),
      venueName: meta.venueName || null,
      venueCity: meta.venueCity || null,
      venueLogoUrl: meta.venueLogoUrl || null,
      permissions: meta.permissions || {},
    };
    setSessionMeta(next);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }, []);

  const clearStaffContext = useCallback(() => {
    setSessionMeta(null);
    sessionStorage.removeItem(STORAGE_KEY);
  }, []);

  const activeToken = urlToken || sessionMeta?.accessToken || null;

  const value = useMemo(
    () => ({
      staffContextToken: activeToken,
      staffVenueMeta: sessionMeta,
      enterStaffContext,
      clearStaffContext,
      inStaffSession: Boolean(activeToken),
    }),
    [activeToken, sessionMeta, enterStaffContext, clearStaffContext],
  );

  return <StaffVenueContext.Provider value={value}>{children}</StaffVenueContext.Provider>;
}

export function useStaffVenueOptional() {
  return useContext(StaffVenueContext);
}
