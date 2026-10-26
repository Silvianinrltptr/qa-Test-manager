'use client';

import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { Locale, TranslationDictionary } from './types';
import { en } from './locales/en';
import { id } from './locales/id';

interface I18nContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  setLanguage: (locale: Locale) => void;
  dict: TranslationDictionary;
  t: (path: string, fallback?: string) => string;
  formatDate: (date: string | number | Date | null | undefined, options?: Intl.DateTimeFormatOptions) => string;
  formatNumber: (num: number | null | undefined, options?: Intl.NumberFormatOptions) => string;
  formatPercent: (num: number | null | undefined) => string;
  isLoaded: boolean;
}

const dictionaries: Record<Locale, TranslationDictionary> = { en, id };

const I18nContext = createContext<I18nContextValue | null>(null);

function getInitialLocale(): Locale {
  if (typeof window === 'undefined') return 'en';
  try {
    const saved = localStorage.getItem('qastudio-language') || localStorage.getItem('testbloom-language');
    if (saved === 'id' || saved === 'en') return saved;

    const cookieMatch = document.cookie.match(/(?:^|;\s*)qastudio_lang=([^;]+)/);
    if (cookieMatch && (cookieMatch[1] === 'id' || cookieMatch[1] === 'en')) {
      return cookieMatch[1] as Locale;
    }
  } catch {
    // ignore
  }
  return 'en';
}

export function I18nProvider({ children }: { children: React.ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(getInitialLocale);
  const [isLoaded, setIsLoaded] = useState(false);

  // Sync with persistent backend preference on mount
  useEffect(() => {
    let active = true;
    const fetchStoredPreference = async () => {
      try {
        const res = await fetch('/api/preferences');
        if (res.ok) {
          const data = await res.json();
          if (active && (data.language === 'id' || data.language === 'en')) {
            setLocaleState(prev => {
              if (prev !== data.language) {
                try {
                  localStorage.setItem('qastudio-language', data.language);
                  document.cookie = `qastudio_lang=${data.language}; path=/; max-age=31536000; SameSite=Lax`;
                } catch {}
                return data.language;
              }
              return prev;
            });
          }
        }
      } catch {
        // Fallback gracefully per Requirement 3.7
      } finally {
        if (active) setIsLoaded(true);
      }
    };

    fetchStoredPreference();

    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'qastudio-language' && (e.newValue === 'en' || e.newValue === 'id')) {
        setLocaleState(e.newValue);
      }
    };

    const handleCustomChange = (e: Event) => {
      const detail = (e as CustomEvent<Locale>).detail;
      if (detail === 'en' || detail === 'id') {
        setLocaleState(detail);
      }
    };

    window.addEventListener('storage', handleStorageChange);
    window.addEventListener('qastudio-lang-change', handleCustomChange);

    return () => {
      active = false;
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('qastudio-lang-change', handleCustomChange);
    };
  }, []);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    try {
      localStorage.setItem('qastudio-language', newLocale);
      localStorage.setItem('testbloom-language', newLocale);
      document.cookie = `qastudio_lang=${newLocale}; path=/; max-age=31536000; SameSite=Lax`;
    } catch {}

    window.dispatchEvent(new CustomEvent('qastudio-lang-change', { detail: newLocale }));

    // Persist to database profile via API asynchronously
    fetch('/api/preferences', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ language: newLocale }),
    }).catch(() => {
      // Safe error handling per Requirement 3.7
    });
  }, []);

  const dict = useMemo(() => dictionaries[locale] || dictionaries.en, [locale]);

  // Nested property resolver: e.g. t('dashboard.title')
  const t = useCallback((path: string, fallback?: string): string => {
    const parts = path.split('.');
    let current: unknown = dict;
    for (const part of parts) {
      if (current && typeof current === 'object' && part in (current as Record<string, unknown>)) {
        current = (current as Record<string, unknown>)[part];
      } else {
        // Fallback to English dictionary if missing in current locale
        let enCurrent: unknown = dictionaries.en;
        for (const p of parts) {
          if (enCurrent && typeof enCurrent === 'object' && p in (enCurrent as Record<string, unknown>)) {
            enCurrent = (enCurrent as Record<string, unknown>)[p];
          } else {
            return fallback || path;
          }
        }
        return typeof enCurrent === 'string' ? enCurrent : fallback || path;
      }
    }
    return typeof current === 'string' ? current : fallback || path;
  }, [dict]);

  const formatDate = useCallback((
    date: string | number | Date | null | undefined,
    options?: Intl.DateTimeFormatOptions
  ): string => {
    if (!date) return '-';
    try {
      const d = typeof date === 'string' || typeof date === 'number' ? new Date(date) : date;
      if (isNaN(d.getTime())) return String(date);
      const loc = locale === 'id' ? 'id-ID' : 'en-US';
      return d.toLocaleDateString(loc, options || { day: 'numeric', month: 'short', year: 'numeric' });
    } catch {
      return String(date);
    }
  }, [locale]);

  const formatNumber = useCallback((
    num: number | null | undefined,
    options?: Intl.NumberFormatOptions
  ): string => {
    if (num === null || num === undefined) return '0';
    try {
      const loc = locale === 'id' ? 'id-ID' : 'en-US';
      return num.toLocaleString(loc, options);
    } catch {
      return String(num);
    }
  }, [locale]);

  const formatPercent = useCallback((num: number | null | undefined): string => {
    if (num === null || num === undefined) return 'N/A';
    return `${num}%`;
  }, []);

  const contextValue = useMemo<I18nContextValue>(() => ({
    locale,
    setLocale,
    setLanguage: setLocale,
    dict,
    t,
    formatDate,
    formatNumber,
    formatPercent,
    isLoaded,
  }), [locale, setLocale, dict, t, formatDate, formatNumber, formatPercent, isLoaded]);

  return (
    <I18nContext.Provider value={contextValue}>
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n(): I18nContextValue {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    // Fallback if rendered outside provider
    return {
      locale: 'en',
      setLocale: () => {},
      setLanguage: () => {},
      dict: en,
      t: (path: string, fallback?: string) => fallback || path,
      formatDate: (d?: string | number | Date | null) => d ? new Date(d).toLocaleDateString() : '-',
      formatNumber: (n?: number | null) => String(n ?? 0),
      formatPercent: (p?: number | null) => p != null ? `${p}%` : 'N/A',
      isLoaded: true,
    };
  }
  return ctx;
}
