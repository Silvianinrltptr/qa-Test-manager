'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { ResultBadge, LoadingSpinner, EmptyState, ProgressBar } from '@/components/ui/Shared';
import {
  FileText, Calendar, Filter, Printer, Download,
  CheckCircle2, XCircle, ShieldAlert, Activity, Bug, ArrowRight
} from 'lucide-react';
import Link from 'next/link';
import type { Module, Feature, TestResult } from '@/lib/types';

interface DefectItem {
  defect_ref: string;
  case_id: string;
  title: string;
  result: TestResult;
  environment: string | null;
  actual_result: string | null;
  notes: string | null;
}

interface PeriodExecutionItem {
  id: number;
  test_case_id: number;
  exec_date: string;
  environment: string | null;
  actual_result: string | null;
  result: TestResult;
  defect_ref: string | null;
  notes: string | null;
  is_retest: number;
  case_id: string;
  title: string;
  priority: string;
  requirement_ref: string | null;
  module_name: string | null;
  feature_name: string | null;
}

interface ReportData {
  period: string;
  startDate: string;
  endDate: string;
  currentTotals: {
    active: number;
    ready: number;
    obsolete: number;
  };
  periodMetrics: {
    totalExecutions: number;
    pass: number;
    fail: number;
    blocked: number;
    passRate: number | null;
    retests: number;
    tcCreated: number;
    tcUpdated: number;
    tcObsolete: number;
    reqChanges: number;
  };
  byModule: Array<{
    module: string;
    total: number;
    pass: number;
    fail: number;
    blocked: number;
  }>;
  defects: DefectItem[];
  executions: PeriodExecutionItem[];
}

export default function ReportsPage() {
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly' | 'custom'>('weekly');
  const [startDate, setStartDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return d.toISOString().split('T')[0];
  });
  const [endDate, setEndDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [moduleId, setModuleId] = useState('');
  const [featureId, setFeatureId] = useState('');
  const [modules, setModules] = useState<Module[]>([]);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);

  // Fetch modules and features
  useEffect(() => {
    fetch('/api/modules')
      .then(r => r.json())
      .then(d => setModules(Array.isArray(d) ? d : []))
      .catch(() => setModules([]));
    fetch('/api/features')
      .then(r => r.json())
      .then(d => setFeatures(Array.isArray(d) ? d : []))
      .catch(() => setFeatures([]));
  }, []);

  const handlePeriodChange = (p: 'daily' | 'weekly' | 'monthly' | 'custom') => {
    setPeriod(p);
    const now = new Date();
    const fmt = (d: Date) => d.toISOString().split('T')[0];

    if (p === 'daily') {
      setStartDate(fmt(now));
      setEndDate(fmt(now));
    } else if (p === 'weekly') {
      const d = new Date(now); d.setDate(d.getDate() - 7);
      setStartDate(fmt(d));
      setEndDate(fmt(now));
    } else if (p === 'monthly') {
      const d = new Date(now); d.setDate(d.getDate() - 30);
      setStartDate(fmt(d));
      setEndDate(fmt(now));
    }
  };

  const fetchReport = async () => {
    if (!startDate || !endDate) return;
    try {
      const params = new URLSearchParams({
        period,
        startDate,
        endDate,
        ...(moduleId && { moduleId }),
        ...(featureId && { featureId }),
      });
      const res = await fetch(`/api/reports?${params}`);
      if (res.ok) {
        setReportData(await res.json());
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (startDate && endDate) {
      fetchReport();
    }
  }, [period, startDate, endDate, moduleId, featureId]);

  const safeFeatures = Array.isArray(features) ? features : [];
  const filteredFeatures = safeFeatures.filter(f => !moduleId || f.module_id === Number(moduleId));

  const handlePrint = () => {
    window.print();
  };

  return (
    <AppShell>
      <header className="page-header main-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <FileText size={20} style={{ color: 'var(--primary)' }} />
            QA Period Reports
          </h1>
          <p className="page-subtitle">
            Daily, weekly, monthly, or custom date range reports distinguishing current actual state from period activities
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="btn btn-secondary" onClick={handlePrint} id="btn-print-report">
            <Printer size={14} /> Print / Save PDF
          </button>
          <ThemeToggle />
        </div>
      </header>

      {/* Filter and Period Selection */}
      <div className="card card-sm" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Period tabs */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[
              { id: 'daily', label: 'Today (Daily)' },
              { id: 'weekly', label: 'Last 7 Days (Weekly)' },
              { id: 'monthly', label: 'Last 30 Days (Monthly)' },
              { id: 'custom', label: 'Custom Range' },
            ].map(tab => (
              <button
                key={tab.id}
                className={`btn btn-sm ${period === tab.id ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => handlePeriodChange(tab.id as 'daily' | 'weekly' | 'monthly' | 'custom')}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Date Picker & Module Filters */}
          <div className="filters-bar" style={{ paddingTop: 8, borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, color: 'var(--foreground-muted)' }}>From:</span>
              <input
                type="date"
                className="form-control"
                style={{ width: 145 }}
                value={startDate}
                onChange={e => { setPeriod('custom'); setStartDate(e.target.value); }}
              />
              <span style={{ fontSize: 13, color: 'var(--foreground-muted)' }}>To:</span>
              <input
                type="date"
                className="form-control"
                style={{ width: 145 }}
                value={endDate}
                onChange={e => { setPeriod('custom'); setEndDate(e.target.value); }}
              />
            </div>

            <select
              className="form-control"
              style={{ width: 170 }}
              value={moduleId}
              onChange={e => { setModuleId(e.target.value); setFeatureId(''); }}
            >
              <option value="">All Modules</option>
              {modules.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>

            <select
              className="form-control"
              style={{ width: 170 }}
              value={featureId}
              onChange={e => setFeatureId(e.target.value)}
            >
              <option value="">All Features</option>
              {filteredFeatures.map(f => (
                <option key={f.id} value={f.id}>{f.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <LoadingSpinner size="lg" />
      ) : !reportData ? (
        <EmptyState title="Failed to load report" description="Please check your date filters" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Section A: Current Totals */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--foreground-muted)', marginBottom: 12 }}>
              A. Current Cumulative Totals
            </div>
            <div className="grid-3">
              <div className="metric-card">
                <div className="metric-label">Total Active Test Cases</div>
                <div className="metric-value">{reportData.currentTotals.active}</div>
                <div style={{ fontSize: 12, color: 'var(--foreground-muted)' }}>Current state in DB</div>
              </div>

              <div className="metric-card">
                <div className="metric-label" style={{ color: 'var(--success)' }}>Ready for Execution</div>
                <div className="metric-value" style={{ color: 'var(--success)' }}>{reportData.currentTotals.ready}</div>
                <div style={{ fontSize: 12, color: 'var(--foreground-muted)' }}>Preparation status: Ready</div>
              </div>

              <div className="metric-card">
                <div className="metric-label" style={{ color: 'var(--foreground-muted)' }}>Obsolete Test Cases</div>
                <div className="metric-value">{reportData.currentTotals.obsolete}</div>
                <div style={{ fontSize: 12, color: 'var(--foreground-muted)' }}>Excluded from active runs</div>
              </div>
            </div>
          </div>

          {/* Section B: Activities during selected period */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--foreground-muted)', marginBottom: 12 }}>
              B. Testing Activities During Period ({new Date(reportData.startDate).toLocaleDateString('en-US')} to {new Date(reportData.endDate).toLocaleDateString('en-US')})
            </div>

            <div className="grid-4" style={{ marginBottom: 16 }}>
              <div className="metric-card">
                <div className="metric-label">Executions Run</div>
                <div className="metric-value">{reportData.periodMetrics.totalExecutions}</div>
                <div style={{ fontSize: 12, color: 'var(--foreground-muted)' }}>
                  {reportData.periodMetrics.retests} retests included
                </div>
              </div>

              <div className="metric-card">
                <div className="metric-label" style={{ color: 'var(--success)' }}>Passed</div>
                <div className="metric-value" style={{ color: 'var(--success)' }}>{reportData.periodMetrics.pass}</div>
                <div style={{ fontSize: 12, color: 'var(--foreground-muted)' }}>
                  Period pass rate: {reportData.periodMetrics.passRate != null ? `${reportData.periodMetrics.passRate}%` : 'N/A'}
                </div>
              </div>

              <div className="metric-card">
                <div className="metric-label" style={{ color: 'var(--error)' }}>Failed</div>
                <div className="metric-value" style={{ color: reportData.periodMetrics.fail > 0 ? 'var(--error)' : 'var(--foreground)' }}>
                  {reportData.periodMetrics.fail}
                </div>
                <div style={{ fontSize: 12, color: 'var(--foreground-muted)' }}>Requires defect fix</div>
              </div>

              <div className="metric-card">
                <div className="metric-label" style={{ color: 'var(--warning)' }}>Blocked</div>
                <div className="metric-value" style={{ color: reportData.periodMetrics.blocked > 0 ? 'var(--warning)' : 'var(--foreground)' }}>
                  {reportData.periodMetrics.blocked}
                </div>
                <div style={{ fontSize: 12, color: 'var(--foreground-muted)' }}>Blocked by dependency</div>
              </div>
            </div>

            {/* Change Metrics During Period */}
            <div className="card">
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
                🔄 QA Asset Changes During This Period:
              </div>
              <div className="grid-4">
                <div style={{ padding: '10px 14px', background: 'var(--surface-2)', borderRadius: 8 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--success)' }}>
                    +{reportData.periodMetrics.tcCreated}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--foreground-muted)', marginTop: 2 }}>
                    New Test Cases Created
                  </div>
                </div>

                <div style={{ padding: '10px 14px', background: 'var(--surface-2)', borderRadius: 8 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--primary)' }}>
                    {reportData.periodMetrics.tcUpdated}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--foreground-muted)', marginTop: 2 }}>
                    Test Cases Updated
                  </div>
                </div>

                <div style={{ padding: '10px 14px', background: 'var(--surface-2)', borderRadius: 8 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--foreground-muted)' }}>
                    {reportData.periodMetrics.tcObsolete}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--foreground-muted)', marginTop: 2 }}>
                    Test Cases Marked Obsolete
                  </div>
                </div>

                <div style={{ padding: '10px 14px', background: 'var(--surface-2)', borderRadius: 8 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent)' }}>
                    {reportData.periodMetrics.reqChanges}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--foreground-muted)', marginTop: 2 }}>
                    Requirement Changes
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Section C: Defects Identified */}
          {reportData.defects && reportData.defects.length > 0 && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--foreground-muted)', marginBottom: 12 }}>
                C. Defects / Bugs Identified During Period ({reportData.defects.length})
              </div>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 120 }}>Defect Ref</th>
                      <th style={{ width: 110 }}>Test Case</th>
                      <th>Test Case Title</th>
                      <th style={{ width: 90 }}>Result</th>
                      <th style={{ width: 120 }}>Environment</th>
                      <th>Actual Findings / Notes</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.defects.map((def, idx: number) => (
                      <tr key={idx}>
                        <td><code style={{ color: 'var(--error)', fontWeight: 700 }}>{def.defect_ref}</code></td>
                        <td><code>{def.case_id}</code></td>
                        <td style={{ fontWeight: 500 }}>{def.title}</td>
                        <td><ResultBadge result={def.result} /></td>
                        <td style={{ fontSize: 12 }}>{def.environment || '—'}</td>
                        <td style={{ fontSize: 12, color: 'var(--foreground-muted)' }}>
                          {def.actual_result || def.notes || '—'}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Section D: Execution Log during period */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--foreground-muted)', marginBottom: 12 }}>
              D. Execution Log During This Period ({reportData.executions?.length || 0})
            </div>
            {reportData.executions?.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '30px', color: 'var(--foreground-muted)' }}>
                No executions recorded in this date range.
              </div>
            ) : (
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 140 }}>Execution Time</th>
                      <th style={{ width: 100 }}>Case ID</th>
                      <th>Test Case Title</th>
                      <th style={{ width: 140 }}>Module / Feature</th>
                      <th style={{ width: 90 }}>Result</th>
                      <th style={{ width: 110 }}>Environment</th>
                      <th style={{ width: 80 }}>Retest?</th>
                      <th>Notes / Defect</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.executions.map(ex => (
                      <tr key={ex.id}>
                        <td style={{ fontSize: 12, color: 'var(--foreground-muted)' }}>
                          {new Date(ex.exec_date).toLocaleString('en-US')}
                        </td>
                        <td><code style={{ fontSize: 12 }}>{ex.case_id}</code></td>
                        <td style={{ fontWeight: 500, fontSize: 13 }}>{ex.title}</td>
                        <td>
                          <div style={{ fontSize: 12 }}>{ex.module_name}</div>
                          <div style={{ fontSize: 11, color: 'var(--foreground-muted)' }}>{ex.feature_name}</div>
                        </td>
                        <td><ResultBadge result={ex.result} /></td>
                        <td style={{ fontSize: 12 }}>{ex.environment || '—'}</td>
                        <td>
                          {ex.is_retest ? (
                            <span className="badge badge-primary">Retest</span>
                          ) : (
                            <span style={{ color: 'var(--foreground-dim)' }}>—</span>
                          )}
                        </td>
                        <td style={{ fontSize: 12 }}>
                          {ex.defect_ref && (
                            <span style={{ color: 'var(--error)', fontWeight: 600, marginRight: 6 }}>
                              [{ex.defect_ref}]
                            </span>
                          )}
                          <span style={{ color: 'var(--foreground-muted)' }}>{ex.notes || ex.actual_result || '—'}</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </AppShell>
  );
}
