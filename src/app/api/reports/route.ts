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

    const period = searchParams.get('period') || 'weekly'; // daily, weekly, monthly, custom
    let startDate = searchParams.get('startDate');
    let endDate = searchParams.get('endDate');
    const moduleId = searchParams.get('moduleId');
    const featureId = searchParams.get('featureId');

    const now = new Date();
    const fmt = (d: Date) => d.toISOString().split('T')[0];

    if (!startDate || !endDate) {
      if (period === 'daily') {
        startDate = fmt(now);
        endDate = fmt(now);
      } else if (period === 'weekly') {
        const d = new Date(now);
        d.setDate(d.getDate() - 7);
        startDate = fmt(d);
        endDate = fmt(now);
      } else if (period === 'monthly') {
        const d = new Date(now);
        d.setDate(d.getDate() - 30);
        startDate = fmt(d);
        endDate = fmt(now);
      } else {
        startDate = fmt(now);
        endDate = fmt(now);
      }
    }

    // 1. Current totals (Current State)
    const activeRow = (await db.prepare(`
      SELECT COUNT(*) as count FROM test_cases WHERE lifecycle_status = 'active'
    `).get()) as { count: number } | undefined;
    const currentActive = activeRow ? Number(activeRow.count) : 0;

    const readyRow = (await db.prepare(`
      SELECT COUNT(*) as count FROM test_cases WHERE lifecycle_status = 'active' AND prep_status = 'ready'
    `).get()) as { count: number } | undefined;
    const currentReady = readyRow ? Number(readyRow.count) : 0;

    const obsoleteRow = (await db.prepare(`
      SELECT COUNT(*) as count FROM test_cases WHERE lifecycle_status = 'obsolete'
    `).get()) as { count: number } | undefined;
    const currentObsolete = obsoleteRow ? Number(obsoleteRow.count) : 0;

    // 2. Executions during selected period
    const startIso = `${startDate} 00:00:00`;
    const endIso = `${endDate} 23:59:59`;

    const execConditions: string[] = ['e.exec_date >= ?', 'e.exec_date <= ?'];
    const execParams: (string | number | Date)[] = [new Date(startIso), new Date(endIso)];

    if (moduleId) {
      execConditions.push('tc.module_id = ?');
      execParams.push(Number(moduleId));
    }
    if (featureId) {
      execConditions.push('tc.feature_id = ?');
      execParams.push(Number(featureId));
    }

    const execWhere = 'WHERE ' + execConditions.join(' AND ');

    const periodExecutions = ((await db.prepare(`
      SELECT e.*, tc.case_id, tc.title, tc.priority, tc.test_type,
             m.name as module_name, f.name as feature_name
      FROM executions e
      JOIN test_cases tc ON tc.id = e.test_case_id
      LEFT JOIN modules m ON m.id = tc.module_id
      LEFT JOIN features f ON f.id = tc.feature_id
      ${execWhere}
      ORDER BY e.exec_date DESC
    `).all(...execParams)) as any[]) || [];

    // Calculate period results
    let passCount = 0;
    let failCount = 0;
    let blockedCount = 0;
    let retestCount = 0;

    for (const ex of periodExecutions) {
      if (ex.result === 'pass') passCount++;
      else if (ex.result === 'fail') failCount++;
      else if (ex.result === 'blocked') blockedCount++;
      if (ex.is_retest) retestCount++;
    }

    const totalExecutedInPeriod = periodExecutions.length;
    const evaluatedTotal = passCount + failCount;
    const periodPassRate = evaluatedTotal > 0 ? Math.round((passCount / evaluatedTotal) * 100) : null;

    // 3. Changes during period (from change_log)
    const changeStats = (await db.prepare(`
      SELECT
        COUNT(CASE WHEN change_type = 'created' AND entity_type = 'test_case' THEN 1 END) as tc_created,
        COUNT(CASE WHEN change_type = 'updated' AND entity_type = 'test_case' THEN 1 END) as tc_updated,
        COUNT(CASE WHEN change_type = 'obsolete' AND entity_type = 'test_case' THEN 1 END) as tc_obsolete,
        COUNT(CASE WHEN entity_type = 'requirement' THEN 1 END) as req_changes
      FROM change_log
      WHERE changed_at >= ? AND changed_at <= ?
    `).get(new Date(startIso), new Date(endIso))) as {
      tc_created: number | null;
      tc_updated: number | null;
      tc_obsolete: number | null;
      req_changes: number | null;
    } | undefined;

    // 4. Defects reported during period
    const defects = periodExecutions
      .filter(e => e.defect_ref && String(e.defect_ref).trim() !== '')
      .map(e => ({
        defect_ref: e.defect_ref,
        case_id: e.case_id,
        title: e.title,
        result: e.result,
        environment: e.environment,
        exec_date: e.exec_date,
        notes: e.notes,
        actual_result: e.actual_result,
      }));

    // 5. Execution distribution by module during period
    const byModuleMap: Record<string, { module: string; total: number; pass: number; fail: number; blocked: number }> = {};
    for (const ex of periodExecutions) {
      const mod = ex.module_name || 'Tanpa Modul';
      if (!byModuleMap[mod]) {
        byModuleMap[mod] = { module: mod, total: 0, pass: 0, fail: 0, blocked: 0 };
      }
      byModuleMap[mod].total++;
      if (ex.result === 'pass') byModuleMap[mod].pass++;
      else if (ex.result === 'fail') byModuleMap[mod].fail++;
      else if (ex.result === 'blocked') byModuleMap[mod].blocked++;
    }

    return NextResponse.json({
      period,
      startDate,
      endDate,
      currentTotals: {
        active: currentActive,
        ready: currentReady,
        obsolete: currentObsolete,
      },
      periodMetrics: {
        totalExecutions: totalExecutedInPeriod,
        pass: passCount,
        fail: failCount,
        blocked: blockedCount,
        passRate: periodPassRate,
        retests: retestCount,
        tcCreated: Number(changeStats?.tc_created) || 0,
        tcUpdated: Number(changeStats?.tc_updated) || 0,
        tcObsolete: Number(changeStats?.tc_obsolete) || 0,
        reqChanges: Number(changeStats?.req_changes) || 0,
      },
      byModule: Object.values(byModuleMap),
      defects,
      executions: periodExecutions,
    });
  } catch (error) {
    console.error('Reports API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
