'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { LoadingSpinner } from '@/components/ui/Shared';
import { useToast } from '@/components/ui/Toast';
import {
  Settings, Database, Sparkles, Key, CheckCircle2,
  AlertTriangle, HardDrive, Download, RefreshCw, Layers
} from 'lucide-react';

interface SettingsData {
  ai: {
    configured: boolean;
    model: string;
    keyMasked: string | null;
  };
  database: {
    path: string;
    sizeBytes: number;
    sizeKb: number;
    counts: {
      modules: number;
      features: number;
      requirements: number;
      testCases: number;
      executions: number;
      activities: number;
    };
  };
}

export default function SettingsPage() {
  const toast = useToast();
  const [data, setData] = useState<SettingsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [seeding, setSeeding] = useState(false);

  const fetchSettings = async () => {
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
        toast.success(resData.message || 'Sample data seeded successfully!');
        fetchSettings();
      } else {
        toast.error(resData.message || 'Failed to seed sample data');
      }
    } catch {
      toast.error('An error occurred during processing');
    } finally {
      setSeeding(false);
    }
  };

  return (
    <AppShell>
      <header className="page-header main-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Settings size={20} style={{ color: 'var(--primary)' }} />
            Settings & System Configuration
          </h1>
          <p className="page-subtitle">
            AI integration status, local SQLite database storage, and data maintenance
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="btn btn-secondary" onClick={fetchSettings}>
            <RefreshCw size={14} /> Refresh Status
          </button>
          <ThemeToggle />
        </div>
      </header>

      {loading ? (
        <LoadingSpinner size="lg" />
      ) : !data ? (
        <div className="card">Failed to load system status</div>
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
                  <h3 style={{ fontSize: 16, fontWeight: 700 }}>Google Gemini AI Integration</h3>
                  <p style={{ fontSize: 12, color: 'var(--foreground-muted)' }}>
                    Used for automated test case generation and OCR extraction from requirement documents
                  </p>
                </div>
              </div>

              <div>
                {data.ai.configured ? (
                  <span className="badge badge-success" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '6px 12px' }}>
                    <CheckCircle2 size={14} /> Connected (Active)
                  </span>
                ) : (
                  <span className="badge badge-warning" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '6px 12px' }}>
                    <AlertTriangle size={14} /> Not Configured
                  </span>
                )}
              </div>
            </div>

            {data.ai.configured ? (
              <div style={{ background: 'var(--surface-2)', padding: 14, borderRadius: 8, fontSize: 13 }}>
                <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                  <div>
                    <span style={{ color: 'var(--foreground-muted)' }}>AI Model: </span>
                    <strong style={{ color: 'var(--primary-light)' }}>{data.ai.model}</strong>
                  </div>
                  <div>
                    <span style={{ color: 'var(--foreground-muted)' }}>API Key: </span>
                    <code>{data.ai.keyMasked}</code>
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: 8, padding: 16 }}>
                <div style={{ fontWeight: 600, color: 'var(--warning)', marginBottom: 8, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <AlertTriangle size={16} /> GEMINI_API_KEY Configuration Instructions:
                </div>
                <ol style={{ fontSize: 13, color: 'var(--foreground)', lineHeight: 1.8, paddingLeft: 20 }}>
                  <li>
                    Get a free API Key at{' '}
                    <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', textDecoration: 'underline' }}>
                      Google AI Studio (aistudio.google.com)
                    </a>.
                  </li>
                  <li>
                    Open the <code>.env.local</code> file in this project&apos;s root folder (or create one if it does not exist).
                  </li>
                  <li>
                    Add the following line to the file:
                    <div style={{ background: 'var(--surface)', padding: '6px 12px', borderRadius: 4, marginTop: 4, fontFamily: 'monospace' }}>
                      GEMINI_API_KEY=your_gemini_api_key_here
                    </div>
                  </li>
                  <li>
                    Save the file and restart the development server. The AI Generator feature will activate automatically!
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
                <h3 style={{ fontSize: 16, fontWeight: 700 }}>Persistent SQLite Database Storage</h3>
                <p style={{ fontSize: 12, color: 'var(--foreground-muted)' }}>
                  Data is permanently stored on local device storage (Write-Ahead Logging / WAL enabled)
                </p>
              </div>
            </div>

            <div className="grid-2" style={{ marginBottom: 20 }}>
              <div style={{ background: 'var(--surface-2)', padding: 14, borderRadius: 8 }}>
                <div style={{ fontSize: 12, color: 'var(--foreground-muted)', marginBottom: 4 }}>Database File Location</div>
                <code style={{ fontSize: 12, wordBreak: 'break-all', color: 'var(--foreground)' }}>{data.database.path}</code>
              </div>
              <div style={{ background: 'var(--surface-2)', padding: 14, borderRadius: 8 }}>
                <div style={{ fontSize: 12, color: 'var(--foreground-muted)', marginBottom: 4 }}>Current Database Size</div>
                <div style={{ fontSize: 16, fontWeight: 700, color: 'var(--success)' }}>{data.database.sizeKb} KB</div>
              </div>
            </div>

            {/* Counts */}
            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10 }}>Stored Record Counts:</div>
            <div className="grid-3" style={{ marginBottom: 20 }}>
              {[
                { label: 'Registered Modules', count: data.database.counts.modules },
                { label: 'Features', count: data.database.counts.features },
                { label: 'Requirements / PRD', count: data.database.counts.requirements },
                { label: 'Test Cases', count: data.database.counts.testCases },
                { label: 'Execution History', count: data.database.counts.executions },
                { label: 'Activity & Audit Logs', count: data.database.counts.activities },
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
                  <div style={{ fontWeight: 600, fontSize: 13 }}>Database Still Empty?</div>
                  <div style={{ fontSize: 12, color: 'var(--foreground-muted)' }}>
                    Click this button to load realistic sample data (Authentication & Transactions modules, PRD requirements, test cases, and execution history).
                  </div>
                </div>
                <button className="btn btn-primary" onClick={handleSeedData} disabled={seeding}>
                  {seeding ? <span className="spinner" /> : <Layers size={14} />}
                  Seed Sample Data
                </button>
              </div>
            )}
          </div>

          {/* Export Assets Section */}
          <div className="card">
            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12 }}>Data Export & Backup</h3>
            <p style={{ fontSize: 13, color: 'var(--foreground-muted)', marginBottom: 16 }}>
              Download test cases or audit logs as CSV files for external reporting or backups.
            </p>
            <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
              <a href="/api/export?type=test-cases" className="btn btn-secondary" download>
                <Download size={14} /> Export All Test Cases (.CSV)
              </a>
              <a href="/api/export?type=executions" className="btn btn-secondary" download>
                <Download size={14} /> Export Execution History (.CSV)
              </a>
              <a href="/api/export?type=change-log" className="btn btn-secondary" download>
                <Download size={14} /> Export Change Log (.CSV)
              </a>
              <a href="/api/export?type=template" className="btn btn-secondary" download>
                <Download size={14} /> Download Import CSV Template
              </a>
            </div>
          </div>
        </div>
      )}
    </AppShell>
  );
}
