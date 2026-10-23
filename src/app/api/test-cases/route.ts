import { getDb, generateCaseId, logActivity, logChange } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
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
      conditions.push('(tc.case_id LIKE ? OR tc.title LIKE ? OR tc.requirement_ref LIKE ?)');
      params.push(`%${search}%`, `%${search}%`, `%${search}%`);
    }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';
    const allowedSorts = ['case_id', 'title', 'priority', 'prep_status', 'exec_status', 'latest_result', 'created_at', 'updated_at'];
    const safeSort = allowedSorts.includes(sortBy) ? sortBy : 'created_at';
    const safeDir = sortDir === 'ASC' ? 'ASC' : 'DESC';

    const countResult = db.prepare(`
      SELECT COUNT(*) as count FROM test_cases tc ${where}
    `).get(...params) as { count: number };

    const testCases = db.prepare(`
      SELECT tc.*, m.name as module_name, m.prefix as module_prefix, f.name as feature_name
      FROM test_cases tc
      JOIN modules m ON m.id = tc.module_id
      JOIN features f ON f.id = tc.feature_id
      ${where}
      ORDER BY tc.${safeSort} ${safeDir}
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    return NextResponse.json({
      data: testCases,
      pagination: {
        total: countResult.count,
        page,
        limit,
        totalPages: Math.ceil(countResult.count / limit),
      }
    });
  } catch (error) {
    console.error('Test cases GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const db = getDb();
    const body = await req.json();
    const { cases } = body; // array of cases

    if (!Array.isArray(cases) || cases.length === 0) {
      return NextResponse.json({ error: 'No cases provided' }, { status: 400 });
    }

    const insert = db.prepare(`
      INSERT INTO test_cases (
        case_id, module_id, feature_id, requirement_ref, title, test_type,
        preconditions, test_steps, test_data, expected_result, priority,
        prep_status, notes, lifecycle_status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
    `);

    const insertMany = db.transaction((cases: any[]) => {
      const results = [];
      for (const c of cases) {
        if (!c.module_id || !c.feature_id || !c.title?.trim()) {
          results.push({ error: 'Missing required fields', case: c });
          continue;
        }

        const mod = db.prepare('SELECT prefix FROM modules WHERE id = ?').get(Number(c.module_id)) as { prefix: string } | undefined;
        if (!mod) { results.push({ error: 'Module not found', case: c }); continue; }

        const caseId = generateCaseId(db, mod.prefix);
        
        insert.run(
          caseId, Number(c.module_id), Number(c.feature_id),
          c.requirement_ref || null, c.title.trim(), c.test_type || 'functional',
          c.preconditions || null, c.test_steps || null, c.test_data || null,
          c.expected_result || null, c.priority || 'medium',
          c.prep_status || 'draft', c.notes || null
        );

        const newCase = db.prepare('SELECT * FROM test_cases WHERE case_id = ?').get(caseId) as { id: number };
        logActivity(db, 'created', 'test_case', newCase.id, caseId, `Test case "${c.title}" dibuat`);
        logChange(db, {
          entityType: 'test_case', entityId: newCase.id, entityRef: caseId,
          changeType: 'created', newValues: c
        });

        results.push({ success: true, caseId, id: newCase.id });
      }
      return results;
    });

    const results = insertMany(cases);
    const succeeded = results.filter((r: any) => r.success).length;
    const failed = results.filter((r: any) => r.error).length;

    return NextResponse.json({ results, succeeded, failed }, { status: 201 });
  } catch (error) {
    console.error('Test cases POST error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
