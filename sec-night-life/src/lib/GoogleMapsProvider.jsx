import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { loadGoogleMapsApi } from '@/lib/googleMapsApi';

const GoogleMapsContext = createContext({
  status: 'idle',
  error: null,
});

export function GoogleMapsProvider({ children }) {
  const [status, setStatus] = useState('loading');
  const [error, setError] = useState(null);
  const didUnmount = useRef(false);

  useEffect(() => {
    didUnmount.current = false;
    let authFailurePoll = null;

    loadGoogleMapsApi()
      .then(() => {
        if (didUnmount.current) return;
        setStatus('ready');

        // Google Maps auth/billing/key-restriction failures can occur after script load.
        // When that happens, switch components into their manual fallback state.
        authFailurePoll = window.setInterval(() => {
          if (didUnmount.current) return;
          if (window.__googleMapsAuthFailure) {
            setError(new Error('Google Maps authentication failed.'));
            setStatus('error');
            window.clearInterval(authFailurePoll);
          }
        }, 500);
      })
      .catch((err) => {
        if (didUnmount.current) return;
        setError(err);
        setStatus('error');
      });

    return () => {
      didUnmount.current = true;
      if (authFailurePoll) window.clearInterval(authFailurePoll);
    };
  }, []);

  const value = useMemo(() => ({ status, error }), [status, error]);

  return <GoogleMapsContext.Provider value={value}>{children}</GoogleMapsContext.Provider>;
}

export function useGoogleMaps() {
  return useContext(GoogleMapsContext);
}

