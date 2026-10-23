import { getDb, logActivity, logChange } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(req.url);
    const includeArchived = searchParams.get('includeArchived') === 'true';

    const modules = db.prepare(`
      SELECT m.*, 
        COUNT(DISTINCT f.id) as feature_count,
        COUNT(DISTINCT tc.id) as test_case_count
      FROM modules m
      LEFT JOIN features f ON f.module_id = m.id AND f.status = 'active'
      LEFT JOIN test_cases tc ON tc.module_id = m.id AND tc.lifecycle_status = 'active'
      ${!includeArchived ? "WHERE m.status = 'active'" : ''}
      GROUP BY m.id
      ORDER BY m.name
    `).all();

    return NextResponse.json(modules);
  } catch (error) {
    console.error('Modules GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = getDb();
    const body = await req.json();
    const { name, description, prefix } = body;

    if (!name?.trim() || !prefix?.trim()) {
      return NextResponse.json({ error: 'Nama dan prefix wajib diisi' }, { status: 400 });
    }

    const prefixUpper = prefix.trim().toUpperCase();

    // Check unique prefix
    const existing = db.prepare('SELECT id FROM modules WHERE prefix = ?').get(prefixUpper);
    if (existing) {
      return NextResponse.json({ error: 'Prefix sudah digunakan' }, { status: 409 });
    }

    const result = db.prepare(`
      INSERT INTO modules (name, description, prefix, status)
      VALUES (?, ?, ?, 'active')
    `).run(name.trim(), description?.trim() || null, prefixUpper);

    const moduleId = result.lastInsertRowid as number;

    logActivity(db, 'created', 'module', moduleId, prefixUpper, `Modul "${name}" dibuat`);
    logChange(db, {
      entityType: 'module', entityId: moduleId, entityRef: prefixUpper,
      changeType: 'created', newValues: { name, description, prefix: prefixUpper }
    });

    const module = db.prepare('SELECT * FROM modules WHERE id = ?').get(moduleId);
    return NextResponse.json(module, { status: 201 });
  } catch (error) {
    console.error('Modules POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
