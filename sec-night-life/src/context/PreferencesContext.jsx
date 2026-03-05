import React, { createContext, useContext, useEffect, useLayoutEffect, useState, useCallback } from 'react';
import { t } from '@/i18n/translations';

const STORAGE_KEY = 'sec-preferences';

const defaultPrefs = {
  theme: 'dark',
  language: 'en',
};

function loadFromStorage() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...defaultPrefs };
    const parsed = JSON.parse(raw);
    return {
      theme: ['dark', 'light'].includes(parsed.theme) ? parsed.theme : defaultPrefs.theme,
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

function applyThemeToDocument(theme) {
  const root = document.documentElement;
  root.classList.remove('light', 'dark');
  root.classList.add(theme);
  root.style.colorScheme = theme;
}

const PreferencesContext = createContext(null);

export function PreferencesProvider({ children }) {
  const [prefs, setPrefsState] = useState(loadFromStorage);
  const [hydrated, setHydrated] = useState(false);

  useLayoutEffect(() => {
    applyThemeToDocument(prefs.theme);
  }, [prefs.theme]);

  useEffect(() => {
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    saveToStorage(prefs);
  }, [prefs, hydrated]);

  const setTheme = useCallback((theme) => {
    if (theme !== 'dark' && theme !== 'light') return;
    setPrefsState((p) => ({ ...p, theme }));
  }, []);

  const setLanguage = useCallback((lang) => {
    setPrefsState((p) => ({ ...p, language: lang }));
  }, []);

  const toggleTheme = useCallback(() => {
    setPrefsState((p) => ({ ...p, theme: p.theme === 'dark' ? 'light' : 'dark' }));
  }, []);

  const tKey = useCallback((key) => t(prefs.language, key), [prefs.language]);

  const value = {
    theme: prefs.theme,
    language: prefs.language,
    setTheme,
    setLanguage,
    toggleTheme,
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
