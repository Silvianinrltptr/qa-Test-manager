'use client';

import { TestResult, Priority, PrepStatus, LifecycleStatus, TestType } from '@/lib/types';

const RESULT_LABELS: Record<string, string> = {
  pass: 'Pass', fail: 'Fail', blocked: 'Blocked', not_run: 'Not Run'
};

const PRIORITY_LABELS: Record<string, string> = {
  critical: 'Kritis', high: 'Tinggi', medium: 'Sedang', low: 'Rendah'
};

const PREP_LABELS: Record<string, string> = {
  draft: 'Draft', in_progress: 'Sedang Disiapkan', ready: 'Siap'
};

const LIFECYCLE_LABELS: Record<string, string> = {
  draft: 'Draft', active: 'Aktif', obsolete: 'Usang', archived: 'Diarsipkan'
};

const TYPE_LABELS: Record<string, string> = {
  functional: 'Fungsional', regression: 'Regresi', smoke: 'Smoke',
  boundary: 'Boundary', negative: 'Negatif', validation: 'Validasi',
  permission: 'Perizinan', integration: 'Integrasi', uat: 'UAT',
  performance: 'Performa', other: 'Lainnya'
};

export function ResultBadge({ result }: { result: TestResult }) {
  const cls = {
    pass: 'badge-pass', fail: 'badge-fail', blocked: 'badge-blocked', not_run: 'badge-notrun'
  }[result] || 'badge-notrun';
  return <span className={`badge ${cls}`}>{RESULT_LABELS[result] ?? result}</span>;
}

export function PriorityBadge({ priority }: { priority: Priority }) {
  const cls = {
    critical: 'badge-critical', high: 'badge-high', medium: 'badge-medium', low: 'badge-low'
  }[priority] || 'badge-medium';
  return <span className={`badge ${cls}`}>{PRIORITY_LABELS[priority] ?? priority}</span>;
}

export function PrepBadge({ status }: { status: PrepStatus }) {
  const cls = { draft: 'badge-draft', in_progress: 'badge-inprogress', ready: 'badge-ready' }[status] || 'badge-draft';
  return <span className={`badge ${cls}`}>{PREP_LABELS[status] ?? status}</span>;
}

export function LifecycleBadge({ status }: { status: LifecycleStatus }) {
  const cls = { draft: 'badge-draft', active: 'badge-active', obsolete: 'badge-obsolete', archived: 'badge-archived' }[status] || 'badge-active';
  return <span className={`badge ${cls}`}>{LIFECYCLE_LABELS[status] ?? status}</span>;
}

export function TypeBadge({ type }: { type: TestType }) {
  return <span className="badge badge-blue">{TYPE_LABELS[type] ?? type}</span>;
}

export function ProgressBar({ value, max, color = 'primary' }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div>
      <div className="progress-bar">
        <div
          className={`progress-fill progress-fill-${color}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
        <span style={{ fontSize: 11, color: 'var(--foreground-muted)' }}>{value} / {max}</span>
        <span style={{ fontSize: 11, fontWeight: 600, color: 'var(--foreground)' }}>
          {max === 0 ? 'N/A' : `${pct}%`}
        </span>
      </div>
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="empty-state">
      {icon && <div className="empty-icon">{icon}</div>}
      <div className="empty-title">{title}</div>
      {description && <div className="empty-desc">{description}</div>}
      {action}
    </div>
  );
}

export function LoadingSpinner({ size = 'default' }: { size?: 'default' | 'lg' }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}>
      <div className={`spinner ${size === 'lg' ? 'spinner-lg' : ''}`} />
    </div>
  );
}

export function Pagination({
  page, totalPages, onPageChange
}: { page: number; totalPages: number; onPageChange: (p: number) => void }) {
  if (totalPages <= 1) return null;
  
  const pages = [];
  for (let i = Math.max(1, page - 2); i <= Math.min(totalPages, page + 2); i++) {
    pages.push(i);
  }

  return (
    <div className="pagination">
      <button className="page-btn" disabled={page === 1} onClick={() => onPageChange(page - 1)}>‹</button>
      {pages[0] > 1 && <>
        <button className="page-btn" onClick={() => onPageChange(1)}>1</button>
        {pages[0] > 2 && <span style={{ color: 'var(--foreground-muted)', padding: '0 4px' }}>…</span>}
      </>}
      {pages.map(p => (
        <button key={p} className={`page-btn ${p === page ? 'active' : ''}`} onClick={() => onPageChange(p)}>{p}</button>
      ))}
      {pages[pages.length - 1] < totalPages && <>
        {pages[pages.length - 1] < totalPages - 1 && <span style={{ color: 'var(--foreground-muted)', padding: '0 4px' }}>…</span>}
        <button className="page-btn" onClick={() => onPageChange(totalPages)}>{totalPages}</button>
      </>}
      <button className="page-btn" disabled={page === totalPages} onClick={() => onPageChange(page + 1)}>›</button>
    </div>
  );
}
