import React, { createContext, useContext, useEffect, useLayoutEffect, useState, useCallback, useRef } from 'react';
import { t } from '@/i18n/translations';
import { useAuth } from '@/lib/AuthContext';
import { apiPatch } from '@/api/client';

const STORAGE_KEY = 'sec-preferences';
const PRIVACY_KEY = 'sec-privacy-settings';

const defaultPrefs = {
  theme: 'dark',
  language: 'en',
  notifications: {
    enabled: true,
    push: {
      eventReminders: true,
      tableInvitations: true,
      friendRequests: true,
      messages: true,
      promotions: true,
      appUpdates: true,
    },
    email: {
      eventReminders: true,
      promotions: true,
    },
  },
  location: {
    useLocation: false,
    distanceUnit: 'km',
    radiusKm: 25,
  },
};

const defaultPrivacy = {
  profilePublic: true,
  searchVisible: true,
  tablesVisible: true,
  allowMessages: true,
};

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaultPrefs };
    const parsed = JSON.parse(raw);
    const notif = parsed.notifications || {};
    const loc = parsed.location || {};
    return {
      theme: ['dark', 'light'].includes(parsed.theme) ? parsed.theme : defaultPrefs.theme,
      language: parsed.language || defaultPrefs.language,
      notifications: {
        enabled: notif.enabled ?? defaultPrefs.notifications.enabled,
        push: { ...defaultPrefs.notifications.push, ...(notif.push && typeof notif.push === 'object' ? notif.push : {}) },
        email: { ...defaultPrefs.notifications.email, ...(notif.email && typeof notif.email === 'object' ? notif.email : {}) },
      },
      location: {
        ...defaultPrefs.location,
        ...(loc && typeof loc === 'object' ? loc : {}),
        radiusKm: Number(loc?.radiusKm) > 0 ? Number(loc.radiusKm) : defaultPrefs.location.radiusKm,
      },
    };
  } catch {
    return { ...defaultPrefs };
  }
}

function loadPrivacyFromStorage() {
  try {
    const raw = localStorage.getItem(PRIVACY_KEY);
    if (!raw) return { ...defaultPrivacy };
    const parsed = JSON.parse(raw);
    return { ...defaultPrivacy, ...parsed };
  } catch {
    return { ...defaultPrivacy };
  }
}

function saveToStorage(prefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch (e) {
    console.warn('Failed to save preferences:', e);
  }
}

function savePrivacyToStorage(privacy) {
  try {
    localStorage.setItem(PRIVACY_KEY, JSON.stringify(privacy));
  } catch (e) {
    console.warn('Failed to save privacy settings:', e);
  }
}

function applyThemeToDocument(theme) {
  const root = document.documentElement;
  root.classList.remove('light', 'dark');
  root.classList.add(theme);
  root.style.colorScheme = theme;
}

const PreferencesContext = createContext(null);

export function PreferencesProvider({ children }) {
  const { isAuthenticated, userProfile } = useAuth();
  const [prefs, setPrefsState] = useState(loadFromStorage);
  const [privacy, setPrivacyState] = useState(loadPrivacyFromStorage);
  const [geoCoords, setGeoCoords] = useState(null);
  const [hydrated, setHydrated] = useState(false);
  const hydratedFromApi = useRef(false);
  const skipNextSync = useRef(false);

  useLayoutEffect(() => {
    applyThemeToDocument('dark');
  }, []);

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!userProfile || hydratedFromApi.current) return;
    skipNextSync.current = true;
    if (userProfile.notification_prefs && typeof userProfile.notification_prefs === 'object') {
      const notif = userProfile.notification_prefs;
      setPrefsState((p) => ({
        ...p,
        notifications: {
          enabled: notif.enabled ?? p.notifications.enabled,
          push: { ...p.notifications.push, ...(notif.push || {}) },
          email: { ...p.notifications.email, ...(notif.email || {}) },
        },
      }));
    }
    if (userProfile.app_preferences?.location) {
      setPrefsState((p) => ({
        ...p,
        location: { ...p.location, ...userProfile.app_preferences.location },
      }));
    }
    if (userProfile.privacy_settings && typeof userProfile.privacy_settings === 'object') {
      setPrivacyState({ ...defaultPrivacy, ...userProfile.privacy_settings });
    }
    hydratedFromApi.current = true;
  }, [userProfile]);

  useEffect(() => {
    if (!hydrated) return;
    saveToStorage(prefs);
  }, [prefs, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    savePrivacyToStorage(privacy);
  }, [privacy, hydrated]);

  useEffect(() => {
    if (!hydrated || !isAuthenticated) return;
    if (skipNextSync.current) {
      skipNextSync.current = false;
      return;
    }
    const timer = setTimeout(() => {
      apiPatch('/api/users/profile', {
        notification_prefs: prefs.notifications,
        app_preferences: {
          location: prefs.location,
          language: prefs.language,
          theme: prefs.theme,
        },
        privacy_settings: privacy,
      }).catch(() => {});
    }, 700);
    return () => clearTimeout(timer);
  }, [prefs.notifications, prefs.location, prefs.language, privacy, hydrated, isAuthenticated]);

  const requestGeoCoords = useCallback(() => {
    if (!navigator.geolocation) return Promise.reject(new Error('Geolocation not supported'));
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          const next = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          setGeoCoords(next);
          resolve(next);
        },
        (err) => reject(err),
        { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 },
      );
    });
  }, []);

  useEffect(() => {
    if (!prefs.location?.useLocation) {
      setGeoCoords(null);
      return;
    }
    requestGeoCoords().catch(() => {});
  }, [prefs.location?.useLocation, requestGeoCoords]);

  const setTheme = useCallback((theme) => {
    if (theme !== 'dark' && theme !== 'light') return;
    setPrefsState((p) => ({ ...p, theme }));
  }, []);

  const toggleTheme = useCallback(() => {
    setPrefsState((p) => ({ ...p, theme: p.theme === 'dark' ? 'light' : 'dark' }));
  }, []);

  const setLanguage = useCallback((lang) => {
    setPrefsState((p) => ({ ...p, language: lang }));
  }, []);

  const setNotification = useCallback((path, value) => {
    setPrefsState((p) => {
      const next = { ...p, notifications: { ...p.notifications } };
      const parts = path.split('.');
      let obj = next.notifications;
      for (let i = 0; i < parts.length - 1; i++) {
        const key = parts[i];
        obj[key] = { ...obj[key] };
        obj = obj[key];
      }
      obj[parts[parts.length - 1]] = value;
      return next;
    });
  }, []);

  const setLocation = useCallback((key, value) => {
    setPrefsState((p) => ({
      ...p,
      location: { ...p.location, [key]: value },
    }));
  }, []);

  const setPrivacySetting = useCallback((key, value) => {
    setPrivacyState((p) => ({ ...p, [key]: value }));
  }, []);

  const tKey = useCallback((key) => t(prefs.language, key), [prefs.language]);

  const value = {
    theme: prefs.theme,
    language: prefs.language,
    notifications: prefs.notifications,
    location: prefs.location,
    privacy,
    geoCoords,
    requestGeoCoords,
    setTheme,
    toggleTheme,
    setLanguage,
    setNotification,
    setLocation,
    setPrivacySetting,
    t: tKey,
    hydrated,
  };

  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  );
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  if (!ctx) {
    throw new Error('usePreferences must be used within PreferencesProvider');
  }
  return ctx;
}
