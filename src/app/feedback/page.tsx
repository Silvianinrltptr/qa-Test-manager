'use client';

import { useEffect, useState } from 'react';
import { AppShell } from '@/components/layout/AppShell';
import { ThemeToggle } from '@/components/ui/ThemeToggle';
import { LoadingSpinner, EmptyState } from '@/components/ui/Shared';
import { useToast } from '@/components/ui/Toast';
import {
  Inbox,
  CheckCircle2,
  Clock,
  Send,
  ExternalLink,
  Search,
  Filter,
} from 'lucide-react';
import Link from 'next/link';
import type { TestCaseComment, FeedbackInboxStats } from '@/lib/types';

export default function FeedbackInboxPage() {
  const [comments, setComments] = useState<TestCaseComment[]>([]);
  const [stats, setStats] = useState<FeedbackInboxStats>({ total: 0, pending: 0, reviewed: 0, resolved: 0 });
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'reviewed' | 'resolved'>('all');
  const [roleFilter, setRoleFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  
  // State for replying inline
  const [replyTextMap, setReplyTextMap] = useState<Record<number, string>>({});
  const [submittingReplyId, setSubmittingReplyId] = useState<number | null>(null);

  const [reloadKey, setReloadKey] = useState(0);

  const toast = useToast();

  useEffect(() => {
    let ignore = false;
    fetch('/api/comments/inbox')
      .then(res => (res.ok ? res.json() : null))
      .then((data: { comments: TestCaseComment[]; stats: FeedbackInboxStats } | null) => {
        if (!ignore && data) {
          setComments(data.comments || []);
          setStats(data.stats || { total: 0, pending: 0, reviewed: 0, resolved: 0 });
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

  const handleUpdateStatus = async (commentId: number, newStatus: 'pending' | 'reviewed' | 'resolved') => {
    try {
      const res = await fetch(`/api/comments/${commentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error('Failed to update status');
      toast.success(`Feedback marked as ${newStatus}`);
      setReloadKey(k => k + 1);
    } catch {
      toast.error('Failed to update status');
    }
  };

  const handleSendReply = async (commentId: number, resolveAfter = false) => {
    const text = replyTextMap[commentId]?.trim();
    if (!text) {
      toast.warning('Please write a reply before submitting');
      return;
    }

    setSubmittingReplyId(commentId);
    try {
      const payload: { reply: string; status?: 'pending' | 'reviewed' | 'resolved' } = {
        reply: text,
      };
      if (resolveAfter) {
        payload.status = 'resolved';
      } else {
        payload.status = 'reviewed';
      }

      const res = await fetch(`/api/comments/${commentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error('Failed to send reply');
      toast.success(resolveAfter ? 'Reply saved and marked as resolved' : 'QA reply saved');
      setReplyTextMap(prev => ({ ...prev, [commentId]: '' }));
      setReloadKey(k => k + 1);
    } catch {
      toast.error('Failed to send QA reply');
    } finally {
      setSubmittingReplyId(null);
    }
  };

  // Filter logic
  const filteredComments = comments.filter(c => {
    if (statusFilter !== 'all' && c.status !== statusFilter) return false;
    if (roleFilter !== 'all' && c.author_role !== roleFilter) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchCase = c.case_id?.toLowerCase().includes(q);
      const matchTitle = c.test_case_title?.toLowerCase().includes(q);
      const matchAuthor = c.author_name?.toLowerCase().includes(q);
      const matchContent = c.content?.toLowerCase().includes(q);
      if (!matchCase && !matchTitle && !matchAuthor && !matchContent) return false;
    }
    return true;
  });

  return (
    <AppShell>
      <div className="page-header">
        <div>
          <h1 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <Inbox size={26} style={{ color: 'var(--primary)' }} />
            QA Feedback Inbox
            {stats.pending > 0 && (
              <span className="badge badge-error" style={{ fontSize: 13, padding: '2px 8px' }}>
                {stats.pending} pending
              </span>
            )}
          </h1>
          <p className="page-subtitle">
            Centralized review and reply station for comments and questions submitted by PMs and Developers.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <ThemeToggle />
        </div>
      </div>

      {/* Metrics overview */}
      <div className="grid-4" style={{ marginBottom: 24 }}>
        <div className="metric-card">
          <div className="metric-label">Total Feedback</div>
          <div className="metric-value">{stats.total}</div>
          <div style={{ fontSize: 12, color: 'var(--foreground-muted)' }}>From PMs, Devs & QA</div>
        </div>

        <div className="metric-card" style={{ borderLeft: '4px solid var(--warning)' }}>
          <div className="metric-label" style={{ color: 'var(--warning)' }}>Pending Review</div>
          <div className="metric-value" style={{ color: 'var(--warning)' }}>{stats.pending}</div>
          <div style={{ fontSize: 12, color: 'var(--foreground-muted)' }}>Requires QA attention</div>
        </div>

        <div className="metric-card" style={{ borderLeft: '4px solid var(--info)' }}>
          <div className="metric-label" style={{ color: 'var(--info)' }}>Reviewed</div>
          <div className="metric-value" style={{ color: 'var(--info)' }}>{stats.reviewed}</div>
          <div style={{ fontSize: 12, color: 'var(--foreground-muted)' }}>Acknowledged / replied</div>
        </div>

        <div className="metric-card" style={{ borderLeft: '4px solid var(--success)' }}>
          <div className="metric-label" style={{ color: 'var(--success)' }}>Resolved</div>
          <div className="metric-value" style={{ color: 'var(--success)' }}>{stats.resolved}</div>
          <div style={{ fontSize: 12, color: 'var(--foreground-muted)' }}>Questions answered</div>
        </div>
      </div>

      {/* Search and Filters */}
      <div className="card" style={{ padding: '16px 20px', marginBottom: 24 }}>
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Status filter tabs */}
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              className={`btn btn-sm ${statusFilter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
              onClick={() => setStatusFilter('all')}
            >
              All ({stats.total})
            </button>
            <button
              className={`btn btn-sm ${statusFilter === 'pending' ? 'btn-warning' : 'btn-secondary'}`}
              onClick={() => setStatusFilter('pending')}
            >
              Pending ({stats.pending})
            </button>
            <button
              className={`btn btn-sm ${statusFilter === 'reviewed' ? 'btn-secondary' : 'btn-secondary'}`}
              style={statusFilter === 'reviewed' ? { background: 'var(--info)', color: '#fff', borderColor: 'var(--info)' } : {}}
              onClick={() => setStatusFilter('reviewed')}
            >
              Reviewed ({stats.reviewed})
            </button>
            <button
              className={`btn btn-sm ${statusFilter === 'resolved' ? 'btn-success' : 'btn-secondary'}`}
              onClick={() => setStatusFilter('resolved')}
            >
              Resolved ({stats.resolved})
            </button>
          </div>

          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <Filter size={15} style={{ color: 'var(--foreground-muted)' }} />
              <select
                className="form-control"
                style={{ width: 140, height: 34, fontSize: 13, padding: '4px 8px' }}
                value={roleFilter}
                onChange={e => setRoleFilter(e.target.value)}
              >
                <option value="all">All Roles</option>
                <option value="pm">PM Feedback</option>
                <option value="developer">Developer</option>
                <option value="qa">QA Peer</option>
              </select>
            </div>

            <div style={{ position: 'relative' }}>
              <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--foreground-muted)' }} />
              <input
                type="text"
                className="form-control"
                placeholder="Search feedback..."
                style={{ width: 220, height: 34, fontSize: 13, paddingLeft: 30 }}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Content list */}
      {loading ? (
        <LoadingSpinner size="lg" />
      ) : filteredComments.length === 0 ? (
        <EmptyState
          icon={<Inbox size={32} style={{ color: 'var(--foreground-muted)' }} />}
          title="No Feedback Items Found"
          description={
            statusFilter === 'all'
              ? "Collaborator comments submitted by PMs and Developers will appear here for review."
              : `No feedback items matching status '${statusFilter}'.`
          }
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {filteredComments.map(item => {
            const isPending = item.status === 'pending';
            const isResolved = item.status === 'resolved';

            return (
              <div
                key={item.id}
                className="card"
                style={{
                  padding: '20px 24px',
                  borderLeft: isPending
                    ? '4px solid var(--warning)'
                    : isResolved
                    ? '4px solid var(--success)'
                    : '4px solid var(--info)',
                }}
              >
                {/* Header row */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <Link
                        href={`/test-cases?search=${item.case_id}`}
                        style={{
                          fontWeight: 700,
                          fontSize: 14,
                          color: 'var(--primary)',
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 4,
                          textDecoration: 'none',
                        }}
                      >
                        <code>{item.case_id}</code>
                        <ExternalLink size={13} />
                      </Link>
                      <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--foreground)' }}>
                        {item.test_case_title}
                      </span>
                      {item.module_name && (
                        <span className="badge badge-neutral" style={{ fontSize: 11 }}>
                          {item.module_name}
                        </span>
                      )}
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span
                      className={`badge ${
                        item.author_role === 'pm'
                          ? 'badge-primary'
                          : item.author_role === 'developer'
                          ? 'badge-info'
                          : 'badge-neutral'
                      }`}
                      style={{ fontSize: 11, textTransform: 'uppercase' }}
                    >
                      {item.author_role === 'pm' ? 'Product Manager' : item.author_role === 'developer' ? 'Developer' : 'QA'}
                    </span>
                    <span
                      className={`badge ${
                        isPending ? 'badge-warning' : isResolved ? 'badge-success' : 'badge-neutral'
                      }`}
                      style={{ fontSize: 11, textTransform: 'capitalize' }}
                    >
                      {item.status}
                    </span>
                  </div>
                </div>

                {/* Comment content */}
                <div
                  style={{
                    background: 'var(--surface-2)',
                    padding: '14px 16px',
                    borderRadius: 8,
                    marginBottom: 14,
                    fontSize: 14,
                    lineHeight: 1.5,
                    color: 'var(--foreground-body)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6, fontSize: 12, color: 'var(--foreground-muted)' }}>
                    <span>
                      <strong>{item.author_name}</strong> wrote:
                    </span>
                    <span>{new Date(item.created_at).toLocaleString('en-US')}</span>
                  </div>
                  <div style={{ whiteSpace: 'pre-wrap' }}>{item.content}</div>
                </div>

                {/* Existing reply if any */}
                {item.reply && (
                  <div
                    style={{
                      background: 'rgba(181, 141, 159, 0.08)',
                      border: '1px solid var(--border)',
                      padding: '12px 16px',
                      borderRadius: 8,
                      marginBottom: 14,
                      fontSize: 13,
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 11, color: 'var(--foreground-muted)' }}>
                      <span style={{ fontWeight: 600, color: 'var(--primary)' }}>QAE Studio Response:</span>
                      {item.replied_at && <span>{new Date(item.replied_at).toLocaleString('en-US')}</span>}
                    </div>
                    <div style={{ color: 'var(--foreground)', whiteSpace: 'pre-wrap' }}>{item.reply}</div>
                  </div>
                )}

                {/* Reply Form */}
                <div style={{ display: 'flex', gap: 10, marginTop: 10, flexWrap: 'wrap' }}>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Write a response or explanation from QA..."
                    style={{ flex: 1, minWidth: 260, fontSize: 13 }}
                    value={replyTextMap[item.id] || ''}
                    onChange={e => setReplyTextMap({ ...replyTextMap, [item.id]: e.target.value })}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleSendReply(item.id, false);
                      }
                    }}
                  />
                  <button
                    className="btn btn-secondary btn-sm"
                    disabled={submittingReplyId === item.id}
                    onClick={() => handleSendReply(item.id, false)}
                    title="Send response and mark as reviewed"
                  >
                    <Send size={13} style={{ marginRight: 4 }} />
                    Reply
                  </button>
                  <button
                    className="btn btn-primary btn-sm"
                    disabled={submittingReplyId === item.id}
                    onClick={() => handleSendReply(item.id, true)}
                    title="Send response and close/resolve feedback"
                  >
                    <CheckCircle2 size={13} style={{ marginRight: 4 }} />
                    Reply & Resolve
                  </button>

                  <div style={{ display: 'flex', gap: 6, marginLeft: 'auto' }}>
                    {isPending && (
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleUpdateStatus(item.id, 'reviewed')}
                      >
                        <Clock size={13} style={{ marginRight: 4 }} />
                        Mark Reviewed
                      </button>
                    )}
                    {!isResolved ? (
                      <button
                        className="btn btn-success btn-sm"
                        onClick={() => handleUpdateStatus(item.id, 'resolved')}
                      >
                        <CheckCircle2 size={13} style={{ marginRight: 4 }} />
                        Resolve
                      </button>
                    ) : (
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleUpdateStatus(item.id, 'pending')}
                      >
                        Reopen
                      </button>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </AppShell>
  );
}
