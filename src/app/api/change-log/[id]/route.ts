import { getDb, prisma } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { errorResponse } = await requireAuth(req, ['qa']);
    if (errorResponse) return errorResponse;

    const { id } = await params;
    const logId = Number(id);
    if (!logId || isNaN(logId)) {
      return NextResponse.json({ error: 'Invalid change log ID' }, { status: 400 });
    }

    const db = getDb();
    const log = (await db.prepare('SELECT * FROM change_log WHERE id = ?').get(logId)) as any;
    if (!log) {
      return NextResponse.json({ error: 'Change log entry not found' }, { status: 404 });
    }

    let testCase: any = null;
    let executions: any[] = [];
    let translations: any[] = [];
    let historyLogs: any[] = [];
    let deleteClassification = {
      is_delete: false,
      delete_type: 'none',
      badge_label: log.change_type,
      can_restore: false,
      reason_description: '',
    };

    if (log.entity_type === 'test_case' && log.entity_id) {
      // 1. Fetch live test case from database
      testCase = (await db.prepare(`
        SELECT tc.*, m.name as module_name, m.prefix as module_prefix, f.name as feature_name
        FROM test_cases tc
        LEFT JOIN modules m ON m.id = tc.module_id
        LEFT JOIN features f ON f.id = tc.feature_id
        WHERE tc.id = ?
      `).get(log.entity_id)) as any;

      // Fallback lookup by entity_ref (case_id) if id was somehow modified
      if (!testCase && log.entity_ref) {
        testCase = (await db.prepare(`
          SELECT tc.*, m.name as module_name, m.prefix as module_prefix, f.name as feature_name
          FROM test_cases tc
          LEFT JOIN modules m ON m.id = tc.module_id
          LEFT JOIN features f ON f.id = tc.feature_id
          WHERE tc.case_id = ?
        `).get(log.entity_ref)) as any;
      }

      // If test case exists in DB, fetch executions, translations, and all change logs for it
      if (testCase) {
        executions = (await db.prepare(`
          SELECT * FROM executions WHERE test_case_id = ? ORDER BY exec_date DESC
        `).all(testCase.id)) as any[];

        translations = (await db.prepare(`
          SELECT * FROM test_case_translations WHERE test_case_id = ? ORDER BY language ASC
        `).all(testCase.id)) as any[];

        historyLogs = (await db.prepare(`
          SELECT * FROM change_log 
          WHERE entity_type = 'test_case' AND (entity_id = ? OR entity_ref = ?)
          ORDER BY changed_at ASC
        `).all(testCase.id, testCase.case_id)) as any[];
      } else {
        // Fallback: extract snapshot from old_values / new_values if row not found in test_cases
        try {
          const parsedOld = log.old_values ? JSON.parse(log.old_values) : null;
          if (parsedOld && parsedOld.title) {
            testCase = {
              id: log.entity_id,
              case_id: log.entity_ref,
              ...parsedOld,
              is_snapshot_fallback: true,
            };
          }
        } catch {}
      }

      // 2. Classify whether this log entry originated from a Delete activity
      if (log.change_type === 'archived') {
        // Row Delete soft-deletes test cases to 'archived'
        deleteClassification = {
          is_delete: true,
          delete_type: 'row_delete',
          badge_label: 'Deleted (Row Delete - Archived)',
          can_restore: Boolean(testCase && testCase.lifecycle_status === 'archived'),
          reason_description: log.reason || 'Test case deleted via row-level Delete action and archived',
        };
      } else if (log.change_type === 'obsolete') {
        // Determine whether this obsolete change was caused by Bulk Delete vs normal lifecycle edit
        const hasBulkReason = Boolean(log.reason && log.reason.toLowerCase().includes('bulk'));
        const hasBulkRef = Boolean(log.requirement_ref && log.requirement_ref.toLowerCase().includes('bulk'));

        // Check if multiple test cases were obsoleted within a 5-second window (bulk operation cluster)
        let isCluster = false;
        if (!hasBulkReason && !hasBulkRef) {
          const logDate = new Date(log.changed_at);
          const windowStart = new Date(logDate.getTime() - 5000);
          const windowEnd = new Date(logDate.getTime() + 5000);
          const clusterCount = await prisma.changeLog.count({
            where: {
              changeType: 'obsolete',
              id: { not: log.id },
              changedAt: { gte: windowStart, lte: windowEnd }
            }
          });
          isCluster = clusterCount > 0;
        }

        if (hasBulkReason || hasBulkRef || isCluster) {
          deleteClassification = {
            is_delete: true,
            delete_type: 'bulk_delete',
            badge_label: 'Deleted (Bulk Delete - Obsolete)',
            can_restore: Boolean(testCase && testCase.lifecycle_status === 'obsolete'),
            reason_description: log.reason || 'Test case obsoleted via Bulk Delete action',
          };
        } else {
          deleteClassification = {
            is_delete: false,
            delete_type: 'unverified',
            badge_label: 'Obsolete (Perlu Verifikasi)',
            can_restore: Boolean(testCase && (testCase.lifecycle_status === 'obsolete' || testCase.lifecycle_status === 'archived')),
            reason_description: 'Test case marked obsolete via normal lifecycle change. Ready for recovery to Active upon confirmation.',
          };
        }
      } else if (log.change_type === 'restored') {
        deleteClassification = {
          is_delete: false,
          delete_type: 'restore',
          badge_label: 'Restored to Active',
          can_restore: false,
          reason_description: log.reason || 'Test case recovered and restored to Active status',
        };
      } else if (log.change_type === 'created') {
        deleteClassification = {
          is_delete: false,
          delete_type: 'create',
          badge_label: 'Created',
          can_restore: false,
          reason_description: 'Test case created',
        };
      } else if (log.change_type === 'updated') {
        deleteClassification = {
          is_delete: false,
          delete_type: 'update',
          badge_label: 'Updated',
          can_restore: false,
          reason_description: log.reason || 'Test case updated',
        };
      }

      // If the test case is currently obsolete or archived in the DB, allow restoring to Active
      if (testCase && (testCase.lifecycle_status === 'obsolete' || testCase.lifecycle_status === 'archived')) {
        deleteClassification.can_restore = true;
      }
    }

    return NextResponse.json({
      log,
      deleteClassification,
      testCase,
      executions,
      translations,
      historyLogs,
    });
  } catch (error) {
    console.error('Failed to get change log detail:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
