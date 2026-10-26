import { getDb, logActivity, logChange } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { errorResponse } = await requireAuth(req, ['qa', 'dev_pm']);
    if (errorResponse) return errorResponse;

    const { id } = await params;
    const db = getDb();

    const requirement = await db.prepare(`
      SELECT r.*,
        m.name as module_name,
        m.prefix as module_prefix,
        f.name as feature_name
      FROM requirements r
      LEFT JOIN modules m ON m.id = r.module_id
      LEFT JOIN features f ON f.id = r.feature_id
      WHERE r.id = ?
    `).get(Number(id));

    if (!requirement) {
      return NextResponse.json({ error: 'Requirement not found' }, { status: 404 });
    }

    const reqData = requirement as { id: number; ref_id: string; module_id: number; feature_id: number };

    // Fetch history
    const history = await db.prepare(`
      SELECT * FROM requirement_history 
      WHERE requirement_id = ? 
      ORDER BY version DESC
    `).all(Number(id));

    // Fetch linked test cases
    const linkedTestCases = await db.prepare(`
      SELECT tc.id, tc.case_id, tc.title, tc.test_type, tc.priority, 
             tc.prep_status, tc.exec_status, tc.latest_result, tc.lifecycle_status
      FROM test_cases tc
      WHERE (tc.requirement_ref = ? AND ? != '')
         OR (tc.module_id = ? AND tc.feature_id = ? AND (tc.requirement_ref IS NULL OR tc.requirement_ref = ''))
      ORDER BY tc.case_id
    `).all(reqData.ref_id, reqData.ref_id, reqData.module_id, reqData.feature_id);

    return NextResponse.json({
      requirement,
      history,
      linkedTestCases,
    });
  } catch (error) {
    console.error('Error fetching requirement detail:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { errorResponse } = await requireAuth(req, ['qa']);
    if (errorResponse) return errorResponse;

    const { id } = await params;
    const db = getDb();
    const body = await req.json();
    const { title, description, change_type = 'updated', status = 'active', module_id, feature_id, reason } = body;

    const existing = (await db.prepare('SELECT * FROM requirements WHERE id = ?').get(Number(id))) as {
      id: number;
      ref_id: string;
      title: string;
      description: string | null;
      version: number;
      status: string;
      module_id: number | null;
      feature_id: number | null;
    } | undefined;

    if (!existing) {
      return NextResponse.json({ error: 'Requirement not found' }, { status: 404 });
    }

    const newVersion = (existing.version || 1) + 1;

    await db.prepare(`
      UPDATE requirements 
      SET title = ?, description = ?, change_type = ?, status = ?, 
          version = ?, module_id = ?, feature_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      title ? title.trim() : existing.title,
      description !== undefined ? description?.trim() : existing.description,
      change_type,
      status || existing.status,
      newVersion,
      module_id ? Number(module_id) : existing.module_id,
      feature_id ? Number(feature_id) : existing.feature_id,
      Number(id)
    );

    // Record in requirement_history
    await db.prepare(`
      INSERT INTO requirement_history (requirement_id, title, description, change_type, version)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      Number(id),
      title ? title.trim() : existing.title,
      description !== undefined ? description?.trim() : existing.description,
      change_type,
      newVersion
    );

    // Log activity & change
    await logActivity(
      db,
      'update_requirement',
      'requirement',
      Number(id),
      existing.ref_id,
      `Updated requirement ${existing.ref_id} (v${newVersion}, type: ${change_type}): ${title || existing.title}`
    );

    await logChange(db, {
      entityType: 'requirement',
      entityId: Number(id),
      entityRef: existing.ref_id,
      changeType: change_type,
      oldValues: { title: existing.title, description: existing.description, status: existing.status, version: existing.version },
      newValues: { title, description, status, version: newVersion },
      reason: reason || `Requirement updated to version ${newVersion}`,
      requirementRef: existing.ref_id,
    });

    return NextResponse.json({ success: true, version: newVersion });
  } catch (error) {
    console.error('Error updating requirement:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { errorResponse } = await requireAuth(req, ['qa']);
    if (errorResponse) return errorResponse;

    const { id } = await params;
    const db = getDb();

    const existing = (await db.prepare('SELECT * FROM requirements WHERE id = ?').get(Number(id))) as {
      id: number;
      ref_id: string;
      title: string;
    } | undefined;

    if (!existing) {
      return NextResponse.json({ error: 'Requirement not found' }, { status: 404 });
    }

    // Soft delete / archive to preserve traceability
    await db.prepare(`UPDATE requirements SET status = 'archived', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(Number(id));

    await logActivity(db, 'archive_requirement', 'requirement', Number(id), existing.ref_id, `Archived requirement ${existing.ref_id}: ${existing.title}`);
    await logChange(db, {
      entityType: 'requirement',
      entityId: Number(id),
      entityRef: existing.ref_id,
      changeType: 'archived',
      reason: 'Requirement archived',
      requirementRef: existing.ref_id,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error archiving requirement:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
