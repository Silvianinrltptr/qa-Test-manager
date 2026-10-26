import { getDb, generateCaseId, logActivity, logChange } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';

export async function POST(req: NextRequest) {
  try {
    const { errorResponse } = await requireAuth(req, ['qa']);
    if (errorResponse) return errorResponse;

    const db = getDb();
    const body = await req.json();
    const { rows, fieldMap } = body;
    // rows: array of { [colName]: value }
    // fieldMap: { [appField]: colName }

    if (!Array.isArray(rows) || rows.length === 0) {
      return NextResponse.json({ error: 'No rows provided' }, { status: 400 });
    }

    const results: { rowIndex: number; status: string; caseId?: string; error?: string }[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      
      // Map fields
      const getVal = (field: string) => {
        const col = fieldMap?.[field];
        const val = col ? row[col] : row[field];
        return val !== undefined && val !== null ? String(val).trim() : '';
      };

      const moduleIdRaw = getVal('module_id');
      const featureIdRaw = getVal('feature_id');
      const title = getVal('title');

      if (!title) {
        results.push({ rowIndex: i, status: 'error', error: 'Title is required' });
        continue;
      }

      // Look up module by name or ID
      let moduleId: number | null = null;
      let modulePrefix = '';
      if (moduleIdRaw) {
        const isNum = !isNaN(Number(moduleIdRaw)) && moduleIdRaw !== '';
        const mod = (isNum
          ? await db.prepare("SELECT id, prefix FROM modules WHERE id = ?").get(Number(moduleIdRaw))
          : await db.prepare("SELECT id, prefix FROM modules WHERE name = ? AND status = 'active'").get(moduleIdRaw)) as { id: number; prefix: string } | undefined;
        if (mod) { moduleId = mod.id; modulePrefix = mod.prefix; }
      }

      let featureId: number | null = null;
      if (featureIdRaw && moduleId) {
        const isNum = !isNaN(Number(featureIdRaw)) && featureIdRaw !== '';
        const feat = (isNum
          ? await db.prepare("SELECT id FROM features WHERE id = ? AND module_id = ?").get(Number(featureIdRaw), moduleId)
          : await db.prepare("SELECT id FROM features WHERE name = ? AND module_id = ? AND status = 'active'").get(featureIdRaw, moduleId)) as { id: number } | undefined;
        if (feat) featureId = feat.id;
      }

      if (!moduleId || !featureId) {
        results.push({ rowIndex: i, status: 'error', error: `Module "${moduleIdRaw}" or Feature "${featureIdRaw}" not found` });
        continue;
      }

      // Check duplicate by title in same feature
      const existing = (await db.prepare(
        "SELECT case_id FROM test_cases WHERE title = ? AND feature_id = ? AND lifecycle_status = 'active'"
      ).get(title, featureId)) as { case_id: string } | undefined;

      if (existing) {
        results.push({ rowIndex: i, status: 'duplicate', caseId: existing.case_id, error: `Duplicate of ${existing.case_id}` });
        continue;
      }

      const caseId = await generateCaseId(db, modulePrefix);
      const insertRes = await db.prepare(`
        INSERT INTO test_cases (
          case_id, module_id, feature_id, requirement_ref, title, test_type,
          preconditions, test_steps, test_data, expected_result, priority,
          prep_status, notes, lifecycle_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
      `).run(
        caseId, moduleId, featureId,
        getVal('requirement_ref') || null,
        title,
        getVal('test_type') || 'functional',
        getVal('preconditions') || null,
        getVal('test_steps') || null,
        getVal('test_data') || null,
        getVal('expected_result') || null,
        getVal('priority') || 'medium',
        getVal('prep_status') || 'draft',
        getVal('notes') || null
      );

      const insertedId = insertRes.lastInsertRowid || ((await db.prepare('SELECT id FROM test_cases WHERE case_id = ?').get(caseId)) as any)?.id;

      await logActivity(db, 'imported', 'test_case', insertedId, caseId, `Test case "${title}" imported`);
      await logChange(db, {
        entityType: 'test_case', entityId: insertedId, entityRef: caseId,
        changeType: 'created', newValues: { source: 'import', title }
      });

      results.push({ rowIndex: i, status: 'success', caseId });
    }

    const succeeded = results.filter(r => r.status === 'success').length;
    const duplicates = results.filter(r => r.status === 'duplicate').length;
    const failed = results.filter(r => r.status === 'error').length;

    return NextResponse.json({ results, succeeded, duplicates, failed, total: rows.length });
  } catch (error) {
    console.error('Import save error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
