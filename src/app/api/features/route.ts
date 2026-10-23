import { getDb, logActivity, logChange } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
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
    query += ' GROUP BY f.id ORDER BY m.name, f.name';

    return NextResponse.json(db.prepare(query).all(...params));
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = getDb();
    const body = await req.json();
    const { module_id, name, description } = body;

    if (!module_id || !name?.trim()) {
      return NextResponse.json({ error: 'Module dan nama fitur wajib diisi' }, { status: 400 });
    }

    const mod = db.prepare('SELECT * FROM modules WHERE id = ?').get(Number(module_id)) as { prefix: string } | undefined;
    if (!mod) return NextResponse.json({ error: 'Modul tidak ditemukan' }, { status: 404 });

    const result = db.prepare(`
      INSERT INTO features (module_id, name, description, status)
      VALUES (?, ?, ?, 'active')
    `).run(Number(module_id), name.trim(), description?.trim() || null);

    const featureId = result.lastInsertRowid as number;
    logActivity(db, 'created', 'feature', featureId, name.trim(), `Fitur "${name}" dibuat dalam modul ${mod.prefix}`);
    logChange(db, {
      entityType: 'feature', entityId: featureId, entityRef: name.trim(),
      changeType: 'created', newValues: body
    });

    const feature = db.prepare(`
      SELECT f.*, m.name as module_name, m.prefix as module_prefix
      FROM features f JOIN modules m ON m.id = f.module_id
      WHERE f.id = ?
    `).get(featureId);
    return NextResponse.json(feature, { status: 201 });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
