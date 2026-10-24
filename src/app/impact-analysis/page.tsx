'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { Modal, ConfirmModal } from '@/components/ui/Modal';
import { EmptyState, LoadingSpinner } from '@/components/ui/Shared';
import { useToast } from '@/components/ui/Toast';
import {
  AlertTriangle, CheckCircle, RefreshCw, Sparkles, Edit2,
  Trash2, ShieldAlert, ArrowRight, Eye, Check, X, Filter
} from 'lucide-react';
import Link from 'next/link';
import type { Module } from '@/lib/types';

interface ImpactItem {
  id: string;
  requirementId: number;
  requirementRef: string;
  requirementTitle: string;
  requirementVersion: number;
  changeType: string;
  requirementStatus: string;
  moduleName: string;
  featureName: string;
  testCaseId?: number;
  caseId?: string;
  testCaseTitle?: string;
  currentTestStatus?: string;
  currentPrepStatus?: string;
  suggestedAction: 'obsolete' | 'update' | 'create_cases' | 'review';
  reason: string;
  severity: 'high' | 'medium' | 'low';
}

export default function ImpactAnalysisPage() {
  const toast = useToast();
  const [impacts, setImpacts] = useState<ImpactItem[]>([]);
  const [stats, setStats] = useState({
    totalImpacts: 0,
    needObsolete: 0,
    needUpdate: 0,
    needCreation: 0,
    needReview: 0,
  });
  const [loading, setLoading] = useState(true);
  const [modules, setModules] = useState<Module[]>([]);
  const [selectedModule, setSelectedModule] = useState('');
  const [filterAction, setFilterAction] = useState<string>('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);

  // Approval modal for bulk resolution
  const [pendingAction, setPendingAction] = useState<{
    action: 'mark_obsolete' | 'mark_review';
    testCaseIds: number[];
    label: string;
  } | null>(null);

  const fetchImpacts = async () => {
    try {
      const params = new URLSearchParams({
        ...(selectedModule && { moduleId: selectedModule }),
      });
      const res = await fetch(`/api/impact-analysis?${params}`);
      if (res.ok) {
        const data = await res.json();
        setImpacts(data.impacts || []);
        setStats(data.stats || { totalImpacts: 0, needObsolete: 0, needUpdate: 0, needCreation: 0, needReview: 0 });
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetch('/api/modules').then(r => r.json()).then(setModules);
  }, []);

  useEffect(() => {
    fetchImpacts();
  }, [selectedModule]);

  const filteredImpacts = impacts.filter(item => {
    if (filterAction === 'all') return true;
    return item.suggestedAction === filterAction;
  });

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAllFiltered = () => {
    const selectable = filteredImpacts.filter(i => i.testCaseId).map(i => i.id);
    if (selectedIds.size === selectable.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(selectable));
    }
  };

  const promptApplyAction = (action: 'mark_obsolete' | 'mark_review', specificCaseId?: number) => {
    let ids: number[] = [];
    if (specificCaseId) {
      ids = [specificCaseId];
    } else {
      ids = impacts
        .filter(i => selectedIds.has(i.id) && i.testCaseId)
        .map(i => i.testCaseId as number);
    }

    if (ids.length === 0) {
      toast.error('Select at least one valid test case item');
      return;
    }

    setPendingAction({
      action,
      testCaseIds: ids,
      label: action === 'mark_obsolete' ? 'Mark Obsolete' : 'Mark for Preparation Review',
    });
  };

  const handleConfirmApproval = async () => {
    if (!pendingAction) return;
    setApplying(true);
    try {
      const res = await fetch('/api/impact-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: pendingAction.action,
          testCaseIds: pendingAction.testCaseIds,
        }),
      });

      if (res.ok) {
        const data = await res.json();
        toast.success(`Successfully applied ${pendingAction.label} to ${data.updatedCount} test case${data.updatedCount === 1 ? '' : 's'}`);
        setPendingAction(null);
        setSelectedIds(new Set());
        fetchImpacts();
      } else {
        toast.error('Failed to apply recommendation');
      }
    } finally {
      setApplying(false);
    }
  };

  return (
    <AppShell>
      <header className="page-header main-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <AlertTriangle size={20} style={{ color: 'var(--warning)' }} />
            Change Impact Analysis
          </h1>
          <p className="page-subtitle">
            Automatically detect added, changed, or deleted requirements and evaluate impact on test cases
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="btn btn-secondary" onClick={fetchImpacts}>
            <RefreshCw size={14} /> Re-analyze
          </button>
          <ThemeToggle />
        </div>
      </header>

      {/* Safety Banner */}
      <div className="info-box" style={{ marginBottom: 20 }}>
        <span style={{ fontSize: 13 }}>
          🛡️ <strong>AI & QA Safety Principle:</strong> Recommendations below will never automatically modify or obsolete test cases. Every action requires your explicit review and approval.
        </span>
      </div>

      {/* Summary Stat Cards */}
      <div className="grid-4" style={{ marginBottom: 24 }}>
        <div className="metric-card" style={{ cursor: 'pointer', border: filterAction === 'all' ? '1px solid var(--primary)' : undefined }}
             onClick={() => setFilterAction('all')}>
          <div className="metric-label">Total Impacts Detected</div>
          <div className="metric-value">{stats.totalImpacts}</div>
          <div style={{ fontSize: 12, color: 'var(--foreground-muted)' }}>All recommendations</div>
        </div>

        <div className="metric-card" style={{ cursor: 'pointer', border: filterAction === 'obsolete' ? '1px solid var(--error)' : undefined }}
             onClick={() => setFilterAction('obsolete')}>
          <div className="metric-label" style={{ color: 'var(--error)' }}>Requires Obsolete</div>
          <div className="metric-value" style={{ color: 'var(--error)' }}>{stats.needObsolete}</div>
          <div style={{ fontSize: 12, color: 'var(--foreground-muted)' }}>Req obsolete / deleted</div>
        </div>

        <div className="metric-card" style={{ cursor: 'pointer', border: filterAction === 'update' ? '1px solid var(--primary)' : undefined }}
             onClick={() => setFilterAction('update')}>
          <div className="metric-label" style={{ color: 'var(--primary)' }}>Requires Step Update</div>
          <div className="metric-value" style={{ color: 'var(--primary)' }}>{stats.needUpdate}</div>
          <div style={{ fontSize: 12, color: 'var(--foreground-muted)' }}>Req new version / modified</div>
        </div>

        <div className="metric-card" style={{ cursor: 'pointer', border: filterAction === 'create_cases' ? '1px solid var(--warning)' : undefined }}
             onClick={() => setFilterAction('create_cases')}>
          <div className="metric-label" style={{ color: 'var(--warning)' }}>Coverage Gap</div>
          <div className="metric-value" style={{ color: 'var(--warning)' }}>{stats.needCreation}</div>
          <div style={{ fontSize: 12, color: 'var(--foreground-muted)' }}>Req without test cases</div>
        </div>
      </div>

      {/* Controls & Filter Bar */}
      <div className="card card-sm" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
            <select
              className="form-control"
              style={{ width: 180 }}
              value={selectedModule}
              onChange={e => setSelectedModule(e.target.value)}
            >
              <option value="">All Modules</option>
              {modules.map(m => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>

            <select
              className="form-control"
              style={{ width: 180 }}
              value={filterAction}
              onChange={e => setFilterAction(e.target.value)}
            >
              <option value="all">All Impact Types</option>
              <option value="obsolete">Requires Obsolete</option>
              <option value="update">Requires Step Update</option>
              <option value="create_cases">Coverage Gap</option>
              <option value="review">Requires Review / Scope</option>
            </select>
          </div>

          {/* Bulk Action Controls */}
          {selectedIds.size > 0 && (
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <span style={{ fontSize: 13, color: 'var(--foreground-muted)' }}>
                {selectedIds.size} selected:
              </span>
              <button
                className="btn btn-sm btn-danger"
                onClick={() => promptApplyAction('mark_obsolete')}
              >
                Mark Obsolete ({selectedIds.size})
              </button>
              <button
                className="btn btn-sm btn-secondary"
                onClick={() => promptApplyAction('mark_review')}
              >
                Mark for Review ({selectedIds.size})
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Impact Table */}
      {loading ? (
        <LoadingSpinner size="lg" />
      ) : filteredImpacts.length === 0 ? (
        <EmptyState
          icon={<CheckCircle size={32} style={{ color: 'var(--success)' }} />}
          title="All Test Cases Aligned!"
          description="No pending change impacts found. All test cases are aligned with current requirements."
          action={
            <Link href="/requirements" className="btn btn-secondary">
              Manage Requirements
            </Link>
          }
        />
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th style={{ width: 40 }}>
                  <input
                    type="checkbox"
                    checked={selectedIds.size > 0 && selectedIds.size === filteredImpacts.filter(i => i.testCaseId).length}
                    onChange={selectAllFiltered}
                  />
                </th>
                <th style={{ width: 130 }}>Requirement</th>
                <th style={{ width: 160 }}>Module / Feature</th>
                <th>Impacted Test Case</th>
                <th style={{ width: 150 }}>Recommendation</th>
                <th>Analysis Reason</th>
                <th style={{ width: 140, textAlign: 'right' }}>Approval Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredImpacts.map(item => (
                <tr key={item.id}>
                  <td>
                    {item.testCaseId ? (
                      <input
                        type="checkbox"
                        checked={selectedIds.has(item.id)}
                        onChange={() => toggleSelect(item.id)}
                      />
                    ) : (
                      <span style={{ color: 'var(--foreground-dim)' }}>—</span>
                    )}
                  </td>
                  <td>
                    <div>
                      <code style={{ fontSize: 12, fontWeight: 600, color: 'var(--primary)' }}>
                        {item.requirementRef}
                      </code>
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--foreground-muted)', marginTop: 2 }}>
                      v{item.requirementVersion} · {item.changeType}
                    </div>
                  </td>
                  <td>
                    <div style={{ fontSize: 12, fontWeight: 500 }}>{item.moduleName}</div>
                    <div style={{ fontSize: 11, color: 'var(--foreground-muted)' }}>{item.featureName}</div>
                  </td>
                  <td>
                    {item.testCaseId ? (
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <code style={{ fontSize: 12 }}>{item.caseId}</code>
                          <span className={`badge badge-${item.currentTestStatus}`}>{item.currentTestStatus}</span>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--foreground)', marginTop: 2 }}>
                          {item.testCaseTitle}
                        </div>
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, color: 'var(--warning)', fontStyle: 'italic' }}>
                        ⚠️ No test case for this requirement yet
                      </div>
                    )}
                  </td>
                  <td>
                    {item.suggestedAction === 'obsolete' && (
                      <span className="badge badge-error">Mark Obsolete</span>
                    )}
                    {item.suggestedAction === 'update' && (
                      <span className="badge badge-primary">Update Test Steps</span>
                    )}
                    {item.suggestedAction === 'create_cases' && (
                      <span className="badge badge-warning">Create New Cases</span>
                    )}
                    {item.suggestedAction === 'review' && (
                      <span className="badge badge-muted">Review Coverage</span>
                    )}
                  </td>
                  <td>
                    <div style={{ fontSize: 12, color: 'var(--foreground-muted)', lineHeight: 1.4 }}>
                      {item.reason}
                    </div>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    {item.suggestedAction === 'create_cases' ? (
                      <Link
                        href={`/ai-generator?moduleId=${item.requirementId ? '' : ''}`}
                        className="btn btn-primary btn-sm"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                      >
                        <Sparkles size={11} /> AI Generator
                      </Link>
                    ) : item.suggestedAction === 'obsolete' && item.testCaseId ? (
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => promptApplyAction('mark_obsolete', item.testCaseId)}
                      >
                        Approve Obsolete
                      </button>
                    ) : item.testCaseId ? (
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4 }}>
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => promptApplyAction('mark_review', item.testCaseId)}
                          title="Mark test case as in progress / review"
                        >
                          Mark Review
                        </button>
                        <Link
                          href={`/test-cases?search=${encodeURIComponent(item.caseId || '')}`}
                          className="btn btn-secondary btn-icon btn-sm"
                          title="Open Test Case"
                        >
                          <Eye size={12} />
                        </Link>
                      </div>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(pendingAction)}
        onClose={() => setPendingAction(null)}
        onConfirm={handleConfirmApproval}
        title={`Approval Confirmation: ${pendingAction?.label}`}
        message={`Do you approve applying "${pendingAction?.label}" to ${pendingAction?.testCaseIds.length} selected test case(s)? Change history will be recorded automatically.`}
        confirmLabel={applying ? 'Applying...' : 'Yes, Approve & Apply'}
        danger={pendingAction?.action === 'mark_obsolete'}
        loading={applying}
      />
    </AppShell>
  );
}
