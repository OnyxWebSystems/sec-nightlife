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

    loadGoogleMapsApi()
      .then(() => {
        if (didUnmount.current) return;
        setStatus('ready');
      })
      .catch((err) => {
        if (didUnmount.current) return;
        setError(err);
        setStatus('error');
      });

    return () => {
      didUnmount.current = true;
    };
  }, []);

  const value = useMemo(() => ({ status, error }), [status, error]);

  return <GoogleMapsContext.Provider value={value}>{children}</GoogleMapsContext.Provider>;
}

export function useGoogleMaps() {
  return useContext(GoogleMapsContext);
}

