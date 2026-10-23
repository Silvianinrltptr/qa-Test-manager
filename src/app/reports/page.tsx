'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { ResultBadge, LoadingSpinner, EmptyState, ProgressBar } from '@/components/ui/Shared';
import {
  FileText, Calendar, Filter, Printer, Download,
  CheckCircle2, XCircle, ShieldAlert, Activity, Bug, ArrowRight
} from 'lucide-react';
import Link from 'next/link';
import type { Module, Feature } from '@/lib/types';

export default function ReportsPage() {
  const [period, setPeriod] = useState<'daily' | 'weekly' | 'monthly' | 'custom'>('weekly');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [moduleId, setModuleId] = useState('');
  const [featureId, setFeatureId] = useState('');
  const [modules, setModules] = useState<Module[]>([]);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [reportData, setReportData] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Initialize dates
  useEffect(() => {
    const now = new Date();
    const fmt = (d: Date) => d.toISOString().split('T')[0];
    const past7 = new Date(now); past7.setDate(past7.getDate() - 7);
    setStartDate(fmt(past7));
    setEndDate(fmt(now));

    fetch('/api/modules').then(r => r.json()).then(setModules);
    fetch('/api/features').then(r => r.json()).then(setFeatures);
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
    setLoading(true);
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

  const filteredFeatures = features.filter(f => !moduleId || f.module_id === Number(moduleId));

  const handlePrint = () => {
    window.print();
  };

  return (
    <AppShell>
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <FileText size={20} style={{ color: 'var(--primary)' }} />
            Laporan QA Berdasarkan Periode
          </h1>
          <p className="page-subtitle">
            Laporan harian, mingguan, bulanan, atau rentang tanggal kustom yang membedakan kondisi riil saat ini dari aktivitas periode
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" onClick={handlePrint} id="btn-print-report">
            <Printer size={14} /> Cetak / Simpan PDF
          </button>
        </div>
      </div>

      {/* Filter and Period Selection */}
      <div className="card card-sm" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* Period tabs */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {[
              { id: 'daily', label: 'Hari Ini (Harian)' },
              { id: 'weekly', label: '7 Hari Terakhir (Mingguan)' },
              { id: 'monthly', label: '30 Hari Terakhir (Bulanan)' },
              { id: 'custom', label: 'Rentang Khusus (Custom)' },
            ].map(tab => (
              <button
                key={tab.id}
                className={`btn btn-sm ${period === tab.id ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => handlePeriodChange(tab.id as any)}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Date Picker & Module Filters */}
          <div className="filters-bar" style={{ paddingTop: 8, borderTop: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, color: 'var(--foreground-muted)' }}>Dari:</span>
              <input
                type="date"
                className="form-control"
                style={{ width: 145 }}
                value={startDate}
                onChange={e => { setPeriod('custom'); setStartDate(e.target.value); }}
              />
              <span style={{ fontSize: 13, color: 'var(--foreground-muted)' }}>Sampai:</span>
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
              <option value="">Semua Modul</option>
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
              <option value="">Semua Fitur</option>
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
        <EmptyState title="Gagal memuat laporan" description="Silakan periksa filter tanggal Anda" />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Section A: Current Totals */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--foreground-muted)', marginBottom: 12 }}>
              A. Kondisi Akumulatif Saat Ini (Current Totals)
            </div>
            <div className="grid-3">
              <div className="metric-card">
                <div className="metric-label">Total Test Case Aktif</div>
                <div className="metric-value">{reportData.currentTotals.active}</div>
                <div style={{ fontSize: 12, color: 'var(--foreground-muted)' }}>Kondisi tersimpan di DB</div>
              </div>

              <div className="metric-card">
                <div className="metric-label" style={{ color: 'var(--success)' }}>Siap Dieksekusi</div>
                <div className="metric-value" style={{ color: 'var(--success)' }}>{reportData.currentTotals.ready}</div>
                <div style={{ fontSize: 12, color: 'var(--foreground-muted)' }}>Status persiapan: Ready</div>
              </div>

              <div className="metric-card">
                <div className="metric-label" style={{ color: 'var(--foreground-muted)' }}>Test Case Usang (Obsolete)</div>
                <div className="metric-value">{reportData.currentTotals.obsolete}</div>
                <div style={{ fontSize: 12, color: 'var(--foreground-muted)' }}>Dikecualikan dari run aktif</div>
              </div>
            </div>
          </div>

          {/* Section B: Activities during selected period */}
          <div>
            <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--foreground-muted)', marginBottom: 12 }}>
              B. Aktivitas Pengujian Selama Periode ({new Date(reportData.startDate).toLocaleDateString('id-ID')} s/d {new Date(reportData.endDate).toLocaleDateString('id-ID')})
            </div>

            <div className="grid-4" style={{ marginBottom: 16 }}>
              <div className="metric-card">
                <div className="metric-label">Eksekusi Dijalankan</div>
                <div className="metric-value">{reportData.periodMetrics.totalExecutions}</div>
                <div style={{ fontSize: 12, color: 'var(--foreground-muted)' }}>
                  {reportData.periodMetrics.retests} di antaranya retest
                </div>
              </div>

              <div className="metric-card">
                <div className="metric-label" style={{ color: 'var(--success)' }}>Lolos (Pass)</div>
                <div className="metric-value" style={{ color: 'var(--success)' }}>{reportData.periodMetrics.pass}</div>
                <div style={{ fontSize: 12, color: 'var(--foreground-muted)' }}>
                  Pass rate periode: {reportData.periodMetrics.passRate != null ? `${reportData.periodMetrics.passRate}%` : 'N/A'}
                </div>
              </div>

              <div className="metric-card">
                <div className="metric-label" style={{ color: 'var(--error)' }}>Gagal (Fail)</div>
                <div className="metric-value" style={{ color: reportData.periodMetrics.fail > 0 ? 'var(--error)' : 'var(--foreground)' }}>
                  {reportData.periodMetrics.fail}
                </div>
                <div style={{ fontSize: 12, color: 'var(--foreground-muted)' }}>Memerlukan perbaikan</div>
              </div>

              <div className="metric-card">
                <div className="metric-label" style={{ color: 'var(--warning)' }}>Blocked</div>
                <div className="metric-value" style={{ color: reportData.periodMetrics.blocked > 0 ? 'var(--warning)' : 'var(--foreground)' }}>
                  {reportData.periodMetrics.blocked}
                </div>
                <div style={{ fontSize: 12, color: 'var(--foreground-muted)' }}>Terkendala blocker</div>
              </div>
            </div>

            {/* Change Metrics During Period */}
            <div className="card">
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 12 }}>
                🔄 Perubahan Aset QA Selama Periode Ini:
              </div>
              <div className="grid-4">
                <div style={{ padding: '10px 14px', background: 'var(--surface-2)', borderRadius: 8 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--success)' }}>
                    +{reportData.periodMetrics.tcCreated}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--foreground-muted)', marginTop: 2 }}>
                    Test Case Baru Dibuat
                  </div>
                </div>

                <div style={{ padding: '10px 14px', background: 'var(--surface-2)', borderRadius: 8 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--primary)' }}>
                    {reportData.periodMetrics.tcUpdated}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--foreground-muted)', marginTop: 2 }}>
                    Test Case Diperbarui
                  </div>
                </div>

                <div style={{ padding: '10px 14px', background: 'var(--surface-2)', borderRadius: 8 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--foreground-muted)' }}>
                    {reportData.periodMetrics.tcObsolete}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--foreground-muted)', marginTop: 2 }}>
                    Test Case Di-Obsolete
                  </div>
                </div>

                <div style={{ padding: '10px 14px', background: 'var(--surface-2)', borderRadius: 8 }}>
                  <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--accent)' }}>
                    {reportData.periodMetrics.reqChanges}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--foreground-muted)', marginTop: 2 }}>
                    Perubahan Requirement
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Section C: Defects Identified */}
          {reportData.defects && reportData.defects.length > 0 && (
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--foreground-muted)', marginBottom: 12 }}>
                C. Daftar Temuan Defect / Bug Selama Periode ({reportData.defects.length})
              </div>
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 120 }}>Ref Defect</th>
                      <th style={{ width: 110 }}>Test Case</th>
                      <th>Judul Test Case</th>
                      <th style={{ width: 90 }}>Hasil</th>
                      <th style={{ width: 120 }}>Environment</th>
                      <th>Temuan Aktual / Catatan</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.defects.map((def: any, idx: number) => (
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
              D. Log Eksekusi pada Periode Ini ({reportData.executions?.length || 0})
            </div>
            {reportData.executions?.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '30px', color: 'var(--foreground-muted)' }}>
                Tidak ada eksekusi tercatat dalam rentang tanggal ini.
              </div>
            ) : (
              <div className="table-container">
                <table>
                  <thead>
                    <tr>
                      <th style={{ width: 140 }}>Waktu Eksekusi</th>
                      <th style={{ width: 100 }}>Case ID</th>
                      <th>Judul Test Case</th>
                      <th style={{ width: 140 }}>Modul / Fitur</th>
                      <th style={{ width: 90 }}>Hasil</th>
                      <th style={{ width: 110 }}>Environment</th>
                      <th style={{ width: 80 }}>Retest?</th>
                      <th>Catatan / Defect</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reportData.executions.map((ex: any) => (
                      <tr key={ex.id}>
                        <td style={{ fontSize: 12, color: 'var(--foreground-muted)' }}>
                          {new Date(ex.exec_date).toLocaleString('id-ID')}
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
