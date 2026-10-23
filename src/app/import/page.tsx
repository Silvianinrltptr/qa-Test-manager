'use client';

import { useRef, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { useToast } from '@/components/ui/Toast';
import { Upload, Download, Check, X, AlertTriangle, ArrowRight, Save } from 'lucide-react';
import type { Module } from '@/lib/types';
import { useEffect } from 'react';

type ImportRow = Record<string, any> & { _status?: 'valid' | 'duplicate' | 'error'; _error?: string; _selected?: boolean; _rowIndex?: number };

const APP_FIELDS = [
  { value: 'module_id', label: 'Modul (nama atau ID)', required: true },
  { value: 'feature_id', label: 'Fitur (nama atau ID)', required: true },
  { value: 'title', label: 'Judul Test Case', required: true },
  { value: 'requirement_ref', label: 'Referensi Requirement' },
  { value: 'test_type', label: 'Tipe Test' },
  { value: 'preconditions', label: 'Prasyarat' },
  { value: 'test_steps', label: 'Langkah Test' },
  { value: 'test_data', label: 'Data Test' },
  { value: 'expected_result', label: 'Expected Result' },
  { value: 'priority', label: 'Prioritas' },
  { value: 'prep_status', label: 'Status Persiapan' },
  { value: 'notes', label: 'Catatan' },
];

export default function ImportPage() {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [fileData, setFileData] = useState<{ headers: string[]; rows: Record<string, string>[] } | null>(null);
  const [fieldMap, setFieldMap] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState<ImportRow[]>([]);
  const [saving, setSaving] = useState(false);
  const [results, setResults] = useState<any>(null);
  const [modules, setModules] = useState<Module[]>([]);

  useEffect(() => {
    fetch('/api/modules').then(r => r.json()).then(setModules);
  }, []);

  const handleFile = async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    
    if (!['xlsx', 'xls', 'csv'].includes(ext || '')) {
      toast.error('Hanya file XLSX, XLS, dan CSV yang didukung di sini. Untuk file lain, gunakan AI Generator.');
      return;
    }

    try {
      if (ext === 'csv') {
        const text = await file.text();
        const lines = text.split('\n').filter(l => l.trim());
        const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim());
        const rows = lines.slice(1).map(line => {
          const vals = line.split(',').map(v => v.replace(/^"|"$/g, '').trim());
          return Object.fromEntries(headers.map((h, i) => [h, vals[i] || '']));
        });
        setFileData({ headers, rows });
        autoMap(headers);
      } else {
        const XLSX = await import('xlsx');
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, { type: 'array' });
        const sheetName = wb.SheetNames[0];
        const sheet = wb.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(sheet, { defval: '' }) as Record<string, string>[];
        const headers = json.length > 0 ? Object.keys(json[0]) : [];
        setFileData({ headers, rows: json.map(r => Object.fromEntries(Object.entries(r).map(([k, v]) => [k, String(v)]))) });
        autoMap(headers);
      }
      setStep(2);
      toast.success(`File "${file.name}" berhasil diproses`);
    } catch (err) {
      toast.error('Gagal memproses file');
    }
  };

  const autoMap = (headers: string[]) => {
    const map: Record<string, string> = {};
    const normalize = (s: string) => s.toLowerCase().replace(/[^a-z]/g, '');
    const lookups: Record<string, string[]> = {
      module_id: ['module', 'modul', 'moduleid', 'modulname'],
      feature_id: ['feature', 'fitur', 'featureid', 'featurename'],
      title: ['title', 'judul', 'scenario', 'skenario', 'testcase', 'name'],
      requirement_ref: ['req', 'requirement', 'reqid', 'reqref'],
      test_type: ['testtype', 'type', 'tipe', 'jenis'],
      preconditions: ['precondition', 'prasyarat', 'preconditions'],
      test_steps: ['steps', 'teststeps', 'langkah', 'step'],
      test_data: ['testdata', 'data'],
      expected_result: ['expected', 'expectedresult', 'hasil'],
      priority: ['priority', 'prioritas'],
      prep_status: ['prepstatus', 'status', 'prep'],
      notes: ['notes', 'catatan', 'keterangan'],
    };

    for (const [field, keywords] of Object.entries(lookups)) {
      const match = headers.find(h => keywords.includes(normalize(h)));
      if (match) map[field] = match;
    }
    setFieldMap(map);
  };

  const generatePreview = () => {
    if (!fileData) return;
    const rows: ImportRow[] = fileData.rows.slice(0, 100).map((row, i) => {
      const title = fieldMap.title ? row[fieldMap.title] : '';
      const moduleId = fieldMap.module_id ? row[fieldMap.module_id] : '';
      const featureId = fieldMap.feature_id ? row[fieldMap.feature_id] : '';
      let status: 'valid' | 'error' = 'valid';
      let error = '';
      if (!title) { status = 'error'; error = 'Judul kosong'; }
      else if (!moduleId) { status = 'error'; error = 'Modul tidak ditemukan'; }
      else if (!featureId) { status = 'error'; error = 'Fitur tidak ditemukan'; }
      return { ...row, _status: status, _error: error, _selected: status === 'valid', _rowIndex: i };
    });
    setPreview(rows);
    setStep(3);
  };

  const saveImport = async () => {
    const selected = preview.filter(r => r._selected && r._status === 'valid');
    if (selected.length === 0) { toast.error('Tidak ada baris yang dipilih'); return; }
    
    setSaving(true);
    try {
      const res = await fetch('/api/import/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rows: selected.map(({ _status, _error, _selected, _rowIndex, ...row }) => row),
          fieldMap
        })
      });
      if (res.ok) {
        const data = await res.json();
        setResults(data);
        setStep(4);
      } else {
        toast.error('Gagal menyimpan');
      }
    } finally { setSaving(false); }
  };

  const reset = () => {
    setStep(1); setFileData(null); setFieldMap({}); setPreview([]); setResults(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const toggleRow = (idx: number) => {
    setPreview(prev => prev.map((r, i) => i === idx ? { ...r, _selected: !r._selected } : r));
  };

  const validCount = preview.filter(r => r._status === 'valid').length;
  const selectedCount = preview.filter(r => r._selected).length;

  return (
    <AppShell>
      <div className="page-header">
        <div>
          <h1 className="page-title">Import Excel / CSV</h1>
          <p className="page-subtitle">Import test case dari file Excel atau CSV dengan validasi dan preview</p>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <a href="/api/export?type=template" className="btn btn-secondary" download>
            <Download size={14} /> Download Template
          </a>
        </div>
      </div>

      {/* Stepper */}
      <div style={{ display: 'flex', gap: 0, marginBottom: 24 }}>
        {[
          { n: 1, label: 'Upload File' },
          { n: 2, label: 'Pemetaan Kolom' },
          { n: 3, label: 'Preview & Validasi' },
          { n: 4, label: 'Selesai' },
        ].map((s, i, arr) => (
          <div key={s.n} style={{ display: 'flex', alignItems: 'center', flex: i < arr.length - 1 ? 1 : undefined }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 28, height: 28, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                background: step >= s.n ? 'var(--primary)' : 'var(--surface-2)',
                color: step >= s.n ? 'white' : 'var(--foreground-muted)',
                fontSize: 13, fontWeight: 600, flexShrink: 0
              }}>
                {step > s.n ? <Check size={14} /> : s.n}
              </div>
              <span style={{ fontSize: 13, fontWeight: step === s.n ? 600 : 400, color: step === s.n ? 'var(--foreground)' : 'var(--foreground-muted)', whiteSpace: 'nowrap' }}>
                {s.label}
              </span>
            </div>
            {i < arr.length - 1 && (
              <div style={{ flex: 1, height: 1, background: step > s.n ? 'var(--primary)' : 'var(--border)', margin: '0 12px' }} />
            )}
          </div>
        ))}
      </div>

      {/* Step 1: Upload */}
      {step === 1 && (
        <div className="card" style={{ maxWidth: 600 }}>
          <div
            className="file-drop-zone"
            onClick={() => fileRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
          >
            <Upload size={32} />
            <div style={{ fontWeight: 600, fontSize: 16 }}>Pilih atau seret file ke sini</div>
            <div style={{ fontSize: 13 }}>Format yang didukung: XLSX, XLS, CSV</div>
          </div>
          <input ref={fileRef} type="file" style={{ display: 'none' }} accept=".xlsx,.xls,.csv"
            onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} id="import-file-input" />
          <div style={{ marginTop: 16 }}>
            <div style={{ fontSize: 12, color: 'var(--foreground-muted)', marginBottom: 8, fontWeight: 600 }}>
              Download template:
            </div>
            <a href="/api/export?type=template" download className="btn btn-secondary btn-sm">
              <Download size={12} /> Template CSV
            </a>
          </div>
        </div>
      )}

      {/* Step 2: Field Mapping */}
      {step === 2 && fileData && (
        <div className="card" style={{ maxWidth: 700 }}>
          <div style={{ fontWeight: 600, marginBottom: 16 }}>Petakan kolom file ke field aplikasi</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 20 }}>
            {APP_FIELDS.map(f => (
              <div key={f.value} style={{ display: 'grid', gridTemplateColumns: '1fr 40px 1fr', alignItems: 'center', gap: 10 }}>
                <div style={{ fontSize: 13, fontWeight: f.required ? 600 : 400 }}>
                  {f.label} {f.required && <span style={{ color: 'var(--error)' }}>*</span>}
                </div>
                <ArrowRight size={14} style={{ color: 'var(--foreground-dim)', justifySelf: 'center' }} />
                <select className="form-control" value={fieldMap[f.value] || ''}
                  onChange={e => setFieldMap(prev => ({ ...prev, [f.value]: e.target.value }))}>
                  <option value="">-- Tidak dipetakan --</option>
                  {fileData.headers.map(h => <option key={h} value={h}>{h}</option>)}
                </select>
              </div>
            ))}
          </div>
          <div style={{ display: 'flex', gap: 10 }}>
            <button className="btn btn-secondary" onClick={() => setStep(1)}>‹ Kembali</button>
            <button className="btn btn-primary" onClick={generatePreview}
              disabled={!fieldMap.title || !fieldMap.module_id || !fieldMap.feature_id} id="btn-preview-import">
              Preview Data ›
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Preview */}
      {step === 3 && (
        <>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
            <div style={{ display: 'flex', gap: 12 }}>
              <span style={{ fontSize: 13 }}>
                <span style={{ color: 'var(--success)' }}>{validCount} valid</span>
                {' · '}
                <span style={{ color: 'var(--error)' }}>{preview.filter(r => r._status === 'error').length} error</span>
                {' · '}
                <span style={{ fontWeight: 600 }}>{selectedCount} dipilih</span>
              </span>
            </div>
            <div style={{ display: 'flex', gap: 10 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setStep(2)}>‹ Kembali</button>
              <button className="btn btn-primary" onClick={saveImport} disabled={saving || selectedCount === 0} id="btn-save-import">
                {saving ? <span className="spinner" /> : <Save size={13} />}
                Simpan {selectedCount} Baris
              </button>
            </div>
          </div>
          <div className="table-container">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 40 }}>
                    <input type="checkbox"
                      checked={selectedCount === validCount && validCount > 0}
                      onChange={() => setPreview(prev => prev.map(r => ({ ...r, _selected: r._status === 'valid' ? selectedCount !== validCount : r._selected })))}
                    />
                  </th>
                  <th>Status</th>
                  <th>{fieldMap.title || 'Judul'}</th>
                  <th>{fieldMap.module_id || 'Modul'}</th>
                  <th>{fieldMap.feature_id || 'Fitur'}</th>
                  <th>{fieldMap.expected_result || 'Expected'}</th>
                  <th>{fieldMap.priority || 'Prioritas'}</th>
                </tr>
              </thead>
              <tbody>
                {preview.map((row, idx) => (
                  <tr key={idx} style={{ opacity: !row._selected ? 0.5 : 1 }}>
                    <td>
                      <input type="checkbox" checked={row._selected || false} disabled={row._status === 'error'}
                        onChange={() => toggleRow(idx)} />
                    </td>
                    <td>
                      {row._status === 'valid' ? (
                        <span className="badge badge-active">Valid</span>
                      ) : (
                        <span className="badge badge-fail" title={row._error}>⚠ {row._error}</span>
                      )}
                    </td>
                    <td style={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {fieldMap.title ? row[fieldMap.title] : ''}
                    </td>
                    <td>{fieldMap.module_id ? row[fieldMap.module_id] : ''}</td>
                    <td>{fieldMap.feature_id ? row[fieldMap.feature_id] : ''}</td>
                    <td style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {fieldMap.expected_result ? row[fieldMap.expected_result] : ''}
                    </td>
                    <td>{fieldMap.priority ? row[fieldMap.priority] : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* Step 4: Results */}
      {step === 4 && results && (
        <div className="card" style={{ maxWidth: 600 }}>
          <div style={{ textAlign: 'center', padding: '20px 0' }}>
            <div style={{ fontSize: 48 }}>🎉</div>
            <div style={{ fontSize: 20, fontWeight: 700, marginTop: 12 }}>Import Selesai!</div>
          </div>
          <div className="grid-3" style={{ marginBottom: 20 }}>
            <div style={{ textAlign: 'center', padding: '16px', background: 'rgba(52,211,153,0.08)', borderRadius: 8 }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--success)' }}>{results.succeeded}</div>
              <div style={{ fontSize: 12, color: 'var(--foreground-muted)' }}>Berhasil</div>
            </div>
            <div style={{ textAlign: 'center', padding: '16px', background: 'rgba(251,191,36,0.08)', borderRadius: 8 }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--warning)' }}>{results.duplicates}</div>
              <div style={{ fontSize: 12, color: 'var(--foreground-muted)' }}>Duplikat</div>
            </div>
            <div style={{ textAlign: 'center', padding: '16px', background: 'rgba(248,113,113,0.08)', borderRadius: 8 }}>
              <div style={{ fontSize: 28, fontWeight: 700, color: 'var(--error)' }}>{results.failed}</div>
              <div style={{ fontSize: 12, color: 'var(--foreground-muted)' }}>Gagal</div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
            <button className="btn btn-secondary" onClick={reset}>Import Lagi</button>
            <a href="/test-cases" className="btn btn-primary">Lihat Test Cases ›</a>
          </div>
        </div>
      )}
    </AppShell>
  );
}
