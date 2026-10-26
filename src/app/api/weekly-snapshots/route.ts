import { getDb } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { errorResponse } = await requireAuth(req, ['qa', 'dev_pm']);
    if (errorResponse) return errorResponse;

    const db = getDb();
    const { searchParams } = new URL(req.url);
    const page = Number(searchParams.get('page') ?? '1');
    const limit = Number(searchParams.get('limit') ?? '10');
    const offset = (page - 1) * limit;

    const totalRow = (await db.prepare('SELECT COUNT(*) as count FROM weekly_snapshots').get()) as { count: number } | undefined;
    const total = totalRow ? Number(totalRow.count) : 0;
    const snapshots = await db.prepare('SELECT * FROM weekly_snapshots ORDER BY week_start DESC LIMIT ? OFFSET ?').all(limit, offset);

    return NextResponse.json({ data: snapshots || [], pagination: { total, page, limit, totalPages: Math.ceil(total / limit) || 1 } });
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
    const { week_start, week_end, notes, activities, next_priorities } = body;

    if (!week_start || !week_end) {
      return NextResponse.json({ error: 'week_start and week_end required' }, { status: 400 });
    }

    // Calculate live snapshot data
    const totalActiveRow = (await db.prepare(`SELECT COUNT(*) as count FROM test_cases WHERE lifecycle_status = 'active'`).get()) as { count: number } | undefined;
    const totalActive = totalActiveRow ? Number(totalActiveRow.count) : 0;

    const prepRow = ((await db.prepare(`
      SELECT COUNT(CASE WHEN prep_status = 'ready' THEN 1 END) as ready, COUNT(*) as total
      FROM test_cases WHERE lifecycle_status = 'active'
    `).get()) as { ready: number; total: number } | undefined) || { ready: 0, total: 0 };

    const execRow = ((await db.prepare(`
      SELECT COUNT(CASE WHEN exec_status = 'executed' THEN 1 END) as executed, COUNT(*) as ready_total
      FROM test_cases WHERE lifecycle_status = 'active' AND prep_status = 'ready'
    `).get()) as { executed: number; ready_total: number } | undefined) || { executed: 0, ready_total: 0 };

    const results = ((await db.prepare(`
      SELECT
        COUNT(CASE WHEN latest_result = 'pass' THEN 1 END) as pass,
        COUNT(CASE WHEN latest_result = 'fail' THEN 1 END) as fail,
        COUNT(CASE WHEN latest_result = 'blocked' THEN 1 END) as blocked,
        COUNT(CASE WHEN latest_result = 'not_run' THEN 1 END) as not_run
      FROM test_cases WHERE lifecycle_status = 'active'
    `).get()) as { pass: number; fail: number; blocked: number; not_run: number } | undefined) || { pass: 0, fail: 0, blocked: 0, not_run: 0 };

    const weeklyChanges = ((await db.prepare(`
      SELECT
        COUNT(CASE WHEN change_type = 'created' THEN 1 END) as added,
        COUNT(CASE WHEN change_type = 'updated' THEN 1 END) as updated,
        COUNT(CASE WHEN change_type = 'obsolete' THEN 1 END) as obsolete,
        COUNT(CASE WHEN change_type = 'reactivated' THEN 1 END) as reactivated
      FROM change_log
      WHERE entity_type = 'test_case' AND changed_at BETWEEN ? AND ?
    `).get(new Date(week_start), new Date(week_end))) as { added: number; updated: number; obsolete: number; reactivated: number } | undefined) || { added: 0, updated: 0, obsolete: 0, reactivated: 0 };

    const execDuringWeekRow = (await db.prepare(`
      SELECT COUNT(*) as count FROM executions WHERE exec_date BETWEEN ? AND ?
    `).get(new Date(week_start), new Date(week_end))) as { count: number } | undefined;
    const execDuringWeek = execDuringWeekRow ? Number(execDuringWeekRow.count) : 0;

    const passTotal = (Number(results.pass) || 0) + (Number(results.fail) || 0);

    const snapshotData = {
      totalActive,
      prepProgress: {
        ready: Number(prepRow.ready) || 0, total: Number(prepRow.total) || 0,
        pct: Number(prepRow.total) > 0 ? Math.round(((Number(prepRow.ready) || 0) / Number(prepRow.total)) * 100) : null
      },
      execProgress: {
        executed: Number(execRow.executed) || 0, readyTotal: Number(execRow.ready_total) || 0,
        pct: Number(execRow.ready_total) > 0 ? Math.round(((Number(execRow.executed) || 0) / Number(execRow.ready_total)) * 100) : null
      },
      results: { pass: Number(results.pass) || 0, fail: Number(results.fail) || 0, blocked: Number(results.blocked) || 0, not_run: Number(results.not_run) || 0 },
      passRate: { pass: Number(results.pass) || 0, total: passTotal, pct: passTotal > 0 ? Math.round(((Number(results.pass) || 0) / passTotal) * 100) : null },
      weeklyChanges: { added: Number(weeklyChanges.added) || 0, updated: Number(weeklyChanges.updated) || 0, obsolete: Number(weeklyChanges.obsolete) || 0, reactivated: Number(weeklyChanges.reactivated) || 0 },
      execDuringWeek,
    };

    const result = await db.prepare(`
      INSERT INTO weekly_snapshots (week_start, week_end, snapshot_data, notes, activities, next_priorities)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(new Date(week_start), new Date(week_end), JSON.stringify(snapshotData), notes || null, activities || null, next_priorities || null);

    const snapshot = await db.prepare('SELECT * FROM weekly_snapshots WHERE id = ?').get(result.lastInsertRowid);
    return NextResponse.json(snapshot, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
