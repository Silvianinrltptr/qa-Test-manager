'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { ProgressBar, ResultBadge, LoadingSpinner, EmptyState } from '@/components/ui/Shared';
import { Modal } from '@/components/ui/Modal';
import { useToast } from '@/components/ui/Toast';
import { BarChart3, Plus, Camera, Download } from 'lucide-react';
import type { WeeklySnapshot } from '@/lib/types';

export default function WeeklyProgressPage() {
  const toast = useToast();
  const [snapshots, setSnapshots] = useState<WeeklySnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    week_start: '', week_end: '', notes: '', activities: '', next_priorities: ''
  });

  useEffect(() => {
    fetchSnapshots();
    // Set default dates to current week
    const now = new Date();
    const day = now.getDay();
    const mon = new Date(now); mon.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
    const sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    const fmt = (d: Date) => d.toISOString().split('T')[0];
    setForm(p => ({ ...p, week_start: fmt(mon), week_end: fmt(sun) }));
  }, []);

  const fetchSnapshots = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/weekly-snapshots');
      if (res.ok) {
        const data = await res.json();
        setSnapshots(data.data);
      }
    } finally { setLoading(false); }
  };

  const saveSnapshot = async () => {
    if (!form.week_start || !form.week_end) {
      toast.error('Tanggal minggu wajib diisi'); return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/weekly-snapshots', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form)
      });
      if (res.ok) {
        toast.success('Snapshot mingguan disimpan');
        setShowModal(false);
        fetchSnapshots();
      } else {
        toast.error('Gagal menyimpan snapshot');
      }
    } finally { setSaving(false); }
  };

  const formatWeek = (start: string, end: string) => {
    const s = new Date(start).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
    const e = new Date(end).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' });
    return `${s} – ${e}`;
  };

  return (
    <AppShell>
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <BarChart3 size={20} style={{ color: 'var(--primary)' }} />
            Progres Mingguan
          </h1>
          <p className="page-subtitle">Snapshot progres QA per minggu yang tersimpan secara historis</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button className="btn btn-secondary" onClick={() => window.open('/api/export?type=change-log')}>
            <Download size={14} /> Export
          </button>
          <button className="btn btn-primary" onClick={() => setShowModal(true)} id="btn-create-snapshot">
            <Camera size={14} /> Ambil Snapshot
          </button>
        </div>
      </div>

      <div className="info-box" style={{ marginBottom: 20 }}>
        <span style={{ fontSize: 13 }}>
          📌 Klik <strong>Ambil Snapshot</strong> untuk menyimpan kondisi saat ini. Snapshot yang tersimpan tidak berubah meskipun data QA diperbarui setelahnya.
        </span>
      </div>

      {loading ? <LoadingSpinner /> : snapshots.length === 0 ? (
        <EmptyState
          icon={<BarChart3 size={28} />}
          title="Belum ada snapshot mingguan"
          description="Buat snapshot pertama untuk mulai melacak progres mingguan"
          action={<button className="btn btn-primary" onClick={() => setShowModal(true)}><Camera size={13} /> Ambil Snapshot Sekarang</button>}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {snapshots.map(snap => {
            let data: any = {};
            try { data = JSON.parse(snap.snapshot_data); } catch {}

            return (
              <div key={snap.id} className="card">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                  <div>
                    <div style={{ fontSize: 16, fontWeight: 700 }}>{formatWeek(snap.week_start, snap.week_end)}</div>
                    <div style={{ fontSize: 12, color: 'var(--foreground-muted)' }}>
                      Diambil: {new Date(snap.created_at).toLocaleString('id-ID')}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontSize: 24, fontWeight: 700 }}>{data.totalActive ?? 0}</div>
                    <div style={{ fontSize: 12, color: 'var(--foreground-muted)' }}>Test case aktif</div>
                  </div>
                </div>

                <div className="grid-4" style={{ marginBottom: 16 }}>
                  {[
                    { label: 'Ditambah', value: data.weeklyChanges?.added ?? 0, color: 'var(--success)' },
                    { label: 'Diperbarui', value: data.weeklyChanges?.updated ?? 0, color: 'var(--primary)' },
                    { label: 'Dieksekusi (minggu ini)', value: data.execDuringWeek ?? 0, color: 'var(--accent)' },
                    { label: 'Usang', value: data.weeklyChanges?.obsolete ?? 0, color: 'var(--foreground-muted)' },
                  ].map(item => (
                    <div key={item.label} style={{ textAlign: 'center', padding: '10px', background: 'var(--surface-2)', borderRadius: 8 }}>
                      <div style={{ fontSize: 22, fontWeight: 700, color: item.color }}>{item.value}</div>
                      <div style={{ fontSize: 11, color: 'var(--foreground-muted)', marginTop: 2 }}>{item.label}</div>
                    </div>
                  ))}
                </div>

                <div className="grid-3" style={{ marginBottom: 16, gap: 12 }}>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Persiapan Test</div>
                    <ProgressBar value={data.prepProgress?.ready ?? 0} max={data.prepProgress?.total ?? 0} color="primary" />
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Eksekusi Test</div>
                    <ProgressBar value={data.execProgress?.executed ?? 0} max={data.execProgress?.readyTotal ?? 0} color="success" />
                  </div>
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Pass Rate</div>
                    <ProgressBar value={data.passRate?.pass ?? 0} max={data.passRate?.total ?? 0} color="success" />
                  </div>
                </div>

                {/* Result breakdown */}
                {data.results && (
                  <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                    {[
                      { key: 'pass', label: 'Pass' },
                      { key: 'fail', label: 'Fail' },
                      { key: 'blocked', label: 'Blocked' },
                      { key: 'not_run', label: 'Not Run' },
                    ].map(r => (
                      <div key={r.key} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
                        <ResultBadge result={r.key as any} />
                        <span style={{ fontWeight: 600 }}>{data.results[r.key] ?? 0}</span>
                      </div>
                    ))}
                  </div>
                )}

                {snap.activities && (
                  <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground-muted)', marginBottom: 4 }}>Aktivitas Minggu Ini:</div>
                    <div style={{ fontSize: 13, color: 'var(--foreground)', whiteSpace: 'pre-wrap' }}>{snap.activities}</div>
                  </div>
                )}

                {snap.next_priorities && (
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground-muted)', marginBottom: 4 }}>Prioritas Minggu Depan:</div>
                    <div style={{ fontSize: 13, color: 'var(--foreground)', whiteSpace: 'pre-wrap' }}>{snap.next_priorities}</div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create Snapshot Modal */}
      <Modal
        isOpen={showModal}
        onClose={() => setShowModal(false)}
        title="Ambil Snapshot Mingguan"
        footer={
          <>
            <button className="btn btn-secondary" onClick={() => setShowModal(false)}>Batal</button>
            <button className="btn btn-primary" onClick={saveSnapshot} disabled={saving} id="btn-save-snapshot">
              {saving ? <span className="spinner" /> : <Camera size={13} />}
              Simpan Snapshot
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="info-box">
            <span style={{ fontSize: 12 }}>Snapshot akan menangkap kondisi data QA saat ini. Data snapshot tidak akan berubah meskipun Anda memodifikasi test case setelahnya.</span>
          </div>
          <div className="grid-2">
            <div className="form-group">
              <label className="form-label">Tanggal Mulai Minggu <span style={{ color: 'var(--error)' }}>*</span></label>
              <input type="date" className="form-control" value={form.week_start}
                onChange={e => setForm(p => ({ ...p, week_start: e.target.value }))} />
            </div>
            <div className="form-group">
              <label className="form-label">Tanggal Akhir Minggu <span style={{ color: 'var(--error)' }}>*</span></label>
              <input type="date" className="form-control" value={form.week_end}
                onChange={e => setForm(p => ({ ...p, week_end: e.target.value }))} />
            </div>
          </div>
          <div className="form-group">
            <label className="form-label">Aktivitas Minggu Ini</label>
            <textarea className="form-control" rows={3}
              placeholder="- Selesaikan test case untuk modul A&#10;- Eksekusi 15 test case regresi"
              value={form.activities} onChange={e => setForm(p => ({ ...p, activities: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Prioritas Minggu Depan</label>
            <textarea className="form-control" rows={3}
              placeholder="- Mulai testing modul B&#10;- Review defect terbuka"
              value={form.next_priorities} onChange={e => setForm(p => ({ ...p, next_priorities: e.target.value }))} />
          </div>
          <div className="form-group">
            <label className="form-label">Catatan Tambahan</label>
            <textarea className="form-control" rows={2} value={form.notes}
              onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} />
          </div>
        </div>
      </Modal>
    </AppShell>
  );
}
