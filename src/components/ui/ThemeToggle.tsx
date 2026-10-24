'use client';

import React, { useSyncExternalStore } from 'react';
import { Sun, Moon } from 'lucide-react';

function subscribe(callback: () => void) {
  window.addEventListener('storage', callback);
  window.addEventListener('qastudio-theme-change', callback);
  window.addEventListener('testbloom-theme-change', callback);
  return () => {
    window.removeEventListener('storage', callback);
    window.removeEventListener('qastudio-theme-change', callback);
    window.removeEventListener('testbloom-theme-change', callback);
  };
}

function getSnapshot(): 'light' | 'dark' {
  if (typeof window === 'undefined') return 'light';
  return (
    (localStorage.getItem('qastudio-theme') as 'light' | 'dark') ||
    (localStorage.getItem('testbloom-theme') as 'light' | 'dark') ||
    'light'
  );
}

function getServerSnapshot(): 'light' | 'dark' {
  return 'light';
}

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  const isLight = theme === 'light';

  const toggleTheme = () => {
    const nextTheme: 'light' | 'dark' = isLight ? 'dark' : 'light';
    try {
      localStorage.setItem('qastudio-theme', nextTheme);
      localStorage.setItem('testbloom-theme', nextTheme);
      document.documentElement.setAttribute('data-theme', nextTheme);
    } catch {
      // Ignore if localStorage unavailable
    }
    window.dispatchEvent(new CustomEvent('qastudio-theme-change', { detail: nextTheme }));
    window.dispatchEvent(new CustomEvent('testbloom-theme-change', { detail: nextTheme }));
  };

  return (
    <button
      type="button"
      className="theme-toggle"
      onClick={toggleTheme}
      aria-label={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
      title={isLight ? 'Switch to dark mode' : 'Switch to light mode'}
      id="theme-toggle-btn"
    >
      {isLight ? (
        <Sun size={17} className="theme-toggle-icon" />
      ) : (
        <Moon size={17} className="theme-toggle-icon" />
      )}
    </button>
  );
}
