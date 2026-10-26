'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { Modal, ConfirmModal } from '@/components/ui/Modal';
import { EmptyState, LoadingSpinner } from '@/components/ui/Shared';
import { useToast } from '@/components/ui/Toast';
import { Plus, Edit2, Trash2, ChevronRight, Layers, FolderOpen, Package } from 'lucide-react';
import type { Module, Feature } from '@/lib/types';

export default function ModulesPage() {
  const toast = useToast();
  const [modules, setModules] = useState<Module[]>([]);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedModule, setSelectedModule] = useState<Module | null>(null);
  const [showModuleModal, setShowModuleModal] = useState(false);
  const [showFeatureModal, setShowFeatureModal] = useState(false);
  const [editModule, setEditModule] = useState<Module | null>(null);
  const [editFeature, setEditFeature] = useState<Feature | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'module' | 'feature'; id: number; name: string } | null>(null);
  const [saving, setSaving] = useState(false);

  const [modForm, setModForm] = useState({ name: '', description: '', prefix: '' });
  const [featForm, setFeatForm] = useState({ name: '', description: '', module_id: '' });

  const fetchAll = async () => {
    try {
      const [mRes, fRes] = await Promise.all([
        fetch('/api/modules'),
        fetch('/api/features'),
      ]);
      if (mRes.ok) {
        const mData = await mRes.json();
        setModules(Array.isArray(mData) ? mData : []);
      }
      if (fRes.ok) {
        const fData = await fRes.json();
        setFeatures(Array.isArray(fData) ? fData : []);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchAll(); }, []);

  const openCreateModule = () => {
    setEditModule(null);
    setModForm({ name: '', description: '', prefix: '' });
    setShowModuleModal(true);
  };

  const openEditModule = (mod: Module) => {
    setEditModule(mod);
    setModForm({ name: mod.name, description: mod.description || '', prefix: mod.prefix });
    setShowModuleModal(true);
  };

  const openCreateFeature = (moduleId?: number) => {
    setEditFeature(null);
    setFeatForm({ name: '', description: '', module_id: String(moduleId ?? selectedModule?.id ?? '') });
    setShowFeatureModal(true);
  };

  const openEditFeature = (feat: Feature) => {
    setEditFeature(feat);
    setFeatForm({ name: feat.name, description: feat.description || '', module_id: String(feat.module_id) });
    setShowFeatureModal(true);
  };

  const saveModule = async () => {
    if (!modForm.name.trim() || !modForm.prefix.trim()) {
      toast.error('Name and prefix are required'); return;
    }
    setSaving(true);
    try {
      const url = editModule ? `/api/modules/${editModule.id}` : '/api/modules';
      const method = editModule ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(modForm) });
      if (res.ok) {
        toast.success(editModule ? 'Module updated' : 'Module created successfully');
        setShowModuleModal(false);
        fetchAll();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to save');
      }
    } finally { setSaving(false); }
  };

  const saveFeature = async () => {
    if (!featForm.name.trim() || !featForm.module_id) {
      toast.error('Name and module are required'); return;
    }
    setSaving(true);
    try {
      const url = editFeature ? `/api/features/${editFeature.id}` : '/api/features';
      const method = editFeature ? 'PUT' : 'POST';
      const body = { ...featForm, module_id: Number(featForm.module_id) };
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) {
        toast.success(editFeature ? 'Feature updated' : 'Feature created successfully');
        setShowFeatureModal(false);
        fetchAll();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Failed to save');
      }
    } finally { setSaving(false); }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      const url = deleteTarget.type === 'module' ? `/api/modules/${deleteTarget.id}` : `/api/features/${deleteTarget.id}`;
      const res = await fetch(url, { method: 'DELETE' });
      if (res.ok) {
        toast.success(`${deleteTarget.type === 'module' ? 'Module' : 'Feature'} archived`);
        if (deleteTarget.type === 'module' && selectedModule?.id === deleteTarget.id) setSelectedModule(null);
        setDeleteTarget(null);
        fetchAll();
      } else {
        toast.error('Failed to delete');
      }
    } finally { setSaving(false); }
  };

  const selectedFeatures = features.filter(f => f.module_id === selectedModule?.id);

  if (loading) return <AppShell><LoadingSpinner size="lg" /></AppShell>;

  return (
    <AppShell>
      <header className="page-header main-header">
        <div>
          <h1 className="page-title">Modules & Features</h1>
          <p className="page-subtitle">Manage Project → Module → Feature hierarchy</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="btn btn-secondary" onClick={() => openCreateFeature()} id="btn-create-feature">
            <FolderOpen size={14} /> Add Feature
          </button>
          <button className="btn btn-primary" onClick={openCreateModule} id="btn-create-module">
            <Plus size={14} /> New Module
          </button>
          <ThemeToggle />
        </div>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20, alignItems: 'start' }}>
        {/* Module list */}
        <div>
          <div style={{ marginBottom: 12, fontSize: 13, fontWeight: 600, color: 'var(--foreground-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Modules ({modules.length})
          </div>
          {modules.length === 0 ? (
            <EmptyState
              icon={<Package size={24} />}
              title="No modules yet"
              description="Create your first module to start organizing test cases"
              action={<button className="btn btn-primary btn-sm" onClick={openCreateModule}><Plus size={12} /> Create Module</button>}
            />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {modules.map(mod => (
                <div
                  key={mod.id}
                  className="card card-sm"
                  style={{
                    cursor: 'pointer',
                    borderColor: selectedModule?.id === mod.id ? 'var(--primary)' : undefined,
                    background: selectedModule?.id === mod.id ? 'rgba(79,124,255,0.05)' : undefined,
                  }}
                  onClick={() => setSelectedModule(mod)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
                      <div style={{
                        width: 36, height: 36, borderRadius: 8, background: 'rgba(79,124,255,0.1)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
                      }}>
                        <Layers size={16} style={{ color: 'var(--primary)' }} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{mod.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--foreground-muted)' }}>
                          {mod.prefix} · {mod.feature_count ?? 0} features · {mod.test_case_count ?? 0} TCs
                        </div>
                      </div>
                    </div>
                    <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                      <button className="btn btn-ghost btn-icon btn-sm" onClick={e => { e.stopPropagation(); openEditModule(mod); }}>
                        <Edit2 size={13} />
                      </button>
                      <button className="btn btn-ghost btn-icon btn-sm" onClick={e => { e.stopPropagation(); setDeleteTarget({ type: 'module', id: mod.id, name: mod.name }); }}>
                        <Trash2 size={13} style={{ color: 'var(--error)' }} />
                      </button>
                      <ChevronRight size={14} style={{ color: 'var(--foreground-dim)', marginLeft: 2 }} />
                    </div>
                  </div>
                  {mod.description && (
                    <div style={{ fontSize: 12, color: 'var(--foreground-muted)', marginTop: 6, marginLeft: 46 }}>
                      {mod.description}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Features panel */}
        <div>
          {selectedModule ? (
            <>
              <div style={{ marginBottom: 16, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--foreground-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Features in {selectedModule.name}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--foreground-dim)', marginTop: 2 }}>{selectedFeatures.length} features</div>
                </div>
                <button className="btn btn-primary btn-sm" onClick={() => openCreateFeature(selectedModule.id)} id="btn-add-feature-to-module">
                  <Plus size={13} /> Add Feature
                </button>
              </div>

              {selectedFeatures.length === 0 ? (
                <EmptyState
                  icon={<FolderOpen size={24} />}
                  title="No features yet"
                  description="Add features to this module to start grouping test cases"
                  action={
                    <button className="btn btn-primary btn-sm" onClick={() => openCreateFeature(selectedModule.id)}>
                      <Plus size={12} /> Add Feature
                    </button>
                  }
                />
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 12 }}>
                  {selectedFeatures.map(feat => (
                    <div key={feat.id} className="card card-sm">
                      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                        <div style={{ display: 'flex', gap: 10, minWidth: 0 }}>
                          <div style={{
                            width: 32, height: 32, borderRadius: 8, background: 'rgba(167,139,250,0.1)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1
                          }}>
                            <FolderOpen size={14} style={{ color: 'var(--accent)' }} />
                          </div>
                          <div style={{ minWidth: 0 }}>
                            <div style={{ fontWeight: 600, fontSize: 14 }}>{feat.name}</div>
                            <div style={{ fontSize: 11, color: 'var(--foreground-muted)', marginTop: 2 }}>
                              {feat.test_case_count ?? 0} test cases
                            </div>
                            {feat.description && (
                              <div style={{ fontSize: 12, color: 'var(--foreground-muted)', marginTop: 4, lineHeight: 1.4 }}>
                                {feat.description}
                              </div>
                            )}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => openEditFeature(feat)}>
                            <Edit2 size={12} />
                          </button>
                          <button className="btn btn-ghost btn-icon btn-sm" onClick={() => setDeleteTarget({ type: 'feature', id: feat.id, name: feat.name })}>
                            <Trash2 size={12} style={{ color: 'var(--error)' }} />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            <div className="empty-state" style={{ paddingTop: 80 }}>
              <div className="empty-icon"><Layers size={28} /></div>
              <div className="empty-title">Select a module</div>
              <div className="empty-desc">Click a module on the left to view its features</div>
            </div>
          )}
        </div>
      </div>

      {/* Module Modal */}
      <Modal
        isOpen={showModuleModal}
        onClose={() => setShowModuleModal(false)}
        title={editModule ? 'Edit Module' : 'Create New Module'}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setShowModuleModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={saveModule} disabled={saving} id="btn-save-module">
              {saving ? <span className="spinner" /> : (editModule ? 'Save' : 'Create Module')}
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="form-group">
            <label className="form-label">Module Name <span className="form-required">*</span></label>
            <input
              className="form-control"
              placeholder="e.g. Authentication"
              value={modForm.name}
              onChange={e => setModForm(p => ({ ...p, name: e.target.value }))}
              id="input-module-name"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Prefix (unique code) <span className="form-required">*</span></label>
            <input
              className="form-control"
              placeholder="e.g. AUTH"
              value={modForm.prefix}
              onChange={e => setModForm(p => ({ ...p, prefix: e.target.value.toUpperCase() }))}
              disabled={!!editModule}
              style={{ fontFamily: 'monospace', textTransform: 'uppercase' }}
              id="input-module-prefix"
            />
            <div style={{ fontSize: 11, color: 'var(--foreground-muted)' }}>
              Prefix is used for test case IDs, e.g. AUTH-001. Cannot be changed once created.
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea
              className="form-control"
              placeholder="Module description (optional)"
              value={modForm.description}
              onChange={e => setModForm(p => ({ ...p, description: e.target.value }))}
              rows={3}
            />
          </div>
        </div>
      </Modal>

      {/* Feature Modal */}
      <Modal
        isOpen={showFeatureModal}
        onClose={() => setShowFeatureModal(false)}
        title={editFeature ? 'Edit Feature' : 'Add New Feature'}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setShowFeatureModal(false)}>Cancel</button>
            <button className="btn btn-primary" onClick={saveFeature} disabled={saving} id="btn-save-feature">
              {saving ? <span className="spinner" /> : (editFeature ? 'Save' : 'Add Feature')}
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="form-group">
            <label className="form-label">Module <span className="form-required">*</span></label>
            <select
              className="form-control"
              value={featForm.module_id}
              onChange={e => setFeatForm(p => ({ ...p, module_id: e.target.value }))}
              id="select-feature-module"
            >
              <option value="">-- Select Module --</option>
              {modules.map(m => <option key={m.id} value={m.id}>{m.name} ({m.prefix})</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Feature Name <span className="form-required">*</span></label>
            <input
              className="form-control"
              placeholder="e.g. Login"
              value={featForm.name}
              onChange={e => setFeatForm(p => ({ ...p, name: e.target.value }))}
              id="input-feature-name"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Description</label>
            <textarea
              className="form-control"
              placeholder="Feature description (optional)"
              value={featForm.description}
              onChange={e => setFeatForm(p => ({ ...p, description: e.target.value }))}
              rows={3}
            />
          </div>
        </div>
      </Modal>

      {/* Confirm Delete */}
      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title={`Archive ${deleteTarget?.type === 'module' ? 'Module' : 'Feature'}`}
        message={`"${deleteTarget?.name}" will be archived. Data will not be permanently deleted and can be restored at any time.`}
        confirmLabel="Archive"
        danger
        loading={saving}
      />
    </AppShell>
  );
}
