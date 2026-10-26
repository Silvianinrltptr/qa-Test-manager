import { getDb } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, ctx: RouteContext<'/api/test-cases/[id]'>) {
  try {
    const { errorResponse } = await requireAuth(req, ['qa', 'dev_pm']);
    if (errorResponse) return errorResponse;

    const { id } = await ctx.params;
    const testCaseId = Number(id);

    const db = getDb();
    const translations = await db.prepare(
      'SELECT * FROM test_case_translations WHERE test_case_id = ? ORDER BY language ASC'
    ).all(testCaseId);

    return NextResponse.json({ translations: translations || [] });
  } catch (error: any) {
    console.error('Get translations error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, ctx: RouteContext<'/api/test-cases/[id]'>) {
  try {
    const { errorResponse } = await requireAuth(req, ['qa']);
    if (errorResponse) return errorResponse;

    const { id } = await ctx.params;
    const testCaseId = Number(id);
    const body = await req.json();

    const language = body.language === 'en' ? 'en' : 'id';
    const { title, preconditions, test_steps, test_data, expected_result, reviewed } = body;

    const db = getDb();

    const upsertSql = `
      INSERT INTO test_case_translations (test_case_id, language, title, preconditions, test_steps, test_data, expected_result, reviewed, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
      ON CONFLICT (test_case_id, language)
      DO UPDATE SET
        title = EXCLUDED.title,
        preconditions = EXCLUDED.preconditions,
        test_steps = EXCLUDED.test_steps,
        test_data = EXCLUDED.test_data,
        expected_result = EXCLUDED.expected_result,
        reviewed = EXCLUDED.reviewed,
        updated_at = NOW()
      RETURNING *
    `;

    const saved = await db.prepare(upsertSql).get(
      testCaseId,
      language,
      title || null,
      preconditions || null,
      test_steps || null,
      test_data || null,
      expected_result || null,
      reviewed === undefined ? true : Boolean(reviewed)
    );

    return NextResponse.json({ success: true, translation: saved });
  } catch (error: any) {
    console.error('Save translation error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
