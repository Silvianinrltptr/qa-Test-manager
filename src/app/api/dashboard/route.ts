import { getDb } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { errorResponse } = await requireAuth(req, ['qa', 'dev_pm']);
    if (errorResponse) return errorResponse;

    const db = getDb();

    // Total active test cases
    const totalActive = (db.prepare(`SELECT COUNT(*) as count FROM test_cases WHERE lifecycle_status = 'active'`).get() as { count: number }).count;

    // By module
    const byModule = db.prepare(`
      SELECT m.name as module, m.prefix, 
        COUNT(tc.id) as total,
        SUM(CASE WHEN tc.prep_status = 'ready' THEN 1 ELSE 0 END) as ready,
        SUM(CASE WHEN tc.exec_status = 'executed' THEN 1 ELSE 0 END) as executed,
        SUM(CASE WHEN tc.latest_result = 'pass' THEN 1 ELSE 0 END) as pass,
        SUM(CASE WHEN tc.latest_result = 'fail' THEN 1 ELSE 0 END) as fail,
        SUM(CASE WHEN tc.latest_result = 'blocked' THEN 1 ELSE 0 END) as blocked
      FROM modules m
      LEFT JOIN test_cases tc ON tc.module_id = m.id AND tc.lifecycle_status = 'active'
      WHERE m.status = 'active'
      GROUP BY m.id
      ORDER BY m.name
    `).all();

    // Prep progress
    const prepRow = db.prepare(`
      SELECT 
        SUM(CASE WHEN prep_status = 'ready' THEN 1 ELSE 0 END) as ready,
        COUNT(*) as total
      FROM test_cases WHERE lifecycle_status = 'active'
    `).get() as { ready: number; total: number };

    // Exec progress (of ready cases)
    const execRow = db.prepare(`
      SELECT 
        SUM(CASE WHEN exec_status = 'executed' THEN 1 ELSE 0 END) as executed,
        COUNT(*) as ready_total
      FROM test_cases WHERE lifecycle_status = 'active' AND prep_status = 'ready'
    `).get() as { executed: number; ready_total: number };

    // Results
    const results = db.prepare(`
      SELECT
        SUM(CASE WHEN latest_result = 'pass' THEN 1 ELSE 0 END) as pass,
        SUM(CASE WHEN latest_result = 'fail' THEN 1 ELSE 0 END) as fail,
        SUM(CASE WHEN latest_result = 'blocked' THEN 1 ELSE 0 END) as blocked,
        SUM(CASE WHEN latest_result = 'not_run' THEN 1 ELSE 0 END) as not_run
      FROM test_cases WHERE lifecycle_status = 'active'
    `).get() as { pass: number; fail: number; blocked: number; not_run: number };

    // Not ready
    const notReady = (db.prepare(`
      SELECT COUNT(*) as count FROM test_cases 
      WHERE lifecycle_status = 'active' AND prep_status != 'ready'
    `).get() as { count: number }).count;

    // Recent activity
    const recentActivity = db.prepare(`
      SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 10
    `).all();

    // Weekly change (last 7 days)
    const weeklyChange = db.prepare(`
      SELECT
        SUM(CASE WHEN change_type = 'created' THEN 1 ELSE 0 END) as added,
        SUM(CASE WHEN change_type = 'updated' THEN 1 ELSE 0 END) as updated,
        SUM(CASE WHEN change_type = 'obsolete' THEN 1 ELSE 0 END) as obsolete,
        SUM(CASE WHEN change_type = 'reactivated' THEN 1 ELSE 0 END) as reactivated
      FROM change_log
      WHERE entity_type = 'test_case' AND changed_at >= datetime('now', '-7 days')
    `).get() as { added: number; updated: number; obsolete: number; reactivated: number };

    // Pass rate
    const passTotal = (results.pass || 0) + (results.fail || 0);

    return NextResponse.json({
      totalActive,
      byModule,
      prepProgress: {
        ready: prepRow.ready || 0,
        total: prepRow.total || 0,
        pct: prepRow.total > 0 ? Math.round(((prepRow.ready || 0) / prepRow.total) * 100) : null,
      },
      execProgress: {
        executed: execRow.executed || 0,
        readyTotal: execRow.ready_total || 0,
        pct: execRow.ready_total > 0 ? Math.round(((execRow.executed || 0) / execRow.ready_total) * 100) : null,
      },
      results: {
        pass: results.pass || 0,
        fail: results.fail || 0,
        blocked: results.blocked || 0,
        not_run: results.not_run || 0,
      },
      passRate: {
        pass: results.pass || 0,
        total: passTotal,
        pct: passTotal > 0 ? Math.round(((results.pass || 0) / passTotal) * 100) : null,
      },
      notReady,
      recentActivity,
      weeklyChange: {
        added: weeklyChange.added || 0,
        updated: weeklyChange.updated || 0,
        obsolete: weeklyChange.obsolete || 0,
        reactivated: weeklyChange.reactivated || 0,
      },
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
