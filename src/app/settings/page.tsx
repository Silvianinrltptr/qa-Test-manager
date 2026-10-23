'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { LoadingSpinner } from '@/components/ui/Shared';
import { useToast } from '@/components/ui/Toast';
import {
  Settings, Database, Sparkles, Key, CheckCircle2,
  AlertTriangle, HardDrive, Download, RefreshCw, Layers
} from 'lucide-react';

export default function SettingsPage() {
  const toast = useToast();
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/settings');
      if (res.ok) {
        setData(await res.json());
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSeedData = async () => {
    setSeeding(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'seed_sample_data' }),
      });
      const resData = await res.json();
      if (res.ok) {
        toast.success(resData.message || 'Data sampel berhasil ditambahkan!');
        fetchSettings();
      } else {
        toast.error(resData.message || 'Gagal menambahkan data sampel');
      }
    } catch {
      toast.error('Terjadi kesalahan saat memproses');
    } finally {
      setSeeding(false);
    }
  };

  return (
    <AppShell>
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Settings size={20} style={{ color: 'var(--primary)' }} />
            Pengaturan & Konfigurasi Sistem
          </h1>
          <p className="page-subtitle">
            Status integrasi AI, penyimpanan database SQLite lokal, dan pemeliharaan data
          </p>
        </div>
        <button className="btn btn-secondary" onClick={fetchSettings}>
          <RefreshCw size={14} /> Refresh Status
        </button>
      </div>

      {loading ? (
        <LoadingSpinner size="lg" />
      ) : !data ? (
        <div className="card">Gagal memuat status sistem</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* AI Configuration Section */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 8,
                  background: 'rgba(79,124,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'var(--primary)'
                }}>
                  <Sparkles size={20} />
                </div>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 700 }}>Integrasi Google Gemini AI</h3>
                  <p style={{ fontSize: 12, color: 'var(--foreground-muted)' }}>
                    Digunakan untuk pembuatan test case otomatis dan ekstraksi OCR dokumen requirement
                  </p>
                </div>
              </div>

              <div>
                {data.ai.configured ? (
                  <span className="badge badge-success" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '6px 12px' }}>
                    <CheckCircle2 size={14} /> Terhubung (Aktif)
                  </span>
                ) : (
                  <span className="badge badge-warning" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '6px 12px' }}>
                    <AlertTriangle size={14} /> Belum Dikonfigurasi
                  </span>
                )}
              </div>
            </div>

            {data.ai.configured ? (
              <div style={{ background: 'var(--surface-2)', padding: 14, borderRadius: 8, fontSize: 13 }}>
                <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                  <div>
                    <span style={{ color: 'var(--foreground-muted)' }}>Model AI: </span>
                    <strong style={{ color: 'var(--primary-light)' }}>{data.ai.model}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--foreground-muted)' }}>Kunci API: </span>
                    <code>{data.ai.keyMasked}</code>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: 8, padding: 16 }}>
                <div style={{ fontWeight: 600, color: 'var(--warning)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <AlertTriangle size={16} /> Instruksi Konfigurasi GEMINI_API_KEY:
                </div>
                <ol style={{ fontSize: 13, color: 'var(--foreground)', lineHeight: 1.8, paddingLeft: 20 }}>
                  <li>
                    Dapatkan API Key gratis di{' '}
                    <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', textDecoration: 'underline' }}>
                      Google AI Studio (aistudio.google.com)
                    </a>.
                  </li>
                  <li>
                    Buka file <code>.env.local</code> di folder root proyek ini (atau buat baru jika belum ada).
                  </li>
                  <li>
                    Tambahkan baris berikut ke dalam file:
                    <div style={{ background: 'var(--surface)', padding: '6px 12px', borderRadius: 4, marginTop: 4, fontFamily: 'monospace' }}>
                      GEMINI_API_KEY=your_gemini_api_key_here
                    </div>
                  </li>
                  <li>
                    Simpan file lalu restart server development. Fitur AI Generator akan langsung aktif otomatis!
                  </li>
                </ol>
              </div>
            )}
          </div>

          {/* Database & Storage Section */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 8,
                background: 'rgba(52,211,153,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--success)'
              }}>
                <Database size={20} />
              </div>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700 }}>Penyimpanan Database SQLite Persisten</h3>
                <p style={{ fontSize: 12, color: 'var(--foreground-muted)' }}>
                  Data tersimpan secara permanen di storage lokal perangkat (Write-Ahead Logging / WAL aktif)
                </p>
              </div>
            </div>

            <div className="grid-2" style={{ marginBottom: 20 }}>
              <div style={{ background: 'var(--surface-2)', padding: 14, borderRadius: 8 }}>
                <div style={{ fontSize: 12, color: 'var(--foreground-muted)', marginBottom: 4 }}>Lokasi Database File</div>
                <code style={{ fontSize: 12, wordBreak: 'break-all', color: 'var(--foreground)' }}>{data.database.path}</code>
              </div>
              <div style={{ background: 'var(--surface-2)', padding: 14, borderRadius: 8 }}>
                <div style={{ fontSize: 12, color: 'var(--foreground-muted)', marginBottom: 4 }}>Ukuran Database Saat Ini</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--success)' }}>{data.database.sizeKb} KB</div>
              </div>
            </div>

            {/* Counts */}
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Jumlah Record Tersimpan:</div>
            <div className="grid-3" style={{ marginBottom: 20 }}>
              {[
                { label: 'Modul Terdaftar', count: data.database.counts.modules },
                { label: 'Fitur', count: data.database.counts.features },
                { label: 'Requirements / PRD', count: data.database.counts.requirements },
                { label: 'Test Cases', count: data.database.counts.testCases },
                { label: 'Riwayat Eksekusi', count: data.database.counts.executions },
                { label: 'Log Aktivitas & Audit', count: data.database.counts.activities },
              ].map(item => (
                <div key={item.label} style={{ background: 'var(--surface-2)', padding: 12, borderRadius: 8 }}>
                  <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--primary)' }}>{item.count}</div>
                  <div style={{ fontSize: 12, color: 'var(--foreground-muted)' }}>{item.label}</div>
                </div>
              ))}
            </div>

            {/* Seed Sample Data button */}
            {data.database.counts.testCases === 0 && (
              <div style={{
                background: 'rgba(79,124,255,0.06)',
                border: '1px dashed var(--primary)',
                borderRadius: 8,
                padding: 16,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>Database Masih Kosong?</div>
                  <div style={{ fontSize: 12, color: 'var(--foreground-muted)' }}>
                    Klik tombol ini untuk memasukkan data sampel realistis (Modul Autentikasi, Transaksi, PRD, Test Case, dan Riwayat Eksekusi).
                  </div>
                </div>
                <button className="btn btn-primary" onClick={handleSeedData} disabled={seeding}>
                  {seeding ? <span className="spinner" /> : <Layers size={14} />}
                  Inisialisasi Data Sampel
                </button>
              </div>
            )}
          </div>

          {/* Export Assets Section */}
          <div className="card">
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Ekspor & Backup Data</h3>
            <p style={{ fontSize: 13, color: 'var(--foreground-muted)', marginBottom: 16 }}>
              Unduh data test case atau riwayat audit dalam format file CSV untuk kebutuhan pelaporan eksternal atau backup.
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <a href="/api/export?type=test-cases" className="btn btn-secondary" download>
                <Download size={14} /> Ekspor Semua Test Case (.CSV)
              </a>
              <a href="/api/export?type=executions" className="btn btn-secondary" download>
                <Download size={14} /> Ekspor Riwayat Eksekusi (.CSV)
              </a>
              <a href="/api/export?type=change-log" className="btn btn-secondary" download>
                <Download size={14} /> Ekspor Change Log (.CSV)
              </a>
              <a href="/api/export?type=template" className="btn btn-secondary" download>
                <Download size={14} /> Unduh Template CSV Import
              </a>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
