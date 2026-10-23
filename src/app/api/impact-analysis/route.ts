import { getDb, logActivity, logChange } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export interface ImpactItem {
  id: string; // unique item id
  requirementId: number;
  requirementRef: string;
  requirementTitle: string;
  requirementVersion: number;
  changeType: string;
  requirementStatus: string;
  moduleName: string;
  featureName: string;
  testCaseId?: number;
  caseId?: string;
  testCaseTitle?: string;
  currentTestStatus?: string;
  currentPrepStatus?: string;
  suggestedAction: 'obsolete' | 'update' | 'create_cases' | 'review';
  reason: string;
  severity: 'high' | 'medium' | 'low';
}

export async function GET(req: NextRequest) {
  try {
    const db = getDb();
    const { searchParams } = new URL(req.url);
    const moduleId = searchParams.get('moduleId');

    // 1. Fetch all requirements
    const modFilter = moduleId ? 'AND r.module_id = ?' : '';
    const modParams = moduleId ? [Number(moduleId)] : [];

    const requirements = db.prepare(`
      SELECT r.*,
        m.name as module_name,
        f.name as feature_name
      FROM requirements r
      LEFT JOIN modules m ON m.id = r.module_id
      LEFT JOIN features f ON f.id = r.feature_id
      WHERE 1=1 ${modFilter}
      ORDER BY r.updated_at DESC
    `).all(...modParams) as any[];

    // 2. Fetch all test cases
    const testCases = db.prepare(`
      SELECT tc.id, tc.case_id, tc.module_id, tc.feature_id, tc.requirement_ref,
             tc.title, tc.lifecycle_status, tc.prep_status, tc.latest_result,
             m.name as module_name, f.name as feature_name
      FROM test_cases tc
      LEFT JOIN modules m ON m.id = tc.module_id
      LEFT JOIN features f ON f.id = tc.feature_id
      WHERE tc.lifecycle_status != 'archived'
    `).all() as any[];

    const impacts: ImpactItem[] = [];

    // Analyze each requirement
    for (const req of requirements) {
      const linkedCases = testCases.filter(
        tc => tc.requirement_ref && tc.requirement_ref.trim().toLowerCase() === req.ref_id.trim().toLowerCase()
      );

      // Scenario A: Requirement is obsolete or archived, but test cases are still active
      if (req.status === 'obsolete' || req.status === 'archived') {
        for (const tc of linkedCases) {
          if (tc.lifecycle_status === 'active') {
            impacts.push({
              id: `req-${req.id}-tc-${tc.id}-obsolete`,
              requirementId: req.id,
              requirementRef: req.ref_id,
              requirementTitle: req.title,
              requirementVersion: req.version,
              changeType: req.change_type || 'obsolete',
              requirementStatus: req.status,
              moduleName: req.module_name || 'N/A',
              featureName: req.feature_name || 'N/A',
              testCaseId: tc.id,
              caseId: tc.case_id,
              testCaseTitle: tc.title,
              currentTestStatus: tc.lifecycle_status,
              currentPrepStatus: tc.prep_status,
              suggestedAction: 'obsolete',
              reason: `Requirement ${req.ref_id} telah usang/diarsipkan. Test case ini harus ditandai obsolete agar tidak dieksekusi secara keliru.`,
              severity: 'high',
            });
          }
        }
      }

      // Scenario B: Requirement updated / modified (version > 1 or change_type == 'updated')
      else if (req.version > 1 || req.change_type === 'updated' || req.change_type === 'scope_reduced') {
        for (const tc of linkedCases) {
          if (tc.lifecycle_status === 'active') {
            impacts.push({
              id: `req-${req.id}-tc-${tc.id}-update`,
              requirementId: req.id,
              requirementRef: req.ref_id,
              requirementTitle: req.title,
              requirementVersion: req.version,
              changeType: req.change_type,
              requirementStatus: req.status,
              moduleName: req.module_name || 'N/A',
              featureName: req.feature_name || 'N/A',
              testCaseId: tc.id,
              caseId: tc.case_id,
              testCaseTitle: tc.title,
              currentTestStatus: tc.lifecycle_status,
              currentPrepStatus: tc.prep_status,
              suggestedAction: req.change_type === 'scope_reduced' ? 'review' : 'update',
              reason: req.change_type === 'scope_reduced' 
                ? `Cakupan requirement ${req.ref_id} dikurangi. Verifikasi apakah test case ini masih relevan atau perlu penyesuaian.`
                : `Requirement ${req.ref_id} telah diperbarui ke versi ${req.version}. Perlu review langkah tes & expected result.`,
              severity: req.change_type === 'scope_reduced' ? 'medium' : 'high',
            });
          }
        }
      }

      // Scenario C: Newly created requirement with NO test cases linked
      if (linkedCases.length === 0 && req.status === 'active') {
        impacts.push({
          id: `req-${req.id}-no-cases`,
          requirementId: req.id,
          requirementRef: req.ref_id,
          requirementTitle: req.title,
          requirementVersion: req.version,
          changeType: req.change_type || 'new',
          requirementStatus: req.status,
          moduleName: req.module_name || 'N/A',
          featureName: req.feature_name || 'N/A',
          suggestedAction: 'create_cases',
          reason: `Requirement ${req.ref_id} belum memiliki test case sama sekali (Coverage Gap). Disarankan generate test case baru.`,
          severity: 'medium',
        });
      }
    }

    // Scenario D: Active test cases referencing unknown or missing requirements
    const allReqRefs = new Set(requirements.map(r => r.ref_id.trim().toLowerCase()));
    for (const tc of testCases) {
      if (tc.requirement_ref && tc.requirement_ref.trim() !== '') {
        const refLower = tc.requirement_ref.trim().toLowerCase();
        if (!allReqRefs.has(refLower) && tc.lifecycle_status === 'active') {
          impacts.push({
            id: `tc-${tc.id}-orphan`,
            requirementId: 0,
            requirementRef: tc.requirement_ref,
            requirementTitle: 'Requirement tidak ditemukan',
            requirementVersion: 0,
            changeType: 'removed',
            requirementStatus: 'missing',
            moduleName: tc.module_name || 'N/A',
            featureName: tc.feature_name || 'N/A',
            testCaseId: tc.id,
            caseId: tc.case_id,
            testCaseTitle: tc.title,
            currentTestStatus: tc.lifecycle_status,
            currentPrepStatus: tc.prep_status,
            suggestedAction: 'review',
            reason: `Test case merujuk ke requirement "${tc.requirement_ref}" yang sudah dihapus atau tidak terdaftar.`,
            severity: 'low',
          });
        }
      }
    }

    // Summary stats
    const stats = {
      totalImpacts: impacts.length,
      needObsolete: impacts.filter(i => i.suggestedAction === 'obsolete').length,
      needUpdate: impacts.filter(i => i.suggestedAction === 'update').length,
      needCreation: impacts.filter(i => i.suggestedAction === 'create_cases').length,
      needReview: impacts.filter(i => i.suggestedAction === 'review').length,
    };

    return NextResponse.json({
      impacts,
      stats,
    });
  } catch (error) {
    console.error('Impact analysis error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// User-approved bulk resolution of impact items
export async function POST(req: NextRequest) {
  try {
    const db = getDb();
    const body = await req.json();
    const { action, testCaseIds, reason } = body as {
      action: 'mark_obsolete' | 'mark_review';
      testCaseIds: number[];
      reason?: string;
    };

    if (!testCaseIds || testCaseIds.length === 0) {
      return NextResponse.json({ error: 'Tidak ada test case yang dipilih' }, { status: 400 });
    }

    let updatedCount = 0;

    for (const tcId of testCaseIds) {
      const tc = db.prepare('SELECT id, case_id, title, lifecycle_status, prep_status FROM test_cases WHERE id = ?').get(tcId) as any;
      if (!tc) continue;

      if (action === 'mark_obsolete') {
        db.prepare(`
          UPDATE test_cases 
          SET lifecycle_status = 'obsolete', updated_at = CURRENT_TIMESTAMP 
          WHERE id = ?
        `).run(tcId);

        logActivity(db, 'obsolete_test_case', 'test_case', tcId, tc.case_id, `Menandai ${tc.case_id} sebagai Obsolete akibat perubahan requirement`);
        logChange(db, {
          entityType: 'test_case',
          entityId: tcId,
          entityRef: tc.case_id,
          changeType: 'obsolete',
          oldValues: { lifecycle_status: tc.lifecycle_status },
          newValues: { lifecycle_status: 'obsolete' },
          reason: reason || 'Di-obsolete berdasarkan analisis dampak requirement',
        });
        updatedCount++;
      } else if (action === 'mark_review') {
        db.prepare(`
          UPDATE test_cases 
          SET prep_status = 'in_progress', updated_at = CURRENT_TIMESTAMP 
          WHERE id = ?
        `).run(tcId);

        logActivity(db, 'review_test_case', 'test_case', tcId, tc.case_id, `Menandai ${tc.case_id} perlu review persiapan akibat perubahan requirement`);
        logChange(db, {
          entityType: 'test_case',
          entityId: tcId,
          entityRef: tc.case_id,
          changeType: 'review_required',
          oldValues: { prep_status: tc.prep_status },
          newValues: { prep_status: 'in_progress' },
          reason: reason || 'Perlu review akibat perubahan requirement',
        });
        updatedCount++;
      }
    }

    return NextResponse.json({ success: true, updatedCount });
  } catch (error) {
    console.error('Impact apply error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
