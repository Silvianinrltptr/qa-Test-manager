'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard, Layers, Sparkles, Upload,
  Play, BarChart3, History, Settings, ClipboardList, FlaskConical,
  FileCheck2, AlertTriangle, Network, FileText
} from 'lucide-react';

const NAV = [
  {
    label: 'Utama',
    items: [
      { href: '/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
      { href: '/modules', icon: Layers, label: 'Modul & Fitur' },
      { href: '/requirements', icon: FileCheck2, label: 'PRD & Requirements' },
      { href: '/test-cases', icon: ClipboardList, label: 'Test Cases' },
    ]
  },
  {
    label: 'Input',
    items: [
      { href: '/ai-generator', icon: Sparkles, label: 'AI Generator' },
      { href: '/bulk-add', icon: FlaskConical, label: 'Tambah Massal' },
      { href: '/import', icon: Upload, label: 'Import Excel/CSV' },
    ]
  },
  {
    label: 'Eksekusi & Analisis',
    items: [
      { href: '/execution', icon: Play, label: 'Eksekusi Test' },
      { href: '/impact-analysis', icon: AlertTriangle, label: 'Impact Analysis' },
      { href: '/traceability', icon: Network, label: 'Traceability Matrix' },
    ]
  },
  {
    label: 'Laporan & Audit',
    items: [
      { href: '/reports', icon: FileText, label: 'Laporan Periode' },
      { href: '/weekly-progress', icon: BarChart3, label: 'Progres Mingguan' },
      { href: '/change-log', icon: History, label: 'Change Log' },
    ]
  },
  {
    label: 'Sistem',
    items: [
      { href: '/settings', icon: Settings, label: 'Pengaturan' },
    ]
  }
];

export function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <h1>⬡ QA Manager</h1>
        <p>Personal QA Test Manager</p>
      </div>
      <nav className="sidebar-nav">
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
                >
                  <Icon size={16} />
                  {item.label}
                </Link>
              );
            })}
          </div>
        ))}
      </nav>
    </aside>
  );
}
