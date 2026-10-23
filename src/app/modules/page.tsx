'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
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
    setLoading(true);
    try {
      const [mRes, fRes] = await Promise.all([
        fetch('/api/modules'),
        fetch('/api/features'),
      ]);
      if (mRes.ok) setModules(await mRes.json());
      if (fRes.ok) setFeatures(await fRes.json());
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
      toast.error('Nama dan prefix wajib diisi'); return;
    }
    setSaving(true);
    try {
      const url = editModule ? `/api/modules/${editModule.id}` : '/api/modules';
      const method = editModule ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(modForm) });
      if (res.ok) {
        toast.success(editModule ? 'Modul diperbarui' : 'Modul berhasil dibuat');
        setShowModuleModal(false);
        fetchAll();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Gagal menyimpan');
      }
    } finally { setSaving(false); }
  };

  const saveFeature = async () => {
    if (!featForm.name.trim() || !featForm.module_id) {
      toast.error('Nama dan modul wajib diisi'); return;
    }
    setSaving(true);
    try {
      const url = editFeature ? `/api/features/${editFeature.id}` : '/api/features';
      const method = editFeature ? 'PUT' : 'POST';
      const body = { ...featForm, module_id: Number(featForm.module_id) };
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (res.ok) {
        toast.success(editFeature ? 'Fitur diperbarui' : 'Fitur berhasil dibuat');
        setShowFeatureModal(false);
        fetchAll();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Gagal menyimpan');
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
        toast.success(`${deleteTarget.type === 'module' ? 'Modul' : 'Fitur'} diarsipkan`);
        if (deleteTarget.type === 'module' && selectedModule?.id === deleteTarget.id) setSelectedModule(null);
        setDeleteTarget(null);
        fetchAll();
      } else {
        toast.error('Gagal menghapus');
      }
    } finally { setSaving(false); }
  };

  const selectedFeatures = features.filter(f => f.module_id === selectedModule?.id);

  if (loading) return <AppShell><LoadingSpinner size="lg" /></AppShell>;

  return (
    <AppShell>
      <div className="page-header">
        <div>
          <h1 className="page-title">Modul & Fitur</h1>
          <p className="page-subtitle">Kelola hierarki Proyek → Modul → Fitur</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" onClick={() => openCreateFeature()} id="btn-create-feature">
            <FolderOpen size={14} /> Tambah Fitur
          </button>
          <button className="btn btn-primary" onClick={openCreateModule} id="btn-create-module">
            <Plus size={14} /> Modul Baru
          </button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '320px 1fr', gap: 20, alignItems: 'start' }}>
        {/* Module list */}
        <div>
          <div style={{ marginBottom: 12, fontSize: 13, fontWeight: 600, color: 'var(--foreground-muted)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
            Modul ({modules.length})
          </div>
          {modules.length === 0 ? (
            <EmptyState
              icon={<Package size={24} />}
              title="Belum ada modul"
              description="Buat modul pertama untuk mulai mengorganisir test case"
              action={<button className="btn btn-primary btn-sm" onClick={openCreateModule}><Plus size={12} /> Buat Modul</button>}
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
                          {mod.prefix} · {mod.feature_count ?? 0} fitur · {mod.test_case_count ?? 0} TC
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
                    Fitur dalam {selectedModule.name}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--foreground-dim)', marginTop: 2 }}>{selectedFeatures.length} fitur</div>
                </div>
                <button className="btn btn-primary btn-sm" onClick={() => openCreateFeature(selectedModule.id)} id="btn-add-feature-to-module">
                  <Plus size={13} /> Tambah Fitur
                </button>
              </div>

              {selectedFeatures.length === 0 ? (
                <EmptyState
                  icon={<FolderOpen size={24} />}
                  title="Belum ada fitur"
                  description="Tambahkan fitur ke modul ini untuk mulai mengelompokkan test case"
                  action={
                    <button className="btn btn-primary btn-sm" onClick={() => openCreateFeature(selectedModule.id)}>
                      <Plus size={12} /> Tambah Fitur
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
                              {feat.test_case_count ?? 0} test case
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
              <div className="empty-title">Pilih modul</div>
              <div className="empty-desc">Klik modul di sebelah kiri untuk melihat fiturnya</div>
            </div>
          )}
        </div>
      </div>

      {/* Module Modal */}
      <Modal
        isOpen={showModuleModal}
        onClose={() => setShowModuleModal(false)}
        title={editModule ? 'Edit Modul' : 'Buat Modul Baru'}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setShowModuleModal(false)}>Batal</button>
            <button className="btn btn-primary" onClick={saveModule} disabled={saving} id="btn-save-module">
              {saving ? <span className="spinner" /> : (editModule ? 'Simpan' : 'Buat Modul')}
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="form-group">
            <label className="form-label">Nama Modul <span className="form-required">*</span></label>
            <input
              className="form-control"
              placeholder="contoh: Autentikasi"
              value={modForm.name}
              onChange={e => setModForm(p => ({ ...p, name: e.target.value }))}
              id="input-module-name"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Prefix (kode unik) <span className="form-required">*</span></label>
            <input
              className="form-control"
              placeholder="contoh: AUTH"
              value={modForm.prefix}
              onChange={e => setModForm(p => ({ ...p, prefix: e.target.value.toUpperCase() }))}
              disabled={!!editModule}
              style={{ fontFamily: 'monospace', textTransform: 'uppercase' }}
              id="input-module-prefix"
            />
            <div style={{ fontSize: 11, color: 'var(--foreground-muted)' }}>
              Prefix digunakan untuk ID test case, contoh: AUTH-001. Tidak bisa diubah setelah dibuat.
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Deskripsi</label>
            <textarea
              className="form-control"
              placeholder="Deskripsi modul (opsional)"
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
        title={editFeature ? 'Edit Fitur' : 'Tambah Fitur Baru'}
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setShowFeatureModal(false)}>Batal</button>
            <button className="btn btn-primary" onClick={saveFeature} disabled={saving} id="btn-save-feature">
              {saving ? <span className="spinner" /> : (editFeature ? 'Simpan' : 'Tambah Fitur')}
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="form-group">
            <label className="form-label">Modul <span className="form-required">*</span></label>
            <select
              className="form-control"
              value={featForm.module_id}
              onChange={e => setFeatForm(p => ({ ...p, module_id: e.target.value }))}
              id="select-feature-module"
            >
              <option value="">-- Pilih Modul --</option>
              {modules.map(m => <option key={m.id} value={m.id}>{m.name} ({m.prefix})</option>)}
            </select>
          </div>
          <div className="form-group">
            <label className="form-label">Nama Fitur <span className="form-required">*</span></label>
            <input
              className="form-control"
              placeholder="contoh: Login"
              value={featForm.name}
              onChange={e => setFeatForm(p => ({ ...p, name: e.target.value }))}
              id="input-feature-name"
            />
          </div>
          <div className="form-group">
            <label className="form-label">Deskripsi</label>
            <textarea
              className="form-control"
              placeholder="Deskripsi fitur (opsional)"
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
        title={`Arsipkan ${deleteTarget?.type === 'module' ? 'Modul' : 'Fitur'}`}
        message={`"${deleteTarget?.name}" akan diarsipkan. Data tidak akan dihapus permanen dan dapat dipulihkan kapan saja.`}
        confirmLabel="Arsipkan"
        danger
        loading={saving}
      />
    </AppShell>
  );
}
