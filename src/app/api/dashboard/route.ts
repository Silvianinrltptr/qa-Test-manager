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
    const totalActiveRow = (await db.prepare(`SELECT COUNT(*) as count FROM test_cases WHERE lifecycle_status = 'active'`).get()) as { count: number } | undefined;
    const totalActive = totalActiveRow ? Number(totalActiveRow.count) : 0;

    // By module
    const byModuleRaw = await db.prepare(`
      SELECT m.name as module, m.prefix, 
        COUNT(tc.id) as total,
        COUNT(CASE WHEN tc.prep_status = 'ready' THEN 1 END) as ready,
        COUNT(CASE WHEN tc.prep_status = 'ready' AND (tc.exec_status = 'executed' OR tc.latest_result IN ('pass', 'fail', 'blocked')) THEN 1 END) as executed,
        COUNT(CASE WHEN tc.prep_status = 'ready' AND tc.latest_result = 'pass' THEN 1 END) as pass,
        COUNT(CASE WHEN tc.prep_status = 'ready' AND tc.latest_result = 'fail' THEN 1 END) as fail,
        COUNT(CASE WHEN tc.prep_status = 'ready' AND tc.latest_result = 'blocked' THEN 1 END) as blocked
      FROM modules m
      LEFT JOIN test_cases tc ON tc.module_id = m.id AND tc.lifecycle_status = 'active'
      WHERE m.status = 'active' OR m.id IN (SELECT DISTINCT module_id FROM test_cases WHERE lifecycle_status = 'active')
      GROUP BY m.id
      ORDER BY m.name
    `).all();

    const byModule = (byModuleRaw || []).map((mod: any) => {
      const total = Number(mod.total) || 0;
      const ready = Number(mod.ready) || 0;
      const executed = Number(mod.executed) || 0;
      const pass = Number(mod.pass) || 0;
      const fail = Number(mod.fail) || 0;
      const blocked = Number(mod.blocked) || 0;
      const not_run = Math.max(0, ready - executed);
      const unclassified = Math.max(0, executed - (pass + fail + blocked));
      return {
        module: mod.module,
        prefix: mod.prefix,
        total,
        ready,
        executed,
        pass,
        fail,
        blocked,
        not_run,
        unclassified,
      };
    });

    // Prep progress
    const prepRow = ((await db.prepare(`
      SELECT 
        COUNT(CASE WHEN prep_status = 'ready' THEN 1 END) as ready,
        COUNT(*) as total
      FROM test_cases WHERE lifecycle_status = 'active'
    `).get()) as { ready: number; total: number } | undefined) || { ready: 0, total: 0 };

    // Exec progress (of ready cases)
    const execRow = ((await db.prepare(`
      SELECT 
        COUNT(CASE WHEN tc.prep_status = 'ready' AND (tc.exec_status = 'executed' OR tc.latest_result IN ('pass', 'fail', 'blocked')) THEN 1 END) as executed,
        COUNT(CASE WHEN tc.prep_status = 'ready' THEN 1 END) as ready_total
      FROM test_cases tc WHERE tc.lifecycle_status = 'active'
    `).get()) as { executed: number; ready_total: number } | undefined) || { executed: 0, ready_total: 0 };

    // Results (Pass, Fail, Blocked on active cases)
    const resultsRow = ((await db.prepare(`
      SELECT
        COUNT(CASE WHEN tc.prep_status = 'ready' AND tc.latest_result = 'pass' THEN 1 END) as pass,
        COUNT(CASE WHEN tc.prep_status = 'ready' AND tc.latest_result = 'fail' THEN 1 END) as fail,
        COUNT(CASE WHEN tc.prep_status = 'ready' AND tc.latest_result = 'blocked' THEN 1 END) as blocked
      FROM test_cases tc WHERE tc.lifecycle_status = 'active'
    `).get()) as { pass: number; fail: number; blocked: number } | undefined) || { pass: 0, fail: 0, blocked: 0 };

    const totalReady = Number(prepRow.ready) || 0;
    const totalExecuted = Number(execRow.executed) || 0;
    const totalNotRun = Math.max(0, totalReady - totalExecuted);
    const passCount = Number(resultsRow.pass) || 0;
    const failCount = Number(resultsRow.fail) || 0;
    const blockedCount = Number(resultsRow.blocked) || 0;
    const totalUnclassified = Math.max(0, totalExecuted - (passCount + failCount + blockedCount));

    // Pass rate: Pass / (Pass + Fail) * 100%. Blocked and Not Run excluded from denominator.
    const passTotal = passCount + failCount;

    // Not ready
    const notReadyRow = (await db.prepare(`
      SELECT COUNT(*) as count FROM test_cases 
      WHERE lifecycle_status = 'active' AND prep_status != 'ready'
    `).get()) as { count: number } | undefined;
    const notReady = notReadyRow ? Number(notReadyRow.count) : 0;

    // Recent activity
    const recentActivity = await db.prepare(`
      SELECT * FROM activity_log ORDER BY created_at DESC LIMIT 10
    `).all();

    // Weekly change (last 7 days)
    const weeklyChangeRow = (await db.prepare(`
      SELECT
        COUNT(CASE WHEN change_type = 'created' THEN 1 END) as added,
        COUNT(CASE WHEN change_type = 'updated' THEN 1 END) as updated,
        COUNT(CASE WHEN change_type = 'obsolete' THEN 1 END) as obsolete,
        COUNT(CASE WHEN change_type = 'reactivated' THEN 1 END) as reactivated
      FROM change_log
      WHERE entity_type = 'test_case' AND changed_at >= (NOW() - INTERVAL '7 days')
    `).get()) as { added: number; updated: number; obsolete: number; reactivated: number } | undefined;

    const weeklyChange = weeklyChangeRow || { added: 0, updated: 0, obsolete: 0, reactivated: 0 };

    return NextResponse.json({
      totalActive,
      byModule,
      prepProgress: {
        ready: totalReady,
        total: Number(prepRow.total) || 0,
        pct: Number(prepRow.total) > 0 ? Math.round((totalReady / Number(prepRow.total)) * 100) : null,
      },
      execProgress: {
        executed: totalExecuted,
        readyTotal: totalReady,
        pct: totalReady > 0 ? Math.round((totalExecuted / totalReady) * 100) : null,
      },
      results: {
        pass: passCount,
        fail: failCount,
        blocked: blockedCount,
        not_run: totalNotRun,
        unclassified: totalUnclassified,
      },
      passRate: {
        pass: passCount,
        total: passTotal,
        pct: passTotal > 0 ? Math.round((passCount / passTotal) * 100) : null,
      },
      notReady,
      recentActivity: recentActivity || [],
      weeklyChange: {
        added: Number(weeklyChange.added) || 0,
        updated: Number(weeklyChange.updated) || 0,
        obsolete: Number(weeklyChange.obsolete) || 0,
        reactivated: Number(weeklyChange.reactivated) || 0,
      },
    });
  } catch (error) {
    console.error('Dashboard error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
