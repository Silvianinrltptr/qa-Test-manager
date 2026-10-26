import { getDb, logActivity, logChange } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { resolveTestCaseLanguageContent, isIndonesianText, translateTestCase } from '@/lib/translation';

export async function GET(req: NextRequest, ctx: RouteContext<'/api/test-cases/[id]'>) {
  try {
    const { errorResponse } = await requireAuth(req, ['qa', 'dev_pm']);
    if (errorResponse) return errorResponse;

    const db = getDb();
    const { id } = await ctx.params;
    const { searchParams } = new URL(req.url);
    const lang = searchParams.get('lang') || req.cookies.get('qastudio_lang')?.value || 'en';

    const tc = (await db.prepare(`
      SELECT tc.*, m.name as module_name, m.prefix as module_prefix, f.name as feature_name
      FROM test_cases tc
      JOIN modules m ON m.id = tc.module_id
      JOIN features f ON f.id = tc.feature_id
      WHERE tc.id = ?
    `).get(Number(id))) as any;

    if (!tc) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const translations = (await db.prepare(`
      SELECT * FROM test_case_translations WHERE test_case_id = ? ORDER BY language ASC
    `).all(Number(id))) as any[];

    const resolved = resolveTestCaseLanguageContent(tc, translations, lang);

    const testCase = {
      ...tc,
      ...resolved,
      translation_id: translations.find((t: any) => t.language === resolved.display_language)?.id,
      translation_lang: resolved.display_language,
    };

    const executions = await db.prepare(`
      SELECT * FROM executions WHERE test_case_id = ? ORDER BY exec_date DESC
    `).all(Number(id));

    const changes = await db.prepare(`
      SELECT * FROM change_log WHERE entity_type = 'test_case' AND entity_id = ? ORDER BY changed_at DESC
    `).all(Number(id));

    const comments = await db.prepare(`
      SELECT * FROM test_case_comments WHERE test_case_id = ? ORDER BY created_at ASC
    `).all(Number(id));

    return NextResponse.json({
      testCase,
      translations: translations || [],
      executions: executions || [],
      changes: changes || [],
      comments: comments || []
    });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, ctx: RouteContext<'/api/test-cases/[id]'>) {
  try {
    const { errorResponse } = await requireAuth(req, ['qa']);
    if (errorResponse) return errorResponse;

    const db = getDb();
    const { id } = await ctx.params;
    const body = await req.json();

    const old = (await db.prepare('SELECT * FROM test_cases WHERE id = ?').get(Number(id))) as Record<string, unknown> | undefined;
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
      await db.prepare(`UPDATE test_cases SET ${updates.join(', ')} WHERE id = ?`).run(...values);
    }

    // Track lifecycle changes
    if (body.lifecycle_status && body.lifecycle_status !== old.lifecycle_status) {
      const changeType = body.lifecycle_status === 'obsolete' ? 'obsolete'
        : body.lifecycle_status === 'active' ? 'reactivated'
        : body.lifecycle_status === 'archived' ? 'archived'
        : 'lifecycle_changed';
      
      await logChange(db, {
        entityType: 'test_case', entityId: Number(id), entityRef: old.case_id as string,
        changeType, changedFields: changedFields.join(', '),
        oldValues: oldVals, newValues: newVals, reason: body.reason
      });
    } else if (changedFields.length > 0) {
      await logChange(db, {
        entityType: 'test_case', entityId: Number(id), entityRef: old.case_id as string,
        changeType: 'updated', changedFields: changedFields.join(', '),
        oldValues: oldVals, newValues: newVals, reason: body.reason
      });
    }

    // If content fields changed, synchronize translations and mark for review
    const contentFieldsChanged = ['title', 'preconditions', 'test_steps', 'test_data', 'expected_result'].some(f => changedFields.includes(f));
    if (contentFieldsChanged) {
      try {
        const activeTitle = ((body.title ?? old.title) || '') as string;
        const isId = isIndonesianText(activeTitle);
        const sourceLang = isId ? 'id' : 'en';
        const targetLang = isId ? 'en' : 'id';

        // 1. Update source language translation as reviewed
        await db.prepare(`
          INSERT INTO test_case_translations (test_case_id, language, title, preconditions, test_steps, test_data, expected_result, reviewed, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, true, NOW())
          ON CONFLICT (test_case_id, language) DO UPDATE SET
            title = EXCLUDED.title,
            preconditions = EXCLUDED.preconditions,
            test_steps = EXCLUDED.test_steps,
            test_data = EXCLUDED.test_data,
            expected_result = EXCLUDED.expected_result,
            reviewed = true,
            updated_at = NOW()
        `).run(
          Number(id), sourceLang,
          body.title ?? old.title,
          body.preconditions ?? old.preconditions,
          body.test_steps ?? old.test_steps,
          body.test_data ?? old.test_data,
          body.expected_result ?? old.expected_result
        );

        // 2. Auto-translate to target language if AI service is configured
        if (process.env.DEEPSEEK_API_KEY || process.env.GEMINI_API_KEY) {
          const transRes = await translateTestCase({
            title: (body.title ?? old.title) as string,
            preconditions: (body.preconditions ?? old.preconditions) as string,
            test_steps: (body.test_steps ?? old.test_steps) as string,
            test_data: (body.test_data ?? old.test_data) as string,
            expected_result: (body.expected_result ?? old.expected_result) as string,
          }, targetLang);

          if (transRes.success && transRes.translated) {
            await db.prepare(`
              INSERT INTO test_case_translations (test_case_id, language, title, preconditions, test_steps, test_data, expected_result, reviewed, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, false, NOW())
              ON CONFLICT (test_case_id, language) DO UPDATE SET
                title = EXCLUDED.title,
                preconditions = EXCLUDED.preconditions,
                test_steps = EXCLUDED.test_steps,
                test_data = EXCLUDED.test_data,
                expected_result = EXCLUDED.expected_result,
                reviewed = false,
                updated_at = NOW()
            `).run(
              Number(id), targetLang,
              transRes.translated.title,
              transRes.translated.preconditions || null,
              transRes.translated.test_steps || null,
              transRes.translated.test_data || null,
              transRes.translated.expected_result || null
            );
          }
        }
      } catch (err) {
        console.warn('Failed to update translations on TC update:', err);
      }
    }

    await logActivity(db, 'updated', 'test_case', Number(id), old.case_id as string, `Test case "${old.title}" updated`);

    const updated = await db.prepare(`
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

export async function DELETE(req: NextRequest, ctx: RouteContext<'/api/test-cases/[id]'>) {
  try {
    const { errorResponse } = await requireAuth(req, ['qa']);
    if (errorResponse) return errorResponse;

    const db = getDb();
    const { id } = await ctx.params;

    const tc = (await db.prepare('SELECT * FROM test_cases WHERE id = ?').get(Number(id))) as { case_id: string; title: string; lifecycle_status: string } | undefined;
    if (!tc) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Soft delete - mark as archived
    await db.prepare(`UPDATE test_cases SET lifecycle_status = 'archived', updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(Number(id));
    await logActivity(db, 'archived', 'test_case', Number(id), tc.case_id, `Test case "${tc.title}" archived`);
    await logChange(db, {
      entityType: 'test_case', entityId: Number(id), entityRef: tc.case_id,
      changeType: 'archived', oldValues: { lifecycle_status: tc.lifecycle_status }
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
