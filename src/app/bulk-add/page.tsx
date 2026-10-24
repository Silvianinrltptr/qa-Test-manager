'use client';

import { useEffect, useRef, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { useToast } from '@/components/ui/Toast';
import { Plus, Trash2, Copy, Save, Upload, Download, AlertTriangle } from 'lucide-react';
import type { Module, Feature } from '@/lib/types';
import { TEST_TYPES, PRIORITIES, PREP_STATUSES } from '@/lib/types';

interface BulkRow {
  id: string;
  module_id: string;
  feature_id: string;
  requirement_ref: string;
  title: string;
  test_type: string;
  preconditions: string;
  test_steps: string;
  test_data: string;
  expected_result: string;
  priority: string;
  prep_status: string;
  notes: string;
  _error?: string;
}

const emptyRow = (): BulkRow => ({
  id: Math.random().toString(36).slice(2),
  module_id: '', feature_id: '', requirement_ref: '', title: '',
  test_type: 'functional', preconditions: '', test_steps: '',
  test_data: '', expected_result: '', priority: 'medium',
  prep_status: 'draft', notes: '',
});

export default function BulkAddPage() {
  const toast = useToast();
  const [modules, setModules] = useState<Module[]>([]);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [rows, setRows] = useState<BulkRow[]>([emptyRow()]);
  const [saving, setSaving] = useState(false);
  const [defaultModuleId, setDefaultModuleId] = useState('');
  const [defaultFeatureId, setDefaultFeatureId] = useState('');
  const pasteRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    fetch('/api/modules').then(r => r.json()).then(setModules);
    fetch('/api/features').then(r => r.json()).then(setFeatures);
  }, []);

  const filteredFeatures = (moduleId: string) => features.filter(f => f.module_id === Number(moduleId));

  const addRow = () => setRows(prev => [...prev, { ...emptyRow(), module_id: defaultModuleId, feature_id: defaultFeatureId }]);

  const removeRow = (id: string) => setRows(prev => prev.filter(r => r.id !== id));

  const duplicateRow = (id: string) => {
    const idx = rows.findIndex(r => r.id === id);
    if (idx === -1) return;
    const dup = { ...rows[idx], id: Math.random().toString(36).slice(2) };
    setRows(prev => [...prev.slice(0, idx + 1), dup, ...prev.slice(idx + 1)]);
  };

  const updateRow = (id: string, field: string, value: string) => {
    setRows(prev => prev.map(r => r.id === id ? { ...r, [field]: value, _error: undefined } : r));
  };

  const applyDefaults = () => {
    setRows(prev => prev.map(r => ({
      ...r,
      module_id: defaultModuleId || r.module_id,
      feature_id: defaultFeatureId || r.feature_id,
    })));
    toast.info('Default module/feature applied to all rows');
  };

  // Paste from Excel
  const handlePaste = (e: React.ClipboardEvent) => {
    const text = e.clipboardData.getData('text');
    const lines = text.split('\n').map(l => l.split('\t'));
    if (lines.length < 2) return;
    
    // Try to parse: Title | TestType | Preconditions | Steps | Data | Expected | Priority | Notes
    const newRows: BulkRow[] = lines
      .filter(cols => cols.some(c => c.trim()))
      .map(cols => ({
        ...emptyRow(),
        module_id: defaultModuleId,
        feature_id: defaultFeatureId,
        title: cols[0]?.trim() || '',
        test_type: cols[1]?.trim() || 'functional',
        preconditions: cols[2]?.trim() || '',
        test_steps: cols[3]?.trim() || '',
        test_data: cols[4]?.trim() || '',
        expected_result: cols[5]?.trim() || '',
        priority: cols[6]?.trim() || 'medium',
        notes: cols[7]?.trim() || '',
      }));

    if (newRows.length > 0) {
      setRows(prev => [...prev.filter(r => r.title || r.expected_result), ...newRows]);
      toast.success(`${newRows.length} row${newRows.length === 1 ? '' : 's'} pasted from clipboard`);
    }
    e.preventDefault();
  };

  const validate = () => {
    let valid = true;
    setRows(prev => prev.map(r => {
      if (!r.title.trim()) { valid = false; return { ...r, _error: 'Title is required' }; }
      if (!r.module_id) { valid = false; return { ...r, _error: 'Select module' }; }
      if (!r.feature_id) { valid = false; return { ...r, _error: 'Select feature' }; }
      return { ...r, _error: undefined };
    }));
    return valid;
  };

  const saveAll = async () => {
    if (!validate()) { toast.error('Please fix errors in the table'); return; }
    setSaving(true);
    try {
      const cases = rows.map(r => ({
        module_id: Number(r.module_id), feature_id: Number(r.feature_id),
        requirement_ref: r.requirement_ref, title: r.title,
        test_type: r.test_type, preconditions: r.preconditions,
        test_steps: r.test_steps, test_data: r.test_data,
        expected_result: r.expected_result, priority: r.priority,
        prep_status: r.prep_status, notes: r.notes,
      }));
      const res = await fetch('/api/test-cases', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cases })
      });
      if (res.ok) {
        const data = await res.json();
        toast.success(`${data.succeeded} test case${data.succeeded === 1 ? '' : 's'} saved successfully`);
        if (data.failed > 0) toast.warning(`${data.failed} failed`);
        setRows([emptyRow()]);
      } else {
        toast.error('Failed to save');
      }
    } finally { setSaving(false); }
  };

  const downloadTemplate = () => {
    const headers = 'title\ttest_type\tpreconditions\ttest_steps\ttest_data\texpected_result\tpriority\tnotes';
    const example = 'Login successful\tfunctional\tUser not logged in\t1. Open login page\nenter username\nclick submit\tusername: admin\npassword: Pass123\tUser successfully logged in\thigh\t';
    const content = headers + '\n' + example;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'bulk_template.tsv'; a.click();
  };

  return (
    <AppShell>
      <header className="page-header main-header">
        <div>
          <h1 className="page-title">Bulk Add Test Cases</h1>
          <p className="page-subtitle">Add multiple test cases at once using an editable table or paste from Excel</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="btn btn-secondary" onClick={downloadTemplate}>
            <Download size={14} /> Template
          </button>
          <button className="btn btn-primary" onClick={saveAll} disabled={saving} id="btn-save-all-bulk">
            {saving ? <span className="spinner" /> : <Save size={14} />}
            Save All ({rows.length})
          </button>
          <ThemeToggle />
        </div>
      </header>

      {/* Defaults */}
      <div className="card card-sm" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--foreground-muted)', width: 120 }}>Default for all rows:</div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Module</label>
            <select className="form-control" style={{ width: 180 }} value={defaultModuleId}
              onChange={e => { setDefaultModuleId(e.target.value); setDefaultFeatureId(''); }}>
              <option value="">-- Module --</option>
              {modules.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div className="form-group" style={{ margin: 0 }}>
            <label className="form-label">Feature</label>
            <select className="form-control" style={{ width: 180 }} value={defaultFeatureId}
              onChange={e => setDefaultFeatureId(e.target.value)} disabled={!defaultModuleId}>
              <option value="">-- Feature --</option>
              {filteredFeatures(defaultModuleId).map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={applyDefaults}>Apply to All</button>
        </div>
      </div>

      {/* Paste hint */}
      <div className="info-box" style={{ marginBottom: 16 }}>
        <Info size={14} style={{ flexShrink: 0 }} />
        <div style={{ fontSize: 12 }}>
          You can <strong>paste directly from Excel/Google Sheets</strong> by clicking a table cell below, then pressing Ctrl+V.
          Column order: Title, Test Type, Preconditions, Steps, Data, Expected Result, Priority, Notes.
          Or <strong>download the template</strong> at the top right.
        </div>
      </div>

      {/* Paste zone */}
      <textarea
        ref={pasteRef}
        onPaste={handlePaste}
        style={{ position: 'absolute', opacity: 0, pointerEvents: 'none', width: 1, height: 1 }}
        readOnly
      />

      {/* Table */}
      <div style={{ overflowX: 'auto', marginBottom: 12 }}>
        <table className="editable-table" style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
              <th style={{ padding: '8px 10px', width: 30, color: 'var(--foreground-muted)', fontWeight: 600, fontSize: 11 }}>#</th>
              <th style={{ padding: '8px 10px', minWidth: 140, color: 'var(--foreground-muted)', fontWeight: 600, fontSize: 11 }}>Module *</th>
              <th style={{ padding: '8px 10px', minWidth: 140, color: 'var(--foreground-muted)', fontWeight: 600, fontSize: 11 }}>Feature *</th>
              <th style={{ padding: '8px 10px', minWidth: 80, color: 'var(--foreground-muted)', fontWeight: 600, fontSize: 11 }}>Ref</th>
              <th style={{ padding: '8px 10px', minWidth: 200, color: 'var(--foreground-muted)', fontWeight: 600, fontSize: 11 }}>Title *</th>
              <th style={{ padding: '8px 10px', minWidth: 110, color: 'var(--foreground-muted)', fontWeight: 600, fontSize: 11 }}>Type</th>
              <th style={{ padding: '8px 10px', minWidth: 150, color: 'var(--foreground-muted)', fontWeight: 600, fontSize: 11 }}>Preconditions</th>
              <th style={{ padding: '8px 10px', minWidth: 200, color: 'var(--foreground-muted)', fontWeight: 600, fontSize: 11 }}>Test Steps</th>
              <th style={{ padding: '8px 10px', minWidth: 130, color: 'var(--foreground-muted)', fontWeight: 600, fontSize: 11 }}>Test Data</th>
              <th style={{ padding: '8px 10px', minWidth: 160, color: 'var(--foreground-muted)', fontWeight: 600, fontSize: 11 }}>Expected Result</th>
              <th style={{ padding: '8px 10px', minWidth: 90, color: 'var(--foreground-muted)', fontWeight: 600, fontSize: 11 }}>Priority</th>
              <th style={{ padding: '8px 10px', minWidth: 90, color: 'var(--foreground-muted)', fontWeight: 600, fontSize: 11 }}>Prep Status</th>
              <th style={{ padding: '8px 10px', minWidth: 120, color: 'var(--foreground-muted)', fontWeight: 600, fontSize: 11 }}>Notes</th>
              <th style={{ padding: '8px 10px', width: 70, color: 'var(--foreground-muted)', fontWeight: 600, fontSize: 11 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, idx) => (
              <tr key={row.id} style={{ borderBottom: '1px solid var(--border)', background: row._error ? 'rgba(248,113,113,0.05)' : undefined }}>
                <td style={{ padding: '4px 10px', color: 'var(--foreground-muted)', fontSize: 11 }}>{idx + 1}</td>
                <td style={{ padding: '4px 6px' }}>
                  <select className="form-control" style={{ fontSize: 12, padding: '4px 6px' }} value={row.module_id}
                    onChange={e => { updateRow(row.id, 'module_id', e.target.value); updateRow(row.id, 'feature_id', ''); }}>
                    <option value="">--</option>
                    {modules.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                  </select>
                </td>
                <td style={{ padding: '4px 6px' }}>
                  <select className="form-control" style={{ fontSize: 12, padding: '4px 6px' }} value={row.feature_id}
                    onChange={e => updateRow(row.id, 'feature_id', e.target.value)} disabled={!row.module_id}>
                    <option value="">--</option>
                    {filteredFeatures(row.module_id).map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
                  </select>
                </td>
                <td style={{ padding: '4px 6px' }}>
                  <input style={{ width: 80, background: 'transparent', border: '1px solid transparent', borderRadius: 4, padding: '4px 6px', color: 'var(--foreground)', fontSize: 12 }}
                    value={row.requirement_ref} onChange={e => updateRow(row.id, 'requirement_ref', e.target.value)}
                    placeholder="REQ-" />
                </td>
                <td style={{ padding: '4px 6px' }}>
                  <input style={{ width: '100%', background: 'transparent', border: row._error ? '1px solid var(--error)' : '1px solid transparent', borderRadius: 4, padding: '4px 6px', color: 'var(--foreground)', fontSize: 12 }}
                    value={row.title} onChange={e => updateRow(row.id, 'title', e.target.value)}
                    onPaste={handlePaste}
                    placeholder="Test case title" />
                  {row._error && <div style={{ fontSize: 10, color: 'var(--error)', marginTop: 2 }}>{row._error}</div>}
                </td>
                <td style={{ padding: '4px 6px' }}>
                  <select className="form-control" style={{ fontSize: 12, padding: '4px 6px' }} value={row.test_type}
                    onChange={e => updateRow(row.id, 'test_type', e.target.value)}>
                    {TEST_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </td>
                <td style={{ padding: '4px 6px' }}>
                  <textarea style={{ width: 150, background: 'transparent', border: '1px solid transparent', borderRadius: 4, padding: '4px 6px', color: 'var(--foreground)', fontSize: 12, resize: 'vertical', minHeight: 36 }}
                    value={row.preconditions} onChange={e => updateRow(row.id, 'preconditions', e.target.value)} />
                </td>
                <td style={{ padding: '4px 6px' }}>
                  <textarea style={{ width: 200, background: 'transparent', border: '1px solid transparent', borderRadius: 4, padding: '4px 6px', color: 'var(--foreground)', fontSize: 12, resize: 'vertical', minHeight: 36 }}
                    value={row.test_steps} onChange={e => updateRow(row.id, 'test_steps', e.target.value)} />
                </td>
                <td style={{ padding: '4px 6px' }}>
                  <textarea style={{ width: 130, background: 'transparent', border: '1px solid transparent', borderRadius: 4, padding: '4px 6px', color: 'var(--foreground)', fontSize: 12, resize: 'vertical', minHeight: 36 }}
                    value={row.test_data} onChange={e => updateRow(row.id, 'test_data', e.target.value)} />
                </td>
                <td style={{ padding: '4px 6px' }}>
                  <textarea style={{ width: 160, background: 'transparent', border: '1px solid transparent', borderRadius: 4, padding: '4px 6px', color: 'var(--foreground)', fontSize: 12, resize: 'vertical', minHeight: 36 }}
                    value={row.expected_result} onChange={e => updateRow(row.id, 'expected_result', e.target.value)} />
                </td>
                <td style={{ padding: '4px 6px' }}>
                  <select className="form-control" style={{ fontSize: 12, padding: '4px 6px' }} value={row.priority}
                    onChange={e => updateRow(row.id, 'priority', e.target.value)}>
                    {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                  </select>
                </td>
                <td style={{ padding: '4px 6px' }}>
                  <select className="form-control" style={{ fontSize: 12, padding: '4px 6px' }} value={row.prep_status}
                    onChange={e => updateRow(row.id, 'prep_status', e.target.value)}>
                    {PREP_STATUSES.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </td>
                <td style={{ padding: '4px 6px' }}>
                  <textarea style={{ width: 120, background: 'transparent', border: '1px solid transparent', borderRadius: 4, padding: '4px 6px', color: 'var(--foreground)', fontSize: 12, resize: 'vertical', minHeight: 36 }}
                    value={row.notes} onChange={e => updateRow(row.id, 'notes', e.target.value)} />
                </td>
                <td style={{ padding: '4px 8px' }}>
                  <div style={{ display: 'flex', gap: 4, flexDirection: 'column' }}>
                    <button className="btn btn-ghost btn-icon btn-sm" title="Duplicate" onClick={() => duplicateRow(row.id)}>
                      <Copy size={12} />
                    </button>
                    <button className="btn btn-ghost btn-icon btn-sm" title="Delete" onClick={() => removeRow(row.id)}
                      disabled={rows.length === 1}>
                      <Trash2 size={12} style={{ color: 'var(--error)' }} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
        <button className="btn btn-secondary" onClick={addRow} id="btn-add-bulk-row">
          <Plus size={14} /> Add Row
        </button>
        <div style={{ display: 'flex', gap: 10 }}>
          <span style={{ fontSize: 13, color: 'var(--foreground-muted)', alignSelf: 'center' }}>
            {rows.length} row{rows.length === 1 ? '' : 's'}
          </span>
          <button className="btn btn-primary" onClick={saveAll} disabled={saving}>
            {saving ? <span className="spinner" /> : <Save size={14} />}
            Save All
          </button>
        </div>
      </div>
    </AppShell>
  );
}

function Info({ size, style }: { size: number; style?: React.CSSProperties }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={style}>
      <circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/>
    </svg>
  );
}
