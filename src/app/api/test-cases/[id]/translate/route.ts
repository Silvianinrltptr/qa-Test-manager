import { getDb, prisma } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { translateTestCase } from '@/lib/translation';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest, ctx: RouteContext<'/api/test-cases/[id]'>) {
  try {
    const { errorResponse } = await requireAuth(req, ['qa']);
    if (errorResponse) return errorResponse;

    const { id } = await ctx.params;
    const testCaseId = Number(id);

    if (isNaN(testCaseId)) {
      return NextResponse.json({ error: 'Invalid test case ID' }, { status: 400 });
    }

    const body = await req.json().catch(() => ({}));
    const targetLang: 'id' | 'en' = body.targetLang === 'en' ? 'en' : 'id';

    const db = getDb();
    const tc = (await db.prepare('SELECT * FROM test_cases WHERE id = ?').get(testCaseId)) as any;
    if (!tc) {
      return NextResponse.json({ error: 'Test case not found' }, { status: 404 });
    }

    const result = await translateTestCase(
      {
        title: tc.title,
        preconditions: tc.preconditions,
        test_steps: tc.test_steps,
        test_data: tc.test_data,
        expected_result: tc.expected_result,
      },
      targetLang
    );

    if (!result.success || !result.translated) {
      return NextResponse.json(
        { error: result.error || 'Translation failed' },
        { status: 502 }
      );
    }

    const { title, preconditions, test_steps, test_data, expected_result } = result.translated;

    // Upsert into test_case_translations
    const upsertSql = `
      INSERT INTO test_case_translations (test_case_id, language, title, preconditions, test_steps, test_data, expected_result, reviewed, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, false, NOW())
      ON CONFLICT (test_case_id, language)
      DO UPDATE SET
        title = EXCLUDED.title,
        preconditions = EXCLUDED.preconditions,
        test_steps = EXCLUDED.test_steps,
        test_data = EXCLUDED.test_data,
        expected_result = EXCLUDED.expected_result,
        reviewed = false,
        updated_at = NOW()
      RETURNING *
    `;

    const saved = await db.prepare(upsertSql).get(
      testCaseId,
      targetLang,
      title,
      preconditions || null,
      test_steps || null,
      test_data || null,
      expected_result || null
    );

    return NextResponse.json({
      success: true,
      provider: result.provider,
      translation: saved || {
        test_case_id: testCaseId,
        language: targetLang,
        title,
        preconditions,
        test_steps,
        test_data,
        expected_result,
        reviewed: false,
      }
    });
  } catch (error: any) {
    console.error('Test case translation error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
