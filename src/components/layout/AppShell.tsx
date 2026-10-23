'use client';

import { Sidebar } from '@/components/layout/Sidebar';
import { ToastProvider } from '@/components/ui/Toast';
import { ReactNode } from 'react';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <ToastProvider>
      <div className="app-layout">
        <Sidebar />
        <main className="main-content">
          <div style={{ padding: '28px 32px', minHeight: '100%' }}>
            {children}
          </div>
        </main>
      </div>
    </ToastProvider>
  );
}
