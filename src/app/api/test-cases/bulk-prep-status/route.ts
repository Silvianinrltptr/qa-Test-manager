// src/app/api/test-cases/bulk-prep-status/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getDb, prisma } from '@/lib/db';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

const VALID_PREP_STATUSES = ['draft', 'in_progress', 'ready'] as const;
type PrepStatus = typeof VALID_PREP_STATUSES[number];

function buildActiveFilterWhere(filters: Record<string, any>) {
  const conditions: string[] = ["tc.lifecycle_status = 'active'"];
  const params: (string | number)[] = [];

  // If user selected a specific lifecycle other than 'active' and 'all',
  // then active cases in this filter must be 0.
  if (filters.lifecycle && filters.lifecycle !== 'active' && filters.lifecycle !== 'all') {
    conditions.push("1 = 0");
  }

  if (filters.moduleId && !isNaN(Number(filters.moduleId))) {
    conditions.push("tc.module_id = ?");
    params.push(Number(filters.moduleId));
  }
  if (filters.featureId && !isNaN(Number(filters.featureId))) {
    conditions.push("tc.feature_id = ?");
    params.push(Number(filters.featureId));
  }
  if (filters.priority) {
    conditions.push("tc.priority = ?");
    params.push(filters.priority);
  }
  if (filters.prepStatus) {
    conditions.push("tc.prep_status = ?");
    params.push(filters.prepStatus);
  }
  if (filters.execStatus) {
    conditions.push("tc.exec_status = ?");
    params.push(filters.execStatus);
  }
  if (filters.latestResult) {
    conditions.push("tc.latest_result = ?");
    params.push(filters.latestResult);
  }
  if (filters.testType) {
    conditions.push("tc.test_type = ?");
    params.push(filters.testType);
  }
  if (filters.search) {
    conditions.push("(tc.case_id LIKE ? OR tc.title LIKE ? OR tc.requirement_ref LIKE ? OR tct_id.title LIKE ? OR tct_en.title LIKE ?)");
    params.push(`%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`, `%${filters.search}%`);
  }

  const where = "WHERE " + conditions.join(" AND ");
  return { where, params };
}

// GET: Preview bulk update impact before confirming
export async function GET(req: NextRequest) {
  try {
    const { errorResponse } = await requireAuth(req, ['qa']);
    if (errorResponse) return errorResponse;

    const db = getDb();
    const { searchParams } = new URL(req.url);

    const filters = {
      lifecycle: searchParams.get('lifecycle') || 'active',
      moduleId: searchParams.get('moduleId') || '',
      featureId: searchParams.get('featureId') || '',
      priority: searchParams.get('priority') || '',
      prepStatus: searchParams.get('prepStatus') || '',
      execStatus: searchParams.get('execStatus') || '',
      latestResult: searchParams.get('latestResult') || '',
      testType: searchParams.get('testType') || '',
      search: searchParams.get('search') || '',
    };

    const newStatusParam = searchParams.get('newStatus') || '';
    const newStatus = VALID_PREP_STATUSES.includes(newStatusParam as PrepStatus)
      ? (newStatusParam as PrepStatus)
      : null;

    const { where, params } = buildActiveFilterWhere(filters);

    const rawRows = (await db.prepare(`
      SELECT tc.id, tc.case_id, tc.title, tc.prep_status, tc.lifecycle_status,
             m.name as module_name, f.name as feature_name
      FROM test_cases tc
      JOIN modules m ON m.id = tc.module_id
      JOIN features f ON f.id = tc.feature_id
      LEFT JOIN test_case_translations tct_id ON tct_id.test_case_id = tc.id AND tct_id.language = 'id'
      LEFT JOIN test_case_translations tct_en ON tct_en.test_case_id = tc.id AND tct_en.language = 'en'
      ${where}
      ORDER BY m.name ASC, f.name ASC, tc.case_id ASC
    `).all(...params)) as any[];

    const matchingActiveCases = rawRows || [];
    const totalMatching = matchingActiveCases.length;

    // Calculate current distribution
    const distribution = {
      draft: 0,
      in_progress: 0,
      ready: 0,
    };

    for (const c of matchingActiveCases) {
      const s = c.prep_status || 'draft';
      if (s in distribution) {
        distribution[s as keyof typeof distribution]++;
      } else {
        distribution.draft++;
      }
    }

    let casesToUpdate = 0;
    let alreadyInTarget = 0;

    if (newStatus) {
      for (const c of matchingActiveCases) {
        if (c.prep_status === newStatus) {
          alreadyInTarget++;
        } else {
          casesToUpdate++;
        }
      }
    }

    const affectedCases = matchingActiveCases.map(c => ({
      id: c.id,
      case_id: c.case_id,
      module_name: c.module_name,
      feature_name: c.feature_name,
      current_prep_status: c.prep_status,
      new_prep_status: newStatus || c.prep_status,
      will_change: newStatus ? c.prep_status !== newStatus : false,
    }));

    return NextResponse.json({
      total_matching_active: totalMatching,
      distribution,
      new_status: newStatus,
      cases_to_update: casesToUpdate,
      already_in_target: alreadyInTarget,
      affected_cases: affectedCases,
      sample_cases: affectedCases.slice(0, 10),
    });
  } catch (error) {
    console.error('Failed to preview bulk preparation update:', error);
    return NextResponse.json({ error: 'Internal server error previewing bulk update' }, { status: 500 });
  }
}

// POST: Execute bulk update of preparation status within a transaction
export async function POST(req: NextRequest) {
  try {
    const { errorResponse } = await requireAuth(req, ['qa']);
    if (errorResponse) return errorResponse;

    const db = getDb();
    const body = await req.json();
    const { filters = {}, newStatus, reason } = body;

    if (!newStatus || !VALID_PREP_STATUSES.includes(newStatus)) {
      return NextResponse.json({
        error: 'INVALID_STATUS',
        message: `Invalid new status. Must be one of: ${VALID_PREP_STATUSES.join(', ')}`,
      }, { status: 400 });
    }

    // 1. Re-query all matching active test cases based on latest filters
    const { where, params } = buildActiveFilterWhere(filters);

    const rawRows = (await db.prepare(`
      SELECT tc.id, tc.case_id, tc.title, tc.prep_status, tc.lifecycle_status,
             m.name as module_name, f.name as feature_name
      FROM test_cases tc
      JOIN modules m ON m.id = tc.module_id
      JOIN features f ON f.id = tc.feature_id
      LEFT JOIN test_case_translations tct_id ON tct_id.test_case_id = tc.id AND tct_id.language = 'id'
      LEFT JOIN test_case_translations tct_en ON tct_en.test_case_id = tc.id AND tct_en.language = 'en'
      ${where}
      ORDER BY m.name ASC, f.name ASC, tc.case_id ASC
    `).all(...params)) as any[];

    const matchingActiveCases = rawRows || [];
    const casesToUpdate = matchingActiveCases.filter(tc => tc.prep_status !== newStatus);
    const alreadyInTarget = matchingActiveCases.length - casesToUpdate.length;

    if (casesToUpdate.length === 0) {
      return NextResponse.json({
        success: true,
        updated_count: 0,
        already_in_target: alreadyInTarget,
        total_matching_active: matchingActiveCases.length,
        message: 'No test cases needed updating; all matching cases already have the target status.',
      });
    }

    const bulkOpId = `BULK-PREP-${Date.now()}`;
    const targetIds = casesToUpdate.map(tc => tc.id);

    // 2. Perform atomic database transaction
    await prisma.$transaction(async (tx) => {
      // Update only prep_status for active cases
      await tx.testCase.updateMany({
        where: {
          id: { in: targetIds },
          lifecycleStatus: 'active',
        },
        data: {
          prepStatus: newStatus,
        },
      });

      // Insert change log for each updated testcase
      const changeLogsData = casesToUpdate.map(tc => ({
        entityType: 'test_case',
        entityId: tc.id,
        entityRef: tc.case_id,
        changeType: 'updated',
        changedFields: 'prep_status',
        oldValues: JSON.stringify({
          prep_status: tc.prep_status,
          module: tc.module_name,
          feature: tc.feature_name,
        }),
        newValues: JSON.stringify({
          prep_status: newStatus,
          module: tc.module_name,
          feature: tc.feature_name,
        }),
        reason: reason || 'Bulk Update Preparation Status',
        requirementRef: bulkOpId,
      }));

      await tx.changeLog.createMany({
        data: changeLogsData,
      });

      // Record in activity_log
      await tx.activityLog.create({
        data: {
          action: 'bulk_update_prep_status',
          entityType: 'test_case',
          entityRef: bulkOpId,
          description: `Bulk updated preparation status of ${casesToUpdate.length} test case(s) to ${newStatus} based on active filters`,
        },
      });
    });

    return NextResponse.json({
      success: true,
      updated_count: casesToUpdate.length,
      already_in_target: alreadyInTarget,
      total_matching_active: matchingActiveCases.length,
      bulk_operation_id: bulkOpId,
      new_status: newStatus,
    });
  } catch (error) {
    console.error('Failed to execute bulk update preparation status:', error);
    return NextResponse.json({
      error: 'TRANSACTION_FAILED',
      message: 'Failed to execute bulk update preparation status. Changes have been rolled back.',
    }, { status: 500 });
  }
}
