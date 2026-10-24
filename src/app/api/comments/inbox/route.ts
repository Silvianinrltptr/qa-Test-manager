import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';
import type { TestCaseComment, FeedbackInboxStats } from '@/lib/types';
import { requireAuth } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const { errorResponse } = await requireAuth(req, ['qa']);
    if (errorResponse) return errorResponse;

    const db = getDb();

    const comments = db.prepare(`
      SELECT 
        c.id,
        c.test_case_id,
        c.author_name,
        c.author_role,
        c.content,
        c.status,
        c.reply,
        c.replied_at,
        c.created_at,
        c.resolved_at,
        tc.case_id,
        tc.title AS test_case_title,
        tc.priority,
        m.name AS module_name,
        f.name AS feature_name
      FROM test_case_comments c
      JOIN test_cases tc ON c.test_case_id = tc.id
      LEFT JOIN modules m ON tc.module_id = m.id
      LEFT JOIN features f ON tc.feature_id = f.id
      ORDER BY c.created_at DESC
    `).all() as TestCaseComment[];

    const statsRow = db.prepare(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) AS pending,
        SUM(CASE WHEN status = 'reviewed' THEN 1 ELSE 0 END) AS reviewed,
        SUM(CASE WHEN status = 'resolved' THEN 1 ELSE 0 END) AS resolved
      FROM test_case_comments
    `).get() as {
      total: number;
      pending: number | null;
      reviewed: number | null;
      resolved: number | null;
    } | undefined;

    const stats: FeedbackInboxStats = {
      total: statsRow?.total || 0,
      pending: statsRow?.pending || 0,
      reviewed: statsRow?.reviewed || 0,
      resolved: statsRow?.resolved || 0,
    };

    return NextResponse.json({
      comments,
      stats,
    });
  } catch (error) {
    console.error('Feedback Inbox API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
