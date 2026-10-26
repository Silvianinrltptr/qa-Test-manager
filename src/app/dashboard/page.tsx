'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { ProgressBar, ResultBadge, LoadingSpinner } from '@/components/ui/Shared';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';
import { useI18n } from '@/lib/i18n/context';
import {
  ClipboardList, CheckCircle2, XCircle, ShieldAlert, Clock,
  TrendingUp, AlertTriangle, Activity, RefreshCw, Copy, Check,
  PieChart as PieIcon, BarChart2, FileCheck2, Network
} from 'lucide-react';
import Link from 'next/link';
import {
  ResponsiveContainer, PieChart, Pie, Cell,
  BarChart, Bar, XAxis, YAxis, Tooltip, Legend
} from 'recharts';
import type { DashboardMetrics } from '@/lib/types';

export default function DashboardPage() {
  const { t, formatDate, locale } = useI18n();
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);

  const fetchMetrics = async () => {
    try {
      const res = await fetch('/api/dashboard');
      if (res.ok) setMetrics(await res.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchMetrics(); }, []);

  const generateSummary = () => {
    if (!metrics) return '';
    const { prepProgress, execProgress, passRate, results } = metrics;
    const today = new Date().toLocaleDateString(locale === 'id' ? 'id-ID' : 'en-US', { day: 'numeric', month: 'long', year: 'numeric' });
    const isId = locale === 'id';
    return isId
      ? `📊 *Pembaruan QA - ${today}*

📋 *Total Test Case Aktif:* ${metrics.totalActive}

✅ *Persiapan Pengujian:* ${prepProgress.pct ?? 'N/A'}% (${prepProgress.ready}/${prepProgress.total} siap dieksekusi)

▶️ *Eksekusi Pengujian:* ${execProgress.pct ?? 'N/A'}% (${execProgress.executed}/${execProgress.readyTotal} dieksekusi)

📈 *Hasil Eksekusi:*
• Lolos (Pass): ${results.pass}
• Gagal (Fail): ${results.fail}
• Terblokir: ${results.blocked}
• Belum Dijalankan: ${results.not_run}
• Tingkat Kelolosan: ${passRate.pct ?? 'N/A'}%

🔄 *Perubahan Minggu Ini:*
• Ditambahkan: ${metrics.weeklyChange.added}
• Diperbarui: ${metrics.weeklyChange.updated}
• Kedaluwarsa: ${metrics.weeklyChange.obsolete}

${results.fail > 0 ? `⚠️ Terdapat ${results.fail} test case yang GAGAL dan memerlukan tindak lanjut.` : '✅ Tidak ada kegagalan yang dilaporkan.'}
${results.blocked > 0 ? `🚧 ${results.blocked} test case TERBLOKIR.` : ''}`
      : `📊 *QA Update - ${today}*

📋 *Total Active Test Cases:* ${metrics.totalActive}

✅ *Test Preparation:* ${prepProgress.pct ?? 'N/A'}% (${prepProgress.ready}/${prepProgress.total} ready for execution)

▶️ *Test Execution:* ${execProgress.pct ?? 'N/A'}% (${execProgress.executed}/${execProgress.readyTotal} executed)

📈 *Execution Results:*
• Pass: ${results.pass}
• Fail: ${results.fail}
• Blocked: ${results.blocked}
• Not Run: ${results.not_run}
• Pass Rate: ${passRate.pct ?? 'N/A'}%

🔄 *Changes This Week:*
• Added: ${metrics.weeklyChange.added}
• Updated: ${metrics.weeklyChange.updated}
• Obsolete: ${metrics.weeklyChange.obsolete}

${results.fail > 0 ? `⚠️ There are ${results.fail} test case(s) that FAILED and require follow-up.` : '✅ No failures reported.'}
${results.blocked > 0 ? `🚧 ${results.blocked} test case(s) BLOCKED.` : ''}`;
  };

  const copySummary = async () => {
    await navigator.clipboard.writeText(generateSummary());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) return <AppShell><LoadingSpinner size="lg" /></AppShell>;

  if (!metrics) {
    return (
      <AppShell>
        <div className="empty-state">
          <div className="empty-title">{t('dashboard.failedToLoad', 'Failed to load dashboard')}</div>
          <button className="btn btn-primary" onClick={() => { setLoading(true); fetchMetrics(); }}>{t('common.tryAgain', 'Try Again')}</button>
        </div>
      </AppShell>
    );
  }

  const { totalActive, byModule, prepProgress, execProgress, passRate, results, notReady, weeklyChange, recentActivity } = metrics;

  return (
    <AppShell>
      {/* Header */}
      <header className="page-header main-header">
        <div>
          <h1 className="page-title">{t('dashboard.title', 'Dashboard')}</h1>
          <p className="page-subtitle">{t('dashboard.subtitle', 'Real-time summary of your QA progress')}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="btn btn-secondary" onClick={() => { setLoading(true); fetchMetrics(); }}>
            <RefreshCw size={14} /> {t('common.refresh', 'Refresh')}
          </button>
          <button className="btn btn-primary" onClick={copySummary} id="btn-copy-summary">
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? t('dashboard.summaryCopied', 'Copied!') : t('dashboard.copySummary', 'Copy Summary')}
          </button>
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </header>

      {/* Metric Cards */}
      <div className="grid-4" style={{ marginBottom: 24 }}>
        <div className="metric-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--primary)' }}>
            <ClipboardList size={18} />
            <span className="metric-label">{t('dashboard.totalActive', 'Total Active')}</span>
          </div>
          <div className="metric-value">{totalActive}</div>
          <div style={{ fontSize: 12, color: 'var(--foreground-muted)' }}>
            {notReady} {t('dashboard.readyForExec', 'ready for execution')}
          </div>
        </div>

        <div className="metric-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--success)' }}>
            <CheckCircle2 size={18} />
            <span className="metric-label">{t('common.resultPass', 'Pass')}</span>
          </div>
          <div className="metric-value" style={{ color: 'var(--success)' }}>{results.pass}</div>
          <div style={{ fontSize: 12, color: 'var(--foreground-muted)' }}>
            {t('dashboard.passRate', 'Pass Rate')}: {passRate.pct != null ? `${passRate.pct}%` : 'N/A'}
          </div>
        </div>

        <div className="metric-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--error)' }}>
            <XCircle size={18} />
            <span className="metric-label">{t('common.resultFail', 'Fail')}</span>
          </div>
          <div className="metric-value" style={{ color: results.fail > 0 ? 'var(--error)' : 'var(--foreground)' }}>
            {results.fail}
          </div>
          <div style={{ fontSize: 12, color: 'var(--foreground-muted)' }}>
            {results.fail > 0 ? t('dashboard.failedFollowupNotice', 'Requires follow-up') : t('dashboard.noFailuresNotice', 'No failures')}
          </div>
        </div>

        <div className="metric-card">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--warning)' }}>
            <ShieldAlert size={18} />
            <span className="metric-label">{t('common.resultBlocked', 'Blocked')}</span>
          </div>
          <div className="metric-value" style={{ color: results.blocked > 0 ? 'var(--warning)' : 'var(--foreground)' }}>
            {results.blocked}
          </div>
          <div style={{ fontSize: 12, color: 'var(--foreground-muted)' }}>
            {results.not_run} {t('common.resultNotRun', 'not run')}
          </div>
        </div>
      </div>

      <div className="grid-2" style={{ marginBottom: 24 }}>
        {/* Progress Section */}
        <div className="card">
          <div className="section-header">
            <h3 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <TrendingUp size={16} style={{ color: 'var(--primary)' }} />
              {t('dashboard.testPrepProgress', 'Progress')}
            </h3>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{t('dashboard.testPrepProgress', 'Test Preparation')}</span>
                <span style={{ fontSize: 13, color: 'var(--foreground-muted)' }}>
                  {prepProgress.pct != null ? `${prepProgress.pct}%` : 'N/A'}
                </span>
              </div>
              <ProgressBar value={prepProgress.ready} max={prepProgress.total} color="primary" />
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{t('dashboard.testExecProgress', 'Test Execution')}</span>
                <span style={{ fontSize: 13, color: 'var(--foreground-muted)' }}>
                  {execProgress.pct != null ? `${execProgress.pct}%` : 'N/A'}
                </span>
              </div>
              <ProgressBar value={execProgress.executed} max={execProgress.readyTotal} color="success" />
            </div>
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 500 }}>{t('dashboard.passRate', 'Pass Rate')}</span>
                <span style={{ fontSize: 13, color: 'var(--foreground-muted)' }}>
                  {passRate.pct != null ? `${passRate.pct}%` : 'N/A'}
                </span>
              </div>
              <ProgressBar value={passRate.pass} max={passRate.total} color="success" />
            </div>
          </div>
        </div>

        {/* Weekly Changes */}
        <div className="card">
          <div className="section-header">
            <h3 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Activity size={16} style={{ color: 'var(--accent)' }} />
              {t('dashboard.changesThisWeek', 'Changes in Last 7 Days')}
            </h3>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            {[
              { label: t('dashboard.added', 'Added'), value: weeklyChange.added, color: 'var(--success)' },
              { label: t('dashboard.updated', 'Updated'), value: weeklyChange.updated, color: 'var(--primary)' },
              { label: t('dashboard.obsolete', 'Obsolete'), value: weeklyChange.obsolete, color: 'var(--foreground-muted)' },
              { label: t('common.statusActive', 'Reactivated'), value: weeklyChange.reactivated, color: 'var(--accent)' },
            ].map(item => (
              <div key={item.label} style={{
                background: 'var(--surface-2)', borderRadius: 8, padding: '12px 16px',
                borderLeft: `3px solid ${item.color}`
              }}>
                <div style={{ fontSize: 22, fontWeight: 700, color: item.color }}>{item.value}</div>
                <div style={{ fontSize: 11, color: 'var(--foreground-muted)', marginTop: 2 }}>{item.label}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Visual Analytics Charts */}
      {totalActive > 0 && (
        <div className="grid-2" style={{ marginBottom: 24 }}>
          {/* Result Distribution Donut Chart */}
          <div className="card">
            <div className="section-header">
              <h3 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <PieIcon size={16} style={{ color: 'var(--primary)' }} />
                Execution Results Distribution
              </h3>
            </div>
            <div style={{ width: '100%', height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { name: 'Pass', value: results.pass, color: '#34d399' },
                      { name: 'Fail', value: results.fail, color: '#f87171' },
                      { name: 'Blocked', value: results.blocked, color: '#fbbf24' },
                      { name: 'Not Run', value: results.not_run, color: '#64748b' },
                    ].filter(d => d.value > 0)}
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {[
                      { name: 'Pass', color: '#34d399' },
                      { name: 'Fail', color: '#f87171' },
                      { name: 'Blocked', color: '#fbbf24' },
                      { name: 'Not Run', color: '#64748b' },
                    ].map(entry => (
                      <Cell key={entry.name} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', borderRadius: 8, color: 'var(--foreground)' }}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Module Comparison Bar Chart */}
          <div className="card">
            <div className="section-header">
              <h3 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <BarChart2 size={16} style={{ color: 'var(--accent)' }} />
                Results by Module
              </h3>
            </div>
            <div style={{ width: '100%', height: 240 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={byModule.map(m => ({
                  name: m.prefix || m.module,
                  Pass: m.pass || 0,
                  Fail: m.fail || 0,
                  Blocked: m.blocked || 0,
                }))}>
                  <XAxis dataKey="name" stroke="var(--foreground-muted)" fontSize={11} />
                  <YAxis stroke="var(--foreground-muted)" fontSize={11} allowDecimals={false} />
                  <Tooltip
                    contentStyle={{ backgroundColor: 'var(--surface)', borderColor: 'var(--border)', borderRadius: 8, color: 'var(--foreground)' }}
                  />
                  <Legend />
                  <Bar dataKey="Pass" fill="#34d399" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Fail" fill="#f87171" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Blocked" fill="#fbbf24" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {/* By Module */}
      {byModule.length > 0 && (
        <div className="card" style={{ marginBottom: 24 }}>
          <div className="section-header">
            <h3 className="section-title">{t('dashboard.progressByModule', 'Progress by Module')}</h3>
          </div>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th>{t('common.module', 'Module')}</th>
                  <th>{t('common.total', 'Total')}</th>
                  <th>{t('common.statusReady', 'Ready')}</th>
                  <th>{t('dashboard.testExecProgress', 'Executed')}</th>
                  <th>{t('common.resultPass', 'Pass')}</th>
                  <th>{t('common.resultFail', 'Fail')}</th>
                  <th>{t('common.resultBlocked', 'Blocked')}</th>
                  <th>{t('dashboard.testPrepProgress', 'Preparation')}</th>
                </tr>
              </thead>
              <tbody>
                {byModule.map(mod => (
                  <tr key={mod.module}>
                    <td>
                      <div style={{ fontWeight: 600 }}>{mod.module}</div>
                      <div style={{ fontSize: 11, color: 'var(--foreground-muted)' }}>{mod.prefix}</div>
                    </td>
                    <td>{mod.total}</td>
                    <td style={{ color: 'var(--success)' }}>{mod.ready}</td>
                    <td>{mod.executed}</td>
                    <td style={{ color: 'var(--success)' }}>{mod.pass}</td>
                    <td style={{ color: mod.fail > 0 ? 'var(--error)' : 'inherit' }}>{mod.fail}</td>
                    <td style={{ color: mod.blocked > 0 ? 'var(--warning)' : 'inherit' }}>{mod.blocked}</td>
                    <td style={{ minWidth: 120 }}>
                      <ProgressBar value={mod.ready} max={mod.total} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Recent Activity */}
      {recentActivity.length > 0 && (
        <div className="card">
          <div className="section-header">
            <h3 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <Clock size={16} style={{ color: 'var(--foreground-muted)' }} />
              {t('dashboard.recentActivity', 'Recent Activity')}
            </h3>
          </div>
          <div className="timeline">
            {recentActivity.slice(0, 8).map(activity => (
              <div key={activity.id} className="timeline-item">
                <div className="timeline-dot">
                  <Activity size={12} style={{ color: 'var(--primary)' }} />
                </div>
                <div className="timeline-content">
                  <div style={{ fontSize: 13, fontWeight: 500 }}>
                    {activity.description}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--foreground-muted)', marginTop: 2 }}>
                    {formatDate(activity.created_at, { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {totalActive === 0 && (
        <div className="card" style={{ marginTop: 24 }}>
          <div className="empty-state">
            <div className="empty-icon"><ClipboardList size={28} /></div>
            <div className="empty-title">{t('dashboard.emptyActivity', 'No Test Cases Yet')}</div>
            <div className="empty-desc">
              {locale === 'id' 
                ? 'Mulai dengan membuat modul dan fitur, lalu tambahkan test case melalui Generator AI, Tambah Massal, atau Impor.'
                : 'Get started by creating modules and features, then add test cases via AI Generator, Bulk Add, or Import.'}
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <a href="/modules" className="btn btn-primary">{t('modules.createModule', 'Create Module')}</a>
              <a href="/ai-generator" className="btn btn-secondary">{t('nav.aiGenerator', 'AI Generator')}</a>
            </div>
          </div>
        </div>
      )}

      {/* QA Summary Box */}
      {totalActive > 0 && (
        <div className="summary-box" style={{ marginTop: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--primary)' }}>📊 {t('dashboard.copySummary', 'QA Summary (for PM)')}</div>
            <button className="btn btn-sm btn-secondary" onClick={copySummary}>
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? t('dashboard.summaryCopied', 'Copied') : t('common.copy', 'Copy')}
            </button>
          </div>
          <pre style={{ fontSize: 12, color: 'var(--foreground-muted)', whiteSpace: 'pre-wrap', lineHeight: 1.7, fontFamily: 'inherit' }}>
            {generateSummary()}
          </pre>
        </div>
      )}
    </AppShell>
  );
}
