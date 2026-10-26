'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { Modal, ConfirmModal } from '@/components/ui/Modal';
import { EmptyState, LoadingSpinner } from '@/components/ui/Shared';
import { useToast } from '@/components/ui/Toast';
import {
  FileCheck2, Plus, Edit2, Trash2, History, Sparkles,
  ClipboardList, Search, Filter, AlertTriangle, ArrowRight, GitCommit
} from 'lucide-react';
import Link from 'next/link';
import type { Module, Feature } from '@/lib/types';

interface RequirementItem {
  id: number;
  module_id: number | null;
  feature_id: number | null;
  ref_id: string;
  title: string;
  description: string | null;
  change_type: string;
  status: string;
  version: number;
  created_at: string;
  updated_at: string;
  module_name?: string;
  feature_name?: string;
  test_case_count: number;
}

interface RequirementHistoryItem {
  id: number;
  requirement_id: number;
  title: string;
  description: string | null;
  change_type: string;
  version: number;
  changed_at: string;
}

export default function RequirementsPage() {
  const toast = useToast();
  const [requirements, setRequirements] = useState<RequirementItem[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    search: '',
    moduleId: '',
    featureId: '',
    status: 'active',
  });

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showHistoryModal, setShowHistoryModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<RequirementItem | null>(null);
  const [selectedReq, setSelectedReq] = useState<RequirementItem | null>(null);
  const [historyData, setHistoryData] = useState<RequirementHistoryItem[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [saving, setSaving] = useState(false);

  // Forms
  const [createForm, setCreateForm] = useState({
    module_id: '',
    feature_id: '',
    ref_id: '',
    title: '',
    description: '',
    status: 'active',
  });

  const [editForm, setEditForm] = useState({
    title: '',
    description: '',
    change_type: 'updated',
    status: 'active',
    reason: '',
  });

  const fetchRequirements = async () => {
    try {
      const params = new URLSearchParams({
        ...(filters.moduleId && { moduleId: filters.moduleId }),
        ...(filters.featureId && { featureId: filters.featureId }),
        ...(filters.status && { status: filters.status }),
        ...(filters.search && { search: filters.search }),
      });
      const res = await fetch(`/api/requirements?${params}`);
      if (res.ok) {
        setRequirements(await res.json());
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetch('/api/modules')
      .then(r => r.ok ? r.json() : [])
      .then(data => { if (Array.isArray(data)) setModules(data); });
    fetch('/api/features')
      .then(r => r.ok ? r.json() : [])
      .then(data => { if (Array.isArray(data)) setFeatures(data); });
  }, []);

  useEffect(() => {
    fetchRequirements();
  }, [filters]);

  const safeFeatures = Array.isArray(features) ? features : [];
  const filteredFeatures = safeFeatures.filter(f => !filters.moduleId || f.module_id === Number(filters.moduleId));
  const createFormFeatures = safeFeatures.filter(f => !createForm.module_id || f.module_id === Number(createForm.module_id));

  const handleOpenCreate = () => {
    setCreateForm({
      module_id: modules[0]?.id ? String(modules[0].id) : '',
      feature_id: '',
      ref_id: '',
      title: '',
      description: '',
      status: 'active',
    });
    setShowCreateModal(true);
  };

  const handleSaveCreate = async () => {
    if (!createForm.title.trim()) {
      toast.error('Requirement title is required');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/requirements', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(createForm),
      });
      if (res.ok) {
        toast.success('Requirement created successfully');
        setShowCreateModal(false);
        fetchRequirements();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to save requirement');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleOpenEdit = (req: RequirementItem) => {
    setSelectedReq(req);
    setEditForm({
      title: req.title,
      description: req.description || '',
      change_type: 'updated',
      status: req.status,
      reason: '',
    });
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!selectedReq) return;
    if (!editForm.title.trim()) {
      toast.error('Requirement title is required');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/requirements/${selectedReq.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      if (res.ok) {
        toast.success(`Requirement ${selectedReq.ref_id} updated`);
        setShowEditModal(false);
        fetchRequirements();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to update');
      }
    } finally {
      setSaving(false);
    }
  };

  const handleOpenHistory = async (req: RequirementItem) => {
    setSelectedReq(req);
    setShowHistoryModal(true);
    setLoadingHistory(true);
    try {
      const res = await fetch(`/api/requirements/${req.id}`);
      if (res.ok) {
        const data = await res.json();
        setHistoryData(data.history || []);
      }
    } finally {
      setLoadingHistory(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    try {
      const res = await fetch(`/api/requirements/${deleteTarget.id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success(`Requirement ${deleteTarget.ref_id} archived`);
        setDeleteTarget(null);
        fetchRequirements();
      } else {
        toast.error('Failed to archive requirement');
      }
    } catch {
      toast.error('An error occurred');
    }
  };

  return (
    <AppShell>
      <header className="page-header main-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <FileCheck2 size={20} style={{ color: 'var(--primary)' }} />
            PRD & Requirements
          </h1>
          <p className="page-subtitle">
            Manage requirement specifications, version changes, and link them to test cases
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <Link href="/impact-analysis" className="btn btn-secondary">
            <AlertTriangle size={14} style={{ color: 'var(--warning)' }} /> Impact Analysis
          </Link>
          <button className="btn btn-primary" onClick={handleOpenCreate} id="btn-create-requirement">
            <Plus size={14} /> Add Requirement
          </button>
          <ThemeToggle />
        </div>
      </header>

      {/* Filters Bar */}
      <div className="card card-sm" style={{ marginBottom: 20 }}>
        <div className="filters-bar">
          <div className="search-bar" style={{ flex: 1, minWidth: 200 }}>
            <Search size={14} className="search-icon" />
            <input
              className="form-control"
              placeholder="Search ref ID, title, or content..."
              value={filters.search}
              onChange={e => setFilters(p => ({ ...p, search: e.target.value }))}
            />
          </div>
          <select
            className="form-control"
            style={{ width: 180 }}
            value={filters.moduleId}
            onChange={e => setFilters(p => ({ ...p, moduleId: e.target.value, featureId: '' }))}
          >
            <option value="">All Modules</option>
            {modules.map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>
          <select
            className="form-control"
            style={{ width: 180 }}
            value={filters.featureId}
            onChange={e => setFilters(p => ({ ...p, featureId: e.target.value }))}
          >
            <option value="">All Features</option>
            {filteredFeatures.map(f => (
              <option key={f.id} value={f.id}>{f.name}</option>
            ))}
          </select>
          <select
            className="form-control"
            style={{ width: 140 }}
            value={filters.status}
            onChange={e => setFilters(p => ({ ...p, status: e.target.value }))}
          >
            <option value="all">All Statuses</option>
            <option value="active">Active</option>
            <option value="obsolete">Obsolete</option>
            <option value="archived">Archived</option>
          </select>
        </div>
      </div>

      {/* Requirements List */}
      {loading ? (
        <LoadingSpinner size="lg" />
      ) : requirements.length === 0 ? (
        <EmptyState
          icon={<FileCheck2 size={32} />}
          title="No requirements yet"
          description="Add your first requirement specification to track testing coverage and change impact analysis."
          action={
            <button className="btn btn-primary" onClick={handleOpenCreate}>
              <Plus size={14} /> Add Requirement
            </button>
          }
        />
      ) : (
        <div className="table-container">
          <table>
            <thead>
              <tr>
                <th style={{ width: 120 }}>Ref ID</th>
                <th>Title & Description</th>
                <th style={{ width: 180 }}>Module & Feature</th>
                <th style={{ width: 90 }}>Version</th>
                <th style={{ width: 110 }}>Change Type</th>
                <th style={{ width: 100 }}>Status</th>
                <th style={{ width: 110 }}>Test Cases</th>
                <th style={{ width: 140, textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {requirements.map(req => (
                <tr key={req.id}>
                  <td>
                    <code style={{ fontSize: 13, fontWeight: 600, color: 'var(--primary)' }}>
                      {req.ref_id}
                    </code>
                  </td>
                  <td>
                    <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--foreground)' }}>
                      {req.title}
                    </div>
                    {req.description && (
                      <div style={{
                        fontSize: 12,
                        color: 'var(--foreground-muted)',
                        marginTop: 4,
                        maxHeight: 40,
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        display: '-webkit-box',
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: 'vertical'
                      }}>
                        {req.description}
                      </div>
                    )}
                  </td>
                  <td>
                    <div style={{ fontSize: 12, fontWeight: 500 }}>{req.module_name || '—'}</div>
                    <div style={{ fontSize: 11, color: 'var(--foreground-muted)' }}>{req.feature_name || '—'}</div>
                  </td>
                  <td>
                    <span className="badge" style={{ background: 'var(--surface-3)', color: 'var(--primary-light)' }}>
                      v{req.version}
                    </span>
                  </td>
                  <td>
                    <span className="badge" style={{
                      background: req.change_type === 'new' ? 'rgba(52,211,153,0.15)' :
                                  req.change_type === 'updated' ? 'rgba(79,124,255,0.15)' :
                                  req.change_type === 'scope_reduced' ? 'rgba(251,191,36,0.15)' : 'var(--surface-3)',
                      color: req.change_type === 'new' ? 'var(--success)' :
                             req.change_type === 'updated' ? 'var(--primary)' :
                             req.change_type === 'scope_reduced' ? 'var(--warning)' : 'var(--foreground-muted)',
                    }}>
                      {req.change_type}
                    </span>
                  </td>
                  <td>
                    <span className={`badge badge-${req.status === 'active' ? 'active' : 'archived'}`}>
                      {req.status}
                    </span>
                  </td>
                  <td>
                    {req.test_case_count > 0 ? (
                      <Link
                        href={`/test-cases?search=${encodeURIComponent(req.ref_id)}`}
                        className="badge badge-success"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}
                      >
                        <ClipboardList size={11} /> {req.test_case_count} {req.test_case_count === 1 ? 'Case' : 'Cases'}
                      </Link>
                    ) : (
                      <Link
                        href={`/ai-generator?moduleId=${req.module_id || ''}&featureId=${req.feature_id || ''}`}
                        className="badge badge-warning"
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4, textDecoration: 'none' }}
                        title="0 test cases linked. Click to generate!"
                      >
                        <Sparkles size={11} /> 0 Cases
                      </Link>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                      <button
                        className="btn btn-secondary btn-icon"
                        title="Version History"
                        onClick={() => handleOpenHistory(req)}
                      >
                        <History size={13} />
                      </button>
                      <button
                        className="btn btn-secondary btn-icon"
                        title="Edit Requirement"
                        onClick={() => handleOpenEdit(req)}
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        className="btn btn-danger btn-icon"
                        title="Archive Requirement"
                        onClick={() => setDeleteTarget(req)}
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      <Modal
        isOpen={showCreateModal}
        onClose={() => setShowCreateModal(false)}
        title="Add New Requirement"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSaveCreate} disabled={saving} id="btn-save-new-req">
              {saving ? <span className="spinner" /> : <Plus size={13} />}
              Save Requirement
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Module</label>
              <select
                className="form-control"
                value={createForm.module_id}
                onChange={e => setCreateForm(p => ({ ...p, module_id: e.target.value, feature_id: '' }))}
              >
                <option value="">Select Module</option>
                {modules.map(m => (
                  <option key={m.id} value={m.id}>{m.name}</option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Feature</label>
              <select
                className="form-control"
                value={createForm.feature_id}
                onChange={e => setCreateForm(p => ({ ...p, feature_id: e.target.value }))}
              >
                <option value="">Select Feature</option>
                {createFormFeatures.map(f => (
                  <option key={f.id} value={f.id}>{f.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Reference ID (Optional, e.g. REQ-001)</label>
            <input
              className="form-control"
              placeholder="Leave empty to auto-generate"
              value={createForm.ref_id}
              onChange={e => setCreateForm(p => ({ ...p, ref_id: e.target.value }))}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Requirement Title <span style={{ color: 'var(--error)' }}>*</span></label>
            <input
              className="form-control"
              placeholder="e.g. Email Validation on Account Registration"
              value={createForm.title}
              onChange={e => setCreateForm(p => ({ ...p, title: e.target.value }))}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Specification Description / PRD Content</label>
            <textarea
              className="form-control"
              rows={4}
              placeholder="Write business rules, acceptance criteria, or requirement text..."
              value={createForm.description}
              onChange={e => setCreateForm(p => ({ ...p, description: e.target.value }))}
            />
          </div>
        </div>
      </Modal>

      {/* Edit Modal (Version Tracking) */}
      <Modal
        isOpen={showEditModal}
        onClose={() => setShowEditModal(false)}
        title={`Edit Requirement: ${selectedReq?.ref_id}`}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setShowEditModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={handleSaveEdit} disabled={saving} id="btn-save-edit-req">
              {saving ? <span className="spinner" /> : <Edit2 size={13} />}
              Save Changes (v{(selectedReq?.version || 1) + 1})
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="info-box">
            <span style={{ fontSize: 12 }}>
              Every time a requirement is updated, the version number automatically increments (v{(selectedReq?.version || 1) + 1}) and change history is recorded for <strong>Impact Analysis</strong>.
            </span>
          </div>

          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Change Type</label>
              <select
                className="form-control"
                value={editForm.change_type}
                onChange={e => setEditForm(p => ({ ...p, change_type: e.target.value }))}
              >
                <option value="updated">Updated</option>
                <option value="modified">Modified</option>
                <option value="scope_reduced">Scope Reduced</option>
                <option value="clarification">Clarification</option>
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Status</label>
              <select
                className="form-control"
                value={editForm.status}
                onChange={e => setEditForm(p => ({ ...p, status: e.target.value }))}
              >
                <option value="active">Active</option>
                <option value="obsolete">Obsolete</option>
                <option value="archived">Archived</option>
              </select>
            </div>
          </div>

          <div className="form-group">
            <label className="form-label">Requirement Title <span style={{ color: 'var(--error)' }}>*</span></label>
            <input
              className="form-control"
              value={editForm.title}
              onChange={e => setEditForm(p => ({ ...p, title: e.target.value }))}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Specification Description</label>
            <textarea
              className="form-control"
              rows={4}
              value={editForm.description}
              onChange={e => setEditForm(p => ({ ...p, description: e.target.value }))}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Reason / Change Summary</label>
            <input
              className="form-control"
              placeholder="e.g. Changed lockout limit from 3x to 5x based on Product Owner feedback"
              value={editForm.reason}
              onChange={e => setEditForm(p => ({ ...p, reason: e.target.value }))}
            />
          </div>
        </div>
      </Modal>

      {/* History Modal */}
      <Modal
        isOpen={showHistoryModal}
        onClose={() => setShowHistoryModal(false)}
        title={`Version History: ${selectedReq?.ref_id}`}
        footer={
          <button className="btn btn-secondary" onClick={() => setShowHistoryModal(false)}>Close</button>
        }
      >
        {loadingHistory ? (
          <LoadingSpinner />
        ) : historyData.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '20px', color: 'var(--foreground-muted)' }}>
            No history recorded yet.
          </div>
        ) : (
          <div className="timeline">
            {historyData.map((h, i) => (
              <div key={h.id || i} className="timeline-item">
                <div className="timeline-dot">
                  <GitCommit size={12} style={{ color: 'var(--primary)' }} />
                </div>
                <div className="timeline-content">
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <span className="badge badge-primary">Version {h.version}</span>
                    <span className="badge" style={{ background: 'var(--surface-3)' }}>{h.change_type}</span>
                    <span style={{ fontSize: 11, color: 'var(--foreground-muted)' }}>
                      {new Date(h.changed_at).toLocaleString('en-US')}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{h.title}</div>
                  {h.description && (
                    <div style={{ fontSize: 12, color: 'var(--foreground-muted)', marginTop: 4, whiteSpace: 'pre-wrap' }}>
                      {h.description}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* Delete / Archive Confirmation */}
      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Archive Requirement"
        message={`Are you sure you want to archive requirement "${deleteTarget?.ref_id} - ${deleteTarget?.title}"? Data will not be permanently deleted so audit trails are preserved.`}
        confirmLabel="Archive"
        danger
      />
    </AppShell>
  );
}
