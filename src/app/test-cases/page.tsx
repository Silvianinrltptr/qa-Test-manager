'use client';

import { useEffect, useState, useCallback } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { Modal, ConfirmModal } from '@/components/ui/Modal';
import { ResultBadge, PriorityBadge, PrepBadge, LifecycleBadge, TypeBadge, EmptyState, LoadingSpinner, Pagination } from '@/components/ui/Shared';
import { useToast } from '@/components/ui/Toast';
import { Plus, Search, Filter, Download, Edit2, Eye, Trash2, ClipboardList, SortAsc, SortDesc, ChevronDown, X, Play, RotateCcw, Globe } from 'lucide-react';
import type { TestCase, Module, Feature, Execution, TestCaseComment } from '@/lib/types';
import { TEST_TYPES, PRIORITIES, PREP_STATUSES, LIFECYCLE_STATUSES } from '@/lib/types';
import { useI18n } from '@/lib/i18n/context';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';

interface TestCaseDetail {
  testCase?: TestCase;
  executions?: Execution[];
  comments?: TestCaseComment[];
}

function renderSortIcon(col: string, sortBy: string, sortDir: 'ASC' | 'DESC') {
  if (sortBy !== col) return null;
  return sortDir === 'ASC' ? <SortAsc size={12} /> : <SortDesc size={12} />;
}

const EXEC_RESULTS = [
  { value: '', label: 'All Results' },
  { value: 'pass', label: 'Pass' },
  { value: 'fail', label: 'Fail' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'not_run', label: 'Not Run' },
];

export default function TestCasesPage() {
  const toast = useToast();
  const { t, locale } = useI18n();
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 20, totalPages: 1 });
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [viewCase, setViewCase] = useState<TestCase | null>(null);
  const [editCase, setEditCase] = useState<TestCase | null>(null);
  const [execCase, setExecCase] = useState<TestCase | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TestCase | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [sortBy, setSortBy] = useState('created_at');
  const [sortDir, setSortDir] = useState<'ASC' | 'DESC'>('DESC');
  const [caseDetail, setCaseDetail] = useState<TestCaseDetail | null>(null);

  const [filters, setFilters] = useState({
    search: '', moduleId: '', featureId: '', priority: '', prepStatus: '',
    latestResult: '', testType: '', lifecycle: 'active',
  });

  const [form, setForm] = useState({
    module_id: '', feature_id: '', requirement_ref: '', title: '', test_type: 'functional',
    preconditions: '', test_steps: '', test_data: '', expected_result: '',
    priority: 'medium', prep_status: 'draft', notes: '', lifecycle_status: 'active',
    reason: '',
  });

  const [execForm, setExecForm] = useState({
    result: '', environment: '', actual_result: '', evidence: '', defect_ref: '', notes: '', is_retest: false,
  });

  const fetchData = useCallback(async (page = 1) => {
    try {
      const params = new URLSearchParams({
        page: String(page), limit: String(pagination.limit),
        sortBy, sortDir, lifecycle: filters.lifecycle,
        lang: locale,
        ...(filters.search && { search: filters.search }),
        ...(filters.moduleId && { moduleId: filters.moduleId }),
        ...(filters.featureId && { featureId: filters.featureId }),
        ...(filters.priority && { priority: filters.priority }),
        ...(filters.prepStatus && { prepStatus: filters.prepStatus }),
        ...(filters.latestResult && { latestResult: filters.latestResult }),
        ...(filters.testType && { testType: filters.testType }),
      });
      const res = await fetch(`/api/test-cases?${params}`);
      if (res.ok) {
        const data = await res.json();
        setTestCases(data.data);
        setPagination(data.pagination);
      }
    } finally { setLoading(false); }
  }, [filters, sortBy, sortDir, pagination.limit, locale]);

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

  useEffect(() => { fetchData(1); }, [filters, sortBy, sortDir, locale]);

  const safeFeatures = Array.isArray(features) ? features : [];
  const filteredFeatures = safeFeatures.filter(f => !filters.moduleId || f.module_id === Number(filters.moduleId));
  const formFeatures = safeFeatures.filter(f => !form.module_id || f.module_id === Number(form.module_id));

  const handleSort = (col: string) => {
    if (sortBy === col) setSortDir(d => d === 'ASC' ? 'DESC' : 'ASC');
    else { setSortBy(col); setSortDir('DESC'); }
  };

  const openCreate = () => {
    setForm({
      module_id: '', feature_id: '', requirement_ref: '', title: '', test_type: 'functional',
      preconditions: '', test_steps: '', test_data: '', expected_result: '',
      priority: 'medium', prep_status: 'draft', notes: '', lifecycle_status: 'active', reason: '',
    });
    setEditCase(null);
    setShowCreateModal(true);
  };

  const openEdit = (tc: TestCase) => {
    setEditCase(tc);
    setForm({
      module_id: String(tc.module_id), feature_id: String(tc.feature_id),
      requirement_ref: tc.requirement_ref || '', title: tc.title,
      test_type: tc.test_type, preconditions: tc.preconditions || '',
      test_steps: tc.test_steps || '', test_data: tc.test_data || '',
      expected_result: tc.expected_result || '', priority: tc.priority,
      prep_status: tc.prep_status, notes: tc.notes || '',
      lifecycle_status: tc.lifecycle_status, reason: '',
    });
    setShowCreateModal(true);
  };

  const openView = async (tc: TestCase) => {
    setViewCase(tc);
    const res = await fetch(`/api/test-cases/${tc.id}?lang=${locale}`);
    if (res.ok) setCaseDetail(await res.json());
  };

  const saveCase = async () => {
    if (!form.title.trim() || !form.module_id || !form.feature_id) {
      toast.error('Title, module, and feature are required'); return;
    }
    setSaving(true);
    try {
      const body = { ...form, module_id: Number(form.module_id), feature_id: Number(form.feature_id) };
      if (editCase) {
        const res = await fetch(`/api/test-cases/${editCase.id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body)
        });
        if (res.ok) { toast.success('Test case updated'); setShowCreateModal(false); fetchData(pagination.page); }
        else { const e = await res.json(); toast.error(e.error || 'Failed to save'); }
      } else {
        const res = await fetch('/api/test-cases', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ cases: [body] })
        });
        if (res.ok) { toast.success('Test case created successfully'); setShowCreateModal(false); fetchData(1); }
        else { const e = await res.json(); toast.error(e.error || 'Failed to save'); }
      }
    } finally { setSaving(false); }
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
      } else {
        const e = await res.json(); toast.error(e.error || 'Failed to save');
      }
    } finally { setSaving(false); }
  };

  const archiveCase = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/test-cases/${deleteTarget.id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Test case archived');
        setDeleteTarget(null);
        fetchData(pagination.page);
      }
    } finally { setSaving(false); }
  };

  const bulkMarkObsolete = async () => {
    for (const id of selected) {
      await fetch(`/api/test-cases/${id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lifecycle_status: 'obsolete' })
      });
    }
    toast.success(`${selected.size} test case${selected.size > 1 ? 's' : ''} marked as obsolete`);
    setSelected(new Set());
    fetchData(pagination.page);
  };

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    if (selected.size === testCases.length) setSelected(new Set());
    else setSelected(new Set(testCases.map(tc => tc.id)));
  };

  const exportData = (format: 'csv' | 'xlsx') => {
    const params = new URLSearchParams({
      type: 'test-cases',
      format,
      lang: locale,
      ...(filters.lifecycle && { lifecycle: filters.lifecycle }),
      ...(filters.moduleId && { moduleId: filters.moduleId }),
      ...(filters.featureId && { featureId: filters.featureId }),
    });
    const link = document.createElement('a');
    link.href = `/api/export?${params.toString()}`;
    link.setAttribute('download', `test_cases_${locale}.${format}`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleTranslateCurrent = async (id: number) => {
    setTranslating(true);
    try {
      const res = await fetch(`/api/test-cases/${id}/translate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetLang: locale === 'id' ? 'id' : 'en' })
      });
      if (res.ok) {
        toast.success(locale === 'id' ? 'Berhasil diterjemahkan ke Bahasa Indonesia' : 'Translated successfully');
        const detailRes = await fetch(`/api/test-cases/${id}?lang=${locale}`);
        if (detailRes.ok) {
          const detail = await detailRes.json();
          setCaseDetail(detail);
          setViewCase(detail.testCase);
        }
        fetchData(pagination.page);
      } else {
        const err = await res.json();
        toast.error(err.error || 'Translation failed');
      }
    } catch {
      toast.error('Translation network request failed');
    } finally {
      setTranslating(false);
    }
  };

  return (
    <AppShell>
      {/* Header */}
      <header className="page-header main-header" style={{ alignItems: 'flex-start' }}>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
          <h1 className="page-title" style={{ margin: 0, fontWeight: 700 }}>{t('testCases.title', 'Test Cases')}</h1>
          <p className="page-subtitle" style={{ margin: '6px 0 14px 0', fontSize: 13, color: 'var(--foreground-muted)' }}>
            {pagination.total} {t('common.testCases', 'Test Cases')} {filters.lifecycle !== 'all' ? `(${filters.lifecycle})` : ''}
          </p>
          <button className="btn btn-primary" onClick={openCreate} id="btn-create-testcase" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <Plus size={14} /> {t('testCases.createTestCase', 'New Test Case')}
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {selected.size > 0 && (
            <button className="btn btn-secondary btn-sm" onClick={bulkMarkObsolete}>
              <X size={13} /> {t('common.delete', 'Mark Obsolete')} ({selected.size})
            </button>
          )}
          <button className="btn btn-secondary" onClick={() => exportData('csv')} title="Export CSV (UTF-8)">
            <Download size={14} /> {t('common.export', 'Export')} CSV
          </button>
          <button className="btn btn-secondary" onClick={() => exportData('xlsx')} title="Export Excel format">
            <Download size={14} /> Excel (.xlsx)
          </button>
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </header>

      {/* Filters */}
      <div className="card card-sm" style={{ marginBottom: 16 }}>
        <div className="filters-bar">
          <div className="search-bar" style={{ flex: 1, minWidth: 200 }}>
            <Search size={14} className="search-icon" />
            <input
              className="form-control"
              placeholder={t('common.search', 'Search ID, title, ref...')}
              value={filters.search}
              onChange={e => setFilters(p => ({ ...p, search: e.target.value }))}
              id="search-testcases"
            />
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
          <select className="form-control" style={{ width: 140 }} value={filters.priority}
            onChange={e => setFilters(p => ({ ...p, priority: e.target.value }))}>
            <option value="">{t('common.all', 'All Priorities')}</option>
            {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
          <select className="form-control" style={{ width: 140 }} value={filters.prepStatus}
            onChange={e => setFilters(p => ({ ...p, prepStatus: e.target.value }))}>
            <option value="">{t('testCases.prepStatus', 'Prep Status')}</option>
            {PREP_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
          </select>
          <select className="form-control" style={{ width: 130 }} value={filters.latestResult}
            onChange={e => setFilters(p => ({ ...p, latestResult: e.target.value }))}>
            {EXEC_RESULTS.map(r => <option key={r.value} value={r.value}>{r.value ? r.label : t('common.all', 'All Results')}</option>)}
          </select>
          <select className="form-control" style={{ width: 120 }} value={filters.lifecycle}
            onChange={e => setFilters(p => ({ ...p, lifecycle: e.target.value }))}>
            <option value="active">{t('common.active', 'Active')}</option>
            <option value="draft">{t('common.draft', 'Draft')}</option>
            <option value="obsolete">{t('common.obsolete', 'Obsolete')}</option>
            <option value="archived">{t('common.archived', 'Archived')}</option>
            <option value="all">{t('common.all', 'All')}</option>
          </select>
        </div>
      </div>

      {/* Table */}
      {loading ? <LoadingSpinner /> : testCases.length === 0 ? (
        <EmptyState
          icon={<ClipboardList size={28} />}
          title={t('common.noData', 'No test cases found')}
          description={t('testCases.subtitle', 'Create a new test case or change search filters')}
          action={<button className="btn btn-primary" onClick={openCreate}><Plus size={13} /> {t('testCases.createTestCase', 'New Test Case')}</button>}
        />
      ) : (
        <>
          <div className="table-container" style={{ marginBottom: 16 }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: 40 }}>
                    <input type="checkbox" checked={selected.size === testCases.length && testCases.length > 0} onChange={selectAll} />
                  </th>
                  <th onClick={() => handleSort('case_id')} style={{ cursor: 'pointer' }}>
                    {t('testCases.caseId', 'ID')} {renderSortIcon('case_id', sortBy, sortDir)}
                  </th>
                  <th onClick={() => handleSort('title')} style={{ cursor: 'pointer', minWidth: 200 }}>
                    {t('testCases.caseTitle', 'Title')} {renderSortIcon('title', sortBy, sortDir)}
                  </th>
                  <th>{t('modules.title', 'Module / Feature')}</th>
                  <th onClick={() => handleSort('priority')} style={{ cursor: 'pointer' }}>{t('common.priority', 'Priority')} {renderSortIcon('priority', sortBy, sortDir)}</th>
                  <th>{t('testCases.testType', 'Type')}</th>
                  <th onClick={() => handleSort('prep_status')} style={{ cursor: 'pointer' }}>{t('testCases.prepStatus', 'Preparation')} {renderSortIcon('prep_status', sortBy, sortDir)}</th>
                  <th onClick={() => handleSort('latest_result')} style={{ cursor: 'pointer' }}>{t('testCases.latestResult', 'Result')} {renderSortIcon('latest_result', sortBy, sortDir)}</th>
                  <th style={{ width: 120 }}>{t('common.actions', 'Actions')}</th>
                </tr>
              </thead>
              <tbody>
                {testCases.map(tc => (
                  <tr key={tc.id} style={{ opacity: tc.lifecycle_status !== 'active' ? 0.65 : 1 }}>
                    <td><input type="checkbox" checked={selected.has(tc.id)} onChange={() => toggleSelect(tc.id)} /></td>
                    <td>
                      <code style={{ fontSize: 12 }}>{tc.case_id}</code>
                      {tc.lifecycle_status !== 'active' && (
                        <div style={{ marginTop: 2 }}><LifecycleBadge status={tc.lifecycle_status} /></div>
                      )}
                    </td>
                    <td>
                      <div style={{ fontWeight: 500, maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {tc.title}
                      </div>
                      {tc.requirement_ref && (
                        <div style={{ fontSize: 11, color: 'var(--foreground-muted)' }}>{tc.requirement_ref}</div>
                      )}
                    </td>
                    <td>
                      <div style={{ fontSize: 12, fontWeight: 500 }}>{tc.module_name}</div>
                      <div style={{ fontSize: 11, color: 'var(--foreground-muted)' }}>{tc.feature_name}</div>
                    </td>
                    <td><PriorityBadge priority={tc.priority} /></td>
                    <td><TypeBadge type={tc.test_type} /></td>
                    <td><PrepBadge status={tc.prep_status} /></td>
                    <td><ResultBadge result={tc.latest_result} /></td>
                    <td>
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-ghost btn-icon btn-sm" title="View Details" onClick={() => openView(tc)}>
                          <Eye size={13} />
                        </button>
                        <button className="btn btn-ghost btn-icon btn-sm" title="Execute" onClick={() => { setExecCase(tc); setExecForm({ result: '', environment: '', actual_result: '', evidence: '', defect_ref: '', notes: '', is_retest: false }); }}>
                          <Play size={13} style={{ color: 'var(--success)' }} />
                        </button>
                        <button className="btn btn-ghost btn-icon btn-sm" title="Edit" onClick={() => openEdit(tc)}>
                          <Edit2 size={13} />
                        </button>
                        <button className="btn btn-ghost btn-icon btn-sm" title="Archive" onClick={() => setDeleteTarget(tc)}>
                          <Trash2 size={13} style={{ color: 'var(--error)' }} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, color: 'var(--foreground-muted)' }}>
              Showing {(pagination.page - 1) * pagination.limit + 1}–{Math.min(pagination.page * pagination.limit, pagination.total)} of {pagination.total}
            </span>
            <Pagination page={pagination.page} totalPages={pagination.totalPages} onPageChange={p => fetchData(p)} />
          </div>
        </>
      )}

      {/* Create/Edit Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title={editCase ? `Edit: ${editCase.case_id}` : 'New Test Case'}
        size="lg"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={saveCase} disabled={saving} id="btn-save-testcase">
              {saving ? <span className="spinner" /> : 'Save'}
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Module <span className="form-required">*</span></label>
              <select className="form-control" value={form.module_id}
                onChange={e => setForm(p => ({ ...p, module_id: e.target.value, feature_id: '' }))}>
                <option value="">-- Select Module --</option>
                {modules.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Feature <span className="form-required">*</span></label>
              <select className="form-control" value={form.feature_id}
                onChange={e => setForm(p => ({ ...p, feature_id: e.target.value }))}>
                <option value="">-- Select Feature --</option>
                {formFeatures.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Title / Test Scenario <span className="form-required">*</span></label>
            <input className="form-control" placeholder="e.g. Successful login with valid email and password"
              value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} />
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Requirement Reference</label>
              <input className="form-control" placeholder="e.g. REQ-001" value={form.requirement_ref}
                onChange={e => setForm(p => ({ ...p, requirement_ref: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Test Type</label>
              <select className="form-control" value={form.test_type}
                onChange={e => setForm(p => ({ ...p, test_type: e.target.value }))}>
                {TEST_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Priority</label>
              <select className="form-control" value={form.priority}
                onChange={e => setForm(p => ({ ...p, priority: e.target.value }))}>
                {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Preparation Status</label>
              <select className="form-control" value={form.prep_status}
                onChange={e => setForm(p => ({ ...p, prep_status: e.target.value }))}>
                {PREP_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Preconditions</label>
            <textarea className="form-control" rows={2} placeholder="Initial conditions required"
              value={form.preconditions} onChange={e => setForm(p => ({ ...p, preconditions: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Test Steps</label>
            <textarea className="form-control" rows={4} placeholder="1. Open login page&#10;2. Enter username&#10;3. ..."
              value={form.test_steps} onChange={e => setForm(p => ({ ...p, test_steps: e.target.value }))} />
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Test Data</label>
              <textarea className="form-control" rows={2} placeholder="Data used for testing"
                value={form.test_data} onChange={e => setForm(p => ({ ...p, test_data: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Expected Result</label>
              <textarea className="form-control" rows={2} placeholder="Expected outcome"
                value={form.expected_result} onChange={e => setForm(p => ({ ...p, expected_result: e.target.value }))} />
            </div>
          </div>
          {editCase && (
            <>
              <div className="form-group">
                <label className="form-label">Lifecycle Status</label>
                <select className="form-control" value={form.lifecycle_status}
                  onChange={e => setForm(p => ({ ...p, lifecycle_status: e.target.value }))}>
                  {LIFECYCLE_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Reason for Change</label>
                <input className="form-control" placeholder="Reason for change (for change log)"
                  value={form.reason} onChange={e => setForm(p => ({ ...p, reason: e.target.value }))} />
              </div>
            </>
          )}
          <div className="form-group">
            <label className="form-label">Notes</label>
            <textarea className="form-control" rows={2} placeholder="Additional notes"
              value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
          </div>
        </div>
      </Modal>

      {/* View Detail Modal */}
      <Modal
        isOpen={!!viewCase}
        onClose={() => { setViewCase(null); setCaseDetail(null); }}
        title={viewCase?.case_id ?? ''}
        size="lg"
      >
        {viewCase && (
          <div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
              <PriorityBadge priority={viewCase.priority} />
              <TypeBadge type={viewCase.test_type} />
              <PrepBadge status={viewCase.prep_status} />
              <ResultBadge result={viewCase.latest_result} />
              <LifecycleBadge status={viewCase.lifecycle_status} />
            </div>

            {/* Translation Status & Action Banner */}
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', background: 'var(--surface-2)', borderRadius: 8, marginBottom: 16, border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <Globe size={15} style={{ color: 'var(--primary)' }} />
                <span><strong>{locale === 'id' ? 'Versi Bahasa:' : 'Language Version:'}</strong></span>
                <span className={`badge ${viewCase.has_translation ? (viewCase.translation_reviewed ? 'badge-success' : 'badge-info') : 'badge-warning'}`}>
                  {locale === 'id'
                    ? (viewCase.source_language === 'id' ? 'Bahasa Indonesia (Asli)' : (viewCase.translation_reviewed ? 'IDN (Ditinjau QA)' : 'IDN (Draf AI)'))
                    : (viewCase.source_language === 'en' ? 'English (Original)' : (viewCase.translation_reviewed ? 'ENG (Reviewed)' : 'ENG (AI Draft)'))}
                </span>
              </div>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => handleTranslateCurrent(viewCase.id)}
                disabled={translating}
              >
                {translating ? <span className="spinner" /> : <Globe size={13} />}
                {locale === 'id' ? 'Terjemahkan / Perbarui IDN' : 'Translate / Refresh ENG'}
              </button>
            </div>

            <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 8 }}>{viewCase.title}</h3>
            {viewCase.original_title && viewCase.original_title !== viewCase.title && (
              <div style={{ fontSize: 12, color: 'var(--foreground-muted)', marginBottom: 14 }}>
                <strong>{viewCase.source_language === 'id' ? 'Original IDN:' : 'Original EN:'}</strong> {viewCase.original_title}
              </div>
            )}
            <div style={{ display: 'grid', gap: 14 }}>
              {viewCase.requirement_ref && <DetailRow label="Requirement Reference" value={viewCase.requirement_ref} />}
              <DetailRow label="Module / Feature" value={`${viewCase.module_name} → ${viewCase.feature_name}`} />
              {viewCase.preconditions && <DetailRow label="Preconditions" value={viewCase.preconditions} pre />}
              {viewCase.test_steps && <DetailRow label="Test Steps" value={viewCase.test_steps} pre />}
              {viewCase.test_data && <DetailRow label="Test Data" value={viewCase.test_data} pre />}
              {viewCase.expected_result && <DetailRow label="Expected Result" value={viewCase.expected_result} pre />}
              {viewCase.actual_result && <DetailRow label="Actual Result" value={viewCase.actual_result} pre />}
              {viewCase.defect_ref && <DetailRow label="Defect Reference" value={viewCase.defect_ref} />}
              {viewCase.notes && <DetailRow label="Notes" value={viewCase.notes} />}
            </div>
            {caseDetail && caseDetail.executions && caseDetail.executions.length > 0 ? (
              <div style={{ marginTop: 20 }}>
                <div className="section-title" style={{ marginBottom: 10 }}>Execution History ({caseDetail.executions.length})</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {caseDetail.executions.slice(0, 5).map(ex => (
                    <div key={ex.id} style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '10px 12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <ResultBadge result={ex.result} />
                        <span style={{ fontSize: 12, color: 'var(--foreground-muted)', marginLeft: 8 }}>
                          {new Date(ex.exec_date).toLocaleString('en-US')}
                        </span>
                        {ex.environment && <span style={{ fontSize: 12, color: 'var(--foreground-muted)', marginLeft: 8 }}>@ {ex.environment}</span>}
                      </div>
                      {ex.defect_ref && <code>{ex.defect_ref}</code>}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            {caseDetail && caseDetail.comments && caseDetail.comments.length > 0 ? (
              <div style={{ marginTop: 20 }}>
                <div className="section-title" style={{ marginBottom: 10 }}>
                  Collaborator Comments & Feedback ({caseDetail.comments.length})
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {caseDetail.comments.map(c => (
                    <div key={c.id} style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '10px 14px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--foreground)' }}>
                          {c.author_name} ({c.author_role.toUpperCase()})
                        </span>
                        <span className={`badge ${c.status === 'resolved' ? 'badge-success' : c.status === 'reviewed' ? 'badge-info' : 'badge-warning'}`} style={{ fontSize: 10 }}>
                          {c.status}
                        </span>
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--foreground-body)', whiteSpace: 'pre-wrap' }}>
                        {c.content}
                      </div>
                      {c.reply && (
                        <div style={{ marginTop: 6, fontSize: 12, color: 'var(--primary)', fontStyle: 'italic' }}>
                          QA Reply: {c.reply}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        )}
      </Modal>

      {/* Execution Modal */}
      <Modal
        isOpen={!!execCase}
        onClose={() => setExecCase(null)}
        title={`Execute: ${execCase?.case_id}`}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setExecCase(null)}>Cancel</button>
            <button className="btn btn-primary" onClick={saveExecution} disabled={saving} id="btn-save-execution">
              {saving ? <span className="spinner" /> : 'Save Result'}
            </button>
          </>
        }
      >
        {execCase && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div className="info-box">
              <span>📋 {execCase.title}</span>
            </div>
            <div className="form-group">
              <label className="form-label">Execution Result <span className="form-required">*</span></label>
              <div style={{ display: 'flex', gap: 8 }}>
                {[
                  { value: 'pass', label: '✅ Pass', color: 'var(--success)' },
                  { value: 'fail', label: '❌ Fail', color: 'var(--error)' },
                  { value: 'blocked', label: '🚧 Blocked', color: 'var(--warning)' },
                  { value: 'not_run', label: '⬜ Not Run', color: 'var(--foreground-muted)' },
                ].map(opt => (
                  <button
                    key={opt.value}
                    className={`btn btn-sm ${execForm.result === opt.value ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ flex: 1, borderColor: execForm.result === opt.value ? opt.color : undefined }}
                    onClick={() => setExecForm(p => ({ ...p, result: opt.value }))}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Environment</label>
                <input className="form-control" placeholder="e.g. Staging" value={execForm.environment}
                  onChange={e => setExecForm(p => ({ ...p, environment: e.target.value }))} />
              </div>
              <div className="form-group">
                <label className="form-label">Defect Reference</label>
                <input className="form-control" placeholder="e.g. BUG-001" value={execForm.defect_ref}
                  onChange={e => setExecForm(p => ({ ...p, defect_ref: e.target.value }))} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Actual Result</label>
              <textarea className="form-control" rows={3} placeholder="What actually occurred"
                value={execForm.actual_result} onChange={e => setExecForm(p => ({ ...p, actual_result: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Notes</label>
              <textarea className="form-control" rows={2} value={execForm.notes}
                onChange={e => setExecForm(p => ({ ...p, notes: e.target.value }))} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" id="is-retest" checked={execForm.is_retest}
                onChange={e => setExecForm(p => ({ ...p, is_retest: e.target.checked }))} />
              <label htmlFor="is-retest" style={{ fontSize: 13, cursor: 'pointer' }}>This is a Retest</label>
            </div>
          </div>
        )}
      </Modal>

      {/* Archive Confirm */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={archiveCase}
        title="Archive Test Case"
        message={`Test case "${deleteTarget?.title}" will be archived. Data is not deleted and can be restored.`}
        confirmLabel="Archive"
        danger
        loading={saving}
      />
    </AppShell>
  );
}

function DetailRow({ label, value, pre }: { label: string; value: string; pre?: boolean }) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--foreground-muted)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 4 }}>
        {label}
      </div>
      {pre ? (
        <pre style={{ fontSize: 13, color: 'var(--foreground)', whiteSpace: 'pre-wrap', lineHeight: 1.6, fontFamily: 'inherit', background: 'var(--surface-2)', padding: '10px 12px', borderRadius: 6, margin: 0 }}>
          {value}
        </pre>
      ) : (
        <div style={{ fontSize: 13, color: 'var(--foreground)', lineHeight: 1.5 }}>{value}</div>
      )}
    </div>
  );
}
