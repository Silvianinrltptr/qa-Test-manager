'use client';

import { Suspense, useEffect, useState, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { ResultBadge, PriorityBadge, LoadingSpinner, EmptyState, Pagination } from '@/components/ui/Shared';
import { useToast } from '@/components/ui/Toast';
import {
  Play, Download, Search, ArrowLeft, ChevronLeft, ChevronRight,
  CheckCircle2, XCircle, AlertCircle, Clock, Save, Layers, Sparkles
} from 'lucide-react';
import type { TestCase, Module, Feature, Execution, TestRun, TestRunItem } from '@/lib/types';
import { useI18n } from '@/lib/i18n/context';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';

function ExecutionContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const runId = searchParams.get('runId');
  const toast = useToast();
  const { t, locale } = useI18n();

  // Mode: Standalone Execution OR Test Run Workspace
  const isTestRunMode = Boolean(runId);

  // Standalone mode state
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [loading, setLoading] = useState(true);
  const [recentExecs, setRecentExecs] = useState<Execution[]>([]);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 20, totalPages: 1 });
  const [execCase, setExecCase] = useState<TestCase | null>(null);
  const [saving, setSaving] = useState(false);
  const [filters, setFilters] = useState({ moduleId: '', featureId: '', search: '', prepStatus: 'ready' });

  // Test Run Workspace state
  const [currentRun, setCurrentRun] = useState<TestRun | null>(null);
  const [runItems, setRunItems] = useState<TestRunItem[]>([]);
  const [activeItemIndex, setActiveItemIndex] = useState(0);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Form state
  const [execForm, setExecForm] = useState({
    result: '',
    environment: '',
    actual_result: '',
    evidence: '',
    defect_ref: '',
    notes: '',
    is_retest: false,
  });

  // Load Test Run Data
  const fetchTestRunData = async (id: string) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/test-runs?id=${id}&lang=${locale}`);
      if (res.ok) {
        const data = await res.json();
        setCurrentRun(data);
        const items: TestRunItem[] = data.items || [];
        setRunItems(items);

        // Find first not_run item, or default to 0
        const firstNotRun = items.findIndex(it => it.status === 'not_run');
        const initialIdx = firstNotRun >= 0 ? firstNotRun : 0;
        setActiveItemIndex(initialIdx);

        if (items.length > 0 && items[initialIdx]) {
          const item = items[initialIdx];
          setExecForm({
            result: item.status !== 'not_run' ? item.status : '',
            environment: data.environment || 'STG',
            actual_result: item.actual_result || '',
            evidence: item.evidence || '',
            defect_ref: item.defect_ref || '',
            notes: item.notes || '',
            is_retest: false,
          });
        }
      } else {
        toast.error('Test run not found');
        router.push('/test-cases');
      }
    } catch {
      toast.error('Failed to load test run');
    } finally {
      setLoading(false);
    }
  };

  // Standalone list data
  const fetchData = async (page = 1) => {
    const params = new URLSearchParams({
      page: String(page),
      limit: '20',
      prepStatus: filters.prepStatus || '',
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
      if (tcRes.ok) {
        const d = await tcRes.json();
        setTestCases(d.data);
        setPagination(d.pagination);
      }
      if (exRes.ok) setRecentExecs(await exRes.json());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isTestRunMode && runId) {
      fetchTestRunData(runId);
    } else {
      fetch('/api/modules')
        .then(r => r.json())
        .then(d => setModules(Array.isArray(d) ? d : []))
        .catch(() => setModules([]));
      fetch('/api/features')
        .then(r => r.json())
        .then(d => setFeatures(Array.isArray(d) ? d : []))
        .catch(() => setFeatures([]));
      fetchData(1);
    }
  }, [runId, isTestRunMode, locale]);

  useEffect(() => {
    if (!isTestRunMode) {
      fetchData(1);
    }
  }, [filters, locale]);

  const safeFeatures = Array.isArray(features) ? features : [];
  const filteredFeatures = safeFeatures.filter(f => !filters.moduleId || f.module_id === Number(filters.moduleId));

  const openExec = (tc: TestCase) => {
    setExecCase(tc);
    setExecForm({
      result: '',
      environment: 'STG',
      actual_result: '',
      evidence: '',
      defect_ref: '',
      notes: '',
      is_retest: false
    });
  };

  const activeItem = runItems[activeItemIndex] || null;

  // Change active item in Test Run Workspace
  const selectRunItem = (index: number) => {
    if (index < 0 || index >= runItems.length) return;
    if (hasUnsavedChanges) {
      const confirmLeave = window.confirm(t('execution.unsavedWarning', 'You have unsaved changes in this test case. Do you want to continue?'));
      if (!confirmLeave) return;
    }
    setActiveItemIndex(index);
    const item = runItems[index];
    setExecForm({
      result: item.status !== 'not_run' ? item.status : '',
      environment: currentRun?.environment || 'STG',
      actual_result: item.actual_result || '',
      evidence: item.evidence || '',
      defect_ref: item.defect_ref || '',
      notes: item.notes || '',
      is_retest: false,
    });
    setHasUnsavedChanges(false);
  };

  // Save execution in Test Run Workspace
  const saveRunItemExecution = async (autoNext = false) => {
    if (!execForm.result) {
      toast.error('Select an execution result (Pass, Fail, or Blocked)');
      return;
    }
    if (!activeItem || !currentRun) return;

    setSaving(true);
    try {
      const res = await fetch('/api/executions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          test_case_id: activeItem.test_case_id,
          test_run_id: currentRun.id,
          result: execForm.result,
          environment: execForm.environment || currentRun.environment,
          actual_result: execForm.actual_result || null,
          evidence: execForm.evidence || null,
          defect_ref: execForm.defect_ref || null,
          notes: execForm.notes || null,
          is_retest: execForm.is_retest,
        }),
      });

      if (res.ok) {
        toast.success(`${activeItem.case_id}: ${execForm.result.toUpperCase()}`);
        setHasUnsavedChanges(false);

        // Update local item
        const updatedItems = [...runItems];
        updatedItems[activeItemIndex] = {
          ...updatedItems[activeItemIndex],
          status: execForm.result as any,
          actual_result: execForm.actual_result,
          evidence: execForm.evidence,
          defect_ref: execForm.defect_ref,
          notes: execForm.notes,
          executed_at: new Date().toISOString(),
        };
        setRunItems(updatedItems);

        // Check if all are done
        const total = updatedItems.length;
        const passed = updatedItems.filter(i => i.status === 'pass').length;
        const failed = updatedItems.filter(i => i.status === 'fail').length;
        const blocked = updatedItems.filter(i => i.status === 'blocked').length;
        const notRun = updatedItems.filter(i => i.status === 'not_run').length;
        const executed = passed + failed + blocked;
        const progressPct = total > 0 ? Math.round((executed / total) * 100) : 0;
        const passRateTotal = passed + failed;
        const passRatePct = passRateTotal > 0 ? Math.round((passed / passRateTotal) * 100) : 0;

        setCurrentRun(prev => prev ? {
          ...prev,
          passed_cases: passed,
          failed_cases: failed,
          blocked_cases: blocked,
          not_run_cases: notRun,
          progress_pct: progressPct,
          pass_rate_pct: passRatePct,
          status: notRun === 0 ? 'completed' : 'in_progress',
        } : null);

        if (notRun === 0) {
          toast.success(t('execution.runCompletedNotice', 'All test cases in this run have been executed! Test run is marked as Completed.'));
        }

        // Auto next
        if (autoNext && activeItemIndex < runItems.length - 1) {
          selectRunItem(activeItemIndex + 1);
        }
      } else {
        toast.error('Failed to record execution');
      }
    } finally {
      setSaving(false);
    }
  };

  // Standalone save execution
  const saveStandaloneExecution = async () => {
    if (!execForm.result) {
      toast.error('Select execution result');
      return;
    }
    if (!execCase) return;
    setSaving(true);
    try {
      const res = await fetch('/api/executions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          test_case_id: execCase.id,
          ...execForm,
        }),
      });
      if (res.ok) {
        toast.success(`Execution saved: ${execForm.result.toUpperCase()}`);
        setExecCase(null);
        fetchData(pagination.page);
      }
    } finally {
      setSaving(false);
    }
  };

  // ==========================================
  // RENDER TEST RUN WORKSPACE MODE
  // ==========================================
  if (isTestRunMode) {
    if (loading || !currentRun) {
      return (
        <AppShell>
          <div style={{ display: 'flex', justifyContent: 'center', padding: '100px 0' }}>
            <LoadingSpinner size="lg" />
          </div>
        </AppShell>
      );
    }

    const total = currentRun.total_cases ?? runItems.length;
    const passed = currentRun.passed_cases ?? runItems.filter(i => i.status === 'pass').length;
    const failed = currentRun.failed_cases ?? runItems.filter(i => i.status === 'fail').length;
    const blocked = currentRun.blocked_cases ?? runItems.filter(i => i.status === 'blocked').length;
    const notRun = currentRun.not_run_cases ?? runItems.filter(i => i.status === 'not_run').length;
    const executed = passed + failed + blocked;
    const progressPct = total > 0 ? Math.round((executed / total) * 100) : 0;
    const passRateTotal = passed + failed;
    const passRatePct = passRateTotal > 0 ? Math.round((passed / passRateTotal) * 100) : 0;

    return (
      <AppShell>
        {/* Test Run Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20, flexWrap: 'wrap', gap: 12 }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => router.push('/test-cases')}
                style={{ display: 'flex', alignItems: 'center', gap: 4 }}
                id="btn-back-to-testcases"
              >
                <ArrowLeft size={14} />
                <span>{t('execution.backToTestCases', 'Back to Test Cases')}</span>
              </button>
              <span className={`badge ${currentRun.status === 'completed' ? 'badge-pass' : 'badge-inprogress'}`} style={{ textTransform: 'capitalize' }}>
                {currentRun.status.replace('_', ' ')}
              </span>
              <span className="badge badge-blue">{currentRun.environment || 'STG'}</span>
            </div>
            <h1 className="page-title" style={{ fontSize: 22, marginTop: 4 }}>
              {currentRun.name}
            </h1>
            {currentRun.description && (
              <p className="page-subtitle" style={{ marginTop: 2 }}>{currentRun.description}</p>
            )}
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <LanguageSwitcher />
            <ThemeToggle />
          </div>
        </div>

        {/* Test Run Summary Metrics Bar */}
        <div className="card" style={{ padding: '16px 20px', marginBottom: 20 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))', gap: 16, alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 11, color: 'var(--foreground-muted)', fontWeight: 600 }}>TOTAL CASES</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--foreground)' }}>{total}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--foreground-muted)', fontWeight: 600 }}>{t('execution.progress', 'Execution Progress')}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 18, fontWeight: 700, color: 'var(--primary)' }}>{progressPct}%</span>
                <span style={{ fontSize: 12, color: 'var(--foreground-muted)' }}>({executed}/{total})</span>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--foreground-muted)', fontWeight: 600 }}>{t('execution.passRate', 'Pass Rate')}</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: passRatePct >= 80 ? 'var(--success)' : 'var(--warning)' }}>
                {passRatePct}%
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--success)', fontWeight: 600 }}>PASS</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--success)' }}>{passed}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--error)', fontWeight: 600 }}>FAIL</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--error)' }}>{failed}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--warning)', fontWeight: 600 }}>BLOCKED</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--warning)' }}>{blocked}</div>
            </div>
            <div>
              <div style={{ fontSize: 11, color: 'var(--foreground-muted)', fontWeight: 600 }}>NOT RUN</div>
              <div style={{ fontSize: 18, fontWeight: 700, color: 'var(--foreground-muted)' }}>{notRun}</div>
            </div>
          </div>
        </div>

        {/* Workspace Layout: Left Sidebar Case Order / Right Execution Panel */}
        <div className="execution-workspace-grid">
          {/* Left Column: Ordered Cases in Test Run */}
          <div className="card" style={{ padding: '16px', maxHeight: 'calc(100vh - 280px)', overflowY: 'auto' }}>
            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span>{t('testCases.selectedCasesToRun', 'Test Cases in this Run')} ({runItems.length})</span>
            </div>
            <div style={{ fontSize: 11, color: 'var(--foreground-muted)', marginBottom: 12 }}>
              {t('testCases.orderNotice', 'Execution order: Module → Feature → Case ID (Ascending)')}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {runItems.map((item, idx) => {
                const isActive = idx === activeItemIndex;
                const statusBorder = {
                  pass: 'var(--success)',
                  fail: 'var(--error)',
                  blocked: 'var(--warning)',
                  not_run: 'transparent',
                }[item.status] || 'transparent';

                return (
                  <div
                    key={item.id}
                    onClick={() => selectRunItem(idx)}
                    style={{
                      padding: '10px 12px',
                      borderRadius: 6,
                      background: isActive ? 'var(--surface-2)' : 'transparent',
                      borderLeft: `4px solid ${isActive ? 'var(--primary)' : statusBorder}`,
                      cursor: 'pointer',
                      border: isActive ? '1px solid var(--primary)' : '1px solid var(--border)',
                      transition: 'all 0.15s ease',
                    }}
                    id={`run-item-${item.test_case_id}`}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--primary)' }}>
                        #{idx + 1} {item.case_id}
                      </span>
                      <ResultBadge result={item.status} />
                    </div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {item.title}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--foreground-muted)', display: 'flex', gap: 6, marginTop: 2 }}>
                      <span>{item.module_name}</span>
                      <span>·</span>
                      <span>{item.feature_name}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Right Column: Active Case Details & Execution Form */}
          {activeItem ? (
            <div className="card" style={{ padding: '24px' }}>
              {/* Header and Step Navigation */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 14 }}>
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <code style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)' }}>{activeItem.case_id}</code>
                    <PriorityBadge priority={activeItem.priority || 'medium'} />
                    <ResultBadge result={activeItem.status} />
                  </div>
                  <h2 style={{ fontSize: 18, fontWeight: 700, margin: 0, color: 'var(--foreground)' }}>
                    {activeItem.title}
                  </h2>
                  <div style={{ fontSize: 12, color: 'var(--foreground-muted)', marginTop: 4 }}>
                    {activeItem.module_name} · {activeItem.feature_name}
                    {activeItem.requirement_ref && ` · REQ: ${activeItem.requirement_ref}`}
                  </div>
                </div>

                {/* Navigation Buttons */}
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    disabled={activeItemIndex === 0}
                    onClick={() => selectRunItem(activeItemIndex - 1)}
                    title={t('execution.prevCase', 'Previous Test Case')}
                    id="btn-prev-case"
                  >
                    <ChevronLeft size={16} />
                  </button>
                  <span style={{ display: 'flex', alignItems: 'center', fontSize: 12, fontWeight: 600, color: 'var(--foreground-muted)' }}>
                    {activeItemIndex + 1} / {runItems.length}
                  </span>
                  <button
                    className="btn btn-secondary btn-sm"
                    disabled={activeItemIndex === runItems.length - 1}
                    onClick={() => selectRunItem(activeItemIndex + 1)}
                    title={t('execution.nextCase', 'Next Test Case')}
                    id="btn-next-case"
                  >
                    <ChevronRight size={16} />
                  </button>
                </div>
              </div>

              {/* Case Specifications (Preconditions, Steps, Expected Result) */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 20 }}>
                {activeItem.preconditions && (
                  <div style={{ gridColumn: '1 / -1', background: 'var(--surface-2)', padding: '10px 14px', borderRadius: 6, fontSize: 13 }}>
                    <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--foreground-muted)', marginBottom: 2 }}>
                      {t('testCases.preconditions', 'PRECONDITIONS')}
                    </div>
                    <div style={{ whiteSpace: 'pre-wrap' }}>{activeItem.preconditions}</div>
                  </div>
                )}

                <div style={{ background: 'var(--surface-2)', padding: '12px 14px', borderRadius: 6, fontSize: 13 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--foreground-muted)', marginBottom: 4 }}>
                    {t('testCases.testSteps', 'TEST STEPS')}
                  </div>
                  <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                    {activeItem.test_steps || '-'}
                  </div>
                  {activeItem.test_data && (
                    <div style={{ marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--border)', fontSize: 12 }}>
                      <span style={{ fontWeight: 600 }}>{t('testCases.testData', 'Test Data')}: </span>
                      <code>{activeItem.test_data}</code>
                    </div>
                  )}
                </div>

                <div style={{ background: 'var(--surface-2)', padding: '12px 14px', borderRadius: 6, fontSize: 13 }}>
                  <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--foreground-muted)', marginBottom: 4 }}>
                    {t('testCases.expectedResult', 'EXPECTED RESULT')}
                  </div>
                  <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.5 }}>
                    {activeItem.expected_result || '-'}
                  </div>
                </div>
              </div>

              {/* Execution Form Inputs */}
              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 18 }}>
                <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 14 }}>
                  {t('execution.recordExecution', 'Record Execution Result')}
                </h3>

                {/* Result Selection Buttons */}
                <div className="form-group" style={{ marginBottom: 14 }}>
                  <label className="form-label" style={{ fontWeight: 600 }}>
                    {t('execution.result', 'Execution Result')} <span style={{ color: 'var(--error)' }}>*</span>
                  </label>
                  <div className="execution-result-buttons">
                    {[
                      { value: 'pass', label: '✅ Pass', bg: 'var(--success)', cls: 'badge-pass' },
                      { value: 'fail', label: '❌ Fail', bg: 'var(--error)', cls: 'badge-fail' },
                      { value: 'blocked', label: '🚧 Blocked', bg: 'var(--warning)', cls: 'badge-blocked' },
                      { value: 'not_run', label: '⬜ Not Run', bg: 'var(--foreground-muted)', cls: 'badge-notrun' },
                    ].map(opt => (
                      <button
                        key={opt.value}
                        type="button"
                        className={`btn ${execForm.result === opt.value ? 'btn-primary' : 'btn-secondary'}`}
                        style={{
                          height: 40,
                          fontSize: 13,
                          fontWeight: 600,
                          borderColor: execForm.result === opt.value ? opt.bg : undefined,
                          background: execForm.result === opt.value ? 'var(--primary)' : undefined,
                        }}
                        onClick={() => {
                          setExecForm(p => ({ ...p, result: opt.value }));
                          setHasUnsavedChanges(true);
                        }}
                        id={`btn-result-${opt.value}`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid-2" style={{ gap: 14, marginBottom: 14 }}>
                  <div className="form-group">
                    <label className="form-label">{t('execution.environment', 'Environment')}</label>
                    <input
                      className="form-control"
                      value={execForm.environment}
                      placeholder="e.g. STG, PROD, DEV"
                      onChange={e => {
                        setExecForm(p => ({ ...p, environment: e.target.value }));
                        setHasUnsavedChanges(true);
                      }}
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">{t('execution.defectRef', 'Defect Reference (if failed)')}</label>
                    <input
                      className="form-control"
                      value={execForm.defect_ref}
                      placeholder="e.g. BUG-102, JIRA-404"
                      onChange={e => {
                        setExecForm(p => ({ ...p, defect_ref: e.target.value }));
                        setHasUnsavedChanges(true);
                      }}
                      id="input-defect-ref"
                    />
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: 14 }}>
                  <label className="form-label">{t('execution.actualResult', 'Actual Result Observed')}</label>
                  <textarea
                    className="form-control"
                    rows={2}
                    placeholder="Describe what occurred during execution..."
                    value={execForm.actual_result}
                    onChange={e => {
                      setExecForm(p => ({ ...p, actual_result: e.target.value }));
                      setHasUnsavedChanges(true);
                    }}
                    id="input-actual-result"
                  />
                </div>

                <div className="grid-2" style={{ gap: 14, marginBottom: 18 }}>
                  <div className="form-group">
                    <label className="form-label">{t('testCases.evidence', 'Evidence Link / Screenshot')}</label>
                    <input
                      className="form-control"
                      placeholder={t('execution.evidencePlaceholder', 'https://jam.dev/... or evidence link')}
                      value={execForm.evidence}
                      onChange={e => {
                        setExecForm(p => ({ ...p, evidence: e.target.value }));
                        setHasUnsavedChanges(true);
                      }}
                      id="input-evidence"
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Notes</label>
                    <input
                      className="form-control"
                      placeholder={t('execution.notesPlaceholder', 'Execution notes or observations...')}
                      value={execForm.notes}
                      onChange={e => {
                        setExecForm(p => ({ ...p, notes: e.target.value }));
                        setHasUnsavedChanges(true);
                      }}
                    />
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, flexWrap: 'wrap', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <input
                      type="checkbox"
                      id="chk-is-retest"
                      checked={execForm.is_retest}
                      onChange={e => {
                        setExecForm(p => ({ ...p, is_retest: e.target.checked }));
                        setHasUnsavedChanges(true);
                      }}
                    />
                    <label htmlFor="chk-is-retest" style={{ fontSize: 13, cursor: 'pointer' }}>
                      {t('execution.isRetest', 'This is a Retest after Bug Fix')}
                    </label>
                  </div>

                  <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                    <button
                      className="btn btn-secondary"
                      onClick={() => saveRunItemExecution(false)}
                      disabled={saving || !execForm.result}
                      id="btn-save-execution"
                    >
                      <Save size={14} />
                      <span>{saving ? 'Saving...' : 'Save Result'}</span>
                    </button>

                    <button
                      className="btn btn-primary"
                      onClick={() => saveRunItemExecution(true)}
                      disabled={saving || !execForm.result}
                      id="btn-save-and-next"
                    >
                      <span>{t('execution.saveAndNext', 'Save & Next')}</span>
                      <ChevronRight size={14} />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="card" style={{ padding: '60px 20px', textAlign: 'center' }}>
              <div style={{ color: 'var(--foreground-muted)' }}>Select a test case to execute</div>
            </div>
          )}
        </div>
      </AppShell>
    );
  }

  // ==========================================
  // RENDER STANDALONE EXECUTION MODE (LEGACY)
  // ==========================================
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

      <div className="execution-single-grid">
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
                  <button className="btn btn-primary" onClick={saveStandaloneExecution} disabled={saving || !execForm.result} style={{ flex: 1 }} id="btn-confirm-execution">
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

export default function ExecutionPage() {
  return (
    <Suspense fallback={
      <AppShell>
        <div style={{ display: 'flex', justifyContent: 'center', padding: '100px 0' }}>
          <LoadingSpinner size="lg" />
        </div>
      </AppShell>
    }>
      <ExecutionContent />
    </Suspense>
  );
}
