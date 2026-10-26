'use client';

import React from 'react';
import { useI18n } from '@/lib/i18n/context';

export function LanguageSwitcher({ className = '' }: { className?: string }) {
  const { locale, setLocale } = useI18n();

  return (
    <div
      className={`language-switcher ${className}`}
      role="group"
      aria-label="Language selection"
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        background: 'var(--surface-2)',
        border: '1px solid var(--border)',
        borderRadius: 8,
        padding: 2,
        height: 32,
        boxSizing: 'border-box',
        verticalAlign: 'middle',
      }}
    >
      <button
        type="button"
        id="btn-lang-en"
        onClick={() => setLocale('en')}
        aria-pressed={locale === 'en'}
        title="Switch to English"
        style={{
          border: 'none',
          cursor: 'pointer',
          padding: '2px 8px',
          fontSize: 11,
          fontWeight: locale === 'en' ? 700 : 500,
          borderRadius: 6,
          background: locale === 'en' ? 'var(--primary)' : 'transparent',
          color: locale === 'en' ? '#ffffff' : 'var(--foreground-muted)',
          transition: 'all 0.15s ease',
          lineHeight: '22px',
          letterSpacing: '0.04em',
        }}
      >
        ENG
      </button>
      <button
        type="button"
        id="btn-lang-id"
        onClick={() => setLocale('id')}
        aria-pressed={locale === 'id'}
        title="Beralih ke Bahasa Indonesia"
        style={{
          border: 'none',
          cursor: 'pointer',
          padding: '2px 8px',
          fontSize: 11,
          fontWeight: locale === 'id' ? 700 : 500,
          borderRadius: 6,
          background: locale === 'id' ? 'var(--primary)' : 'transparent',
          color: locale === 'id' ? '#ffffff' : 'var(--foreground-muted)',
          transition: 'all 0.15s ease',
          lineHeight: '22px',
          letterSpacing: '0.04em',
        }}
      >
        IDN
      </button>
    </div>
  );
}
