'use client';

import { useEffect, useState, useCallback, useMemo, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { Modal, ConfirmModal } from '@/components/ui/Modal';
import { ResultBadge, PriorityBadge, PrepBadge, LifecycleBadge, TypeBadge, EmptyState, LoadingSpinner, Pagination } from '@/components/ui/Shared';
import { useToast } from '@/components/ui/Toast';
import { Plus, Search, Filter, Download, Edit2, Eye, Trash2, ClipboardList, SortAsc, SortDesc, ChevronDown, ChevronRight, X, Play, RotateCcw, Globe, Layers, Check, ArrowRight } from 'lucide-react';
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
  const router = useRouter();
  const toast = useToast();
  const { t, locale } = useI18n();
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 20, totalPages: 1 });
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const headerCheckboxRef = useRef<HTMLInputElement>(null);
  const [selectingAll, setSelectingAll] = useState(false);
  const [showTestRunModal, setShowTestRunModal] = useState(false);
  const [creatingRun, setCreatingRun] = useState(false);
  const [testRunForm, setTestRunForm] = useState({
    name: '',
    description: '',
    environment: 'STG',
  });
  const [selectedCasesData, setSelectedCasesData] = useState<TestCase[]>([]);
  const [loadingSelectedCases, setLoadingSelectedCases] = useState(false);

  // Bulk Update Preparation Status State
  const [showBulkPrepModal, setShowBulkPrepModal] = useState(false);
  const [showAffectedCases, setShowAffectedCases] = useState(false);
  const [bulkPrepNewStatus, setBulkPrepNewStatus] = useState<'draft' | 'in_progress' | 'ready'>('ready');
  const [bulkPrepPreview, setBulkPrepPreview] = useState<{
    total_matching_active: number;
    distribution: { draft: number; in_progress: number; ready: number };
    new_status: string | null;
    cases_to_update: number;
    already_in_target: number;
    affected_cases?: Array<{
      id: number;
      case_id: string;
      feature_name: string;
      current_prep_status: string;
      new_prep_status: string;
      will_change: boolean;
    }>;
    sample_cases?: Array<{
      id: number;
      case_id: string;
      title: string;
      module_name: string;
      feature_name: string;
      current_prep_status: string;
      will_change: boolean;
    }>;
  } | null>(null);
  const [loadingBulkPrepPreview, setLoadingBulkPrepPreview] = useState(false);
  const [executingBulkPrep, setExecutingBulkPrep] = useState(false);
  const [viewCase, setViewCase] = useState<TestCase | null>(null);
  const [editCase, setEditCase] = useState<TestCase | null>(null);
  const [execCase, setExecCase] = useState<TestCase | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<TestCase | null>(null);
  const [showBulkDeleteModal, setShowBulkDeleteModal] = useState(false);
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

  useEffect(() => {
    setSelected(new Set());
    fetchData(1);
  }, [filters, sortBy, sortDir, locale]);

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
        toast.success(locale === 'id' ? 'Test case berhasil dihapus' : 'Test case deleted');
        setDeleteTarget(null);
        fetchData(pagination.page);
      } else {
        const e = await res.json().catch(() => ({}));
        toast.error(e.error || (locale === 'id' ? 'Gagal menghapus test case' : 'Failed to delete test case'));
      }
    } catch {
      toast.error(locale === 'id' ? 'Terjadi kesalahan jaringan saat menghapus test case' : 'Network error deleting test case');
    } finally { setSaving(false); }
  };

  const handleConfirmBulkDelete = async () => {
    if (selected.size === 0) return;
    setSaving(true);
    try {
      const count = selected.size;
      for (const id of selected) {
        await fetch(`/api/test-cases/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ lifecycle_status: 'obsolete', reason: 'Bulk Delete' })
        });
      }
      toast.success(
        locale === 'id'
          ? `${count} test case berhasil ditandai sebagai obsolete`
          : `${count} test case${count > 1 ? 's' : ''} marked as obsolete`
      );
      setSelected(new Set());
      setShowBulkDeleteModal(false);
      fetchData(pagination.page);
    } catch {
      toast.error(
        locale === 'id'
          ? 'Gagal menghapus test cases'
          : 'Failed to delete selected test cases'
      );
    } finally {
      setSaving(false);
    }
  };

  const toggleSelect = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const isAllSelected = pagination.total > 0 && selected.size === pagination.total;
  const isIndeterminate = selected.size > 0 && selected.size < pagination.total;

  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = isIndeterminate;
    }
  }, [isIndeterminate]);

  // Header checkbox: Sole control for Select All / Deselect All across active filter
  const handleToggleHeaderSelect = async () => {
    // If all are selected, clicking deselects all
    if (isAllSelected) {
      setSelected(new Set());
      return;
    }

    // Otherwise (0 or partially selected), select all matching active filter across all pages
    setSelectingAll(true);
    try {
      const params = new URLSearchParams({
        selectIdsOnly: 'true',
        lifecycle: filters.lifecycle,
        ...(filters.search && { search: filters.search }),
        ...(filters.moduleId && { moduleId: filters.moduleId }),
        ...(filters.featureId && { featureId: filters.featureId }),
        ...(filters.priority && { priority: filters.priority }),
        ...(filters.prepStatus && { prepStatus: filters.prepStatus }),
        ...(filters.latestResult && { latestResult: filters.latestResult }),
        ...(filters.testType && { testType: filters.testType }),
      });
      const res = await fetch(`/api/test-cases?${params.toString()}`);
      if (res.ok) {
        const result = await res.json();
        const rows: { id: number; latest_result: string }[] = result.data || [];
        const newSelected = new Set(rows.map(r => r.id));
        setSelected(newSelected);
        toast.success(`${newSelected.size} ${t('testCases.selectedCount', 'test case(s) selected')}`);
      } else {
        toast.error('Failed to select filtered cases');
      }
    } catch {
      toast.error('Failed to select filtered cases');
    } finally {
      setSelectingAll(false);
    }
  };

  // Open Test Run confirmation modal
  const openTestRunModal = async () => {
    if (selected.size === 0) {
      toast.error('Select at least one test case to run');
      return;
    }

    setLoadingSelectedCases(true);
    setShowTestRunModal(true);

    // Default test run name with timestamp/context
    const activeModuleObj = modules.find(m => String(m.id) === String(filters.moduleId));
    const activeFeatureObj = filteredFeatures.find(f => String(f.id) === String(filters.featureId));
    let defaultRunName = 'Test Run';
    if (activeModuleObj && activeFeatureObj) {
      defaultRunName = `${activeModuleObj.name} - ${activeFeatureObj.name} Run`;
    } else if (activeModuleObj) {
      defaultRunName = `${activeModuleObj.name} Regression Run`;
    } else {
      defaultRunName = `Suite Test Run - ${new Date().toISOString().split('T')[0]}`;
    }

    setTestRunForm({
      name: defaultRunName,
      description: '',
      environment: 'STG',
    });

    try {
      // Fetch details of selected test cases
      const selectedIds = Array.from(selected);
      // Fetch test cases to display in modal (limit up to 2000)
      const res = await fetch(`/api/test-cases?limit=2000&lifecycle=all&lang=${locale}`);
      if (res.ok) {
        const d = await res.json();
        const allFetched: TestCase[] = d.data || [];
        const matched = allFetched.filter(tc => selected.has(tc.id));
        // Sort strictly: Module name, Feature name, Case ID ASC
        matched.sort((a, b) => {
          const modA = a.module_name || '';
          const modB = b.module_name || '';
          if (modA !== modB) return modA.localeCompare(modB);
          const featA = a.feature_name || '';
          const featB = b.feature_name || '';
          if (featA !== featB) return featA.localeCompare(featB);
          return a.case_id.localeCompare(b.case_id);
        });
        setSelectedCasesData(matched);
      }
    } catch {
      toast.error('Failed to load selected test case details');
    } finally {
      setLoadingSelectedCases(false);
    }
  };

  // Remove single test case from selection in Test Run modal
  const removeCaseFromRun = (id: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setSelectedCasesData(prev => prev.filter(tc => tc.id !== id));
  };

  // Create Test Run and redirect to Execution Workspace
  const handleCreateTestRun = async () => {
    if (!testRunForm.name.trim()) {
      toast.error('Test Run Name is required');
      return;
    }
    if (selected.size === 0) {
      toast.error('At least one test case must be selected');
      return;
    }

    setCreatingRun(true);
    try {
      const res = await fetch('/api/test-runs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: testRunForm.name.trim(),
          description: testRunForm.description.trim() || null,
          environment: testRunForm.environment || 'STG',
          testCaseIds: Array.from(selected),
        }),
      });

      if (res.ok) {
        const created = await res.json();
        toast.success(`Test Run "${created.name}" created!`);
        setShowTestRunModal(false);
        setSelected(new Set());
        // Redirect to Execution Workspace
        router.push(`/execution?runId=${created.id}`);
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to create Test Run');
      }
    } catch {
      toast.error('Network error creating Test Run');
    } finally {
      setCreatingRun(false);
    }
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

  // Fetch Bulk Prep Status Preview
  const fetchBulkPrepPreview = useCallback(async (targetStatus?: string) => {
    setLoadingBulkPrepPreview(true);
    try {
      const status = targetStatus || bulkPrepNewStatus;
      const params = new URLSearchParams({
        newStatus: status,
        lifecycle: filters.lifecycle,
        ...(filters.search && { search: filters.search }),
        ...(filters.moduleId && { moduleId: filters.moduleId }),
        ...(filters.featureId && { featureId: filters.featureId }),
        ...(filters.priority && { priority: filters.priority }),
        ...(filters.prepStatus && { prepStatus: filters.prepStatus }),
        ...(filters.latestResult && { latestResult: filters.latestResult }),
        ...(filters.testType && { testType: filters.testType }),
      });
      const res = await fetch(`/api/test-cases/bulk-prep-status?${params.toString()}`);
      if (res.ok) {
        const data = await res.json();
        setBulkPrepPreview(data);
      } else {
        toast.error('Failed to load bulk update preview');
      }
    } catch {
      toast.error('Network error loading preview');
    } finally {
      setLoadingBulkPrepPreview(false);
    }
  }, [filters, bulkPrepNewStatus, toast]);

  const openBulkPrepModal = () => {
    setBulkPrepPreview(null);
    setShowAffectedCases(false);
    setShowBulkPrepModal(true);
    fetchBulkPrepPreview(bulkPrepNewStatus);
  };

  const handleChangeBulkPrepStatus = (status: 'draft' | 'in_progress' | 'ready') => {
    setBulkPrepNewStatus(status);
    fetchBulkPrepPreview(status);
  };

  // Re-calculate preview if filters change while modal is open (Requirement 4.5)
  useEffect(() => {
    if (showBulkPrepModal) {
      fetchBulkPrepPreview(bulkPrepNewStatus);
    }
  }, [filters, showBulkPrepModal]);

  const handleConfirmBulkPrepUpdate = async () => {
    if (!bulkPrepPreview || bulkPrepPreview.cases_to_update === 0) return;
    setExecutingBulkPrep(true);
    try {
      const res = await fetch('/api/test-cases/bulk-prep-status', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          filters,
          newStatus: bulkPrepNewStatus,
          reason: 'Bulk Update Preparation Status via Test Cases filter',
        }),
      });

      const result = await res.json();
      if (res.ok && result.success) {
        toast.success(
          `Successfully updated ${result.updated_count} test case(s) to ${bulkPrepNewStatus.toUpperCase()}!`
        );
        setShowBulkPrepModal(false);
        // Refresh table data
        fetchData(pagination.page);
      } else {
        toast.error(result.message || result.error || 'Failed to update preparation status');
      }
    } catch {
      toast.error('Network error executing bulk update');
    } finally {
      setExecutingBulkPrep(false);
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
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          {selected.size > 0 && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={() => setShowBulkDeleteModal(true)}
              id="btn-bulk-delete"
            >
              <X size={13} /> {t('common.delete', 'Mark Obsolete')} ({selected.size})
            </button>
          )}
          <button
            className="btn btn-secondary"
            onClick={openBulkPrepModal}
            id="btn-bulk-prep-status"
            title={t('testCases.bulkUpdatePrepStatus', 'Bulk Update Preparation Status')}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
          >
            <Layers size={14} />
            <span>{t('testCases.bulkUpdatePrepStatus', 'Bulk Update Preparation Status')}</span>
          </button>
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

      {/* Bulk Selection and Test Run Action Bar - shown when cases are selected */}
      {selected.size > 0 && (
        <div
          className="card"
          style={{
            padding: '10px 18px',
            marginBottom: 16,
            background: 'var(--surface-2)',
            borderLeft: '4px solid var(--primary)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 12,
          }}
          id="bulk-selection-bar"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--foreground)' }}>
              {selected.size} {t('testCases.selectedCount', 'test case(s) selected')}
            </span>
            <span style={{ fontSize: 12, color: 'var(--foreground-muted)' }}>
              ({pagination.total} {t('common.total', 'total in current filter')})
            </span>
            {selectingAll && <span className="spinner" style={{ width: 14, height: 14 }} />}
          </div>

          {/* Action: Run Selected Test Cases & Bulk Delete */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <button
              className="btn btn-secondary"
              onClick={() => setShowBulkDeleteModal(true)}
              id="btn-bulk-delete-action-bar"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, color: 'var(--error)' }}
              title="Delete Selected Test Cases"
            >
              <Trash2 size={14} style={{ color: 'var(--error)' }} />
              <span>{t('common.delete', 'Delete')} ({selected.size})</span>
            </button>
            <button
              className="btn btn-success"
              onClick={openTestRunModal}
              id="btn-run-selected"
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600 }}
            >
              <Play size={14} />
              <span>{t('testCases.runSelected', 'Run Selected Test Cases')} ({selected.size})</span>
            </button>
          </div>
        </div>
      )}

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
                    <input
                      ref={headerCheckboxRef}
                      type="checkbox"
                      checked={isAllSelected}
                      onChange={handleToggleHeaderSelect}
                      id="checkbox-select-all"
                      disabled={pagination.total === 0 || selectingAll}
                      title={
                        isAllSelected
                          ? 'Deselect all filtered cases'
                          : 'Select all filtered cases'
                      }
                      style={{ cursor: pagination.total > 0 ? 'pointer' : 'not-allowed' }}
                    />
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
                        <button className="btn btn-ghost btn-icon btn-sm" title={t('common.delete', 'Delete')} onClick={() => setDeleteTarget(tc)} id={`btn-delete-${tc.id}`}>
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

      {/* Create Test Run Confirmation Modal */}
      <Modal
        isOpen={showTestRunModal}
        onClose={() => setShowTestRunModal(false)}
        title={t('testCases.createTestRunModalTitle', 'Create Test Run & Bulk Execution')}
        size="lg"
        footer={
          <>
            <button
              className="btn btn-secondary"
              onClick={() => setShowTestRunModal(false)}
              disabled={creatingRun}
            >
              {t('common.cancel', 'Cancel')}
            </button>
            <button
              className="btn btn-primary"
              id="btn-confirm-create-test-run"
              onClick={handleCreateTestRun}
              disabled={creatingRun || selected.size === 0 || !testRunForm.name.trim()}
              style={{ background: 'var(--plum-primary, #6b21a8)', color: '#fff' }}
            >
              {creatingRun ? (
                <span className="spinner" />
              ) : (
                <>
                  <Play size={14} style={{ marginRight: 6 }} />
                  {t('testCases.startExecution', 'Start Test Run')} ({selected.size})
                </>
              )}
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="info-box" style={{ background: 'var(--surface-2)', padding: '12px 16px', borderRadius: 8 }}>
            <div style={{ fontSize: 13, color: 'var(--foreground)' }}>
              {t('testCases.runModalHint', 'A new Test Run session will be created with the selected test cases ordered strictly by Module, Feature, and Test Case ID.')}
            </div>
          </div>

          <div className="form-grid">
            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label className="form-label">
                {t('testCases.testRunName', 'Test Run Name')} <span className="form-required">*</span>
              </label>
              <input
                id="input-test-run-name"
                className="form-control"
                placeholder="e.g. Authentication Regression - Run 001"
                value={testRunForm.name}
                onChange={e => setTestRunForm(p => ({ ...p, name: e.target.value }))}
                required
              />
            </div>

            <div className="form-group">
              <label className="form-label">{t('testCases.environment', 'Environment')}</label>
              <select
                id="select-test-run-env"
                className="form-control"
                value={testRunForm.environment}
                onChange={e => setTestRunForm(p => ({ ...p, environment: e.target.value }))}
              >
                <option value="DEV">DEV (Development)</option>
                <option value="STG">STG (Staging)</option>
                <option value="UAT">UAT (User Acceptance)</option>
                <option value="PROD">PROD (Production)</option>
              </select>
            </div>

            <div className="form-group">
              <label className="form-label">{t('testCases.totalSelected', 'Total Selected Cases')}</label>
              <div
                style={{
                  height: 38,
                  display: 'flex',
                  alignItems: 'center',
                  fontWeight: 600,
                  fontSize: 14,
                  color: 'var(--primary)',
                }}
              >
                {selected.size} {t('testCases.casesSelected', 'cases')}
              </div>
            </div>

            <div className="form-group" style={{ gridColumn: 'span 2' }}>
              <label className="form-label">{t('testCases.descriptionOptional', 'Description (Optional)')}</label>
              <textarea
                id="input-test-run-desc"
                className="form-control"
                rows={2}
                placeholder="Add test scope, objectives, or release notes..."
                value={testRunForm.description}
                onChange={e => setTestRunForm(p => ({ ...p, description: e.target.value }))}
              />
            </div>
          </div>

          {/* Selected Test Cases List preview */}
          <div>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                marginBottom: 8,
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground)' }}>
                {t('testCases.includedCases', 'Included Test Cases')} ({selectedCasesData.length})
              </div>
              <div style={{ fontSize: 12, color: 'var(--foreground-muted)' }}>
                {t('testCases.orderedHint', 'Ordered by Module → Feature → Case ID')}
              </div>
            </div>

            {loadingSelectedCases ? (
              <div style={{ textAlign: 'center', padding: 24, color: 'var(--foreground-muted)' }}>
                <span className="spinner" /> Loading selected cases...
              </div>
            ) : selectedCasesData.length === 0 ? (
              <div
                style={{
                  textAlign: 'center',
                  padding: 24,
                  background: 'var(--surface-2)',
                  borderRadius: 6,
                  color: 'var(--foreground-muted)',
                  fontSize: 13,
                }}
              >
                No test cases selected.
              </div>
            ) : (
              <div
                style={{
                  maxHeight: 280,
                  overflowY: 'auto',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
                  background: 'var(--surface)',
                }}
              >
                <table className="table" style={{ margin: 0, fontSize: 12 }}>
                  <thead style={{ position: 'sticky', top: 0, background: 'var(--surface-2)', zIndex: 1 }}>
                    <tr>
                      <th style={{ width: 100 }}>Case ID</th>
                      <th style={{ width: 140 }}>Module</th>
                      <th style={{ width: 140 }}>Feature</th>
                      <th>Title</th>
                      <th style={{ width: 80, textAlign: 'center' }}>Result</th>
                      <th style={{ width: 50, textAlign: 'center' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedCasesData.map(tc => (
                      <tr key={tc.id}>
                        <td>
                          <span className="badge badge-neutral" style={{ fontWeight: 600 }}>
                            {tc.case_id}
                          </span>
                        </td>
                        <td style={{ color: 'var(--foreground-muted)' }}>{tc.module_name || '-'}</td>
                        <td style={{ color: 'var(--foreground-muted)' }}>{tc.feature_name || '-'}</td>
                        <td style={{ maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {tc.title}
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <span className={`badge badge-${tc.latest_result || 'not_run'}`}>
                            {tc.latest_result ? tc.latest_result.toUpperCase() : 'NOT RUN'}
                          </span>
                        </td>
                        <td style={{ textAlign: 'center' }}>
                          <button
                            type="button"
                            className="btn btn-ghost btn-icon"
                            title="Remove from run"
                            onClick={() => removeCaseFromRun(tc.id)}
                            style={{ color: 'var(--error, #ef4444)', padding: 4 }}
                          >
                            <Trash2 size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* Simplified Bulk Update Preparation Status Modal */}
      <Modal
        isOpen={showBulkPrepModal}
        onClose={() => setShowBulkPrepModal(false)}
        title={t('testCases.bulkUpdatePrepStatus', 'Bulk Update Preparation Status')}
        size="lg"
        footer={
          <>
            <button
              className="btn btn-secondary"
              onClick={() => setShowBulkPrepModal(false)}
              disabled={executingBulkPrep}
            >
              {t('common.cancel', 'Cancel')}
            </button>
            <button
              className="btn btn-primary"
              id="btn-confirm-bulk-prep-submit"
              onClick={handleConfirmBulkPrepUpdate}
              disabled={
                executingBulkPrep ||
                loadingBulkPrepPreview ||
                !bulkPrepPreview ||
                bulkPrepPreview.cases_to_update === 0
              }
              style={{ background: 'var(--primary)', color: '#fff' }}
            >
              {executingBulkPrep ? (
                <span className="spinner" />
              ) : (
                <>
                  <Check size={14} style={{ marginRight: 6 }} />
                  {t('testCases.confirmUpdatePrep', 'Confirm Update')}{bulkPrepPreview && bulkPrepPreview.cases_to_update > 0 ? ` (${bulkPrepPreview.cases_to_update})` : ''}
                </>
              )}
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* 1. Filter Summary */}
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground-muted)', textTransform: 'uppercase', marginBottom: 6 }}>
              Filter Summary
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {filters.moduleId ? (
                <span className="badge badge-neutral" style={{ padding: '4px 8px', fontSize: 12 }}>
                  Module: {modules.find(m => String(m.id) === String(filters.moduleId))?.name || filters.moduleId}
                </span>
              ) : (
                <span className="badge badge-neutral" style={{ padding: '4px 8px', fontSize: 12 }}>
                  Module: All Modules
                </span>
              )}
              {filters.featureId && (
                <span className="badge badge-neutral" style={{ padding: '4px 8px', fontSize: 12 }}>
                  Feature: {features.find(f => String(f.id) === String(filters.featureId))?.name || filters.featureId}
                </span>
              )}
              {filters.priority && (
                <span className="badge badge-neutral" style={{ padding: '4px 8px', fontSize: 12 }}>
                  Priority: {PRIORITIES.find(p => p.value === filters.priority)?.label || filters.priority.toUpperCase()}
                </span>
              )}
              {filters.prepStatus && (
                <span className="badge badge-neutral" style={{ padding: '4px 8px', fontSize: 12 }}>
                  Preparation Status: {PREP_STATUSES.find(s => s.value === filters.prepStatus)?.label || filters.prepStatus}
                </span>
              )}
              {filters.latestResult && (
                <span className="badge badge-neutral" style={{ padding: '4px 8px', fontSize: 12 }}>
                  Execution Result: {EXEC_RESULTS.find(r => r.value === filters.latestResult)?.label || filters.latestResult}
                </span>
              )}
              {filters.search && (
                <span className="badge badge-neutral" style={{ padding: '4px 8px', fontSize: 12 }}>
                  Search: &ldquo;{filters.search}&rdquo;
                </span>
              )}
              <span className="badge badge-success" style={{ padding: '4px 8px', fontSize: 12, fontWeight: 600 }}>
                Lifecycle: Active Only
              </span>
            </div>
          </div>

          {/* 2. Update Summary */}
          <div style={{ background: 'var(--surface-2)', borderRadius: 8, padding: '12px 16px', border: '1px solid var(--border)' }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground-muted)', textTransform: 'uppercase', marginBottom: 8 }}>
              Update Summary
            </div>
            {loadingBulkPrepPreview ? (
              <div style={{ padding: '12px 0', textAlign: 'center', color: 'var(--foreground-muted)', fontSize: 13 }}>
                <span className="spinner" style={{ marginRight: 8 }} /> Calculating preview...
              </div>
            ) : !bulkPrepPreview ? (
              <div style={{ padding: '8px 0', color: 'var(--foreground-muted)', fontSize: 13 }}>
                No preview data available
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
                <div style={{ background: 'var(--surface)', padding: 10, borderRadius: 6, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 11, color: 'var(--foreground-muted)', fontWeight: 500 }}>Matching Cases</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--foreground)', marginTop: 2 }}>
                    {bulkPrepPreview.total_matching_active}
                  </div>
                </div>
                <div style={{ background: 'var(--surface)', padding: 10, borderRadius: 6, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 11, color: 'var(--foreground-muted)', fontWeight: 500 }}>Current Status Distribution</div>
                  <div style={{ display: 'flex', gap: 6, marginTop: 4, flexWrap: 'wrap', fontSize: 11 }}>
                    <span className="badge badge-neutral" style={{ padding: '2px 6px', fontSize: 11 }}>
                      Draft: {bulkPrepPreview.distribution.draft}
                    </span>
                    <span className="badge badge-neutral" style={{ padding: '2px 6px', fontSize: 11 }}>
                      In Progress: {bulkPrepPreview.distribution.in_progress}
                    </span>
                    <span className="badge badge-neutral" style={{ padding: '2px 6px', fontSize: 11 }}>
                      Ready: {bulkPrepPreview.distribution.ready}
                    </span>
                  </div>
                </div>
                <div style={{
                  background: bulkPrepPreview.cases_to_update > 0 ? 'rgba(16, 185, 129, 0.08)' : 'var(--surface)',
                  padding: 10,
                  borderRadius: 6,
                  border: bulkPrepPreview.cases_to_update > 0 ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid var(--border)'
                }}>
                  <div style={{ fontSize: 11, color: bulkPrepPreview.cases_to_update > 0 ? 'var(--success, #10b981)' : 'var(--foreground-muted)', fontWeight: 600 }}>
                    Cases to Update
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: bulkPrepPreview.cases_to_update > 0 ? 'var(--success, #10b981)' : 'var(--foreground-muted)', marginTop: 2 }}>
                    {bulkPrepPreview.cases_to_update}
                  </div>
                </div>
              </div>
            )}

            {bulkPrepPreview && bulkPrepPreview.total_matching_active === 0 && (
              <div style={{ marginTop: 10, fontSize: 12, color: 'var(--warning, #eab308)' }}>
                ⚠️ No active test cases match the active filter criteria.
              </div>
            )}
            {bulkPrepPreview && bulkPrepPreview.total_matching_active > 0 && bulkPrepPreview.cases_to_update === 0 && (
              <div style={{ marginTop: 10, fontSize: 12, color: 'var(--foreground-muted)' }}>
                ℹ️ All {bulkPrepPreview.total_matching_active} matching test cases already have preparation status &quot;{bulkPrepNewStatus.replace('_', ' ').toUpperCase()}&quot;. No status will be changed.
              </div>
            )}
          </div>

          {/* 3. Change Preparation Status To */}
          <div>
            <label className="form-label" style={{ fontWeight: 600, fontSize: 13, marginBottom: 8, display: 'block' }}>
              Change Preparation Status To
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {[
                { value: 'draft', label: 'Draft', icon: '📝' },
                { value: 'in_progress', label: 'In Progress', icon: '⏳' },
                { value: 'ready', label: 'Ready', icon: '✅' },
              ].map(opt => {
                const isSelected = bulkPrepNewStatus === opt.value;
                return (
                  <button
                    key={opt.value}
                    type="button"
                    onClick={() => handleChangeBulkPrepStatus(opt.value as any)}
                    style={{
                      padding: '12px 14px',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 8,
                      background: isSelected ? 'var(--primary-subtle, rgba(99, 102, 241, 0.1))' : 'var(--surface)',
                      border: isSelected ? '2px solid var(--primary)' : '1px solid var(--border)',
                      borderRadius: 8,
                      cursor: 'pointer',
                      fontWeight: isSelected ? 600 : 500,
                      color: isSelected ? 'var(--primary)' : 'var(--foreground)',
                      transition: 'all 0.15s ease',
                    }}
                  >
                    <span>{opt.icon}</span>
                    <span style={{ fontSize: 13 }}>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 4. View Affected Test Cases (Accordion - collapsed by default) */}
          <div style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden' }}>
            <button
              type="button"
              onClick={() => setShowAffectedCases(!showAffectedCases)}
              style={{
                width: '100%',
                padding: '10px 14px',
                background: 'var(--surface-2)',
                border: 'none',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                cursor: 'pointer',
                textAlign: 'left',
                fontSize: 13,
                fontWeight: 600,
                color: 'var(--foreground)',
              }}
            >
              <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {showAffectedCases ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                View Affected Test Cases {bulkPrepPreview ? `(${bulkPrepPreview.affected_cases?.length || 0})` : ''}
              </span>
              <span style={{ fontSize: 11, color: 'var(--foreground-muted)', fontWeight: 400 }}>
                {showAffectedCases ? 'Click to collapse' : 'Click to expand'}
              </span>
            </button>

            {showAffectedCases && (
              <div style={{ maxHeight: 220, overflowY: 'auto', background: 'var(--surface)' }}>
                {loadingBulkPrepPreview ? (
                  <div style={{ textAlign: 'center', padding: 20, color: 'var(--foreground-muted)', fontSize: 12 }}>
                    <span className="spinner" style={{ marginRight: 6 }} /> Loading affected cases...
                  </div>
                ) : !bulkPrepPreview?.affected_cases?.length ? (
                  <div style={{ padding: 16, textAlign: 'center', color: 'var(--foreground-muted)', fontSize: 12 }}>
                    No test cases matching current criteria.
                  </div>
                ) : (
                  <table className="table" style={{ margin: 0, fontSize: 12 }}>
                    <thead>
                      <tr style={{ background: 'var(--surface-2)', position: 'sticky', top: 0, zIndex: 1 }}>
                        <th style={{ width: '25%', padding: '8px 12px' }}>Test Case ID</th>
                        <th style={{ width: '35%', padding: '8px 12px' }}>Feature</th>
                        <th style={{ width: '20%', padding: '8px 12px' }}>Current Status</th>
                        <th style={{ width: '20%', padding: '8px 12px' }}>New Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {bulkPrepPreview.affected_cases.map(tc => (
                        <tr key={tc.id}>
                          <td style={{ fontWeight: 600, padding: '8px 12px' }}>{tc.case_id}</td>
                          <td style={{ color: 'var(--foreground-muted)', padding: '8px 12px' }}>{tc.feature_name}</td>
                          <td style={{ padding: '8px 12px' }}>
                            <PrepBadge status={tc.current_prep_status as any} />
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            {tc.will_change ? (
                              <PrepBadge status={bulkPrepNewStatus} />
                            ) : (
                              <span style={{ fontSize: 11, color: 'var(--foreground-muted)' }}>
                                No change
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </div>
        </div>
      </Modal>

      {/* Delete Confirmation Popup (Row-level) */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={archiveCase}
        title="Delete Test Case?"
        message="Are you sure you want to delete this test case?"
        confirmLabel="Delete"
        danger
        loading={saving}
      />

      {/* Bulk Delete Confirmation Popup */}
      <ConfirmModal
        isOpen={showBulkDeleteModal}
        onClose={() => setShowBulkDeleteModal(false)}
        onConfirm={handleConfirmBulkDelete}
        title="Delete Selected Test Cases?"
        message={`Are you sure you want to delete the selected test cases? (${selected.size} test case${selected.size > 1 ? 's' : ''} selected)`}
        confirmLabel="Delete Selected"
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
