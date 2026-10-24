import { getDb, logActivity, logChange } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';

export async function PUT(req: NextRequest, ctx: RouteContext<'/api/features/[id]'>) {
  try {
    const { errorResponse } = await requireAuth(req, ['qa']);
    if (errorResponse) return errorResponse;

    const db = getDb();
    const { id } = await ctx.params;
    const body = await req.json();
    const { name, description, status, module_id } = body;

    const old = db.prepare('SELECT * FROM features WHERE id = ?').get(Number(id)) as { name: string; description: string; status: string; module_id: number } | undefined;
    if (!old) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    db.prepare(`
      UPDATE features SET name = ?, description = ?, status = ?, module_id = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(
      name ?? old.name, description ?? old.description,
      status ?? old.status, module_id ?? old.module_id, Number(id)
    );

    logActivity(db, 'updated', 'feature', Number(id), name ?? old.name, `Feature "${name ?? old.name}" updated`);
    logChange(db, {
      entityType: 'feature', entityId: Number(id), entityRef: name ?? old.name,
      changeType: 'updated', oldValues: old, newValues: body
    });

    const updated = db.prepare(`
      SELECT f.*, m.name as module_name, m.prefix as module_prefix
      FROM features f JOIN modules m ON m.id = f.module_id
      WHERE f.id = ?
    `).get(Number(id));
    return NextResponse.json(updated);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: RouteContext<'/api/features/[id]'>) {
  try {
    const { errorResponse } = await requireAuth(req, ['qa']);
    if (errorResponse) return errorResponse;

    const db = getDb();
    const { id } = await ctx.params;
    const feat = db.prepare('SELECT * FROM features WHERE id = ?').get(Number(id)) as { name: string } | undefined;
    if (!feat) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    db.prepare(`UPDATE features SET status = 'archived', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(Number(id));
    logActivity(db, 'archived', 'feature', Number(id), feat.name, `Feature "${feat.name}" archived`);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
