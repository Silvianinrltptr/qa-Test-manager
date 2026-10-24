import { getDb, logActivity, logChange } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { errorResponse } = await requireAuth(req, ['qa', 'dev_pm']);
    if (errorResponse) return errorResponse;

    const db = getDb();
    const { searchParams } = new URL(req.url);
    const testCaseId = searchParams.get('testCaseId');

    if (testCaseId) {
      const executions = db.prepare(`
        SELECT * FROM executions WHERE test_case_id = ? ORDER BY exec_date DESC
      `).all(Number(testCaseId));
      return NextResponse.json(executions);
    }

    // Recent executions
    const executions = db.prepare(`
      SELECT e.*, tc.case_id, tc.title, m.name as module_name, f.name as feature_name
      FROM executions e
      JOIN test_cases tc ON tc.id = e.test_case_id
      JOIN modules m ON m.id = tc.module_id
      JOIN features f ON f.id = tc.feature_id
      ORDER BY e.exec_date DESC
      LIMIT 50
    `).all();
    return NextResponse.json(executions);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { errorResponse } = await requireAuth(req, ['qa']);
    if (errorResponse) return errorResponse;

    const db = getDb();
    const body = await req.json();
    const { test_case_id, exec_date, environment, actual_result, result, evidence, defect_ref, notes, is_retest } = body;

    if (!test_case_id || !result) {
      return NextResponse.json({ error: 'test_case_id and result are required' }, { status: 400 });
    }

    const tc = db.prepare('SELECT * FROM test_cases WHERE id = ?').get(Number(test_case_id)) as { case_id: string; title: string } | undefined;
    if (!tc) return NextResponse.json({ error: 'Test case not found' }, { status: 404 });

    // Insert execution
    const execResult = db.prepare(`
      INSERT INTO executions (test_case_id, exec_date, environment, actual_result, result, evidence, defect_ref, notes, is_retest)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      Number(test_case_id),
      exec_date || new Date().toISOString(),
      environment || null, actual_result || null, result,
      evidence || null, defect_ref || null, notes || null, is_retest ? 1 : 0
    );

    // Update test case latest result and exec status
    db.prepare(`
      UPDATE test_cases 
      SET latest_result = ?, exec_status = 'executed', actual_result = ?, 
          defect_ref = COALESCE(?, defect_ref), updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(result, actual_result || null, defect_ref || null, Number(test_case_id));

    const execId = execResult.lastInsertRowid as number;
    logActivity(db, 'executed', 'test_case', Number(test_case_id), tc.case_id, `Execution: ${tc.case_id} → ${result.toUpperCase()}`);
    logChange(db, {
      entityType: 'test_case', entityId: Number(test_case_id), entityRef: tc.case_id,
      changeType: 'executed', newValues: { result, exec_date, environment }
    });

    const execution = db.prepare('SELECT * FROM executions WHERE id = ?').get(execId);
    return NextResponse.json(execution, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
