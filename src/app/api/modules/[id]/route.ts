import { getDb, logActivity, logChange } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(_req: NextRequest, ctx: RouteContext<'/api/modules/[id]'>) {
  try {
    const db = getDb();
    const { id } = await ctx.params;
    const module = db.prepare('SELECT * FROM modules WHERE id = ?').get(Number(id));
    if (!module) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(module);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, ctx: RouteContext<'/api/modules/[id]'>) {
  try {
    const db = getDb();
    const { id } = await ctx.params;
    const body = await req.json();
    const { name, description, status } = body;

    const old = db.prepare('SELECT * FROM modules WHERE id = ?').get(Number(id)) as { name: string; description: string; status: string; prefix: string } | undefined;
    if (!old) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    db.prepare(`
      UPDATE modules SET name = ?, description = ?, status = ?, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(name ?? old.name, description ?? old.description, status ?? old.status, Number(id));

    logActivity(db, 'updated', 'module', Number(id), old.prefix, `Modul "${name ?? old.name}" diperbarui`);
    logChange(db, {
      entityType: 'module', entityId: Number(id), entityRef: old.prefix,
      changeType: 'updated',
      changedFields: Object.keys(body).join(', '),
      oldValues: { name: old.name, description: old.description, status: old.status },
      newValues: body
    });

    const updated = db.prepare('SELECT * FROM modules WHERE id = ?').get(Number(id));
    return NextResponse.json(updated);
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(_req: NextRequest, ctx: RouteContext<'/api/modules/[id]'>) {
  try {
    const db = getDb();
    const { id } = await ctx.params;
    
    // Archive instead of delete
    const mod = db.prepare('SELECT * FROM modules WHERE id = ?').get(Number(id)) as { prefix: string; name: string } | undefined;
    if (!mod) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    db.prepare(`UPDATE modules SET status = 'archived', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(Number(id));
    logActivity(db, 'archived', 'module', Number(id), mod.prefix, `Modul "${mod.name}" diarsipkan`);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
