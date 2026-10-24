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

    const total = (db.prepare('SELECT COUNT(*) as count FROM weekly_snapshots').get() as { count: number }).count;
    const snapshots = db.prepare('SELECT * FROM weekly_snapshots ORDER BY week_start DESC LIMIT ? OFFSET ?').all(limit, offset);

    return NextResponse.json({ data: snapshots, pagination: { total, page, limit, totalPages: Math.ceil(total / limit) } });
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
    const totalActive = (db.prepare(`SELECT COUNT(*) as count FROM test_cases WHERE lifecycle_status = 'active'`).get() as { count: number }).count;

    const prepRow = db.prepare(`
      SELECT SUM(CASE WHEN prep_status = 'ready' THEN 1 ELSE 0 END) as ready, COUNT(*) as total
      FROM test_cases WHERE lifecycle_status = 'active'
    `).get() as { ready: number; total: number };

    const execRow = db.prepare(`
      SELECT SUM(CASE WHEN exec_status = 'executed' THEN 1 ELSE 0 END) as executed, COUNT(*) as ready_total
      FROM test_cases WHERE lifecycle_status = 'active' AND prep_status = 'ready'
    `).get() as { executed: number; ready_total: number };

    const results = db.prepare(`
      SELECT
        SUM(CASE WHEN latest_result = 'pass' THEN 1 ELSE 0 END) as pass,
        SUM(CASE WHEN latest_result = 'fail' THEN 1 ELSE 0 END) as fail,
        SUM(CASE WHEN latest_result = 'blocked' THEN 1 ELSE 0 END) as blocked,
        SUM(CASE WHEN latest_result = 'not_run' THEN 1 ELSE 0 END) as not_run
      FROM test_cases WHERE lifecycle_status = 'active'
    `).get() as { pass: number; fail: number; blocked: number; not_run: number };

    const weeklyChanges = db.prepare(`
      SELECT
        SUM(CASE WHEN change_type = 'created' THEN 1 ELSE 0 END) as added,
        SUM(CASE WHEN change_type = 'updated' THEN 1 ELSE 0 END) as updated,
        SUM(CASE WHEN change_type = 'obsolete' THEN 1 ELSE 0 END) as obsolete,
        SUM(CASE WHEN change_type = 'reactivated' THEN 1 ELSE 0 END) as reactivated
      FROM change_log
      WHERE entity_type = 'test_case' AND changed_at BETWEEN ? AND ?
    `).get(week_start, week_end) as { added: number; updated: number; obsolete: number; reactivated: number };

    const execDuringWeek = (db.prepare(`
      SELECT COUNT(*) as count FROM executions WHERE exec_date BETWEEN ? AND ?
    `).get(week_start, week_end) as { count: number }).count;

    const passTotal = (results.pass || 0) + (results.fail || 0);

    const snapshotData = {
      totalActive,
      prepProgress: {
        ready: prepRow.ready || 0, total: prepRow.total || 0,
        pct: prepRow.total > 0 ? Math.round(((prepRow.ready || 0) / prepRow.total) * 100) : null
      },
      execProgress: {
        executed: execRow.executed || 0, readyTotal: execRow.ready_total || 0,
        pct: execRow.ready_total > 0 ? Math.round(((execRow.executed || 0) / execRow.ready_total) * 100) : null
      },
      results: { pass: results.pass || 0, fail: results.fail || 0, blocked: results.blocked || 0, not_run: results.not_run || 0 },
      passRate: { pass: results.pass || 0, total: passTotal, pct: passTotal > 0 ? Math.round(((results.pass || 0) / passTotal) * 100) : null },
      weeklyChanges: { added: weeklyChanges.added || 0, updated: weeklyChanges.updated || 0, obsolete: weeklyChanges.obsolete || 0, reactivated: weeklyChanges.reactivated || 0 },
      execDuringWeek,
    };

    const result = db.prepare(`
      INSERT INTO weekly_snapshots (week_start, week_end, snapshot_data, notes, activities, next_priorities)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(week_start, week_end, JSON.stringify(snapshotData), notes || null, activities || null, next_priorities || null);

    const snapshot = db.prepare('SELECT * FROM weekly_snapshots WHERE id = ?').get(result.lastInsertRowid);
    return NextResponse.json(snapshot, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
