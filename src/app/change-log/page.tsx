'use client';

import { useEffect, useState, useCallback } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { Modal, ConfirmModal } from '@/components/ui/Modal';
import { LoadingSpinner, EmptyState, Pagination } from '@/components/ui/Shared';
import { useToast } from '@/components/ui/Toast';
import {
  History, Eye, RotateCcw, Download, CheckCircle2,
  AlertTriangle, Archive, Ban, FileText, CheckCircle, XCircle
} from 'lucide-react';
import type { ChangeLog } from '@/lib/types';
import { useI18n } from '@/lib/i18n/context';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';

interface DeleteClassification {
  is_delete: boolean;
  delete_type: string;
  badge_label: string;
  can_restore?: boolean;
  reason_description?: string;
}

interface LogDetailData {
  log: ChangeLog;
  deleteClassification: DeleteClassification;
  testCase: any | null;
  executions: any[];
  translations: any[];
  historyLogs: any[];
}

export default function ChangeLogPage() {
  const { t } = useI18n();
  const toast = useToast();
  const [logs, setLogs] = useState<(ChangeLog & { deleteClassification?: DeleteClassification })[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 25, totalPages: 1 });
  const [entityType, setEntityType] = useState('');

  // Detail Modal State
  const [selectedLogId, setSelectedLogId] = useState<number | null>(null);
  const [detailData, setDetailData] = useState<LogDetailData | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [activeTab, setActiveTab] = useState<'details' | 'executions' | 'trail' | 'diff'>('details');

  // Restore Modal State
  const [showRestoreModal, setShowRestoreModal] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const fetchLogs = useCallback(async (page = 1) => {
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: '25',
        ...(entityType && { entityType }),
      });
      const res = await fetch(`/api/change-log?${params}`);
      if (res.ok) {
        const data = await res.json();
        setLogs(data.data || []);
        setPagination(data.pagination || { total: 0, page: 1, limit: 25, totalPages: 1 });
      }
    } finally {
      setLoading(false);
    }
  }, [entityType]);

  useEffect(() => {
    fetchLogs(1);
  }, [fetchLogs]);

  const loadLogDetail = async (logId: number) => {
    setSelectedLogId(logId);
    setLoadingDetail(true);
    setActiveTab('details');
    try {
      const res = await fetch(`/api/change-log/${logId}`);
      if (res.ok) {
        const data = await res.json();
        setDetailData(data);
      } else {
        toast.error('Failed to load change log detail');
      }
    } catch {
      toast.error('Network error loading change log detail');
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleConfirmRestore = async () => {
    if (!detailData || !detailData.testCase) return;
    setRestoring(true);
    try {
      const tcId = detailData.testCase.id;
      const res = await fetch(`/api/test-cases/${tcId}/restore`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: `Restored from Change Log #${detailData.log.id} (${detailData.deleteClassification?.badge_label || 'Delete Recovery'})`,
        }),
      });

      const resData = await res.json();
      if (res.ok && resData.success) {
        toast.success(resData.message || `Test case ${detailData.testCase.case_id} restored to Active`);
        setShowRestoreModal(false);
        // Refresh detail and table
        await loadLogDetail(detailData.log.id);
        fetchLogs(pagination.page);
      } else {
        toast.error(resData.error || 'Failed to restore test case');
      }
    } catch {
      toast.error('Network error while restoring test case');
    } finally {
      setRestoring(false);
    }
  };

  const parseJson = (val: string | null) => {
    if (!val) return null;
    try {
      return JSON.parse(val);
    } catch {
      return val;
    }
  };

  const getBadgeClass = (log: ChangeLog & { deleteClassification?: DeleteClassification }) => {
    const classification = log.deleteClassification;
    if (classification?.delete_type === 'row_delete') return 'badge-archived';
    if (classification?.delete_type === 'bulk_delete') return 'badge-archived';
    if (classification?.delete_type === 'unverified') return 'badge-muted';
    if (classification?.delete_type === 'restore') return 'badge-active';

    if (log.change_type === 'created') return 'badge-active';
    if (log.change_type === 'obsolete') return 'badge-archived';
    if (log.change_type === 'archived') return 'badge-archived';
    if (log.change_type === 'updated') return 'badge-primary';
    return 'badge-muted';
  };

  const getBadgeLabel = (log: ChangeLog & { deleteClassification?: DeleteClassification }) => {
    if (log.deleteClassification?.badge_label) {
      return log.deleteClassification.badge_label;
    }
    return log.change_type;
  };

  return (
    <AppShell>
      <header className="page-header main-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <History size={20} style={{ color: 'var(--primary)' }} />
            {t('changeLog.title', 'Audit & Change Log')}
          </h1>
          <p className="page-subtitle">
            {t('changeLog.subtitle', 'Complete historical audit log of changes to test cases, requirements, modules, and testing statuses')}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <a href="/api/export?type=change-log" download="change_log.csv" className="btn btn-secondary">
            <Download size={14} /> CSV
          </a>
          <a href="/api/export?type=change-log&format=xlsx" download="change_log.xlsx" className="btn btn-secondary">
            <Download size={14} /> Excel (.xlsx)
          </a>
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </header>

      {/* Filter Bar */}
      <div className="card card-sm" style={{ marginBottom: 20 }}>
        <div className="filters-bar">
          <select
            className="form-control"
            style={{ width: 220 }}
            value={entityType}
            onChange={e => setEntityType(e.target.value)}
          >
            <option value="">All Entity Types</option>
            <option value="test_case">Test Case</option>
            <option value="requirement">Requirement / PRD</option>
            <option value="module">Module</option>
            <option value="feature">Feature</option>
          </select>
        </div>
      </div>

      {/* Change Log Table */}
      {loading ? (
        <LoadingSpinner size="lg" />
      ) : logs.length === 0 ? (
        <EmptyState
          icon={<History size={32} />}
          title="No change history yet"
          description="Creation, update, and status change activities for test cases and requirements will be logged here."
        />
      ) : (
        <>
          <div className="table-container" style={{ marginBottom: 16 }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: 150 }}>Timestamp</th>
                  <th style={{ width: 110 }}>Entity</th>
                  <th style={{ width: 120 }}>Ref ID</th>
                  <th style={{ width: 190 }}>Change Type / Origin</th>
                  <th>Reason / Description</th>
                  <th style={{ width: 130 }}>Requirement Ref</th>
                  <th style={{ width: 80, textAlign: 'center' }}>Action</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.id}>
                    <td style={{ fontSize: 12, color: 'var(--foreground-muted)' }}>
                      {new Date(log.changed_at).toLocaleString('en-US')}
                    </td>
                    <td>
                      <span className="badge" style={{ background: 'var(--surface-3)', textTransform: 'capitalize' }}>
                        {log.entity_type.replace('_', ' ')}
                      </span>
                    </td>
                    <td>
                      <code style={{ fontSize: 12, fontWeight: 600, color: 'var(--primary)' }}>
                        {log.entity_ref}
                      </code>
                    </td>
                    <td>
                      <span className={`badge ${getBadgeClass(log)}`}>
                        {getBadgeLabel(log)}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontSize: 13, color: 'var(--foreground)' }}>
                        {log.reason || '—'}
                      </div>
                      {log.changed_fields && (
                        <div style={{ fontSize: 11, color: 'var(--foreground-muted)', marginTop: 2 }}>
                          Fields changed: {log.changed_fields}
                        </div>
                      )}
                    </td>
                    <td>
                      {log.requirement_ref ? (
                        <code style={{ fontSize: 11 }}>{log.requirement_ref}</code>
                      ) : (
                        <span style={{ color: 'var(--foreground-dim)' }}>—</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        className="btn btn-secondary btn-icon btn-sm"
                        title="View Details"
                        onClick={() => loadLogDetail(log.id)}
                      >
                        <Eye size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination
            page={pagination.page}
            totalPages={pagination.totalPages}
            onPageChange={p => fetchLogs(p)}
          />
        </>
      )}

      {/* Main View Detail Modal */}
      <Modal
        isOpen={Boolean(selectedLogId)}
        onClose={() => { setSelectedLogId(null); setDetailData(null); }}
        title={
          detailData
            ? `${detailData.log.entity_type === 'test_case' ? 'Test Case Detail' : 'Change Details'}: ${detailData.log.entity_ref} (${detailData.deleteClassification?.badge_label || detailData.log.change_type})`
            : 'Loading Change Log Detail...'
        }
        footer={
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
            <div>
              {detailData?.deleteClassification?.can_restore && (
                <button
                  className="btn btn-primary"
                  onClick={() => setShowRestoreModal(true)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                >
                  <RotateCcw size={14} />
                  Restore to Active
                </button>
              )}
            </div>
            <button
              className="btn btn-secondary"
              onClick={() => { setSelectedLogId(null); setDetailData(null); }}
            >
              Close
            </button>
          </div>
        }
      >
        {loadingDetail ? (
          <div style={{ padding: 40, display: 'flex', justifyContent: 'center' }}>
            <LoadingSpinner size="lg" />
          </div>
        ) : !detailData ? (
          <div style={{ padding: 20, textAlign: 'center', color: 'var(--foreground-muted)' }}>
            No detail data available.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Delete/Status Notice Banner */}
            {detailData.deleteClassification?.is_delete ? (
              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: 8,
                  background: 'rgba(239, 68, 68, 0.08)',
                  border: '1px solid rgba(239, 68, 68, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                {detailData.deleteClassification.delete_type === 'row_delete' ? (
                  <Archive size={20} style={{ color: '#ef4444', flexShrink: 0 }} />
                ) : (
                  <Ban size={20} style={{ color: '#f59e0b', flexShrink: 0 }} />
                )}
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, color: '#ef4444', fontSize: 13 }}>
                    {detailData.deleteClassification.badge_label}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--foreground-muted)', marginTop: 2 }}>
                    {detailData.deleteClassification.reason_description}
                    {detailData.deleteClassification.can_restore && (
                      <span style={{ marginLeft: 6, fontWeight: 500, color: 'var(--primary)' }}>
                        — Ready for recovery. You can restore this test case back to Active.
                      </span>
                    )}
                  </div>
                </div>
              </div>
            ) : detailData.deleteClassification?.delete_type === 'unverified' ? (
              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: 8,
                  background: 'rgba(245, 158, 11, 0.08)',
                  border: '1px solid rgba(245, 158, 11, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <AlertTriangle size={20} style={{ color: '#f59e0b', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, color: '#f59e0b', fontSize: 13 }}>
                    Obsolete (Perlu Verifikasi)
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--foreground-muted)', marginTop: 2 }}>
                    This test case is marked as Obsolete (Perlu Verifikasi). You can restore this test case to Active using the &quot;Restore to Active&quot; button below upon confirmation.
                  </div>
                </div>
              </div>
            ) : detailData.deleteClassification?.delete_type === 'restore' ? (
              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: 8,
                  background: 'rgba(16, 185, 129, 0.08)',
                  border: '1px solid rgba(16, 185, 129, 0.25)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                }}
              >
                <CheckCircle2 size={20} style={{ color: '#10b981', flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, color: '#10b981', fontSize: 13 }}>
                    Restored to Active
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--foreground-muted)', marginTop: 2 }}>
                    {detailData.deleteClassification.reason_description}
                  </div>
                </div>
              </div>
            ) : null}

            {/* Test Case Detail View if entity is test_case */}
            {detailData.testCase ? (
              <div>
                {/* Navigation Tabs inside modal */}
                <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--border)', marginBottom: 16 }}>
                  <button
                    className={`btn btn-sm ${activeTab === 'details' ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setActiveTab('details')}
                  >
                    Test Case Details
                  </button>
                  <button
                    className={`btn btn-sm ${activeTab === 'executions' ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setActiveTab('executions')}
                  >
                    Execution History ({detailData.executions.length})
                  </button>
                  <button
                    className={`btn btn-sm ${activeTab === 'trail' ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setActiveTab('trail')}
                  >
                    Historical Trail ({detailData.historyLogs.length})
                  </button>
                  <button
                    className={`btn btn-sm ${activeTab === 'diff' ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setActiveTab('diff')}
                  >
                    Log Raw Diff
                  </button>
                </div>

                {/* TAB 1: Test Case Details */}
                {activeTab === 'details' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                    {/* Header Block */}
                    <div style={{ background: 'var(--surface-2)', padding: 14, borderRadius: 8 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                            <code style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)' }}>
                              {detailData.testCase.case_id}
                            </code>
                            <span className="badge badge-sm" style={{ background: 'var(--surface-3)' }}>
                              {detailData.testCase.module_name || 'Module'}
                            </span>
                            {detailData.testCase.feature_name && (
                              <span className="badge badge-sm" style={{ background: 'var(--surface-3)' }}>
                                {detailData.testCase.feature_name}
                              </span>
                            )}
                          </div>
                          <h3 style={{ fontSize: 15, fontWeight: 600, color: 'var(--foreground)', margin: 0 }}>
                            {detailData.testCase.title}
                          </h3>
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                          <span className={`badge badge-${detailData.testCase.lifecycle_status === 'active' ? 'active' : 'archived'}`}>
                            {detailData.testCase.lifecycle_status}
                          </span>
                          <span className="badge badge-muted">
                            {detailData.testCase.priority}
                          </span>
                          <span className="badge badge-muted">
                            {detailData.testCase.prep_status}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Metadata Grid */}
                    <div className="grid-3" style={{ gap: 12 }}>
                      <div>
                        <div style={{ fontSize: 11, color: 'var(--foreground-muted)' }}>Requirement Reference</div>
                        <div style={{ fontSize: 13, fontWeight: 500, marginTop: 2 }}>
                          {detailData.testCase.requirement_ref || <span style={{ color: 'var(--foreground-dim)' }}>—</span>}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: 'var(--foreground-muted)' }}>Test Type</div>
                        <div style={{ fontSize: 13, fontWeight: 500, marginTop: 2, textTransform: 'capitalize' }}>
                          {detailData.testCase.test_type || 'Functional'}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: 'var(--foreground-muted)' }}>Latest Result</div>
                        <div style={{ fontSize: 13, fontWeight: 500, marginTop: 2 }}>
                          <span className={`badge badge-${
                            detailData.testCase.latest_result === 'pass' ? 'active' :
                            detailData.testCase.latest_result === 'fail' ? 'archived' : 'muted'
                          }`}>
                            {detailData.testCase.latest_result || detailData.testCase.exec_status || 'not_run'}
                          </span>
                        </div>
                      </div>

                      <div>
                        <div style={{ fontSize: 11, color: 'var(--foreground-muted)' }}>Defect Reference</div>
                        <div style={{ fontSize: 13, fontWeight: 500, marginTop: 2 }}>
                          {detailData.testCase.defect_ref || <span style={{ color: 'var(--foreground-dim)' }}>—</span>}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: 'var(--foreground-muted)' }}>Created Date</div>
                        <div style={{ fontSize: 12, marginTop: 2 }}>
                          {detailData.testCase.created_at ? new Date(detailData.testCase.created_at).toLocaleString() : '—'}
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: 'var(--foreground-muted)' }}>
                          {detailData.testCase.lifecycle_status === 'archived' ? 'Archived Date' :
                           detailData.testCase.lifecycle_status === 'obsolete' ? 'Obsoleted Date' : 'Last Updated'}
                        </div>
                        <div style={{ fontSize: 12, marginTop: 2 }}>
                          {detailData.testCase.updated_at ? new Date(detailData.testCase.updated_at).toLocaleString() : '—'}
                        </div>
                      </div>
                    </div>

                    {/* Specifications */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground)', marginBottom: 4 }}>
                          Preconditions
                        </div>
                        <div style={{ background: 'var(--surface-2)', padding: '10px 12px', borderRadius: 6, fontSize: 12, whiteSpace: 'pre-wrap' }}>
                          {detailData.testCase.preconditions || <span style={{ color: 'var(--foreground-dim)' }}>None</span>}
                        </div>
                      </div>

                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground)', marginBottom: 4 }}>
                          Test Steps
                        </div>
                        <div style={{ background: 'var(--surface-2)', padding: '10px 12px', borderRadius: 6, fontSize: 12, whiteSpace: 'pre-wrap' }}>
                          {detailData.testCase.test_steps || <span style={{ color: 'var(--foreground-dim)' }}>None</span>}
                        </div>
                      </div>

                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground)', marginBottom: 4 }}>
                          Test Data
                        </div>
                        <div style={{ background: 'var(--surface-2)', padding: '10px 12px', borderRadius: 6, fontSize: 12, whiteSpace: 'pre-wrap' }}>
                          {detailData.testCase.test_data || <span style={{ color: 'var(--foreground-dim)' }}>None</span>}
                        </div>
                      </div>

                      <div>
                        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground)', marginBottom: 4 }}>
                          Expected Result
                        </div>
                        <div style={{ background: 'var(--surface-2)', padding: '10px 12px', borderRadius: 6, fontSize: 12, whiteSpace: 'pre-wrap' }}>
                          {detailData.testCase.expected_result || <span style={{ color: 'var(--foreground-dim)' }}>None</span>}
                        </div>
                      </div>

                      {detailData.testCase.notes && (
                        <div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground)', marginBottom: 4 }}>
                            Notes / Remarks
                          </div>
                          <div style={{ background: 'var(--surface-2)', padding: '10px 12px', borderRadius: 6, fontSize: 12, whiteSpace: 'pre-wrap' }}>
                            {detailData.testCase.notes}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* TAB 2: Execution History */}
                {activeTab === 'executions' && (
                  <div>
                    {detailData.executions.length === 0 ? (
                      <div style={{ padding: 24, textAlign: 'center', color: 'var(--foreground-muted)' }}>
                        No execution runs recorded for this test case.
                      </div>
                    ) : (
                      <div className="table-container">
                        <table>
                          <thead>
                            <tr>
                              <th>Date</th>
                              <th>Tester</th>
                              <th>Environment</th>
                              <th>Result</th>
                              <th>Actual Result</th>
                              <th>Defect / Evidence</th>
                            </tr>
                          </thead>
                          <tbody>
                            {detailData.executions.map((ex: any) => (
                              <tr key={ex.id}>
                                <td style={{ fontSize: 12 }}>
                                  {new Date(ex.exec_date || ex.created_at).toLocaleString()}
                                </td>
                                <td style={{ fontSize: 12 }}>{ex.tester_name || 'QA'}</td>
                                <td style={{ fontSize: 12 }}>{ex.environment || 'Default'}</td>
                                <td>
                                  <span className={`badge badge-${ex.result === 'pass' ? 'active' : ex.result === 'fail' ? 'archived' : 'muted'}`}>
                                    {ex.result}
                                  </span>
                                </td>
                                <td style={{ fontSize: 12 }}>{ex.actual_result || '—'}</td>
                                <td style={{ fontSize: 12 }}>
                                  {ex.defect_ref && <span style={{ marginRight: 6 }}>{ex.defect_ref}</span>}
                                  {ex.evidence && <span style={{ color: 'var(--primary)' }}>[Evidence]</span>}
                                  {!ex.defect_ref && !ex.evidence && '—'}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 3: Historical Trail */}
                {activeTab === 'trail' && (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <div style={{ fontSize: 12, color: 'var(--foreground-muted)' }}>
                      Complete lifecycle and modification history for {detailData.testCase.case_id}:
                    </div>
                    {detailData.historyLogs.map((h: any, idx: number) => (
                      <div
                        key={h.id}
                        style={{
                          background: 'var(--surface-2)',
                          padding: '10px 14px',
                          borderRadius: 6,
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          borderLeft: `4px solid ${
                            h.change_type === 'created' ? 'var(--success)' :
                            h.change_type === 'restored' ? 'var(--primary)' :
                            h.change_type === 'archived' || h.change_type === 'obsolete' ? 'var(--error)' : 'var(--border)'
                          }`,
                        }}
                      >
                        <div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase' }}>
                              {idx + 1}. {h.change_type}
                            </span>
                            <span style={{ fontSize: 11, color: 'var(--foreground-muted)' }}>
                              {new Date(h.changed_at).toLocaleString()}
                            </span>
                          </div>
                          <div style={{ fontSize: 12, color: 'var(--foreground)', marginTop: 2 }}>
                            {h.reason || 'No description provided'}
                          </div>
                          {h.changed_fields && (
                            <div style={{ fontSize: 11, color: 'var(--foreground-muted)' }}>
                              Fields: {h.changed_fields}
                            </div>
                          )}
                        </div>
                        <div>
                          <button
                            className="btn btn-secondary btn-sm"
                            onClick={() => loadLogDetail(h.id)}
                            style={{ fontSize: 11 }}
                          >
                            Inspect Log #{h.id}
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* TAB 4: Raw Log Diff */}
                {activeTab === 'diff' && (
                  <div className="grid-2" style={{ gap: 14 }}>
                    <div style={{ background: 'var(--surface-2)', padding: 12, borderRadius: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--error)', marginBottom: 8 }}>
                        🔴 Previous Values (Old):
                      </div>
                      {detailData.log.old_values ? (
                        <pre style={{ fontSize: 11, color: 'var(--foreground)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                          {JSON.stringify(parseJson(detailData.log.old_values), null, 2)}
                        </pre>
                      ) : (
                        <div style={{ fontSize: 12, color: 'var(--foreground-dim)', fontStyle: 'italic' }}>None</div>
                      )}
                    </div>
                    <div style={{ background: 'var(--surface-2)', padding: 12, borderRadius: 8 }}>
                      <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--success)', marginBottom: 8 }}>
                        🟢 New Values (New):
                      </div>
                      {detailData.log.new_values ? (
                        <pre style={{ fontSize: 11, color: 'var(--foreground)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                          {JSON.stringify(parseJson(detailData.log.new_values), null, 2)}
                        </pre>
                      ) : (
                        <div style={{ fontSize: 12, color: 'var(--foreground-dim)', fontStyle: 'italic' }}>None</div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* Non-Test-Case entity view (Requirements, Modules, Features) */
              <div>
                <div className="grid-2" style={{ gap: 14 }}>
                  <div style={{ background: 'var(--surface-2)', padding: 12, borderRadius: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--error)', marginBottom: 8 }}>
                      🔴 Previous Values (Old):
                    </div>
                    {detailData.log.old_values ? (
                      <pre style={{ fontSize: 11, color: 'var(--foreground)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                        {JSON.stringify(parseJson(detailData.log.old_values), null, 2)}
                      </pre>
                    ) : (
                      <div style={{ fontSize: 12, color: 'var(--foreground-dim)', fontStyle: 'italic' }}>None</div>
                    )}
                  </div>
                  <div style={{ background: 'var(--surface-2)', padding: 12, borderRadius: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--success)', marginBottom: 8 }}>
                      🟢 New Values (New):
                    </div>
                    {detailData.log.new_values ? (
                      <pre style={{ fontSize: 11, color: 'var(--foreground)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                        {JSON.stringify(parseJson(detailData.log.new_values), null, 2)}
                      </pre>
                    ) : (
                      <div style={{ fontSize: 12, color: 'var(--foreground-dim)', fontStyle: 'italic' }}>None</div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Restore Confirmation Modal */}
      <ConfirmModal
        isOpen={showRestoreModal}
        onClose={() => setShowRestoreModal(false)}
        onConfirm={handleConfirmRestore}
        title="Restore Test Case?"
        message="Are you sure you want to restore this test case to Active? All existing test case details and execution history will be preserved."
        confirmLabel="Restore to Active"
        loading={restoring}
      />
    </AppShell>
  );
}
