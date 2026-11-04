import { getDb, prisma } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { errorResponse } = await requireAuth(req, ['qa']);
    if (errorResponse) return errorResponse;

    const db = getDb();
    const { searchParams } = new URL(req.url);
    const entityType = searchParams.get('entityType');
    const entityId = searchParams.get('entityId');
    const page = Number(searchParams.get('page') ?? '1');
    const limit = Number(searchParams.get('limit') ?? '30');
    const offset = (page - 1) * limit;

    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (entityType) { conditions.push('entity_type = ?'); params.push(entityType); }
    if (entityId) { conditions.push('entity_id = ?'); params.push(Number(entityId)); }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const totalRow = (await db.prepare(`SELECT COUNT(*) as count FROM change_log ${where}`).get(...params)) as { count: number } | undefined;
    const total = totalRow ? Number(totalRow.count) : 0;
    const logs = (await db.prepare(`SELECT * FROM change_log ${where} ORDER BY changed_at DESC LIMIT ? OFFSET ?`).all(...params, limit, offset)) as any[];

    const enhancedLogs = await Promise.all(
      (logs || []).map(async (log: any) => {
        let classification = {
          is_delete: false,
          delete_type: 'none',
          badge_label: log.change_type,
        };

        if (log.entity_type === 'test_case') {
          if (log.change_type === 'archived') {
            classification = {
              is_delete: true,
              delete_type: 'row_delete',
              badge_label: 'Deleted (Row Delete)',
            };
          } else if (log.change_type === 'obsolete') {
            const hasBulkReason = Boolean(log.reason && log.reason.toLowerCase().includes('bulk'));
            const hasBulkRef = Boolean(log.requirement_ref && log.requirement_ref.toLowerCase().includes('bulk'));
            let isCluster = false;
            if (!hasBulkReason && !hasBulkRef) {
              const logDate = new Date(log.changed_at);
              const windowStart = new Date(logDate.getTime() - 5000);
              const windowEnd = new Date(logDate.getTime() + 5000);
              const count = await prisma.changeLog.count({
                where: {
                  changeType: 'obsolete',
                  id: { not: log.id },
                  changedAt: { gte: windowStart, lte: windowEnd },
                },
              });
              isCluster = count > 0;
            }

            if (hasBulkReason || hasBulkRef || isCluster) {
              classification = {
                is_delete: true,
                delete_type: 'bulk_delete',
                badge_label: 'Deleted (Bulk Delete)',
              };
            } else {
              classification = {
                is_delete: false,
                delete_type: 'unverified',
                badge_label: 'Obsolete (Perlu Verifikasi)',
              };
            }
          } else if (log.change_type === 'restored') {
            classification = {
              is_delete: false,
              delete_type: 'restore',
              badge_label: 'Restored',
            };
          }
        }

        return {
          ...log,
          deleteClassification: classification,
        };
      })
    );

    return NextResponse.json({
      data: enhancedLogs,
      pagination: { total, page, limit, totalPages: Math.ceil(total / limit) || 1 }
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
