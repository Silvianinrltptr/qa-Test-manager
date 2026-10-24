'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { Modal } from '@/components/ui/Modal';
import { PriorityBadge, ResultBadge, PrepBadge, LoadingSpinner, EmptyState, ProgressBar } from '@/components/ui/Shared';
import { useToast } from '@/components/ui/Toast';
import {
  Search,
  Filter,
  MessageSquare,
  Send,
  BarChart3,
  ClipboardList,
  LogOut,
  TrendingUp,
  RefreshCw,
} from 'lucide-react';
import type { TestCase, Module, TestCaseComment, DashboardMetrics } from '@/lib/types';

interface DetailRowProps {
  label: string;
  value: React.ReactNode;
  pre?: boolean;
}

function DetailRow({ label, value, pre }: DetailRowProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--foreground-muted)' }}>{label}</div>
      <div
        style={{
          background: 'var(--surface-2)',
          padding: '8px 12px',
          borderRadius: 6,
          fontSize: 13,
          color: 'var(--foreground)',
          whiteSpace: pre ? 'pre-wrap' : 'normal',
          minHeight: 34,
        }}
      >
        {value || <span style={{ color: 'var(--foreground-dim)' }}>—</span>}
      </div>
    </div>
  );
}

export default function ProjectViewerPage() {
  const router = useRouter();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState<'cases' | 'health'>('cases');
  const [testCases, setTestCases] = useState<TestCase[]>([]);
  const [modules, setModules] = useState<Module[]>([]);
  const [dashboardMetrics, setDashboardMetrics] = useState<DashboardMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  // Filters
  const [search, setSearch] = useState('');
  const [selectedModule, setSelectedModule] = useState('');
  const [selectedPriority, setSelectedPriority] = useState('');
  const [selectedResult, setSelectedResult] = useState('');

  // View modal state
  const [viewCase, setViewCase] = useState<TestCase | null>(null);
  const [caseComments, setCaseComments] = useState<TestCaseComment[]>([]);
  const [loadingComments, setLoadingComments] = useState(false);

  // New comment form
  const [authorName, setAuthorName] = useState('');
  const [authorRole, setAuthorRole] = useState<'pm' | 'developer'>('pm');
  const [commentContent, setCommentContent] = useState('');
  const [submittingComment, setSubmittingComment] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const [casesRes, modulesRes, dashRes] = await Promise.all([
        fetch('/api/test-cases?limit=200'),
        fetch('/api/modules'),
        fetch('/api/dashboard'),
      ]);
      if (casesRes.ok) {
        const casesData = await casesRes.json();
        if (casesData?.data) setTestCases(casesData.data as TestCase[]);
      }
      if (modulesRes.ok) {
        const modulesData = await modulesRes.json();
        if (modulesData) setModules(modulesData as Module[]);
      }
      if (dashRes.ok) {
        const dashData = await dashRes.json();
        if (dashData) setDashboardMetrics(dashData as DashboardMetrics);
      }
      toast.success('Dashboard data refreshed');
    } catch {
      toast.error('Failed to refresh data');
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    let ignore = false;
    Promise.all([
      fetch('/api/test-cases?limit=200').then(r => (r.ok ? r.json() : null)),
      fetch('/api/modules').then(r => (r.ok ? r.json() : null)),
      fetch('/api/dashboard').then(r => (r.ok ? r.json() : null)),
    ])
      .then(([casesData, modulesData, dashData]) => {
        if (!ignore) {
          if (casesData && casesData.data) {
            setTestCases(casesData.data as TestCase[]);
          }
          if (modulesData) {
            setModules(modulesData as Module[]);
          }
          if (dashData) {
            setDashboardMetrics(dashData as DashboardMetrics);
          }
          setLoading(false);
        }
      })
      .catch(err => {
        console.error(err);
        if (!ignore) setLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, [reloadKey]);

  // Fetch comments when viewing a case
  const fetchComments = async (caseId: number) => {
    setLoadingComments(true);
    try {
      const res = await fetch(`/api/comments?testCaseId=${caseId}`);
      if (res.ok) {
        const comments = await res.json() as TestCaseComment[];
        setCaseComments(comments || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingComments(false);
    }
  };

  const handleOpenCaseDetail = (tc: TestCase) => {
    setViewCase(tc);
    fetchComments(tc.id);
  };

  const handlePostComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!viewCase) return;
    if (!authorName.trim()) {
      toast.warning('Please enter your name');
      return;
    }
    if (!commentContent.trim()) {
      toast.warning('Please enter your comment or feedback');
      return;
    }

    setSubmittingComment(true);
    try {
      const res = await fetch('/api/comments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          test_case_id: viewCase.id,
          author_name: authorName.trim(),
          author_role: authorRole,
          content: commentContent.trim(),
        }),
      });

      if (!res.ok) throw new Error('Failed to post comment');
      toast.success('Feedback submitted to QA team successfully');
      setCommentContent('');
      fetchComments(viewCase.id);
      setReloadKey(k => k + 1);
    } catch {
      toast.error('Failed to submit comment');
    } finally {
      setSubmittingComment(false);
    }
  };

  // Filter test cases
  const filteredCases = testCases.filter(tc => {
    if (selectedModule && tc.module_id !== Number(selectedModule)) return false;
    if (selectedPriority && tc.priority !== selectedPriority) return false;
    if (selectedResult && tc.latest_result !== selectedResult) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      const matchId = tc.case_id.toLowerCase().includes(q);
      const matchTitle = tc.title.toLowerCase().includes(q);
      const matchReq = tc.requirement_ref?.toLowerCase().includes(q);
      if (!matchId && !matchTitle && !matchReq) return false;
    }
    return true;
  });

  // Calculate health stats
  const totalCases = testCases.length;
  const passCases = testCases.filter(c => c.latest_result === 'pass').length;
  const failCases = testCases.filter(c => c.latest_result === 'fail').length;
  const blockedCases = testCases.filter(c => c.latest_result === 'blocked').length;
  const notRunCases = testCases.filter(c => c.latest_result === 'not_run').length;
  const passRate = totalCases > 0 ? Math.round((passCases / totalCases) * 100) : 0;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--background)', display: 'flex', flexDirection: 'column' }}>
      {/* Top Banner / Navigation for Project Viewer */}
      {/* Top Banner / Navigation for Project Viewer */}
      <header
        style={{
          background: 'var(--surface)',
          borderBottom: '1px solid var(--border)',
          padding: '0 32px',
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 16, color: 'var(--foreground)' }}>
                QA Studio · Project Viewer
              </div>
              <div style={{ fontSize: 11, color: 'var(--foreground-muted)' }}>
                Collaborator Portal (PM & Developer View)
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <ThemeToggle />
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={async () => {
              try {
                await fetch('/api/auth/logout', { method: 'POST' });
              } catch {
                // ignore
              }
              router.push('/');
              router.refresh();
            }}
            style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--foreground-muted)' }}
          >
            <LogOut size={13} />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      {/* Main Container */}
      <main style={{ padding: '28px 32px', maxWidth: 1280, margin: '0 auto', width: '100%', flex: 1 }}>
        {/* Navigation Tabs */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, borderBottom: '1px solid var(--border)', paddingBottom: 12 }}>
          <div style={{ display: 'flex', gap: 10 }}>
            <button
              className={`btn btn-sm ${activeTab === 'cases' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setActiveTab('cases')}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <ClipboardList size={15} />
              <span>Test Cases ({totalCases})</span>
            </button>
            <button
              className={`btn btn-sm ${activeTab === 'health' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setActiveTab('health')}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
            >
              <BarChart3 size={15} />
              <span>Execution & Health Summary</span>
            </button>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{ fontSize: 12, color: 'var(--foreground-muted)' }}>
              Viewing as Collaborator · Safe read-only mode active
            </div>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleRefresh}
              disabled={refreshing}
              style={{ display: 'flex', alignItems: 'center', gap: 6 }}
              title="Refresh dashboard data"
              id="btn-refresh-dashboard"
            >
              <RefreshCw size={14} style={{ animation: refreshing ? 'spin 0.7s linear infinite' : undefined }} />
              <span>Refresh</span>
            </button>
          </div>
        </div>

        {/* Tab 1: Test Cases List */}
        {activeTab === 'cases' && (
          <div>
            {/* Filters Bar */}
            <div className="card" style={{ padding: '16px 20px', marginBottom: 20 }}>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                <div style={{ position: 'relative', flex: 1, minWidth: 220 }}>
                  <Search size={14} style={{ position: 'absolute', left: 10, top: 11, color: 'var(--foreground-muted)' }} />
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Search test cases by ID, title, requirement..."
                    style={{ paddingLeft: 30, height: 36, fontSize: 13 }}
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                  />
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Filter size={14} style={{ color: 'var(--foreground-muted)' }} />
                  <select
                    className="form-control"
                    style={{ width: 170, height: 36, fontSize: 13 }}
                    value={selectedModule}
                    onChange={e => setSelectedModule(e.target.value)}
                  >
                    <option value="">All Modules</option>
                    {modules.map(m => (
                      <option key={m.id} value={m.id}>{m.name}</option>
                    ))}
                  </select>
                </div>

                <select
                  className="form-control"
                  style={{ width: 140, height: 36, fontSize: 13 }}
                  value={selectedPriority}
                  onChange={e => setSelectedPriority(e.target.value)}
                >
                  <option value="">All Priorities</option>
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>

                <select
                  className="form-control"
                  style={{ width: 140, height: 36, fontSize: 13 }}
                  value={selectedResult}
                  onChange={e => setSelectedResult(e.target.value)}
                >
                  <option value="">All Results</option>
                  <option value="pass">Pass</option>
                  <option value="fail">Fail</option>
                  <option value="blocked">Blocked</option>
                  <option value="not_run">Not Run</option>
                </select>
              </div>
            </div>

            {/* Test Cases Table */}
            {loading ? (
              <LoadingSpinner size="lg" />
            ) : filteredCases.length === 0 ? (
              <EmptyState
                icon={<ClipboardList size={32} style={{ color: 'var(--foreground-muted)' }} />}
                title="No Test Cases Found"
                description={
                  totalCases === 0
                    ? "No test cases are currently created in QA Studio."
                    : "No test cases match your active filter criteria."
                }
              />
            ) : (
              <div className="card" style={{ overflow: 'hidden' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ width: 110 }}>Case ID</th>
                      <th>Title & Scope</th>
                      <th style={{ width: 120 }}>Priority</th>
                      <th style={{ width: 110 }}>Prep Status</th>
                      <th style={{ width: 110 }}>Latest Result</th>
                      <th style={{ width: 120 }}>Comments</th>
                      <th style={{ width: 100, textAlign: 'right' }}>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredCases.map(tc => (
                      <tr key={tc.id} style={{ cursor: 'pointer' }} onClick={() => handleOpenCaseDetail(tc)}>
                        <td>
                          <code style={{ fontWeight: 700, color: 'var(--primary)' }}>{tc.case_id}</code>
                        </td>
                        <td>
                          <div style={{ fontWeight: 600, color: 'var(--foreground)', marginBottom: 2 }}>
                            {tc.title}
                          </div>
                          <div style={{ fontSize: 11, color: 'var(--foreground-muted)', display: 'flex', gap: 8 }}>
                            {tc.module_name && <span>{tc.module_name}</span>}
                            {tc.feature_name && <span>· {tc.feature_name}</span>}
                            {tc.requirement_ref && <span>· REQ: {tc.requirement_ref}</span>}
                          </div>
                        </td>
                        <td>
                          <PriorityBadge priority={tc.priority} />
                        </td>
                        <td>
                          <PrepBadge status={tc.prep_status} />
                        </td>
                        <td>
                          <ResultBadge result={tc.latest_result} />
                        </td>
                        <td>
                          {(tc.comment_count ?? 0) > 0 ? (
                            <span className="badge badge-primary" style={{ fontSize: 11, display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                              <MessageSquare size={11} />
                              {tc.comment_count} {tc.comment_count === 1 ? 'comment' : 'comments'}
                            </span>
                          ) : (
                            <span style={{ fontSize: 11, color: 'var(--foreground-dim)' }}>
                              No feedback
                            </span>
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <button
                            className="btn btn-secondary btn-sm"
                            style={{ fontSize: 12, padding: '4px 8px' }}
                            onClick={e => {
                              e.stopPropagation();
                              handleOpenCaseDetail(tc);
                            }}
                          >
                            Inspect
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Health & Execution Overview */}
        {activeTab === 'health' && (
          <div>
            {/* Statistics Cards */}
            <div className="grid-4" style={{ marginBottom: 24 }}>
              <div className="metric-card">
                <div className="metric-label">Total Test Cases</div>
                <div className="metric-value">{totalCases}</div>
                <div style={{ fontSize: 12, color: 'var(--foreground-muted)' }}>Across all modules</div>
              </div>

              <div className="metric-card" style={{ borderLeft: '4px solid var(--success)' }}>
                <div className="metric-label" style={{ color: 'var(--success)' }}>Passing Tests</div>
                <div className="metric-value" style={{ color: 'var(--success)' }}>{passCases}</div>
                <div style={{ fontSize: 12, color: 'var(--foreground-muted)' }}>Pass rate: {passRate}%</div>
              </div>

              <div className="metric-card" style={{ borderLeft: '4px solid var(--error)' }}>
                <div className="metric-label" style={{ color: 'var(--error)' }}>Failing Tests</div>
                <div className="metric-value" style={{ color: 'var(--error)' }}>{failCases}</div>
                <div style={{ fontSize: 12, color: 'var(--foreground-muted)' }}>Open defect candidates</div>
              </div>

              <div className="metric-card" style={{ borderLeft: '4px solid var(--warning)' }}>
                <div className="metric-label" style={{ color: 'var(--warning)' }}>Blocked / Not Run</div>
                <div className="metric-value" style={{ color: 'var(--warning)' }}>{blockedCases + notRunCases}</div>
                <div style={{ fontSize: 12, color: 'var(--foreground-muted)' }}>{blockedCases} blocked, {notRunCases} not run</div>
              </div>
            </div>

            {/* Progress Section */}
            <div className="card" style={{ marginBottom: 24 }}>
              <div className="section-header">
                <h3 className="section-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <TrendingUp size={16} style={{ color: 'var(--primary)' }} />
                  Progress
                </h3>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>Test Preparation</span>
                    <span style={{ fontSize: 13, color: 'var(--foreground-muted)' }}>
                      {dashboardMetrics?.prepProgress.pct != null ? `${dashboardMetrics.prepProgress.pct}%` : 'N/A'}
                    </span>
                  </div>
                  <ProgressBar value={dashboardMetrics?.prepProgress.ready ?? 0} max={dashboardMetrics?.prepProgress.total ?? 1} color="primary" />
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>Test Execution</span>
                    <span style={{ fontSize: 13, color: 'var(--foreground-muted)' }}>
                      {dashboardMetrics?.execProgress.pct != null ? `${dashboardMetrics.execProgress.pct}%` : 'N/A'}
                    </span>
                  </div>
                  <ProgressBar value={dashboardMetrics?.execProgress.executed ?? 0} max={dashboardMetrics?.execProgress.readyTotal ?? 1} color="success" />
                </div>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>Pass Rate</span>
                    <span style={{ fontSize: 13, color: 'var(--foreground-muted)' }}>
                      {dashboardMetrics?.passRate.pct != null ? `${dashboardMetrics.passRate.pct}%` : 'N/A'}
                    </span>
                  </div>
                  <ProgressBar value={dashboardMetrics?.passRate.pass ?? 0} max={dashboardMetrics?.passRate.total ?? 1} color="success" />
                </div>
              </div>
            </div>

            {/* Progress by Module Table */}
            {dashboardMetrics && dashboardMetrics.byModule.length > 0 && (
              <div className="card" style={{ marginBottom: 24 }}>
                <div className="section-header">
                  <h3 className="section-title">Progress by Module</h3>
                </div>
                <div className="table-container">
                  <table>
                    <thead>
                      <tr>
                        <th>Module</th>
                        <th>Total</th>
                        <th>Ready</th>
                        <th>Executed</th>
                        <th>Pass</th>
                        <th>Fail</th>
                        <th>Blocked</th>
                        <th>Preparation</th>
                      </tr>
                    </thead>
                    <tbody>
                      {dashboardMetrics.byModule.map(mod => (
                        <tr key={mod.module}>
                          <td>
                            <div style={{ fontWeight: 600 }}>{mod.module}</div>
                            <div style={{ fontSize: 11, color: 'var(--foreground-muted)' }}>{mod.prefix}</div>
                          </td>
                          <td>{mod.total}</td>
                          <td style={{ color: 'var(--success)' }}>{mod.ready}</td>
                          <td>{mod.executed}</td>
                          <td style={{ color: 'var(--success)' }}>{mod.pass}</td>
                          <td style={{ color: mod.fail > 0 ? 'var(--error)' : 'inherit' }}>{mod.fail}</td>
                          <td style={{ color: mod.blocked > 0 ? 'var(--warning)' : 'inherit' }}>{mod.blocked}</td>
                          <td style={{ minWidth: 120 }}>
                            <ProgressBar value={mod.ready} max={mod.total} />
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </main>

      {/* Test Case Inspection & Comment Drawer/Modal */}
      {viewCase && (
        <Modal
          isOpen={true}
          onClose={() => setViewCase(null)}
          title={`Test Case: ${viewCase.case_id} — ${viewCase.title}`}
          size="xl"
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Header badges */}
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', paddingBottom: 10, borderBottom: '1px solid var(--border)' }}>
              <PriorityBadge priority={viewCase.priority} />
              <PrepBadge status={viewCase.prep_status} />
              <ResultBadge result={viewCase.latest_result} />
              <span className="badge badge-neutral" style={{ textTransform: 'capitalize' }}>
                Type: {viewCase.test_type}
              </span>
              {viewCase.module_name && (
                <span className="badge badge-neutral">Module: {viewCase.module_name}</span>
              )}
              {viewCase.requirement_ref && (
                <span className="badge badge-info">REQ: {viewCase.requirement_ref}</span>
              )}
            </div>

            {/* Test Details */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 12 }}>
              <DetailRow label="Preconditions" value={viewCase.preconditions} pre />
              <DetailRow label="Test Data" value={viewCase.test_data} pre />
            </div>

            <DetailRow label="Test Steps" value={viewCase.test_steps} pre />
            <DetailRow label="Expected Result" value={viewCase.expected_result} pre />

            {viewCase.actual_result && (
              <DetailRow label="Latest Actual Result" value={viewCase.actual_result} pre />
            )}
            {viewCase.defect_ref && (
              <DetailRow label="Reported Defect Reference" value={<code>{viewCase.defect_ref}</code>} />
            )}

            {/* Comments & Collaborator Feedback Section */}
            <div style={{ marginTop: 16, borderTop: '2px solid var(--border)', paddingTop: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
                <MessageSquare size={18} style={{ color: 'var(--primary)' }} />
                <h4 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: 'var(--foreground)' }}>
                  Collaborator Comments & QA Feedback ({caseComments.length})
                </h4>
              </div>

              {/* Existing Comments List */}
              {loadingComments ? (
                <div style={{ fontSize: 13, color: 'var(--foreground-muted)' }}>Loading comments...</div>
              ) : caseComments.length === 0 ? (
                <div
                  style={{
                    background: 'var(--surface-2)',
                    padding: '14px 16px',
                    borderRadius: 8,
                    fontSize: 13,
                    color: 'var(--foreground-muted)',
                    marginBottom: 16,
                  }}
                >
                  No feedback or questions submitted on this test case yet. Use the form below to leave suggestions or questions for the QA team.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 16 }}>
                  {caseComments.map(comment => (
                    <div
                      key={comment.id}
                      style={{
                        background: 'var(--surface-2)',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        padding: '12px 16px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--foreground)' }}>
                            {comment.author_name}
                          </span>
                          <span
                            className={`badge ${
                              comment.author_role === 'pm'
                                ? 'badge-primary'
                                : comment.author_role === 'developer'
                                ? 'badge-info'
                                : 'badge-neutral'
                            }`}
                            style={{ fontSize: 10, textTransform: 'uppercase' }}
                          >
                            {comment.author_role === 'pm' ? 'Product Manager' : comment.author_role === 'developer' ? 'Developer' : 'QA'}
                          </span>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span className={`badge ${comment.status === 'resolved' ? 'badge-success' : comment.status === 'reviewed' ? 'badge-info' : 'badge-warning'}`} style={{ fontSize: 10 }}>
                            {comment.status}
                          </span>
                          <span style={{ fontSize: 11, color: 'var(--foreground-muted)' }}>
                            {new Date(comment.created_at).toLocaleString('en-US')}
                          </span>
                        </div>
                      </div>
                      <div style={{ fontSize: 13, color: 'var(--foreground-body)', whiteSpace: 'pre-wrap' }}>
                        {comment.content}
                      </div>

                      {/* QA Response */}
                      {comment.reply && (
                        <div
                          style={{
                            marginTop: 10,
                            padding: '10px 12px',
                            background: 'rgba(181, 141, 159, 0.1)',
                            borderLeft: '3px solid var(--primary)',
                            borderRadius: 4,
                            fontSize: 12,
                          }}
                        >
                          <div style={{ fontWeight: 600, color: 'var(--primary)', marginBottom: 2 }}>
                            QA Studio Response:
                          </div>
                          <div style={{ color: 'var(--foreground)', whiteSpace: 'pre-wrap' }}>
                            {comment.reply}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {/* Submit Feedback Form */}
              <form onSubmit={handlePostComment} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: 16 }}>
                <h5 style={{ fontSize: 13, fontWeight: 700, marginBottom: 10, color: 'var(--foreground)' }}>
                  Submit Collaborator Feedback on this Test Case
                </h5>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 10 }}>
                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: 12 }}>Your Name <span style={{ color: 'var(--error)' }}>*</span></label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="e.g. Alex PM or Devin Dev"
                      style={{ height: 34, fontSize: 13 }}
                      value={authorName}
                      onChange={e => setAuthorName(e.target.value)}
                    />
                  </div>

                  <div className="form-group" style={{ marginBottom: 0 }}>
                    <label className="form-label" style={{ fontSize: 12 }}>Your Role</label>
                    <select
                      className="form-control"
                      style={{ height: 34, fontSize: 13 }}
                      value={authorRole}
                      onChange={e => setAuthorRole(e.target.value as 'pm' | 'developer')}
                    >
                      <option value="pm">Product Manager (PM)</option>
                      <option value="developer">Developer (Dev)</option>
                    </select>
                  </div>
                </div>

                <div className="form-group" style={{ marginBottom: 12 }}>
                  <label className="form-label" style={{ fontSize: 12 }}>Comment or Feedback <span style={{ color: 'var(--error)' }}>*</span></label>
                  <textarea
                    className="form-control"
                    rows={3}
                    placeholder="Provide questions, suggestions on steps or expected results, edge cases to add..."
                    style={{ fontSize: 13 }}
                    value={commentContent}
                    onChange={e => setCommentContent(e.target.value)}
                  />
                </div>

                <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                  <button
                    type="submit"
                    className="btn btn-primary btn-sm"
                    disabled={submittingComment}
                    style={{ display: 'flex', alignItems: 'center', gap: 6 }}
                  >
                    <Send size={13} />
                    <span>{submittingComment ? 'Submitting...' : 'Submit to QA Feedback Inbox'}</span>
                  </button>
                </div>
              </form>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
