import { getDb } from '@/lib/db';
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
    const logs = await db.prepare(`SELECT * FROM change_log ${where} ORDER BY changed_at DESC LIMIT ? OFFSET ?`).all(...params, limit, offset);

    return NextResponse.json({ data: logs || [], pagination: { total, page, limit, totalPages: Math.ceil(total / limit) || 1 } });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
