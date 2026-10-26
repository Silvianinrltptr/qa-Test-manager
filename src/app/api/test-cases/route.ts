import { getDb, generateCaseId, logActivity, logChange } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import { resolveTestCaseLanguageContent, isIndonesianText, translateTestCase } from '@/lib/translation';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { errorResponse } = await requireAuth(req, ['qa', 'dev_pm']);
    if (errorResponse) return errorResponse;

    const db = getDb();
    const { searchParams } = new URL(req.url);
    
    const moduleId = searchParams.get('moduleId');
    const featureId = searchParams.get('featureId');
    const lifecycle = searchParams.get('lifecycle') ?? 'active';
    const priority = searchParams.get('priority');
    const prepStatus = searchParams.get('prepStatus');
    const execStatus = searchParams.get('execStatus');
    const latestResult = searchParams.get('latestResult');
    const testType = searchParams.get('testType');
    const search = searchParams.get('search');
    const page = Number(searchParams.get('page') ?? '1');
    const limit = Number(searchParams.get('limit') ?? '20');
    const sortBy = searchParams.get('sortBy') ?? 'created_at';
    const sortDir = searchParams.get('sortDir') ?? 'DESC';
    const offset = (page - 1) * limit;

    const lang = searchParams.get('lang') || req.cookies.get('qastudio_lang')?.value || 'en';

    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (lifecycle !== 'all') {
      if (lifecycle === 'active') conditions.push("tc.lifecycle_status = 'active'");
      else conditions.push(`tc.lifecycle_status = '${lifecycle}'`);
    }
    if (moduleId) { conditions.push('tc.module_id = ?'); params.push(Number(moduleId)); }
    if (featureId) { conditions.push('tc.feature_id = ?'); params.push(Number(featureId)); }
    if (priority) { conditions.push('tc.priority = ?'); params.push(priority); }
    if (prepStatus) { conditions.push('tc.prep_status = ?'); params.push(prepStatus); }
    if (execStatus) { conditions.push('tc.exec_status = ?'); params.push(execStatus); }
    if (latestResult) { conditions.push('tc.latest_result = ?'); params.push(latestResult); }
    if (testType) { conditions.push('tc.test_type = ?'); params.push(testType); }
    if (search) {
      conditions.push('(tc.case_id LIKE ? OR tc.title LIKE ? OR tc.requirement_ref LIKE ? OR tct_id.title LIKE ? OR tct_en.title LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const allowedSorts = ['case_id', 'title', 'priority', 'prep_status', 'exec_status', 'latest_result', 'created_at', 'updated_at'];
    const safeSort = allowedSorts.includes(sortBy) ? sortBy : 'created_at';
    const safeDir = sortDir === 'ASC' ? 'ASC' : 'DESC';

    const countResult = (await db.prepare(`
      SELECT COUNT(*) as count 
      FROM test_cases tc
      LEFT JOIN test_case_translations tct_id ON tct_id.test_case_id = tc.id AND tct_id.language = 'id'
      LEFT JOIN test_case_translations tct_en ON tct_en.test_case_id = tc.id AND tct_en.language = 'en'
      ${where}
    `).get(...params)) as { count: number } | undefined;

    const totalCount = countResult ? Number(countResult.count) : 0;

    const testCases = (await db.prepare(`
      SELECT tc.*, m.name as module_name, m.prefix as module_prefix, f.name as feature_name,
        (SELECT COUNT(*) FROM test_case_comments WHERE test_case_id = tc.id) as comment_count,
        tct_id.id as trans_id_id,
        tct_id.title as trans_id_title,
        tct_id.preconditions as trans_id_preconditions,
        tct_id.test_steps as trans_id_test_steps,
        tct_id.test_data as trans_id_test_data,
        tct_id.expected_result as trans_id_expected_result,
        tct_id.reviewed as trans_id_reviewed,
        tct_en.id as trans_en_id,
        tct_en.title as trans_en_title,
        tct_en.preconditions as trans_en_preconditions,
        tct_en.test_steps as trans_en_test_steps,
        tct_en.test_data as trans_en_test_data,
        tct_en.expected_result as trans_en_expected_result,
        tct_en.reviewed as trans_en_reviewed
      FROM test_cases tc
      JOIN modules m ON m.id = tc.module_id
      JOIN features f ON f.id = tc.feature_id
      LEFT JOIN test_case_translations tct_id ON tct_id.test_case_id = tc.id AND tct_id.language = 'id'
      LEFT JOIN test_case_translations tct_en ON tct_en.test_case_id = tc.id AND tct_en.language = 'en'
      ${where}
      ORDER BY tc.${safeSort} ${safeDir}
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset)) as any[];

    const mappedCases = (testCases || []).map((row: any) => {
      const resolved = resolveTestCaseLanguageContent(
        row,
        {
          en: row.trans_en_title ? {
            title: row.trans_en_title,
            preconditions: row.trans_en_preconditions,
            test_steps: row.trans_en_test_steps,
            test_data: row.trans_en_test_data,
            expected_result: row.trans_en_expected_result,
            reviewed: Boolean(row.trans_en_reviewed),
            language: 'en'
          } : null,
          id: row.trans_id_title ? {
            title: row.trans_id_title,
            preconditions: row.trans_id_preconditions,
            test_steps: row.trans_id_test_steps,
            test_data: row.trans_id_test_data,
            expected_result: row.trans_id_expected_result,
            reviewed: Boolean(row.trans_id_reviewed),
            language: 'id'
          } : null,
        },
        lang
      );

      return {
        ...row,
        ...resolved,
        translation_id: lang === 'id' ? row.trans_id_id : row.trans_en_id,
        translation_lang: resolved.display_language,
      };
    });

    return NextResponse.json({
      data: mappedCases,
      pagination: {
        total: totalCount,
        page,
        limit,
        totalPages: Math.ceil(totalCount / limit) || 1,
      }
    });
  } catch (error) {
    console.error('Test cases GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { errorResponse } = await requireAuth(req, ['qa']);
    if (errorResponse) return errorResponse;

    const db = getDb();
    const body = await req.json();
    const { cases } = body; // array of cases

    if (!Array.isArray(cases) || cases.length === 0) {
      return NextResponse.json({ error: 'No cases provided' }, { status: 400 });
    }

    const insertStmt = db.prepare(`
      INSERT INTO test_cases (
        case_id, module_id, feature_id, requirement_ref, title, test_type,
        preconditions, test_steps, test_data, expected_result, priority,
        prep_status, notes, lifecycle_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
    `);

    interface CreateTestCaseInput {
      module_id: number | string;
      feature_id: number | string;
      requirement_ref?: string;
      title: string;
      test_type?: string;
      preconditions?: string;
      test_steps?: string;
      test_data?: string;
      expected_result?: string;
      priority?: string;
      prep_status?: string;
      notes?: string;
    }

    interface TestCaseInsertResult {
      success?: boolean;
      error?: string;
      caseId?: string;
      id?: number;
      case?: CreateTestCaseInput;
    }

    const results: TestCaseInsertResult[] = [];
    for (const c of cases as CreateTestCaseInput[]) {
      if (!c.module_id || !c.feature_id || !c.title?.trim()) {
        results.push({ error: 'Missing required fields', case: c });
        continue;
      }

      const mod = (await db.prepare('SELECT prefix FROM modules WHERE id = ?').get(Number(c.module_id))) as { prefix: string } | undefined;
      if (!mod) { results.push({ error: 'Module not found', case: c }); continue; }

      const caseId = await generateCaseId(db, mod.prefix);
      
      const insertRes = await insertStmt.run(
        caseId, Number(c.module_id), Number(c.feature_id),
        c.requirement_ref || null, c.title.trim(), c.test_type || 'functional',
        c.preconditions || null, c.test_steps || null, c.test_data || null,
        c.expected_result || null, c.priority || 'medium',
        c.prep_status || 'draft', c.notes || null
      );

      const insertedId = insertRes.lastInsertRowid || ((await db.prepare('SELECT id FROM test_cases WHERE case_id = ?').get(caseId)) as any)?.id;

      // Save source translation and translate to opposite language
      const isIdSource = isIndonesianText(c.title);
      const sourceLang = isIdSource ? 'id' : 'en';
      const targetLang = isIdSource ? 'en' : 'id';

      try {
        // 1. Save source language translation
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
          insertedId, sourceLang, c.title.trim(), c.preconditions || null,
          c.test_steps || null, c.test_data || null, c.expected_result || null
        );

        // 2. Automatically translate to target language if AI service is configured
        if (process.env.DEEPSEEK_API_KEY || process.env.GEMINI_API_KEY) {
          const transResult = await translateTestCase({
            title: c.title.trim(),
            preconditions: c.preconditions || null,
            test_steps: c.test_steps || null,
            test_data: c.test_data || null,
            expected_result: c.expected_result || null,
          }, targetLang);

          if (transResult.success && transResult.translated) {
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
              insertedId, targetLang,
              transResult.translated.title,
              transResult.translated.preconditions || null,
              transResult.translated.test_steps || null,
              transResult.translated.test_data || null,
              transResult.translated.expected_result || null
            );
          }
        }
      } catch (tErr) {
        console.warn('Auto translation on create failed for TC #' + insertedId, tErr);
      }

      await logActivity(db, 'created', 'test_case', insertedId, caseId, `Test case "${c.title}" created`);
      await logChange(db, {
        entityType: 'test_case', entityId: insertedId, entityRef: caseId,
        changeType: 'created', newValues: c
      });

      results.push({ success: true, caseId, id: insertedId });
    }

    const succeeded = results.filter((r: TestCaseInsertResult) => r.success).length;
    const failed = results.filter((r: TestCaseInsertResult) => r.error).length;

    return NextResponse.json({ results, succeeded, failed }, { status: 201 });
  } catch (error) {
    console.error('Test cases POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
