'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard, Layers, Sparkles, Upload,
  Play, BarChart3, History, Settings, ClipboardList, FlaskConical,
  FileCheck2, AlertTriangle, Network, FileText, Inbox, Eye, LogOut
} from 'lucide-react';

interface NavItem {
  href: string;
  icon: typeof LayoutDashboard;
  label: string;
  isFeedback?: boolean;
}

interface NavSection {
  label: string;
  items: NavItem[];
}

const NAV: NavSection[] = [
  {
    label: 'Main',
    items: [
      { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      { href: '/modules', icon: Layers, label: 'Modules & Features' },
      { href: '/requirements', icon: FileCheck2, label: 'PRD & Requirements' },
      { href: '/test-cases', icon: ClipboardList, label: 'Test Cases' },
      { href: '/feedback', icon: Inbox, label: 'Feedback Inbox', isFeedback: true },
    ]
  },
  {
    label: 'Input',
    items: [
      { href: '/ai-generator', icon: Sparkles, label: 'AI Generator' },
      { href: '/bulk-add', icon: FlaskConical, label: 'Bulk Add' },
      { href: '/import', icon: Upload, label: 'Import Excel/CSV' },
    ]
  },
  {
    label: 'Execution & Analysis',
    items: [
      { href: '/execution', icon: Play, label: 'Test Execution' },
      { href: '/impact-analysis', icon: AlertTriangle, label: 'Impact Analysis' },
      { href: '/traceability', icon: Network, label: 'Traceability Matrix' },
    ]
  },
  {
    label: 'Reports & Audit',
    items: [
      { href: '/reports', icon: FileText, label: 'Period Reports' },
      { href: '/weekly-progress', icon: BarChart3, label: 'Weekly Progress' },
      { href: '/change-log', icon: History, label: 'Change Log' },
    ]
  },
  {
    label: 'System',
    items: [
      { href: '/settings', icon: Settings, label: 'Settings' },
    ]
  }
];

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

export function Sidebar() {
  const router = useRouter();
  const pathname = usePathname();
  const [pendingFeedbackCount, setPendingFeedbackCount] = useState<number>(0);

  useEffect(() => {
    let isMounted = true;
    const fetchPendingCount = async () => {
      try {
        const res = await fetch('/api/comments/inbox');
        if (res.ok) {
          const data = await res.json() as { stats?: { pending?: number } };
          if (isMounted && data.stats && typeof data.stats.pending === 'number') {
            setPendingFeedbackCount(data.stats.pending);
          }
        }
      } catch {
        // Silently ignore navigation badge polling errors
      }
    };

    fetchPendingCount();
    return () => {
      isMounted = false;
    };
  }, [pathname]);

  return (
    <aside className="sidebar" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div className="sidebar-logo">
        <h1 style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <QAMonogramIcon size={20} />
          <span>QAE Studio</span>
        </h1>
        <p>Test Management Workspace</p>
      </div>

      <nav className="sidebar-nav" style={{ flex: 1, overflowY: 'auto' }}>
        {NAV.map(section => (
          <div key={section.label}>
            <div className="nav-section-label">{section.label}</div>
            {section.items.map(item => {
              const Icon = item.icon;
              const active = pathname === item.href || pathname.startsWith(item.href + '/');
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`nav-item ${active ? 'active' : ''}`}
                  id={`nav-${item.href.replace('/', '').replace('/', '-') || 'home'}`}
                  style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <Icon size={16} />
                    {item.label}
                  </span>
                  {item.isFeedback && pendingFeedbackCount > 0 && (
                    <span
                      className="badge badge-warning"
                      style={{
                        fontSize: 10,
                        padding: '1px 6px',
                        fontWeight: 700,
                        borderRadius: 10,
                      }}
                    >
                      {pendingFeedbackCount}
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* Portal footer */}
      <div style={{ padding: '14px 12px', borderTop: '1px solid var(--border)', marginTop: 'auto' }}>
        <Link
          href="/project-viewer"
          className="btn btn-secondary btn-sm"
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            fontSize: 12,
            padding: '8px 10px',
            textDecoration: 'none',
            marginBottom: 8,
          }}
        >
          <Eye size={14} style={{ color: 'var(--primary)' }} />
          <span>Switch to Project Viewer</span>
        </Link>
        <button
          type="button"
          onClick={async () => {
            try {
              await fetch('/api/auth/logout', { method: 'POST' });
            } catch {
              // ignore
            }
            if (typeof window !== 'undefined') {
              sessionStorage.removeItem('qastudio_qa_auth');
              sessionStorage.removeItem('qastudio_role');
            }
            router.push('/');
            router.refresh();
          }}
          className="btn btn-secondary btn-sm"
          style={{
            width: '100%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 6,
            fontSize: 12,
            padding: '7px 10px',
            color: 'var(--foreground-muted)',
            cursor: 'pointer',
          }}
        >
          <LogOut size={13} />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
}
