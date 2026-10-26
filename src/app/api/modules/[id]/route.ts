import { getDb, logActivity, logChange } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';

export async function GET(req: NextRequest, ctx: RouteContext<'/api/modules/[id]'>) {
  try {
    const { errorResponse } = await requireAuth(req, ['qa', 'dev_pm']);
    if (errorResponse) return errorResponse;

    const db = getDb();
    const { id } = await ctx.params;
    const moduleRecord = await db.prepare('SELECT * FROM modules WHERE id = ?').get(Number(id));
    if (!moduleRecord) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(moduleRecord);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, ctx: RouteContext<'/api/modules/[id]'>) {
  try {
    const { errorResponse } = await requireAuth(req, ['qa']);
    if (errorResponse) return errorResponse;

    const db = getDb();
    const { id } = await ctx.params;
    const body = await req.json();
    const { name, description, status } = body;

    const old = (await db.prepare('SELECT * FROM modules WHERE id = ?').get(Number(id))) as { name: string; description: string; status: string; prefix: string } | undefined;
    if (!old) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    await db.prepare(`
      UPDATE modules SET name = ?, description = ?, status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(name ?? old.name, description ?? old.description, status ?? old.status, Number(id));

    await logActivity(db, 'updated', 'module', Number(id), old.prefix, `Module "${name ?? old.name}" updated`);
    await logChange(db, {
      entityType: 'module', entityId: Number(id), entityRef: old.prefix,
      changeType: 'updated',
      changedFields: Object.keys(body).join(', '),
      oldValues: { name: old.name, description: old.description, status: old.status },
      newValues: body
    });

    const updated = await db.prepare('SELECT * FROM modules WHERE id = ?').get(Number(id));
    return NextResponse.json(updated);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, ctx: RouteContext<'/api/modules/[id]'>) {
  try {
    const { errorResponse } = await requireAuth(req, ['qa']);
    if (errorResponse) return errorResponse;

    const db = getDb();
    const { id } = await ctx.params;
    
    // Archive instead of delete
    const mod = (await db.prepare('SELECT * FROM modules WHERE id = ?').get(Number(id))) as { prefix: string; name: string } | undefined;
    if (!mod) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    await db.prepare(`UPDATE modules SET status = 'archived', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(Number(id));
    await logActivity(db, 'archived', 'module', Number(id), mod.prefix, `Module "${mod.name}" archived`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
