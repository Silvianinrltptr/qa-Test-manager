'use client';

import { useEffect, useState, useRef } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { EmptyState, LoadingSpinner } from '@/components/ui/Shared';
import { useToast } from '@/components/ui/Toast';
import { Sparkles, Upload, FileText, AlertTriangle, Check, X, Info, Save, Trash2, Languages } from 'lucide-react';
import type { Module, Feature, AIDraft } from '@/lib/types';
import { TEST_TYPES, PRIORITIES } from '@/lib/types';

export default function AIGeneratorPage() {
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [modules, setModules] = useState<Module[]>([]);
  const [features, setFeatures] = useState<Feature[]>([]);
  const [moduleId, setModuleId] = useState('');
  const [featureId, setFeatureId] = useState('');
  const [requirementText, setRequirementText] = useState('');
  const [extractedText, setExtractedText] = useState('');
  const [drafts, setDrafts] = useState<AIDraft[]>([]);
  const [generating, setGenerating] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sessionId] = useState(() => Math.random().toString(36).slice(2));
  const [provider, setProvider] = useState<'gemini' | 'deepseek'>('gemini');
  const [providerStatus, setProviderStatus] = useState<{ gemini: boolean; deepseek: boolean }>({ gemini: false, deepseek: false });
  const [language, setLanguage] = useState<'English' | 'Bahasa Indonesia'>('English');
  const [isConfigured, setIsConfigured] = useState<boolean | null>(null);
  const [tab, setTab] = useState<'paste' | 'file'>('paste');

  useEffect(() => {
    fetch('/api/modules')
      .then(r => r.json())
      .then(d => setModules(Array.isArray(d) ? d : []))
      .catch(() => setModules([]));
    fetch('/api/settings').then(r => r.json()).then(data => {
      if (data?.ai) {
        const geminiOk = Boolean(data.ai.gemini?.configured ?? data.ai.configured);
        const deepseekOk = Boolean(data.ai.deepseek?.configured);
        setProviderStatus({ gemini: geminiOk, deepseek: deepseekOk });
        setIsConfigured(geminiOk || deepseekOk);
      }
    }).catch(() => {
      setIsConfigured(false);
    });
  }, []);

  const safeFeatures = Array.isArray(features) ? features : [];
  const filteredFeatures = safeFeatures.filter(f => f.module_id === Number(moduleId));

  useEffect(() => {
    if (moduleId) {
      fetch(`/api/features?moduleId=${moduleId}`)
        .then(r => r.json())
        .then(d => setFeatures(Array.isArray(d) ? d : []))
        .catch(() => setFeatures([]));
    }
  }, [moduleId]);

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/ai/parse-file', { method: 'POST', body: formData });
      const data = await res.json();
      if (res.ok) {
        setExtractedText(data.text);
        setRequirementText(data.text);
        toast.success(`File "${file.name}" processed successfully (${data.method})`);
        setTab('paste');
      } else {
        toast.error(data.error || 'Failed to process file');
      }
    } finally { setUploading(false); }
  };

  const generate = async () => {
    if (!moduleId || !featureId) { toast.error('Please select a module and feature first'); return; }
    if (!requirementText.trim()) { toast.error('Please enter requirement text first'); return; }

    setGenerating(true);
    setDrafts([]);
    try {
      const res = await fetch('/api/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          module_id: Number(moduleId),
          feature_id: Number(featureId),
          requirement_text: requirementText,
          session_id: sessionId,
          provider: provider,
          language: language
        })
      });
      const data = await res.json();
      if (res.ok) {
        setDrafts(data.drafts.map((d: AIDraft) => ({ ...d, selected: d.selected !== false })));
        const providerName = provider === 'deepseek' ? 'DeepSeek' : 'Gemini';
        toast.success(`${data.totalGenerated} draft test case${data.totalGenerated === 1 ? '' : 's'} generated with ${providerName}`);
      } else if (data.error === 'AI_NOT_CONFIGURED') {
        const providerName = provider === 'deepseek' ? 'DeepSeek' : 'Gemini';
        toast.error(`${providerName} is not configured. Check the Settings page.`);
      } else {
        toast.error(data.error || 'Failed to generate test cases');
      }
    } finally { setGenerating(false); }
  };

  const saveSelected = async () => {
    const selected = drafts.filter(d => d.selected);
    if (selected.length === 0) { toast.error('Select at least one draft to save'); return; }

    setSaving(true);
    try {
      const cases = selected.map(d => ({
        module_id: Number(moduleId), feature_id: Number(featureId),
        title: d.title, test_type: d.test_type,
        preconditions: d.preconditions, test_steps: d.test_steps,
        test_data: d.test_data, expected_result: d.expected_result,
        priority: d.priority, requirement_ref: d.requirement_ref,
        notes: d.notes, prep_status: 'draft',
      }));

      const res = await fetch('/api/test-cases', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ cases })
      });

      if (res.ok) {
        const data = await res.json();
        toast.success(`${data.succeeded} test case${data.succeeded === 1 ? '' : 's'} saved successfully`);
        if (data.failed > 0) toast.warning(`${data.failed} test case${data.failed === 1 ? '' : 's'} failed to save`);
        setDrafts([]);
        setRequirementText('');
      } else {
        toast.error('Failed to save');
      }
    } finally { setSaving(false); }
  };

  const updateDraft = (idx: number, field: string, value: string | boolean) => {
    setDrafts(prev => prev.map((d, i) => i === idx ? { ...d, [field]: value } : d));
  };

  const removeDraft = (idx: number) => {
    setDrafts(prev => prev.filter((_, i) => i !== idx));
  };

  const selectedCount = drafts.filter(d => d.selected).length;

  return (
    <AppShell>
      <header className="page-header main-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Sparkles size={22} style={{ color: 'var(--accent)' }} />
            AI Test Case Generator
          </h1>
          <p className="page-subtitle">Generate test case drafts from requirements using AI</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <ThemeToggle />
        </div>
      </header>

      {isConfigured === false && (
        <div className="warn-box" style={{ marginBottom: 20 }}>
          <AlertTriangle size={16} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>
            <strong>No AI API keys are configured.</strong> To use this feature, configure <code>GEMINI_API_KEY</code> or <code>DEEPSEEK_API_KEY</code> in your <code>.env.local</code> file.
            Check the <a href="/settings" style={{ color: 'inherit', textDecoration: 'underline' }}>Settings</a> page for setup instructions.
            <br />Manual test case management continues to function without AI.
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '420px 1fr', gap: 20, alignItems: 'start' }}>
        {/* Input Panel */}
        <div className="card">
          <div style={{ fontWeight: 600, marginBottom: 16, display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileText size={16} style={{ color: 'var(--primary)' }} />
            Input Requirement
          </div>

          {/* AI Provider Selection */}
          <div className="form-group" style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
              <label className="form-label" style={{ marginBottom: 0 }}>
                AI Provider <span className="form-required">*</span>
              </label>
              {providerStatus[provider] ? (
                <span style={{ fontSize: 11, color: 'var(--success)', display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 500 }}>
                  <Check size={12} /> Key Active
                </span>
              ) : (
                <span style={{ fontSize: 11, color: 'var(--warning)', display: 'inline-flex', alignItems: 'center', gap: 4, fontWeight: 500 }}>
                  <AlertTriangle size={12} /> Key Missing
                </span>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              <button
                type="button"
                className={`btn ${provider === 'gemini' ? 'btn-primary' : 'btn-secondary'}`}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  padding: '8px 12px',
                  textAlign: 'left',
                  height: 'auto',
                  borderRadius: 8,
                  border: provider === 'gemini' ? '2px solid var(--primary)' : '1px solid var(--border)',
                  cursor: 'pointer'
                }}
                onClick={() => setProvider('gemini')}
                id="ai-provider-gemini"
              >
                <div style={{ fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Sparkles size={13} /> Google Gemini
                </div>
                <div style={{ fontSize: 11, opacity: 0.8, marginTop: 2 }}>
                  gemini-2.0-flash
                </div>
              </button>

              <button
                type="button"
                className={`btn ${provider === 'deepseek' ? 'btn-primary' : 'btn-secondary'}`}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'flex-start',
                  padding: '8px 12px',
                  textAlign: 'left',
                  height: 'auto',
                  borderRadius: 8,
                  border: provider === 'deepseek' ? '2px solid var(--primary)' : '1px solid var(--border)',
                  cursor: 'pointer'
                }}
                onClick={() => setProvider('deepseek')}
                id="ai-provider-deepseek"
              >
                <div style={{ fontWeight: 600, fontSize: 13, display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Sparkles size={13} /> DeepSeek
                </div>
                <div style={{ fontSize: 11, opacity: 0.8, marginTop: 2 }}>
                  deepseek-chat
                </div>
              </button>
            </div>
            {!providerStatus[provider] && (
              <div style={{ fontSize: 11, color: 'var(--warning)', marginTop: 6, display: 'flex', alignItems: 'center', gap: 4 }}>
                <AlertTriangle size={12} />
                <span>
                  {provider === 'deepseek' ? 'DEEPSEEK_API_KEY' : 'GEMINI_API_KEY'} is not configured in <code>.env.local</code>.
                </span>
              </div>
            )}
          </div>

          {/* Module/Feature Select */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
            <div className="form-group">
              <label className="form-label">Module <span className="form-required">*</span></label>
              <select className="form-control" value={moduleId} onChange={e => { setModuleId(e.target.value); setFeatureId(''); }} id="ai-select-module">
                <option value="">-- Select Module --</option>
                {modules.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
            <div className="form-group">
              <label className="form-label">Feature <span className="form-required">*</span></label>
              <select className="form-control" value={featureId} onChange={e => setFeatureId(e.target.value)} disabled={!moduleId} id="ai-select-feature">
                <option value="">-- Select Feature --</option>
                {filteredFeatures.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
          </div>

          {/* Input Tabs */}
          <div className="tabs">
            <button className={`tab ${tab === 'paste' ? 'active' : ''}`} onClick={() => setTab('paste')}>
              Paste Text
            </button>
            <button className={`tab ${tab === 'file' ? 'active' : ''}`} onClick={() => setTab('file')}>
              Upload File
            </button>
          </div>

          {tab === 'paste' && (
            <div className="form-group">
              <textarea
                className="form-control"
                rows={12}
                placeholder="Paste requirement text here...&#10;&#10;Example:&#10;- User must be able to log in with email and password&#10;- Email must be in a valid format&#10;- Password must be at least 8 characters"
                value={requirementText}
                onChange={e => setRequirementText(e.target.value)}
                id="ai-requirement-text"
              />
              <div style={{ fontSize: 11, color: 'var(--foreground-muted)', textAlign: 'right' }}>
                {requirementText.length} characters
              </div>
            </div>
          )}

          {tab === 'file' && (
            <div>
              <div
                className={`file-drop-zone ${uploading ? 'dragging' : ''}`}
                onClick={() => fileRef.current?.click()}
                onDragOver={e => e.preventDefault()}
                onDrop={e => { e.preventDefault(); const f = e.dataTransfer.files[0]; if (f) handleFile(f); }}
              >
                {uploading ? (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                    <div className="spinner" />
                    <div>Processing file...</div>
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                    <Upload size={24} />
                    <div style={{ fontWeight: 500 }}>Click or drag file here</div>
                    <div style={{ fontSize: 12 }}>TXT, DOCX, PDF, XLSX, CSV, PNG, JPG</div>
                  </div>
                )}
              </div>
              <input
                ref={fileRef}
                type="file"
                style={{ display: 'none' }}
                accept=".txt,.docx,.pdf,.xlsx,.xls,.csv,.html,.png,.jpg,.jpeg,.webp"
                onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }}
                id="ai-file-input"
              />
              {extractedText && (
                <div style={{ marginTop: 12 }}>
                  <div style={{ fontSize: 12, color: 'var(--success)', marginBottom: 6 }}>✅ Text extracted successfully:</div>
                  <pre style={{ fontSize: 11, background: 'var(--surface-2)', padding: 12, borderRadius: 8, maxHeight: 200, overflow: 'auto', whiteSpace: 'pre-wrap', color: 'var(--foreground-muted)' }}>
                    {extractedText.slice(0, 500)}{extractedText.length > 500 ? '...' : ''}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* Test Case Language Selector */}
          <div className="form-group" style={{ marginTop: 14, marginBottom: 16 }}>
            <label className="form-label" style={{ marginBottom: 6, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Languages size={14} style={{ color: 'var(--primary)' }} />
              Test Case Language
            </label>
            <div
              id="ai-language-selector"
              role="radiogroup"
              aria-label="Test Case Language"
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: 6,
                background: 'var(--surface-2)',
                padding: '4px',
                borderRadius: '8px',
                border: '1px solid var(--border)',
              }}
            >
              <button
                type="button"
                role="radio"
                aria-checked={language === 'English'}
                onClick={() => setLanguage('English')}
                id="lang-option-en"
                style={{
                  padding: '7px 12px',
                  fontSize: '13px',
                  fontWeight: language === 'English' ? 600 : 500,
                  color: language === 'English' ? '#ffffff' : 'var(--foreground-muted)',
                  background: language === 'English' ? 'var(--primary)' : 'transparent',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  textAlign: 'center',
                  boxShadow: language === 'English' ? '0 1px 3px rgba(0,0,0,0.15)' : 'none',
                }}
              >
                English
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={language === 'Bahasa Indonesia'}
                onClick={() => setLanguage('Bahasa Indonesia')}
                id="lang-option-id"
                style={{
                  padding: '7px 12px',
                  fontSize: '13px',
                  fontWeight: language === 'Bahasa Indonesia' ? 600 : 500,
                  color: language === 'Bahasa Indonesia' ? '#ffffff' : 'var(--foreground-muted)',
                  background: language === 'Bahasa Indonesia' ? 'var(--primary)' : 'transparent',
                  border: 'none',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  textAlign: 'center',
                  boxShadow: language === 'Bahasa Indonesia' ? '0 1px 3px rgba(0,0,0,0.15)' : 'none',
                }}
              >
                Bahasa Indonesia
              </button>
            </div>
          </div>

          <button
            className="btn btn-primary"
            style={{ width: '100%', marginTop: 16, justifyContent: 'center' }}
            onClick={generate}
            disabled={generating || !moduleId || !featureId || !requirementText.trim()}
            id="btn-ai-generate"
          >
            {generating ? (
              <><span className="spinner" /> Generating with {provider === 'deepseek' ? 'DeepSeek' : 'Gemini'}...</>
            ) : (
              <><Sparkles size={14} /> Generate with {provider === 'deepseek' ? 'DeepSeek' : 'Gemini'}</>
            )}
          </button>
        </div>

        {/* Drafts Panel */}
        <div>
          {generating && (
            <div className="card">
              <LoadingSpinner />
              <div style={{ textAlign: 'center', color: 'var(--foreground-muted)', fontSize: 13, marginTop: 8 }}>
                AI is analyzing requirements and creating test case drafts...
              </div>
            </div>
          )}

          {!generating && drafts.length === 0 && (
            <EmptyState
              icon={<Sparkles size={28} />}
              title="No drafts yet"
              description="Select module & feature, enter requirements, then click Generate"
            />
          )}

          {drafts.length > 0 && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <div>
                  <span style={{ fontWeight: 600 }}>{drafts.length} draft{drafts.length === 1 ? '' : 's'}</span>
                  <span style={{ color: 'var(--foreground-muted)', fontSize: 13 }}> · {selectedCount} selected</span>
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="btn btn-sm btn-secondary" onClick={() => setDrafts(d => d.map(x => ({ ...x, selected: true })))}>
                    Select All
                  </button>
                  <button className="btn btn-sm btn-secondary" onClick={() => setDrafts(d => d.map(x => ({ ...x, selected: false })))}>
                    Deselect All
                  </button>
                  <button className="btn btn-primary" onClick={saveSelected} disabled={saving || selectedCount === 0} id="btn-save-drafts">
                    {saving ? <span className="spinner" /> : <Save size={13} />}
                    Save Selected ({selectedCount})
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {drafts.map((draft, idx) => (
                  <div key={idx} className="card card-sm" style={{
                    borderColor: draft.selected ? 'var(--primary)' : undefined,
                    opacity: draft.selected ? 1 : 0.6,
                  }}>
                    <div style={{ display: 'flex', gap: 10, marginBottom: 10 }}>
                      <input
                        type="checkbox"
                        checked={draft.selected}
                        onChange={e => updateDraft(idx, 'selected', e.target.checked)}
                        style={{ marginTop: 3, flexShrink: 0 }}
                      />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <input
                          className="form-control"
                          value={draft.title}
                          onChange={e => updateDraft(idx, 'title', e.target.value)}
                          style={{ fontWeight: 600, fontSize: 14, marginBottom: 6 }}
                        />
                        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                          <select className="form-control" style={{ width: 'auto', fontSize: 11, padding: '3px 8px' }}
                            value={draft.priority} onChange={e => updateDraft(idx, 'priority', e.target.value)}>
                            {PRIORITIES.map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                          </select>
                          <select className="form-control" style={{ width: 'auto', fontSize: 11, padding: '3px 8px' }}
                            value={draft.test_type} onChange={e => updateDraft(idx, 'test_type', e.target.value)}>
                            {TEST_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                          </select>
                          {draft.isDuplicate && (
                            <span className="badge badge-fail" style={{ fontSize: 10 }}>⚠️ Potential Duplicate</span>
                          )}
                        </div>
                      </div>
                      <button className="btn btn-ghost btn-icon btn-sm" onClick={() => removeDraft(idx)}>
                        <Trash2 size={13} />
                      </button>
                    </div>
                    <div style={{ display: 'grid', gap: 8, paddingLeft: 28 }}>
                      <DraftField label="Preconditions" value={draft.preconditions} onChange={v => updateDraft(idx, 'preconditions', v)} />
                      <DraftField label="Test Steps" value={draft.test_steps} onChange={v => updateDraft(idx, 'test_steps', v)} rows={3} />
                      <DraftField label="Test Data" value={draft.test_data} onChange={v => updateDraft(idx, 'test_data', v)} />
                      <DraftField label="Expected Result" value={draft.expected_result} onChange={v => updateDraft(idx, 'expected_result', v)} />
                      {draft.notes && <DraftField label="AI Notes" value={draft.notes} onChange={v => updateDraft(idx, 'notes', v)} />}
                    </div>
                  </div>
                ))}
              </div>

              <div style={{ marginTop: 16, display: 'flex', justifyContent: 'flex-end' }}>
                <button className="btn btn-primary" onClick={saveSelected} disabled={saving || selectedCount === 0}>
                  {saving ? <span className="spinner" /> : <Save size={14} />}
                  Save {selectedCount} Selected Test Case{selectedCount === 1 ? '' : 's'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </AppShell>
  );
}

function DraftField({ label, value, onChange, rows = 2 }: { label: string; value: string; onChange: (v: string) => void; rows?: number }) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 600, color: 'var(--foreground-dim)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 3 }}>
        {label}
      </div>
      <textarea
        className="form-control"
        value={value || ''}
        onChange={e => onChange(e.target.value)}
        rows={rows}
        style={{ fontSize: 12 }}
      />
    </div>
  );
}
