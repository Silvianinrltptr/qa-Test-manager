import { NextRequest, NextResponse } from 'next/server';
import { getDb, logActivity } from '@/lib/db';
import type { TestCaseComment } from '@/lib/types';
import { requireAuth } from '@/lib/auth';

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { errorResponse } = await requireAuth(req, ['qa']);
    if (errorResponse) return errorResponse;

    const { id } = await params;
    const commentId = Number(id);
    if (!commentId || isNaN(commentId)) {
      return NextResponse.json({ error: 'Invalid comment ID' }, { status: 400 });
    }

    const body = await req.json() as {
      status?: 'pending' | 'reviewed' | 'resolved';
      reply?: string;
    };

    const db = getDb();
    const existing = db.prepare('SELECT * FROM test_case_comments WHERE id = ?').get(commentId) as TestCaseComment | undefined;
    if (!existing) {
      return NextResponse.json({ error: 'Comment not found' }, { status: 404 });
    }

    const updates: string[] = [];
    const values: (string | number | null)[] = [];

    if (body.status !== undefined) {
      updates.push('status = ?');
      values.push(body.status);
      if (body.status === 'resolved') {
        updates.push("resolved_at = datetime('now')");
      } else {
        updates.push('resolved_at = NULL');
      }
    }

    if (body.reply !== undefined) {
      updates.push('reply = ?');
      values.push(body.reply.trim());
      updates.push("replied_at = datetime('now')");
    }

    if (updates.length > 0) {
      values.push(commentId);
      db.prepare(`UPDATE test_case_comments SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    }

    logActivity(
      db,
      'comment_updated',
      'test_case',
      existing.test_case_id,
      '',
      `Comment #${commentId} status updated to ${body.status || existing.status}`
    );

    const updated = db.prepare('SELECT * FROM test_case_comments WHERE id = ?').get(commentId) as TestCaseComment;
    return NextResponse.json(updated);
  } catch (error) {
    console.error('Comments PATCH error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { errorResponse } = await requireAuth(req, ['qa']);
    if (errorResponse) return errorResponse;

    const { id } = await params;
    const commentId = Number(id);
    if (!commentId || isNaN(commentId)) {
      return NextResponse.json({ error: 'Invalid comment ID' }, { status: 400 });
    }

    const db = getDb();
    db.prepare('DELETE FROM test_case_comments WHERE id = ?').run(commentId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Comments DELETE error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
