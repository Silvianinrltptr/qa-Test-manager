'use client';

import { Sidebar } from '@/components/layout/Sidebar';
import { ToastProvider } from '@/components/ui/Toast';
import { ReactNode, useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu } from 'lucide-react';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';

function QAMonogramIcon({ size = 20, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="var(--primary)"
      strokeWidth="2.2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={{ flexShrink: 0 }}
      aria-hidden="true"
    >
      <path d="M 12 3 L 4.5 13.5 C 4.5 17.5 7.8 20.5 12 20.5 C 16.2 20.5 19.5 17.5 19.5 13.5 L 12 3 Z" />
      <line x1="7.2" y1="13.2" x2="16.8" y2="13.2" />
      <path d="M 14 15.5 L 20.5 22" strokeWidth="2.4" />
    </svg>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const pathname = usePathname();

  // Close mobile drawer whenever route changes
  useEffect(() => {
    setMobileNavOpen(false);
  }, [pathname]);

  return (
    <ToastProvider>
      <div className="app-layout">
        {/* Desktop Sidebar (hidden on screens <= 768px via CSS) */}
        <Sidebar />

        {/* Mobile Navigation Drawer */}
        {mobileNavOpen && (
          <div
            className="mobile-drawer-overlay"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden="true"
          >
            <div
              className="mobile-drawer"
              onClick={e => e.stopPropagation()}
            >
              <Sidebar
                isMobile
                onNavigate={() => setMobileNavOpen(false)}
                onClose={() => setMobileNavOpen(false)}
              />
            </div>
          </div>
        )}

        <main className="main-content">
          {/* Mobile Top Header (only visible on <= 768px via CSS) */}
          <header className="mobile-header">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <button
                type="button"
                className="btn btn-ghost btn-icon mobile-menu-btn"
                onClick={() => setMobileNavOpen(true)}
                aria-label="Open Navigation Menu"
                id="btn-mobile-nav-toggle"
              >
                <Menu size={20} />
              </button>
              <Link href="/dashboard" style={{ display: 'flex', alignItems: 'center', gap: 8, textDecoration: 'none' }}>
                <QAMonogramIcon size={18} />
                <span style={{ fontWeight: 700, fontSize: 16, color: 'var(--foreground)', letterSpacing: '-0.02em' }}>
                  QAE Studio
                </span>
              </Link>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <LanguageSwitcher />
              <ThemeToggle />
            </div>
          </header>

          <div className="main-content-inner">
            {children}
          </div>
        </main>
      </div>
    </ToastProvider>
  );
}

