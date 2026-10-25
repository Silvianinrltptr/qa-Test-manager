import { getDb } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { errorResponse } = await requireAuth(req, ['qa']);
    if (errorResponse) return errorResponse;

    const db = getDb();
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') ?? 'test-cases';
    const moduleId = searchParams.get('moduleId');
    const featureId = searchParams.get('featureId');
    const lifecycle = searchParams.get('lifecycle') ?? 'active';

    if (type === 'template') {
      const format = searchParams.get('format')?.toLowerCase();
      const headers = [
        'Module ID', 'Feature ID', 'Requirement Ref', 'Title', 'Test Type',
        'Preconditions', 'Test Steps', 'Test Data', 'Expected Result', 'Priority', 'Notes'
      ];
      const example = [
        '1', '1', 'REQ-001', 'Successful login with valid credentials', 'functional',
        'User is on the login page', '1. Open login page\n2. Enter username\n3. Enter password\n4. Click Login',
        'username: admin, password: Pass123!', 'User successfully logs in and is redirected to dashboard', 'high', ''
      ];

      if (format === 'xlsx') {
        const XLSX = await import('xlsx');
        const ws = XLSX.utils.aoa_to_sheet([headers, example]);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Template');
        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        return new NextResponse(buf, {
          headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': 'attachment; filename="qa_template.xlsx"'
          }
        });
      }

      // Return CSV template (standard RFC-4180 with proper quote escaping)
      const csvHeaders = headers.join(',');
      const csvExample = example.map(v => `"${v.replace(/"/g, '""')}"`).join(',');
      const csv = csvHeaders + '\n' + csvExample;

      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="qa_template.csv"'
        }
      });
    }

    const conditions: string[] = [];
    const params: (string | number)[] = [];

    if (lifecycle !== 'all') conditions.push(`tc.lifecycle_status = '${lifecycle}'`);
    if (moduleId) { conditions.push('tc.module_id = ?'); params.push(Number(moduleId)); }
    if (featureId) { conditions.push('tc.feature_id = ?'); params.push(Number(featureId)); }

    const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

    if (type === 'test-cases') {
      const rows = db.prepare(`
        SELECT tc.case_id, m.name as module, f.name as feature, tc.requirement_ref,
          tc.title, tc.test_type, tc.preconditions, tc.test_steps, tc.test_data,
          tc.expected_result, tc.actual_result, tc.priority, tc.prep_status,
          tc.exec_status, tc.latest_result, tc.defect_ref, tc.notes,
          tc.lifecycle_status, tc.created_at, tc.updated_at
        FROM test_cases tc
        JOIN modules m ON m.id = tc.module_id
        JOIN features f ON f.id = tc.feature_id
        ${where}
        ORDER BY tc.case_id
      `).all(...params) as Record<string, unknown>[];

      const csv = toCSV(rows);
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="test_cases_${new Date().toISOString().split('T')[0]}.csv"`
        }
      });
    }

    if (type === 'executions') {
      const rows = db.prepare(`
        SELECT tc.case_id, m.name as module, f.name as feature, tc.title,
          e.exec_date, e.environment, e.result, e.actual_result, e.defect_ref, e.notes, e.is_retest
        FROM executions e
        JOIN test_cases tc ON tc.id = e.test_case_id
        JOIN modules m ON m.id = tc.module_id
        JOIN features f ON f.id = tc.feature_id
        ORDER BY e.exec_date DESC
      `).all() as Record<string, unknown>[];

      const csv = toCSV(rows);
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="executions_${new Date().toISOString().split('T')[0]}.csv"`
        }
      });
    }

    if (type === 'change-log') {
      const rows = db.prepare(`
        SELECT entity_type, entity_id, entity_ref, change_type, changed_fields, 
          old_values, new_values, reason, requirement_ref, changed_at
        FROM change_log ORDER BY changed_at DESC
      `).all() as Record<string, unknown>[];

      const csv = toCSV(rows);
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="change_log_${new Date().toISOString().split('T')[0]}.csv"`
        }
      });
    }

    return NextResponse.json({ error: 'Invalid export type' }, { status: 400 });
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function toCSV(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escape = (val: unknown) => {
    const s = val == null ? '' : String(val);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  return [
    headers.join(','),
    ...rows.map(row => headers.map(h => escape(row[h])).join(','))
  ].join('\n');
}
