'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { LanguageSwitcher } from '@/components/ui/LanguageSwitcher';
import { LoadingSpinner } from '@/components/ui/Shared';
import { useToast } from '@/components/ui/Toast';
import { useI18n } from '@/lib/i18n/context';
import {
  Settings, Database, Sparkles, Key, CheckCircle2,
  AlertTriangle, HardDrive, Download, RefreshCw, Layers, Globe
} from 'lucide-react';

interface SettingsData {
  ai: {
    configured: boolean;
    model: string;
    keyMasked: string | null;
    gemini?: {
      configured: boolean;
      model: string;
      keyMasked: string | null;
    };
    deepseek?: {
      configured: boolean;
      model: string;
      keyMasked: string | null;
    };
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
  const { t, locale, setLanguage } = useI18n();
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
            {t('settings.title', 'Settings & System Configuration')}
          </h1>
          <p className="page-subtitle">
            {t('settings.subtitle', 'Configure AI providers, database connections, and workspace options')}
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="btn btn-secondary" onClick={fetchSettings}>
            <RefreshCw size={14} /> {t('common.refresh', 'Refresh')}
          </button>
          <LanguageSwitcher />
          <ThemeToggle />
        </div>
      </header>

      {loading ? (
        <LoadingSpinner size="lg" />
      ) : !data ? (
        <div className="card">{t('common.noData', 'Failed to load system status')}</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
          {/* Language Preference Section */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 8,
                background: 'rgba(79,124,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--primary)'
              }}>
                <Globe size={20} />
              </div>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700 }}>{t('settings.languagePreference', 'Language Preference')}</h3>
                <p style={{ fontSize: 12, color: 'var(--foreground-muted)' }}>
                  {t('settings.languageDesc', 'Choose your default workspace interface language (English or Bahasa Indonesia)')}
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 16, background: 'var(--surface-2)', padding: '16px 20px', borderRadius: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>{t('settings.languagePreference', 'Interface Language')}:</div>
              <LanguageSwitcher />
              <div style={{ fontSize: 12, color: 'var(--foreground-muted)' }}>
                {locale === 'en' ? 'Currently using English (US)' : 'Saat ini menggunakan Bahasa Indonesia'}
              </div>
            </div>
          </div>

          {/* AI Configuration Section */}
          <div className="card">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 20 }}>
              <div style={{
                width: 36, height: 36, borderRadius: 8,
                background: 'rgba(79,124,255,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'var(--primary)'
              }}>
                <Sparkles size={20} />
              </div>
              <div>
                <h3 style={{ fontSize: 16, fontWeight: 700 }}>AI Engines & Model Configuration</h3>
                <p style={{ fontSize: 12, color: 'var(--foreground-muted)' }}>
                  Support for Google Gemini and DeepSeek for automated test case generation and document extraction
                </p>
              </div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Google Gemini Card */}
              <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
                      Google Gemini AI
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--foreground-muted)', marginTop: 2 }}>
                      Recommended for test cases and multimodal document parsing (Model: <code>gemini-2.0-flash</code>)
                    </div>
                  </div>
                  <div>
                    {(data.ai.gemini?.configured ?? data.ai.configured) ? (
                      <span className="badge badge-success" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '5px 10px' }}>
                        <CheckCircle2 size={13} /> Connected (Active)
                      </span>
                    ) : (
                      <span className="badge badge-warning" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '5px 10px' }}>
                        <AlertTriangle size={13} /> Not Configured
                      </span>
                    )}
                  </div>
                </div>

                {(data.ai.gemini?.configured ?? data.ai.configured) ? (
                  <div style={{ background: 'var(--surface)', padding: 12, borderRadius: 6, fontSize: 13, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                    <div>
                      <span style={{ color: 'var(--foreground-muted)' }}>Model: </span>
                      <strong style={{ color: 'var(--primary-light)' }}>{data.ai.gemini?.model || 'gemini-2.0-flash'}</strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--foreground-muted)' }}>API Key: </span>
                      <code>{data.ai.gemini?.keyMasked || data.ai.keyMasked}</code>
                    </div>
                  </div>
                ) : (
                  <div style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: 6, padding: 12, fontSize: 12 }}>
                    <div style={{ fontWeight: 600, color: 'var(--warning)', marginBottom: 6 }}>
                      Setup Instructions for GEMINI_API_KEY:
                    </div>
                    <ol style={{ paddingLeft: 18, lineHeight: 1.6, margin: 0 }}>
                      <li>Get a key from <a href="https://aistudio.google.com/apikey" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', textDecoration: 'underline' }}>Google AI Studio</a>.</li>
                      <li>Add <code>GEMINI_API_KEY=your_key_here</code> to <code>.env.local</code>.</li>
                      <li>Restart the server.</li>
                    </ol>
                  </div>
                )}
              </div>

              {/* DeepSeek Card */}
              <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: 18 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15, display: 'flex', alignItems: 'center', gap: 8 }}>
                      DeepSeek AI
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--foreground-muted)', marginTop: 2 }}>
                      High quality reasoning and code generation (Model: <code>deepseek-chat</code>)
                    </div>
                  </div>
                  <div>
                    {data.ai.deepseek?.configured ? (
                      <span className="badge badge-success" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '5px 10px' }}>
                        <CheckCircle2 size={13} /> Connected (Active)
                      </span>
                    ) : (
                      <span className="badge badge-warning" style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, padding: '5px 10px' }}>
                        <AlertTriangle size={13} /> Not Configured
                      </span>
                    )}
                  </div>
                </div>

                {data.ai.deepseek?.configured ? (
                  <div style={{ background: 'var(--surface)', padding: 12, borderRadius: 6, fontSize: 13, display: 'flex', gap: 20, flexWrap: 'wrap' }}>
                    <div>
                      <span style={{ color: 'var(--foreground-muted)' }}>Model: </span>
                      <strong style={{ color: 'var(--primary-light)' }}>{data.ai.deepseek.model}</strong>
                    </div>
                    <div>
                      <span style={{ color: 'var(--foreground-muted)' }}>API Key: </span>
                      <code>{data.ai.deepseek.keyMasked}</code>
                    </div>
                  </div>
                ) : (
                  <div style={{ background: 'rgba(251,191,36,0.08)', border: '1px solid rgba(251,191,36,0.25)', borderRadius: 6, padding: 12, fontSize: 12 }}>
                    <div style={{ fontWeight: 600, color: 'var(--warning)', marginBottom: 6 }}>
                      Setup Instructions for DEEPSEEK_API_KEY:
                    </div>
                    <ol style={{ paddingLeft: 18, lineHeight: 1.6, margin: 0 }}>
                      <li>Get an API key from <a href="https://platform.deepseek.com/api_keys" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--primary)', textDecoration: 'underline' }}>DeepSeek Platform</a>.</li>
                      <li>Add <code>DEEPSEEK_API_KEY=your_key_here</code> to <code>.env.local</code>.</li>
                      <li>Restart the server.</li>
                    </ol>
                  </div>
                )}
              </div>
            </div>
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
