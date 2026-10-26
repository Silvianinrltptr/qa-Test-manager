'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { ResultBadge, LoadingSpinner, EmptyState, Pagination } from '@/components/ui/Shared';
import { useToast } from '@/components/ui/Toast';
import { Play, Download, Search } from 'lucide-react';
import type { TestCase, Module, Feature, Execution } from '@/lib/types';
import { useI18n } from '@/lib/i18n/context';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';

export default function ExecutionPage() {
  const toast = useToast();
  const { t, locale } = useI18n();
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [loading, setLoading] = useState(true);
  const [recentExecs, setRecentExecs] = useState<Execution[]>([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 20, totalPages: 1 });
  const [execCase, setExecCase] = useState<TestCase | null>(null);
  const [saving, setSaving] = useState(false);
  const [filters, setFilters] = useState({ moduleId: '', featureId: '', search: '', prepStatus: 'ready' });
  const [execForm, setExecForm] = useState({ result: '', environment: '', actual_result: '', defect_ref: '', notes: '', is_retest: false });

  const fetchData = async (page = 1) => {
    const params = new URLSearchParams({
      page: String(page), limit: '20', prepStatus: filters.prepStatus || '',
      lifecycle: 'active',
      lang: locale,
      ...(filters.moduleId && { moduleId: filters.moduleId }),
      ...(filters.featureId && { featureId: filters.featureId }),
      ...(filters.search && { search: filters.search }),
    });
    try {
      const [tcRes, exRes] = await Promise.all([
        fetch(`/api/test-cases?${params}`),
        fetch('/api/executions'),
      ]);
      if (tcRes.ok) { const d = await tcRes.json(); setTestCases(d.data); setPagination(d.pagination); }
      if (exRes.ok) setRecentExecs(await exRes.json());
    } finally { setLoading(false); }
  };

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

  useEffect(() => { fetchData(1); }, [filters, locale]);

  const safeFeatures = Array.isArray(features) ? features : [];
  const filteredFeatures = safeFeatures.filter(f => !filters.moduleId || f.module_id === Number(filters.moduleId));

  const openExec = (tc: TestCase) => {
    setExecCase(tc);
    setExecForm({ result: '', environment: '', actual_result: '', defect_ref: '', notes: '', is_retest: false });
  };

  const saveExecution = async () => {
    if (!execForm.result) { toast.error('Select execution result'); return; }
    if (!execCase) return;
    setSaving(true);
    try {
      const res = await fetch('/api/executions', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ test_case_id: execCase.id, ...execForm })
      });
      if (res.ok) {
        toast.success(`Execution saved: ${execForm.result.toUpperCase()}`);
        setExecCase(null);
        fetchData(pagination.page);
      }
    } finally { setSaving(false); }
  };

  return (
    <AppShell>
      <header className="page-header main-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Play size={20} style={{ color: 'var(--success)' }} />
            {t('execution.title', 'Test Execution')}
          </h1>
          <p className="page-subtitle">{t('execution.subtitle', 'Record test case execution results')}</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <a href="/api/export?type=executions" download="executions.csv" className="btn btn-secondary">
            <Download size={14} /> CSV
          </a>
          <a href="/api/export?type=executions&format=xlsx" download="executions.xlsx" className="btn btn-secondary">
            <Download size={14} /> Excel (.xlsx)
          </a>
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </header>

      {/* Filters */}
      <div className="card card-sm" style={{ marginBottom: 16 }}>
        <div className="filters-bar">
          <div className="search-bar" style={{ flex: 1, minWidth: 180 }}>
            <Search size={14} className="search-icon" />
            <input className="form-control" placeholder={t('common.search', 'Search test cases...')} value={filters.search}
              onChange={e => setFilters(p => ({ ...p, search: e.target.value }))} />
          </div>
          <select className="form-control" style={{ width: 160 }} value={filters.moduleId}
            onChange={e => setFilters(p => ({ ...p, moduleId: e.target.value, featureId: '' }))}>
            <option value="">{t('common.all', 'All Modules')}</option>
            {modules.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
          </select>
          <select className="form-control" style={{ width: 160 }} value={filters.featureId}
            onChange={e => setFilters(p => ({ ...p, featureId: e.target.value }))}>
            <option value="">{t('common.all', 'All Features')}</option>
            {filteredFeatures.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
          </select>
          <select className="form-control" style={{ width: 160 }} value={filters.prepStatus}
            onChange={e => setFilters(p => ({ ...p, prepStatus: e.target.value }))}>
            <option value="">{t('common.all', 'All Prep Statuses')}</option>
            <option value="ready">Ready for Execution</option>
            <option value="in_progress">In Progress</option>
            <option value="draft">Draft</option>
          </select>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 360px', gap: 20, alignItems: 'start' }}>
        {/* Test case list */}
        <div>
          {loading ? <LoadingSpinner /> : testCases.length === 0 ? (
            <EmptyState
              icon={<Play size={28} />}
              title={t('common.noData', 'No test cases found')}
              description={t('execution.noCasesReady', "Change filters or mark test cases as 'Ready for Execution'")}
            />
          ) : (
            <>
              <div className="table-container" style={{ marginBottom: 12 }}>
                <table>
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>Title</th>
                      <th>Module / Feature</th>
                      <th>Priority</th>
                      <th>Latest Result</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {testCases.map(tc => (
                      <tr key={tc.id} style={{ background: execCase?.id === tc.id ? 'rgba(79,124,255,0.05)' : undefined }}>
                        <td><code style={{ fontSize: 12 }}>{tc.case_id}</code></td>
                        <td>
                          <div style={{ fontWeight: 500, maxWidth: 250, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {tc.title}
                          </div>
                        </td>
                        <td>
                          <div style={{ fontSize: 12 }}>{tc.module_name}</div>
                          <div style={{ fontSize: 11, color: 'var(--foreground-muted)' }}>{tc.feature_name}</div>
                        </td>
                        <td>
                          <span className={`badge badge-${tc.priority}`}>{tc.priority}</span>
                        </td>
                        <td><ResultBadge result={tc.latest_result} /></td>
                        <td>
                          <button
                            className="btn btn-success btn-sm"
                            onClick={() => openExec(tc)}
                            id={`btn-exec-${tc.id}`}
                          >
                            <Play size={12} /> Execute
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pagination page={pagination.page} totalPages={pagination.totalPages} onPageChange={p => fetchData(p)} />
            </>
          )}
        </div>

        {/* Execution Form + Recent */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {execCase ? (
            <div className="card">
              <div style={{ fontWeight: 600, marginBottom: 12 }}>
                📋 {execCase.case_id}
              </div>
              <div style={{ fontSize: 13, color: 'var(--foreground-muted)', marginBottom: 16, lineHeight: 1.4 }}>
                {execCase.title}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <div className="form-group">
                  <label className="form-label">Result <span style={{ color: 'var(--error)' }}>*</span></label>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                    {[
                      { value: 'pass', label: '✅ Pass', color: 'var(--success)' },
                      { value: 'fail', label: '❌ Fail', color: 'var(--error)' },
                      { value: 'blocked', label: '🚧 Blocked', color: 'var(--warning)' },
                      { value: 'not_run', label: '⬜ Not Run', color: 'var(--foreground-muted)' },
                    ].map(opt => (
                      <button
                        key={opt.value}
                        className={`btn btn-sm ${execForm.result === opt.value ? 'btn-primary' : 'btn-secondary'}`}
                        style={{ justifyContent: 'center', borderColor: execForm.result === opt.value ? opt.color : undefined }}
                        onClick={() => setExecForm(p => ({ ...p, result: opt.value }))}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className="form-group">
                  <label className="form-label">Environment</label>
                  <input className="form-control" placeholder="Staging / Production / Dev"
                    value={execForm.environment} onChange={e => setExecForm(p => ({ ...p, environment: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Actual Result</label>
                  <textarea className="form-control" rows={3} placeholder="What actually occurred"
                    value={execForm.actual_result} onChange={e => setExecForm(p => ({ ...p, actual_result: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Defect Reference</label>
                  <input className="form-control" placeholder="BUG-001"
                    value={execForm.defect_ref} onChange={e => setExecForm(p => ({ ...p, defect_ref: e.target.value }))} />
                </div>
                <div className="form-group">
                  <label className="form-label">Notes</label>
                  <textarea className="form-control" rows={2}
                    value={execForm.notes} onChange={e => setExecForm(p => ({ ...p, notes: e.target.value }))} />
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <input type="checkbox" id="exec-retest" checked={execForm.is_retest}
                    onChange={e => setExecForm(p => ({ ...p, is_retest: e.target.checked }))} />
                  <label htmlFor="exec-retest" style={{ fontSize: 13 }}>Retest</label>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-secondary" onClick={() => setExecCase(null)} style={{ flex: 1 }}>Cancel</button>
                  <button className="btn btn-primary" onClick={saveExecution} disabled={saving || !execForm.result} style={{ flex: 1 }} id="btn-confirm-execution">
                    {saving ? <span className="spinner" /> : 'Save'}
                  </button>
                </div>
              </div>
            </div>
          ) : (
            <div className="card">
              <div className="empty-state" style={{ padding: '30px 20px' }}>
                <div className="empty-icon"><Play size={22} /></div>
                <div className="empty-title" style={{ fontSize: 14 }}>Select a test case</div>
                <div className="empty-desc" style={{ fontSize: 12 }}>Click the Execute button on any test case row</div>
              </div>
            </div>
          )}

          {/* Recent Executions */}
          {recentExecs.length > 0 && (
            <div className="card">
              <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>Recent Executions</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {recentExecs.slice(0, 8).map(ex => (
                  <div key={ex.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
                    <div>
                      <div style={{ fontSize: 12, fontWeight: 500 }}>{ex.case_id}</div>
                      <div style={{ fontSize: 11, color: 'var(--foreground-muted)' }}>
                        {new Date(ex.exec_date).toLocaleDateString('en-US')}
                        {ex.environment && ` · ${ex.environment}`}
                      </div>
                    </div>
                    <ResultBadge result={ex.result} />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
