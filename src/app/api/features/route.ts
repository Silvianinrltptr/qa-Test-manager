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
    const moduleId = searchParams.get('moduleId');
    const includeArchived = searchParams.get('includeArchived') === 'true';

    let query = `
      SELECT f.*, m.name as module_name, m.prefix as module_prefix,
        COUNT(tc.id) as test_case_count
      FROM features f
      JOIN modules m ON m.id = f.module_id
      LEFT JOIN test_cases tc ON tc.feature_id = f.id AND tc.lifecycle_status = 'active'
    `;
    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (moduleId) { conditions.push('f.module_id = ?'); params.push(Number(moduleId)); }
    if (!includeArchived) conditions.push("f.status = 'active'");

    if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
    query += ' GROUP BY f.id, m.name, m.prefix ORDER BY m.name, f.name';

    const rows = await db.prepare(query).all(...params);
    return NextResponse.json(rows);
  } catch (error) {
    console.error('Features GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { errorResponse } = await requireAuth(req, ['qa']);
    if (errorResponse) return errorResponse;

    const db = getDb();
    const body = await req.json();
    const { module_id, name, description } = body;

    if (!module_id || !name?.trim()) {
      return NextResponse.json({ error: 'Module and feature name are required' }, { status: 400 });
    }

    const mod = (await db.prepare('SELECT * FROM modules WHERE id = ?').get(Number(module_id))) as { prefix: string } | undefined;
    if (!mod) return NextResponse.json({ error: 'Module not found' }, { status: 404 });

    const result = await db.prepare(`
      INSERT INTO features (module_id, name, description, status)
      VALUES (?, ?, ?, 'active')
    `).run(Number(module_id), name.trim(), description?.trim() || null);

    const featureId = result.lastInsertRowid as number;
    await logActivity(db, 'created', 'feature', featureId, name.trim(), `Feature "${name}" created in module ${mod.prefix}`);
    await logChange(db, {
      entityType: 'feature', entityId: featureId, entityRef: name.trim(),
      changeType: 'created', newValues: body
    });

    const feature = await db.prepare(`
      SELECT f.*, m.name as module_name, m.prefix as module_prefix
      FROM features f JOIN modules m ON m.id = f.module_id
      WHERE f.id = ?
    `).get(featureId);
    return NextResponse.json(feature, { status: 201 });
  } catch (error) {
    console.error('Features POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
