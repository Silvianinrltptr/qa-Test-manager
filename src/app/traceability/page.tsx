'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { ResultBadge, PriorityBadge, LoadingSpinner, EmptyState, ProgressBar } from '@/components/ui/Shared';
import { Network, CheckCircle2, AlertTriangle, XCircle, Search, Layers, Sparkles, ExternalLink, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import type { Module, TestResult, Priority, TestType } from '@/lib/types';

interface TraceabilityExecution {
  id: number;
  test_case_id: number;
  exec_date: string;
  environment: string | null;
  result: TestResult;
  defect_ref: string | null;
}

interface TraceabilityTestCase {
  id: number;
  case_id: string;
  title: string;
  test_type: TestType;
  priority: Priority;
  latest_result: TestResult;
  executions?: TraceabilityExecution[];
  hasExecutions?: boolean;
}

interface TraceabilityRequirement {
  id: number;
  ref_id: string;
  title: string;
  description: string | null;
  change_type: string;
  status: string;
  version: number;
  testCases: TraceabilityTestCase[];
  isCovered: boolean;
}

interface TraceabilityFeature {
  id: number;
  name: string;
  requirements: TraceabilityRequirement[];
  unlinkedCases?: TraceabilityTestCase[];
}

interface TraceabilityModule {
  id: number;
  name: string;
  prefix: string;
  features: TraceabilityFeature[];
}

interface TraceabilityStats {
  totalRequirements: number;
  coveredRequirements: number;
  uncoveredRequirements: number;
  reqCoveragePct: number;
  totalTestCases: number;
  casesWithRequirement: number;
  casesWithoutRequirement: number;
  casesExecuted: number;
  executionCoveragePct: number;
}

export default function TraceabilityPage() {
  const [matrix, setMatrix] = useState<TraceabilityModule[]>([]);
  const [stats, setStats] = useState<TraceabilityStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [modules, setModules] = useState<Module[]>([]);
  const [selectedModule, setSelectedModule] = useState('');
  const [filterCoverage, setFilterCoverage] = useState<'all' | 'uncovered' | 'covered'>('all');

  const fetchTraceability = async () => {
    try {
      const params = new URLSearchParams({
        ...(selectedModule && { moduleId: selectedModule }),
      });
      const res = await fetch(`/api/traceability?${params}`);
      if (res.ok) {
        const data = await res.json();
        setMatrix(data.matrix || []);
        setStats(data.stats || null);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetch('/api/modules').then(r => r.json()).then(setModules);
  }, []);

  useEffect(() => {
    fetchTraceability();
  }, [selectedModule]);

  return (
    <AppShell>
      <header className="page-header main-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Network size={20} style={{ color: 'var(--primary)' }} />
            Traceability Matrix
          </h1>
          <p className="page-subtitle">
            End-to-end trace: Module → Feature → Requirement → Test Case → Execution History
          </p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button className="btn btn-secondary" onClick={fetchTraceability}>
            <RefreshCw size={14} /> Refresh
          </button>
          <ThemeToggle />
        </div>
      </header>

      {/* Coverage Statistics */}
      {stats && (
        <div className="grid-3" style={{ marginBottom: 24 }}>
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span className="metric-label">Requirement Coverage</span>
              <span style={{ fontWeight: 700, color: 'var(--primary)' }}>{stats.reqCoveragePct}%</span>
            </div>
            <ProgressBar value={stats.coveredRequirements} max={stats.totalRequirements} color="primary" />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--foreground-muted)', marginTop: 8 }}>
              <span>{stats.coveredRequirements} covered</span>
              <span style={{ color: stats.uncoveredRequirements > 0 ? 'var(--warning)' : 'inherit' }}>
                {stats.uncoveredRequirements} without test cases
              </span>
            </div>
          </div>

          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span className="metric-label">Test Case to Requirement Linkage</span>
              <span style={{ fontWeight: 700, color: 'var(--accent)' }}>
                {stats.totalTestCases > 0 ? Math.round((stats.casesWithRequirement / stats.totalTestCases) * 100) : 0}%
              </span>
            </div>
            <ProgressBar value={stats.casesWithRequirement} max={stats.totalTestCases} color="primary" />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--foreground-muted)', marginTop: 8 }}>
              <span>{stats.casesWithRequirement} linked to REQ</span>
              <span>{stats.casesWithoutRequirement} without REQ ref</span>
            </div>
          </div>

          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
              <span className="metric-label">Execution Coverage</span>
              <span style={{ fontWeight: 700, color: 'var(--success)' }}>{stats.executionCoveragePct}%</span>
            </div>
            <ProgressBar value={stats.casesExecuted} max={stats.totalTestCases} color="success" />
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: 'var(--foreground-muted)', marginTop: 8 }}>
              <span>{stats.casesExecuted} executed</span>
              <span>{stats.totalTestCases - stats.casesExecuted} unexecuted</span>
            </div>
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="card card-sm" style={{ marginBottom: 20 }}>
        <div className="filters-bar">
          <select
            className="form-control"
            style={{ width: 200 }}
            value={selectedModule}
            onChange={e => setSelectedModule(e.target.value)}
          >
            <option value="">All Modules</option>
            {modules.map(m => (
              <option key={m.id} value={m.id}>{m.name}</option>
            ))}
          </select>

          <select
            className="form-control"
            style={{ width: 200 }}
            value={filterCoverage}
            onChange={e => setFilterCoverage(e.target.value as 'all' | 'uncovered' | 'covered')}
          >
            <option value="all">All Requirements</option>
            <option value="uncovered">Uncovered Only (0 Cases)</option>
            <option value="covered">Covered Only (&gt;0 Cases)</option>
          </select>
        </div>
      </div>

      {/* Matrix Tree Content */}
      {loading ? (
        <LoadingSpinner size="lg" />
      ) : matrix.length === 0 ? (
        <EmptyState
          icon={<Network size={32} />}
          title="No traceability data yet"
          description="Add modules, features, requirements, and test cases to view traceability links."
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {matrix.map(mod => (
            <div key={mod.id} className="card" style={{ padding: 0, overflow: 'hidden' }}>
              {/* Module Header */}
              <div style={{
                padding: '16px 20px',
                background: 'var(--surface-2)',
                borderBottom: '1px solid var(--border)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span className="badge badge-primary">{mod.prefix}</span>
                  <span style={{ fontSize: 16, fontWeight: 700 }}>{mod.name}</span>
                </div>
                <div style={{ fontSize: 12, color: 'var(--foreground-muted)' }}>
                  {mod.features?.length || 0} {mod.features?.length === 1 ? 'Feature' : 'Features'}
                </div>
              </div>

              {/* Features in Module */}
              <div style={{ padding: '16px 20px' }}>
                {mod.features?.length === 0 ? (
                  <div style={{ fontSize: 13, color: 'var(--foreground-muted)', fontStyle: 'italic', padding: 8 }}>
                    No features in this module yet.
                  </div>
                ) : (
                  mod.features.map(feat => {
                    const reqList = (feat.requirements || []).filter(r => {
                      if (filterCoverage === 'uncovered') return !r.isCovered;
                      if (filterCoverage === 'covered') return r.isCovered;
                      return true;
                    });

                    return (
                      <div key={feat.id} style={{ marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--foreground)', marginBottom: 12 }}>
                          📁 Feature: {feat.name}
                        </div>

                        {reqList.length === 0 && feat.unlinkedCases?.length === 0 ? (
                          <div style={{ fontSize: 12, color: 'var(--foreground-muted)', fontStyle: 'italic', paddingLeft: 12 }}>
                            No requirements or test cases match this filter.
                          </div>
                        ) : (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                            {/* Requirements in feature */}
                            {reqList.map(req => (
                              <div key={req.id} style={{
                                background: 'var(--surface-2)',
                                borderRadius: 8,
                                padding: 14,
                                borderLeft: `3px solid ${req.isCovered ? 'var(--success)' : 'var(--warning)'}`
                              }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                                  <div>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                      <code style={{ fontSize: 12, fontWeight: 700, color: 'var(--primary)' }}>
                                        {req.ref_id}
                                      </code>
                                      <span className="badge" style={{ background: 'var(--surface-3)', fontSize: 11 }}>
                                        v{req.version}
                                      </span>
                                      <span style={{ fontSize: 13, fontWeight: 600 }}>{req.title}</span>
                                    </div>
                                    {req.description && (
                                      <div style={{ fontSize: 12, color: 'var(--foreground-muted)', marginTop: 4 }}>
                                        {req.description}
                                      </div>
                                    )}
                                  </div>

                                  <div>
                                    {req.isCovered ? (
                                      <span className="badge badge-success" style={{ fontSize: 11 }}>
                                        ✓ {req.testCases?.length} Case{req.testCases?.length === 1 ? '' : 's'} Linked
                                      </span>
                                    ) : (
                                      <Link
                                        href={`/ai-generator?moduleId=${mod.id}&featureId=${feat.id}`}
                                        className="btn btn-sm btn-primary"
                                        style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                                      >
                                        <Sparkles size={11} /> Generate Test Case
                                      </Link>
                                    )}
                                  </div>
                                </div>

                                {/* Linked Test Cases Table */}
                                {req.testCases && req.testCases.length > 0 && (
                                  <div className="table-container" style={{ marginTop: 10, background: 'var(--surface)' }}>
                                    <table>
                                      <thead>
                                        <tr>
                                          <th style={{ width: 110 }}>Test Case ID</th>
                                          <th>Test Case Title</th>
                                          <th style={{ width: 90 }}>Type</th>
                                          <th style={{ width: 90 }}>Priority</th>
                                          <th style={{ width: 110 }}>Latest Result</th>
                                          <th>Latest Execution</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {req.testCases.map(tc => (
                                          <tr key={tc.id}>
                                            <td><code style={{ fontSize: 12 }}>{tc.case_id}</code></td>
                                            <td>
                                              <Link href={`/test-cases?search=${encodeURIComponent(tc.case_id)}`}
                                                    style={{ color: 'var(--foreground)', textDecoration: 'none', fontWeight: 500 }}>
                                                {tc.title}
                                              </Link>
                                            </td>
                                            <td><span className="badge" style={{ background: 'var(--surface-3)' }}>{tc.test_type}</span></td>
                                            <td><PriorityBadge priority={tc.priority} /></td>
                                            <td><ResultBadge result={tc.latest_result} /></td>
                                            <td>
                                              {tc.executions && tc.executions.length > 0 ? (
                                                <div style={{ fontSize: 11, color: 'var(--foreground-muted)' }}>
                                                  {new Date(tc.executions[0].exec_date).toLocaleDateString('en-US')}
                                                  {tc.executions[0].environment && ` (${tc.executions[0].environment})`}
                                                  {tc.executions[0].defect_ref && (
                                                    <span style={{ color: 'var(--error)', marginLeft: 6, fontWeight: 600 }}>
                                                      Defect: {tc.executions[0].defect_ref}
                                                    </span>
                                                  )}
                                                </div>
                                              ) : (
                                                <span style={{ fontSize: 11, color: 'var(--foreground-dim)' }}>Not executed yet</span>
                                              )}
                                            </td>
                                          </tr>
                                        ))}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            ))}

                            {/* Unlinked test cases in this feature */}
                            {filterCoverage !== 'uncovered' && feat.unlinkedCases && feat.unlinkedCases.length > 0 && (
                              <div style={{ padding: '10px 14px', background: 'rgba(255,255,255,0.02)', borderRadius: 8 }}>
                                <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground-muted)', marginBottom: 8 }}>
                                  Test cases without specific requirement link:
                                </div>
                                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                                  {feat.unlinkedCases.map(tc => (
                                    <Link
                                      key={tc.id}
                                      href={`/test-cases?search=${encodeURIComponent(tc.case_id)}`}
                                      className="badge badge-muted"
                                      style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 6 }}
                                    >
                                      <code>{tc.case_id}</code>
                                      <span>{tc.title.slice(0, 30)}...</span>
                                      <ResultBadge result={tc.latest_result} />
                                    </Link>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </AppShell>
  );
}
