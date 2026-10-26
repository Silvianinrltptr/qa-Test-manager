import { getDb } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';
import * as XLSX from 'xlsx';
import { resolveTestCaseLanguageContent } from '@/lib/translation';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const type = searchParams.get('type') ?? 'test-cases';
    const format = searchParams.get('format')?.toLowerCase() === 'xlsx' ? 'xlsx' : 'csv';
    const lang = searchParams.get('lang') || req.cookies.get('qastudio_lang')?.value || 'en';
    const moduleId = searchParams.get('moduleId');
    const featureId = searchParams.get('featureId');
    const lifecycle = searchParams.get('lifecycle') ?? 'active';

    // Templates can be downloaded by any authenticated role or public preview
    if (type !== 'template') {
      const { errorResponse } = await requireAuth(req, ['qa', 'dev_pm']);
      if (errorResponse) return errorResponse;
    }

    const db = getDb();
    const dateStr = new Date().toISOString().split('T')[0];

    // ==========================================
    // 1. TEMPLATE DOWNLOAD
    // ==========================================
    if (type === 'template') {
      const headers = [
        'Module ID', 'Feature ID', 'Requirement Ref', 'Title', 'Test Type',
        'Preconditions', 'Test Steps', 'Test Data', 'Expected Result', 'Priority', 'Notes'
      ];
      const example = [
        '1', '1', 'REQ-001',
        lang === 'id' ? 'Login berhasil dengan kredensial yang valid' : 'Successful login with valid credentials',
        'functional',
        lang === 'id' ? 'Pengguna berada di halaman login' : 'User is on the login page',
        lang === 'id'
          ? '1. Buka halaman login\n2. Masukkan username valid\n3. Masukkan password valid\n4. Klik tombol Masuk'
          : '1. Open login page\n2. Enter username\n3. Enter password\n4. Click Login',
        'username: admin, password: Pass123!',
        lang === 'id'
          ? 'Pengguna berhasil masuk dan diarahkan ke dashboard utama'
          : 'User successfully logs in and is redirected to dashboard',
        'high',
        lang === 'id' ? 'Pengujian alur otentikasi standar' : 'Standard authentication flow test'
      ];

      if (format === 'xlsx') {
        const ws = XLSX.utils.aoa_to_sheet([headers, example]);
        ws['!cols'] = [
          { wch: 10 }, { wch: 10 }, { wch: 15 }, { wch: 35 }, { wch: 12 },
          { wch: 25 }, { wch: 40 }, { wch: 30 }, { wch: 35 }, { wch: 10 }, { wch: 25 }
        ];
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

      const csv = toCSV([
        Object.fromEntries(headers.map((h, i) => [h, example[i]]))
      ]);
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="qa_template.csv"'
        }
      });
    }

    // ==========================================
    // 2. TEST CASES EXPORT
    // ==========================================
    if (type === 'test-cases') {
      const conditions: string[] = [];
      const params: (string | number)[] = [];

      if (lifecycle !== 'all') conditions.push(`tc.lifecycle_status = '${lifecycle}'`);
      if (moduleId) { conditions.push('tc.module_id = ?'); params.push(Number(moduleId)); }
      if (featureId) { conditions.push('tc.feature_id = ?'); params.push(Number(featureId)); }

      const where = conditions.length ? 'WHERE ' + conditions.join(' AND ') : '';

      const rows = ((await db.prepare(`
        SELECT tc.case_id, m.name as module_name, f.name as feature_name, tc.requirement_ref,
          tc.title, tc.test_type, tc.preconditions, tc.test_steps, tc.test_data,
          tc.expected_result, tc.actual_result, tc.priority, tc.prep_status,
          tc.exec_status, tc.latest_result, tc.defect_ref, tc.notes,
          tc.lifecycle_status, tc.created_at, tc.updated_at,
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
        ORDER BY tc.case_id ASC
      `).all(...params)) as any[]) || [];

      const formatted = rows.map(r => {
        const resolved = resolveTestCaseLanguageContent(
          r,
          {
            en: r.trans_en_title ? {
              title: r.trans_en_title,
              preconditions: r.trans_en_preconditions,
              test_steps: r.trans_en_test_steps,
              test_data: r.trans_en_test_data,
              expected_result: r.trans_en_expected_result,
              language: 'en'
            } : null,
            id: r.trans_id_title ? {
              title: r.trans_id_title,
              preconditions: r.trans_id_preconditions,
              test_steps: r.trans_id_test_steps,
              test_data: r.trans_id_test_data,
              expected_result: r.trans_id_expected_result,
              language: 'id'
            } : null,
          },
          lang
        );

        const transStatus = resolved.has_translation
          ? (resolved.translation_reviewed ? `${lang.toUpperCase()} (Reviewed)` : `${lang.toUpperCase()} (Draft)`)
          : `Original ${resolved.source_language.toUpperCase()}`;

        return {
          'Case ID': r.case_id,
          'Module': r.module_name,
          'Feature': r.feature_name,
          'Requirement Ref': r.requirement_ref || '',
          'Title': resolved.title,
          'Test Type': r.test_type || 'functional',
          'Preconditions': resolved.preconditions || '',
          'Test Steps': resolved.test_steps || '',
          'Test Data': resolved.test_data || '',
          'Expected Result': resolved.expected_result || '',
          'Actual Result': r.actual_result || '',
          'Priority': r.priority || 'medium',
          'Prep Status': r.prep_status || 'draft',
          'Exec Status': r.exec_status || 'not_run',
          'Latest Result': r.latest_result || 'not_run',
          'Defect Ref': r.defect_ref || '',
          'Notes': r.notes || '',
          'Lifecycle Status': r.lifecycle_status || 'active',
          'Language': resolved.display_language === 'id' ? 'Indonesian' : 'English',
          'Translation Status': transStatus,
          'Created At': r.created_at ? new Date(r.created_at).toISOString().split('T')[0] : '',
          'Updated At': r.updated_at ? new Date(r.updated_at).toISOString().split('T')[0] : '',
        };
      });

      if (format === 'xlsx') {
        // Exclude technical columns from Excel export per requirements:
        // Excluded: Prep Status, Exec Status, Latest Result, Defect Ref, Notes, Lifecycle Status, Language, Translation Status
        const isId = lang === 'id';
        const xlsxFormatted = rows.map(r => {
          const resolved = resolveTestCaseLanguageContent(
            r,
            {
              en: r.trans_en_title ? {
                title: r.trans_en_title,
                preconditions: r.trans_en_preconditions,
                test_steps: r.trans_en_test_steps,
                test_data: r.trans_en_test_data,
                expected_result: r.trans_en_expected_result,
                language: 'en'
              } : null,
              id: r.trans_id_title ? {
                title: r.trans_id_title,
                preconditions: r.trans_id_preconditions,
                test_steps: r.trans_id_test_steps,
                test_data: r.trans_id_test_data,
                expected_result: r.trans_id_expected_result,
                language: 'id'
              } : null,
            },
            lang
          );

          if (isId) {
            return {
              'ID Kasus': r.case_id,
              'Modul': r.module_name,
              'Fitur': r.feature_name,
              'Referensi Kebutuhan': r.requirement_ref || '',
              'Skenario Uji': resolved.title,
              'Tipe Pengujian': r.test_type || 'functional',
              'Prasyarat': resolved.preconditions || '',
              'Langkah Pengujian': resolved.test_steps || '',
              'Data Pengujian': resolved.test_data || '',
              'Hasil yang Diharapkan': resolved.expected_result || '',
              'Hasil Aktual': r.actual_result || '',
              'Prioritas': r.priority || 'medium',
              'Dibuat Pada': r.created_at ? new Date(r.created_at).toISOString().split('T')[0] : '',
              'Diperbarui Pada': r.updated_at ? new Date(r.updated_at).toISOString().split('T')[0] : '',
            };
          }

          return {
            'Case ID': r.case_id,
            'Module': r.module_name,
            'Feature': r.feature_name,
            'Requirement Ref': r.requirement_ref || '',
            'Title': resolved.title,
            'Test Type': r.test_type || 'functional',
            'Preconditions': resolved.preconditions || '',
            'Test Steps': resolved.test_steps || '',
            'Test Data': resolved.test_data || '',
            'Expected Result': resolved.expected_result || '',
            'Actual Result': r.actual_result || '',
            'Priority': r.priority || 'medium',
            'Created At': r.created_at ? new Date(r.created_at).toISOString().split('T')[0] : '',
            'Updated At': r.updated_at ? new Date(r.updated_at).toISOString().split('T')[0] : '',
          };
        });

        const ws = XLSX.utils.json_to_sheet(xlsxFormatted);
        ws['!cols'] = [
          { wch: 12 }, // Case ID
          { wch: 18 }, // Module
          { wch: 18 }, // Feature
          { wch: 16 }, // Requirement Ref
          { wch: 40 }, // Title / Skenario Uji
          { wch: 14 }, // Test Type
          { wch: 30 }, // Preconditions
          { wch: 45 }, // Test Steps
          { wch: 25 }, // Test Data
          { wch: 40 }, // Expected Result
          { wch: 25 }, // Actual Result
          { wch: 12 }, // Priority
          { wch: 14 }, // Created At
          { wch: 14 }, // Updated At
        ];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, isId ? 'Kasus Uji' : 'Test Cases');
        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        return new NextResponse(buf, {
          headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="test_cases_${lang}_${dateStr}.xlsx"`
          }
        });
      }

      const csv = toCSV(formatted);
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="test_cases_${lang}_${dateStr}.csv"`
        }
      });
    }

    // ==========================================
    // 3. EXECUTIONS EXPORT
    // ==========================================
    if (type === 'executions') {
      const rows = ((await db.prepare(`
        SELECT tc.case_id, m.name as module_name, f.name as feature_name, tc.title,
          e.exec_date, e.environment, e.result, e.actual_result, e.defect_ref, e.notes, e.is_retest
        FROM executions e
        JOIN test_cases tc ON tc.id = e.test_case_id
        JOIN modules m ON m.id = tc.module_id
        JOIN features f ON f.id = tc.feature_id
        ORDER BY e.exec_date DESC
      `).all()) as any[]) || [];

      const formatted = rows.map(r => ({
        'Case ID': r.case_id,
        'Module': r.module_name,
        'Feature': r.feature_name,
        'Title': r.title,
        'Execution Date': r.exec_date ? new Date(r.exec_date).toISOString() : '',
        'Environment': r.environment || 'staging',
        'Result': r.result,
        'Actual Result': r.actual_result || '',
        'Defect Ref': r.defect_ref || '',
        'Notes': r.notes || '',
        'Is Retest': r.is_retest ? 'Yes' : 'No',
      }));

      if (format === 'xlsx') {
        const ws = XLSX.utils.json_to_sheet(formatted);
        ws['!cols'] = [
          { wch: 12 }, { wch: 15 }, { wch: 15 }, { wch: 35 },
          { wch: 22 }, { wch: 15 }, { wch: 12 }, { wch: 30 },
          { wch: 15 }, { wch: 25 }, { wch: 10 }
        ];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Executions');
        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        return new NextResponse(buf, {
          headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="executions_${dateStr}.xlsx"`
          }
        });
      }

      const csv = toCSV(formatted);
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="executions_${dateStr}.csv"`
        }
      });
    }

    // ==========================================
    // 4. CHANGE LOG AUDIT EXPORT
    // ==========================================
    if (type === 'change-log') {
      const rows = ((await db.prepare(`
        SELECT entity_type, entity_id, entity_ref, change_type, changed_fields, 
          old_values, new_values, reason, requirement_ref, changed_at
        FROM change_log ORDER BY changed_at DESC
      `).all()) as any[]) || [];

      const formatted = rows.map(r => ({
        'Entity Type': r.entity_type,
        'Entity Ref': r.entity_ref || String(r.entity_id),
        'Change Type': r.change_type,
        'Changed Fields': r.changed_fields || '',
        'Old Values': r.old_values || '',
        'New Values': r.new_values || '',
        'Reason': r.reason || '',
        'Requirement Ref': r.requirement_ref || '',
        'Changed At': r.changed_at ? new Date(r.changed_at).toISOString() : '',
      }));

      if (format === 'xlsx') {
        const ws = XLSX.utils.json_to_sheet(formatted);
        ws['!cols'] = [
          { wch: 15 }, { wch: 15 }, { wch: 15 }, { wch: 25 },
          { wch: 30 }, { wch: 30 }, { wch: 25 }, { wch: 15 }, { wch: 22 }
        ];
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Change Log');
        const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
        return new NextResponse(buf, {
          headers: {
            'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
            'Content-Disposition': `attachment; filename="change_log_${dateStr}.xlsx"`
          }
        });
      }

      const csv = toCSV(formatted);
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="change_log_${dateStr}.csv"`
        }
      });
    }

    return NextResponse.json({ error: 'Invalid export type' }, { status: 400 });
  } catch (error) {
    console.error('Export error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Standard RFC-4180 CSV serializer with UTF-8 BOM (\uFEFF)
 * for automatic UTF-8 detection in Microsoft Excel on Mac and Windows.
 */
function toCSV(rows: Record<string, unknown>[]): string {
  if (!rows || rows.length === 0) return '\uFEFF';
  const headers = Object.keys(rows[0]);
  const escapeCell = (val: unknown): string => {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const headerLine = headers.map(escapeCell).join(',');
  const rowLines = rows.map(row => headers.map(h => escapeCell(row[h])).join(','));

  // Prepend UTF-8 BOM \uFEFF
  return '\uFEFF' + [headerLine, ...rowLines].join('\r\n');
}
