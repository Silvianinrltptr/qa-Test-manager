import { getDb, logActivity, logChange } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(_req: NextRequest, ctx: RouteContext<'/api/test-cases/[id]'>) {
  try {
    const db = getDb();
    const { id } = await ctx.params;

    const tc = db.prepare(`
      SELECT tc.*, m.name as module_name, m.prefix as module_prefix, f.name as feature_name
      FROM test_cases tc
      JOIN modules m ON m.id = tc.module_id
      JOIN features f ON f.id = tc.feature_id
      WHERE tc.id = ?
    `).get(Number(id));

    if (!tc) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const executions = db.prepare(`
      SELECT * FROM executions WHERE test_case_id = ? ORDER BY exec_date DESC
    `).all(Number(id));

    const changes = db.prepare(`
      SELECT * FROM change_log WHERE entity_type = 'test_case' AND entity_id = ? ORDER BY changed_at DESC
    `).all(Number(id));

    return NextResponse.json({ testCase: tc, executions, changes });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, ctx: RouteContext<'/api/test-cases/[id]'>) {
  try {
    const db = getDb();
    const { id } = await ctx.params;
    const body = await req.json();

    const old = db.prepare('SELECT * FROM test_cases WHERE id = ?').get(Number(id)) as Record<string, unknown> | undefined;
    if (!old) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const fields = [
      'module_id', 'feature_id', 'requirement_ref', 'title', 'test_type',
      'preconditions', 'test_steps', 'test_data', 'expected_result',
      'actual_result', 'priority', 'prep_status', 'exec_status', 'latest_result',
      'evidence', 'defect_ref', 'notes', 'lifecycle_status'
    ];

    const updates: string[] = [];
    const values: unknown[] = [];
    const changedFields: string[] = [];
    const oldVals: Record<string, unknown> = {};
    const newVals: Record<string, unknown> = {};

    for (const field of fields) {
      if (field in body) {
        updates.push(`${field} = ?`);
        values.push(body[field]);
        if (body[field] !== old[field]) {
          changedFields.push(field);
          oldVals[field] = old[field];
          newVals[field] = body[field];
        }
      }
    }

    if (updates.length > 0) {
      updates.push('updated_at = CURRENT_TIMESTAMP');
      values.push(Number(id));
      db.prepare(`UPDATE test_cases SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    }

    // Track lifecycle changes
    if (body.lifecycle_status && body.lifecycle_status !== old.lifecycle_status) {
      const changeType = body.lifecycle_status === 'obsolete' ? 'obsolete'
        : body.lifecycle_status === 'active' ? 'reactivated'
        : body.lifecycle_status === 'archived' ? 'archived'
        : 'lifecycle_changed';
      
      logChange(db, {
        entityType: 'test_case', entityId: Number(id), entityRef: old.case_id as string,
        changeType, changedFields: changedFields.join(', '),
        oldValues: oldVals, newValues: newVals, reason: body.reason
      });
    } else if (changedFields.length > 0) {
      logChange(db, {
        entityType: 'test_case', entityId: Number(id), entityRef: old.case_id as string,
        changeType: 'updated', changedFields: changedFields.join(', '),
        oldValues: oldVals, newValues: newVals, reason: body.reason
      });
    }

    logActivity(db, 'updated', 'test_case', Number(id), old.case_id as string, `Test case "${old.title}" diperbarui`);

    const updated = db.prepare(`
      SELECT tc.*, m.name as module_name, m.prefix as module_prefix, f.name as feature_name
      FROM test_cases tc
      JOIN modules m ON m.id = tc.module_id
      JOIN features f ON f.id = tc.feature_id
      WHERE tc.id = ?
    `).get(Number(id));

    return NextResponse.json(updated);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<'/api/test-cases/[id]'>) {
  try {
    const db = getDb();
    const { id } = await ctx.params;

    const tc = db.prepare('SELECT * FROM test_cases WHERE id = ?').get(Number(id)) as { case_id: string; title: string; lifecycle_status: string } | undefined;
    if (!tc) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Soft delete - mark as archived
    db.prepare(`UPDATE test_cases SET lifecycle_status = 'archived', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(Number(id));
    logActivity(db, 'archived', 'test_case', Number(id), tc.case_id, `Test case "${tc.title}" diarsipkan`);
    logChange(db, {
      entityType: 'test_case', entityId: Number(id), entityRef: tc.case_id,
      changeType: 'archived', oldValues: { lifecycle_status: tc.lifecycle_status }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
