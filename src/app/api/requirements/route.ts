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
    const featureId = searchParams.get('featureId');
    const status = searchParams.get('status');
    const search = searchParams.get('search');

    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (moduleId) {
      conditions.push('r.module_id = ?');
      params.push(Number(moduleId));
    }
    if (featureId) {
      conditions.push('r.feature_id = ?');
      params.push(Number(featureId));
    }
    if (status && status !== 'all') {
      conditions.push('r.status = ?');
      params.push(status);
    }
    if (search) {
      conditions.push('(r.title LIKE ? OR r.ref_id LIKE ? OR r.description LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    const requirements = db.prepare(`
      SELECT r.*,
        m.name as module_name,
        m.prefix as module_prefix,
        f.name as feature_name,
        (
          SELECT COUNT(*) FROM test_cases tc 
          WHERE (tc.requirement_ref = r.ref_id AND r.ref_id IS NOT NULL AND r.ref_id != '')
             OR (tc.module_id = r.module_id AND tc.feature_id = r.feature_id AND (tc.requirement_ref IS NULL OR tc.requirement_ref = ''))
        ) as test_case_count
      FROM requirements r
      LEFT JOIN modules m ON m.id = r.module_id
      LEFT JOIN features f ON f.id = r.feature_id
      ${where}
      ORDER BY r.updated_at DESC
    `).all(...params);

    return NextResponse.json(requirements);
  } catch (error) {
    console.error('Error fetching requirements:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { errorResponse } = await requireAuth(req, ['qa']);
    if (errorResponse) return errorResponse;

    const db = getDb();
    const body = await req.json();
    const { module_id, feature_id, ref_id, title, description, status = 'active' } = body;

    if (!title?.trim()) {
      return NextResponse.json({ error: 'Requirement title is required' }, { status: 400 });
    }

    // Auto-generate ref_id if not provided
    let finalRefId = ref_id?.trim();
    if (!finalRefId) {
      const count = (db.prepare('SELECT COUNT(*) as count FROM requirements').get() as { count: number }).count;
      finalRefId = `REQ-${String(count + 1).padStart(3, '0')}`;
    }

    const stmt = db.prepare(`
      INSERT INTO requirements (module_id, feature_id, ref_id, title, description, change_type, status, version)
      VALUES (?, ?, ?, ?, ?, 'new', ?, 1)
    `);

    const res = stmt.run(
      module_id ? Number(module_id) : null,
      feature_id ? Number(feature_id) : null,
      finalRefId,
      title.trim(),
      description?.trim() || null,
      status
    );

    const newId = Number(res.lastInsertRowid);

    // Save initial history
    db.prepare(`
      INSERT INTO requirement_history (requirement_id, title, description, change_type, version)
      VALUES (?, ?, ?, 'new', 1)
    `).run(newId, title.trim(), description?.trim() || null);

    // Log activity and change
    logActivity(db, 'create_requirement', 'requirement', newId, finalRefId, `Created new requirement: ${finalRefId} - ${title.trim()}`);
    logChange(db, {
      entityType: 'requirement',
      entityId: newId,
      entityRef: finalRefId,
      changeType: 'created',
      newValues: { title, ref_id: finalRefId, description, status },
      reason: 'Requirement created'
    });

    return NextResponse.json({ id: newId, ref_id: finalRefId, success: true }, { status: 201 });
  } catch (error) {
    console.error('Error creating requirement:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
