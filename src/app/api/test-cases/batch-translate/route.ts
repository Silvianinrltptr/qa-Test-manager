import { getDb } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { translateTestCase } from '@/lib/translation';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const { errorResponse } = await requireAuth(req, ['qa']);
    if (errorResponse) return errorResponse;

    const db = getDb();
    const body = await req.json().catch(() => ({}));
    const targetLang: 'id' | 'en' = body.targetLang === 'en' ? 'en' : 'id';
    const limit = Math.min(Number(body.limit || 50), 100);
    const caseIds = Array.isArray(body.caseIds) ? body.caseIds : null;

    // Find test cases that lack translation for targetLang
    let query: string;
    let params: any[] = [];

    if (caseIds && caseIds.length > 0) {
      const placeholders = caseIds.map(() => '?').join(',');
      query = `
        SELECT tc.* FROM test_cases tc
        WHERE tc.id IN (${placeholders})
        ORDER BY tc.id ASC
      `;
      params = caseIds;
    } else {
      query = `
        SELECT tc.* FROM test_cases tc
        LEFT JOIN test_case_translations tct ON tct.test_case_id = tc.id AND tct.language = ?
        WHERE tct.id IS NULL AND tc.lifecycle_status != 'archived'
        ORDER BY tc.id ASC
        LIMIT ?
      `;
      params = [targetLang, limit];
    }

    const testCases = (await db.prepare(query).all(...params)) as any[];

    if (!testCases || testCases.length === 0) {
      return NextResponse.json({
        message: 'No test cases need translation',
        translatedCount: 0,
        totalRemaining: 0
      });
    }

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
    `;
    const upsertStmt = db.prepare(upsertSql);

    let translatedCount = 0;
    const errors: string[] = [];

    for (const tc of testCases) {
      try {
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

        if (result.success && result.translated) {
          const { title, preconditions, test_steps, test_data, expected_result } = result.translated;
          await upsertStmt.run(
            tc.id,
            targetLang,
            title,
            preconditions || null,
            test_steps || null,
            test_data || null,
            expected_result || null
          );
          translatedCount++;
        } else {
          errors.push(`TC #${tc.id} (${tc.case_id}): ${result.error}`);
          // Stop on global AI config error to avoid repetitive failures
          if (result.error?.includes('No translation AI service')) {
            break;
          }
        }
      } catch (err: any) {
        errors.push(`TC #${tc.id}: ${err.message}`);
      }
    }

    // Check remaining count
    const remainingCountRow = (await db.prepare(`
      SELECT COUNT(*) as count FROM test_cases tc
      LEFT JOIN test_case_translations tct ON tct.test_case_id = tc.id AND tct.language = ?
      WHERE tct.id IS NULL AND tc.lifecycle_status != 'archived'
    `).get(targetLang)) as any;

    return NextResponse.json({
      success: true,
      translatedCount,
      totalRemaining: remainingCountRow ? Number(remainingCountRow.count) : 0,
      errors: errors.length > 0 ? errors.slice(0, 5) : undefined
    });
  } catch (error: any) {
    console.error('Batch translation error:', error);
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}
