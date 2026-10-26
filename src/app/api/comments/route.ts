import { NextRequest, NextResponse } from 'next/server';
import { getDb, logActivity } from '@/lib/db';
import type { TestCaseComment } from '@/lib/types';
import { requireAuth } from '@/lib/auth';

export async function GET(req: NextRequest) {
  try {
    const { errorResponse } = await requireAuth(req, ['qa', 'dev_pm']);
    if (errorResponse) return errorResponse;

    const testCaseId = req.nextUrl.searchParams.get('testCaseId');
    if (!testCaseId) {
      return NextResponse.json({ error: 'testCaseId parameter is required' }, { status: 400 });
    }

    const db = getDb();
    const comments = (await db.prepare(`
      SELECT * FROM test_case_comments 
      WHERE test_case_id = ? 
      ORDER BY created_at ASC
    `).all(Number(testCaseId))) as TestCaseComment[];

    return NextResponse.json(comments || []);
  } catch (error) {
    console.error('Comments GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { errorResponse } = await requireAuth(req, ['qa', 'dev_pm']);
    if (errorResponse) return errorResponse;

    const body = (await req.json()) as {
      test_case_id?: number;
      author_name?: string;
      author_role?: string;
      content?: string;
    };

    const { test_case_id, author_name, author_role = 'pm', content } = body;

    if (!test_case_id || !author_name?.trim() || !content?.trim()) {
      return NextResponse.json({ error: 'test_case_id, author_name, and content are required' }, { status: 400 });
    }

    const db = getDb();
    const stmt = db.prepare(`
      INSERT INTO test_case_comments (test_case_id, author_name, author_role, content, status)
      VALUES (?, ?, ?, ?, 'pending')
    `);
    const info = await stmt.run(Number(test_case_id), author_name.trim(), author_role, content.trim());

    // Activity log entry
    await logActivity(
      db,
      'comment_created',
      'test_case',
      Number(test_case_id),
      '',
      `Feedback comment submitted by ${author_name.trim()} (${author_role})`
    );

    const created = (await db.prepare('SELECT * FROM test_case_comments WHERE id = ?').get(info.lastInsertRowid)) as TestCaseComment;
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    console.error('Comments POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
