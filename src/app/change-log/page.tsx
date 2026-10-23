'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { Modal } from '@/components/ui/Modal';
import { LoadingSpinner, EmptyState, Pagination } from '@/components/ui/Shared';
import { History, Search, Filter, Eye, GitCommit, ArrowRight, Clock } from 'lucide-react';
import type { ChangeLog } from '@/lib/types';

export default function ChangeLogPage() {
  const [logs, setLogs] = useState<ChangeLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ total: 0, page: 1, limit: 25, totalPages: 1 });
  const [entityType, setEntityType] = useState('');
  const [selectedLog, setSelectedLog] = useState<ChangeLog | null>(null);

  const fetchLogs = async (page = 1) => {
    setLoading(true);
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
  };

  useEffect(() => {
    fetchLogs(1);
  }, [entityType]);

  const parseJson = (val: string | null) => {
    if (!val) return null;
    try {
      return JSON.parse(val);
    } catch {
      return val;
    }
  };

  return (
    <AppShell>
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <History size={20} style={{ color: 'var(--primary)' }} />
            Audit & Change Log
          </h1>
          <p className="page-subtitle">
            Catatan historis lengkap seluruh perubahan test case, requirement, modul, dan status pengujian
          </p>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="card card-sm" style={{ marginBottom: 20 }}>
        <div className="filters-bar">
          <select
            className="form-control"
            style={{ width: 220 }}
            value={entityType}
            onChange={e => setEntityType(e.target.value)}
          >
            <option value="">Semua Tipe Entitas</option>
            <option value="test_case">Test Case</option>
            <option value="requirement">Requirement / PRD</option>
            <option value="module">Modul</option>
            <option value="feature">Fitur</option>
          </select>
        </div>
      </div>

      {/* Change Log Table */}
      {loading ? (
        <LoadingSpinner size="lg" />
      ) : logs.length === 0 ? (
        <EmptyState
          icon={<History size={32} />}
          title="Belum ada riwayat perubahan"
          description="Aktivitas pembuatan, pembaruan, dan perubahan status test case atau requirement akan tercatat di sini."
        />
      ) : (
        <>
          <div className="table-container" style={{ marginBottom: 16 }}>
            <table>
              <thead>
                <tr>
                  <th style={{ width: 150 }}>Waktu</th>
                  <th style={{ width: 110 }}>Entitas</th>
                  <th style={{ width: 130 }}>Ref ID</th>
                  <th style={{ width: 110 }}>Tipe Ubah</th>
                  <th>Alasan / Keterangan</th>
                  <th style={{ width: 130 }}>Ref Requirement</th>
                  <th style={{ width: 90, textAlign: 'right' }}>Diff</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(log => (
                  <tr key={log.id}>
                    <td style={{ fontSize: 12, color: 'var(--foreground-muted)' }}>
                      {new Date(log.changed_at).toLocaleString('id-ID')}
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
                      <span className={`badge badge-${
                        log.change_type === 'created' ? 'active' :
                        log.change_type === 'obsolete' ? 'archived' :
                        log.change_type === 'updated' ? 'primary' : 'muted'
                      }`}>
                        {log.change_type}
                      </span>
                    </td>
                    <td>
                      <div style={{ fontSize: 13, color: 'var(--foreground)' }}>
                        {log.reason || '—'}
                      </div>
                      {log.changed_fields && (
                        <div style={{ fontSize: 11, color: 'var(--foreground-muted)', marginTop: 2 }}>
                          Field diubah: {log.changed_fields}
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
                    <td style={{ textAlign: 'right' }}>
                      {(log.old_values || log.new_values) && (
                        <button
                          className="btn btn-secondary btn-icon btn-sm"
                          title="Lihat Detail Nilai Lama vs Baru"
                          onClick={() => setSelectedLog(log)}
                        >
                          <Eye size={12} />
                        </button>
                      )}
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

      {/* Diff / Detail Modal */}
      <Modal
        isOpen={Boolean(selectedLog)}
        onClose={() => setSelectedLog(null)}
        title={`Detail Perubahan: ${selectedLog?.entity_ref} (${selectedLog?.change_type})`}
        footer={
          <button className="btn btn-secondary" onClick={() => setSelectedLog(null)}>Tutup</button>
        }
      >
        {selectedLog && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div className="grid-2">
              <div>
                <div style={{ fontSize: 12, color: 'var(--foreground-muted)', marginBottom: 2 }}>Waktu Perubahan</div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{new Date(selectedLog.changed_at).toLocaleString('id-ID')}</div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: 'var(--foreground-muted)', marginBottom: 2 }}>Alasan</div>
                <div style={{ fontSize: 13, fontWeight: 500 }}>{selectedLog.reason || '—'}</div>
              </div>
            </div>

            <div className="grid-2" style={{ gap: 14 }}>
              {/* Old Values */}
              <div style={{ background: 'var(--surface-2)', padding: 12, borderRadius: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--error)', marginBottom: 8 }}>
                  🔴 Nilai Sebelumnya (Old):
                </div>
                {selectedLog.old_values ? (
                  <pre style={{ fontSize: 11, color: 'var(--foreground)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                    {JSON.stringify(parseJson(selectedLog.old_values), null, 2)}
                  </pre>
                ) : (
                  <div style={{ fontSize: 12, color: 'var(--foreground-dim)', fontStyle: 'italic' }}>Tidak ada (entitas baru)</div>
                )}
              </div>

              {/* New Values */}
              <div style={{ background: 'var(--surface-2)', padding: 12, borderRadius: 8 }}>
                <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--success)', marginBottom: 8 }}>
                  🟢 Nilai Sesudahnya (New):
                </div>
                {selectedLog.new_values ? (
                  <pre style={{ fontSize: 11, color: 'var(--foreground)', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
                    {JSON.stringify(parseJson(selectedLog.new_values), null, 2)}
                  </pre>
                ) : (
                  <div style={{ fontSize: 12, color: 'var(--foreground-dim)', fontStyle: 'italic' }}>Tidak ada</div>
                )}
              </div>
            </div>
          </div>
        )}
      </Modal>
    </AppShell>
  );
}
