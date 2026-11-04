import { getDb, logActivity } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { resolveTestCaseLanguageContent } from '@/lib/translation';

export const dynamic = 'force-dynamic';

// GET /api/test-runs - List recent test runs
// GET /api/test-runs?id=<id> - Get specific test run with its ordered items
export async function GET(req: NextRequest) {
  try {
    const { errorResponse } = await requireAuth(req, ['qa', 'dev_pm']);
    if (errorResponse) return errorResponse;

    const db = getDb();
    const { searchParams } = new URL(req.url);
    const id = searchParams.get('id');
    const lang = searchParams.get('lang') || req.cookies.get('qastudio_lang')?.value || 'en';

    if (id) {
      const run = (await db.prepare(`
        SELECT tr.*,
          COUNT(tri.id) as total_cases,
          COUNT(CASE WHEN tri.status = 'pass' THEN 1 END) as passed_cases,
          COUNT(CASE WHEN tri.status = 'fail' THEN 1 END) as failed_cases,
          COUNT(CASE WHEN tri.status = 'blocked' THEN 1 END) as blocked_cases,
          COUNT(CASE WHEN tri.status = 'not_run' THEN 1 END) as not_run_cases
        FROM test_runs tr
        LEFT JOIN test_run_items tri ON tri.test_run_id = tr.id
        WHERE tr.id = ?
        GROUP BY tr.id
      `).get(Number(id))) as any;

      if (!run) {
        return NextResponse.json({ error: 'Test run not found' }, { status: 404 });
      }

      // Fetch items in the structured order: Module name/order, Feature name, Case ID ASC
      const rawItems = (await db.prepare(`
        SELECT 
          tri.*,
          tc.case_id,
          tc.title,
          tc.module_id,
          tc.feature_id,
          tc.test_type,
          tc.preconditions,
          tc.test_steps,
          tc.test_data,
          tc.expected_result,
          tc.priority,
          tc.requirement_ref,
          tc.prep_status,
          tc.latest_result,
          m.name as module_name,
          m.prefix as module_prefix,
          f.name as feature_name,
          tct_id.id as trans_id_id,
          tct_id.title as trans_id_title,
          tct_id.preconditions as trans_id_preconditions,
          tct_id.test_steps as trans_id_test_steps,
          tct_id.test_data as trans_id_test_data,
          tct_id.expected_result as trans_id_expected_result,
          tct_id.reviewed as trans_id_reviewed,
          tct_en.id as trans_en_id,
          tct_en.title as trans_en_title,
          tct_en.preconditions as trans_en_preconditions,
          tct_en.test_steps as trans_en_test_steps,
          tct_en.test_data as trans_en_test_data,
          tct_en.expected_result as trans_en_expected_result,
          tct_en.reviewed as trans_en_reviewed
        FROM test_run_items tri
        JOIN test_cases tc ON tc.id = tri.test_case_id
        JOIN modules m ON m.id = tc.module_id
        JOIN features f ON f.id = tc.feature_id
        LEFT JOIN test_case_translations tct_id ON tct_id.test_case_id = tc.id AND tct_id.language = 'id'
        LEFT JOIN test_case_translations tct_en ON tct_en.test_case_id = tc.id AND tct_en.language = 'en'
        WHERE tri.test_run_id = ?
        ORDER BY tri.order_index ASC, m.name ASC, f.name ASC, tc.case_id ASC
      `).all(Number(id))) as any[];

      const items = (rawItems || []).map((row: any) => {
        const resolved = resolveTestCaseLanguageContent(
          row,
          {
            en: row.trans_en_title ? {
              title: row.trans_en_title,
              preconditions: row.trans_en_preconditions,
              test_steps: row.trans_en_test_steps,
              test_data: row.trans_en_test_data,
              expected_result: row.trans_en_expected_result,
              reviewed: Boolean(row.trans_en_reviewed),
              language: 'en'
            } : null,
            id: row.trans_id_title ? {
              title: row.trans_id_title,
              preconditions: row.trans_id_preconditions,
              test_steps: row.trans_id_test_steps,
              test_data: row.trans_id_test_data,
              expected_result: row.trans_id_expected_result,
              reviewed: Boolean(row.trans_id_reviewed),
              language: 'id'
            } : null,
          },
          lang
        );

        return {
          id: row.id,
          test_run_id: row.test_run_id,
          test_case_id: row.test_case_id,
          order_index: row.order_index,
          status: row.status,
          actual_result: row.actual_result,
          evidence: row.evidence,
          defect_ref: row.defect_ref,
          notes: row.notes,
          executed_at: row.executed_at,
          created_at: row.created_at,
          updated_at: row.updated_at,
          case_id: row.case_id,
          title: resolved.title,
          module_id: row.module_id,
          module_name: row.module_name,
          module_prefix: row.module_prefix,
          feature_id: row.feature_id,
          feature_name: row.feature_name,
          priority: row.priority,
          test_type: row.test_type,
          preconditions: resolved.preconditions,
          test_steps: resolved.test_steps,
          test_data: resolved.test_data,
          expected_result: resolved.expected_result,
          requirement_ref: row.requirement_ref,
          prep_status: row.prep_status,
          latest_result: row.latest_result,
        };
      });

      const total = Number(run.total_cases) || items.length;
      const passed = Number(run.passed_cases) || 0;
      const failed = Number(run.failed_cases) || 0;
      const blocked = Number(run.blocked_cases) || 0;
      const notRun = Number(run.not_run_cases) || 0;
      const executed = passed + failed + blocked;
      const progressPct = total > 0 ? Math.round((executed / total) * 100) : 0;
      const passRateTotal = passed + failed;
      const passRatePct = passRateTotal > 0 ? Math.round((passed / passRateTotal) * 100) : 0;

      return NextResponse.json({
        ...run,
        total_cases: total,
        passed_cases: passed,
        failed_cases: failed,
        blocked_cases: blocked,
        not_run_cases: notRun,
        progress_pct: progressPct,
        pass_rate_pct: passRatePct,
        items,
      });
    }

    // List recent test runs
    const runs = (await db.prepare(`
      SELECT tr.*,
        COUNT(tri.id) as total_cases,
        COUNT(CASE WHEN tri.status = 'pass' THEN 1 END) as passed_cases,
        COUNT(CASE WHEN tri.status = 'fail' THEN 1 END) as failed_cases,
        COUNT(CASE WHEN tri.status = 'blocked' THEN 1 END) as blocked_cases,
        COUNT(CASE WHEN tri.status = 'not_run' THEN 1 END) as not_run_cases
      FROM test_runs tr
      LEFT JOIN test_run_items tri ON tri.test_run_id = tr.id
      GROUP BY tr.id
      ORDER BY tr.created_at DESC
      LIMIT 50
    `).all()) as any[];

    const formattedRuns = (runs || []).map((r: any) => {
      const total = Number(r.total_cases) || 0;
      const passed = Number(r.passed_cases) || 0;
      const failed = Number(r.failed_cases) || 0;
      const blocked = Number(r.blocked_cases) || 0;
      const notRun = Number(r.not_run_cases) || 0;
      const executed = passed + failed + blocked;
      const progressPct = total > 0 ? Math.round((executed / total) * 100) : 0;
      const passRateTotal = passed + failed;
      const passRatePct = passRateTotal > 0 ? Math.round((passed / passRateTotal) * 100) : 0;

      return {
        ...r,
        total_cases: total,
        passed_cases: passed,
        failed_cases: failed,
        blocked_cases: blocked,
        not_run_cases: notRun,
        progress_pct: progressPct,
        pass_rate_pct: passRatePct,
      };
    });

    return NextResponse.json(formattedRuns);
  } catch (error) {
    console.error('Error fetching test runs:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/test-runs - Create a new test run with selected test cases
export async function POST(req: NextRequest) {
  try {
    const { errorResponse } = await requireAuth(req, ['qa']);
    if (errorResponse) return errorResponse;

    const db = getDb();
    const body = await req.json();
    const { name, description, environment, testCaseIds } = body;

    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Test run name is required' }, { status: 400 });
    }

    if (!Array.isArray(testCaseIds) || testCaseIds.length === 0) {
      return NextResponse.json({ error: 'At least one test case must be selected' }, { status: 400 });
    }

    // Sanitize unique IDs
    const uniqueIds = Array.from(new Set(testCaseIds.map(Number))).filter(id => !isNaN(id) && id > 0);
    if (uniqueIds.length === 0) {
      return NextResponse.json({ error: 'Valid test case IDs are required' }, { status: 400 });
    }

    // Query test cases to ensure they exist and order them strictly by:
    // 1. Module name (or module_id order)
    // 2. Feature name
    // 3. Test Case ID ascending (AUTH-001, AUTH-002, etc.)
    const placeholders = uniqueIds.map(() => '?').join(',');
    const cases = (await db.prepare(`
      SELECT tc.id, tc.case_id, tc.module_id, tc.feature_id, m.name as module_name, f.name as feature_name
      FROM test_cases tc
      JOIN modules m ON m.id = tc.module_id
      JOIN features f ON f.id = tc.feature_id
      WHERE tc.id IN (${placeholders})
      ORDER BY m.name ASC, f.name ASC, tc.case_id ASC
    `).all(...uniqueIds)) as any[];

    if (!cases || cases.length === 0) {
      return NextResponse.json({ error: 'Selected test cases not found' }, { status: 404 });
    }

    // Create test run
    const createRunResult = await db.prepare(`
      INSERT INTO test_runs (name, description, environment, status)
      VALUES (?, ?, ?, 'in_progress')
    `).run(
      name.trim(),
      description?.trim() || null,
      environment || 'STG'
    );

    const testRunId = createRunResult.lastInsertRowid as number;

    // Insert items in the sorted order
    for (let i = 0; i < cases.length; i++) {
      const tc = cases[i];
      await db.prepare(`
        INSERT INTO test_run_items (test_run_id, test_case_id, order_index, status)
        VALUES (?, ?, ?, 'not_run')
      `).run(testRunId, tc.id, i + 1);
    }

    await logActivity(db, 'created', 'test_run', testRunId, name.trim(), `Created Test Run: ${name.trim()} (${cases.length} cases)`);

    return NextResponse.json({
      id: testRunId,
      name: name.trim(),
      environment: environment || 'STG',
      total_cases: cases.length,
      status: 'in_progress',
    }, { status: 201 });
  } catch (error) {
    console.error('Error creating test run:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
