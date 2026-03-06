import React, { createContext, useContext, useEffect, useLayoutEffect, useState, useCallback } from 'react';
import { t } from '@/i18n/translations';

const STORAGE_KEY = 'sec-preferences';

const defaultPrefs = {
  language: 'en',
};

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaultPrefs };
    const parsed = JSON.parse(raw);
    return {
      language: parsed.language || defaultPrefs.language,
    };
  } catch {
    return { ...defaultPrefs };
  }
}

function saveToStorage(prefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch (e) {
    console.warn('Failed to save preferences:', e);
  }
}

const PreferencesContext = createContext(null);

export function PreferencesProvider({ children }) {
  const [prefs, setPrefsState] = useState(loadFromStorage);
  const [hydrated, setHydrated] = useState(false);

  useLayoutEffect(() => {
    const root = document.documentElement;
    root.classList.remove('light');
    root.classList.add('dark');
    root.style.colorScheme = 'dark';
  }, []);

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveToStorage(prefs);
  }, [prefs, hydrated]);

  const setLanguage = useCallback((lang) => {
    setPrefsState((p) => ({ ...p, language: lang }));
  }, []);

  const tKey = useCallback((key) => t(prefs.language, key), [prefs.language]);

  const value = {
    language: prefs.language,
    setLanguage,
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
