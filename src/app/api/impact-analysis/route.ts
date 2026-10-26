import { getDb, logActivity, logChange } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';

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
    const { errorResponse } = await requireAuth(req, ['qa']);
    if (errorResponse) return errorResponse;

    const db = getDb();
    const { searchParams } = new URL(req.url);
    const moduleId = searchParams.get('moduleId');

    // 1. Fetch all requirements
    const modFilter = moduleId ? 'AND r.module_id = ?' : '';
    const modParams = moduleId ? [Number(moduleId)] : [];

    interface RequirementWithMeta {
      id: number;
      ref_id: string;
      title: string;
      description: string | null;
      change_type: string;
      status: string;
      version: number;
      module_id: number;
      feature_id: number;
      created_at: string;
      updated_at: string;
      module_name: string | null;
      feature_name: string | null;
    }

    interface TestCaseWithMeta {
      id: number;
      case_id: string;
      module_id: number;
      feature_id: number;
      requirement_ref: string | null;
      title: string;
      lifecycle_status: string;
      prep_status: string;
      latest_result: string;
      module_name: string | null;
      feature_name: string | null;
    }

    const requirements = ((await db.prepare(`
      SELECT r.*,
        m.name as module_name,
        f.name as feature_name
      FROM requirements r
      LEFT JOIN modules m ON m.id = r.module_id
      LEFT JOIN features f ON f.id = r.feature_id
      WHERE 1=1 ${modFilter}
      ORDER BY r.updated_at DESC
    `).all(...modParams)) as RequirementWithMeta[]) || [];

    // 2. Fetch all test cases
    const testCases = ((await db.prepare(`
      SELECT tc.id, tc.case_id, tc.module_id, tc.feature_id, tc.requirement_ref,
             tc.title, tc.lifecycle_status, tc.prep_status, tc.latest_result,
             m.name as module_name, f.name as feature_name
      FROM test_cases tc
      LEFT JOIN modules m ON m.id = tc.module_id
      LEFT JOIN features f ON f.id = tc.feature_id
      WHERE tc.lifecycle_status != 'archived'
    `).all()) as TestCaseWithMeta[]) || [];

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
              reason: `Requirement ${req.ref_id} is obsolete/archived. This test case should be marked obsolete to prevent accidental execution.`,
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
                ? `Requirement ${req.ref_id} scope was reduced. Verify if this test case remains relevant or needs adjustments.`
                : `Requirement ${req.ref_id} was updated to version ${req.version}. Test steps & expected result need review.`,
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
          reason: `Requirement ${req.ref_id} has no test cases linked (Coverage Gap). Generating new test cases is recommended.`,
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
            requirementTitle: 'Requirement not found',
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
            reason: `Test case references requirement "${tc.requirement_ref}" which has been deleted or is not registered.`,
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
    const { errorResponse } = await requireAuth(req, ['qa']);
    if (errorResponse) return errorResponse;

    const db = getDb();
    const body = await req.json();
    const { action, testCaseIds, reason } = body as {
      action: 'mark_obsolete' | 'mark_review';
      testCaseIds: number[];
      reason?: string;
    };

    if (!testCaseIds || testCaseIds.length === 0) {
      return NextResponse.json({ error: 'No test cases selected' }, { status: 400 });
    }

    let updatedCount = 0;

    for (const tcId of testCaseIds) {
      const tc = (await db.prepare('SELECT id, case_id, title, lifecycle_status, prep_status FROM test_cases WHERE id = ?').get(tcId)) as {
        id: number;
        case_id: string;
        title: string;
        lifecycle_status: string;
        prep_status: string;
      } | undefined;
      if (!tc) continue;

      if (action === 'mark_obsolete') {
        await db.prepare(`
          UPDATE test_cases 
          SET lifecycle_status = 'obsolete', updated_at = CURRENT_TIMESTAMP 
          WHERE id = ?
        `).run(tcId);

        await logActivity(db, 'obsolete_test_case', 'test_case', tcId, tc.case_id, `Marked ${tc.case_id} as Obsolete due to requirement change`);
        await logChange(db, {
          entityType: 'test_case',
          entityId: tcId,
          entityRef: tc.case_id,
          changeType: 'obsolete',
          oldValues: { lifecycle_status: tc.lifecycle_status },
          newValues: { lifecycle_status: 'obsolete' },
          reason: reason || 'Marked obsolete based on requirement impact analysis',
        });
        updatedCount++;
      } else if (action === 'mark_review') {
        await db.prepare(`
          UPDATE test_cases 
          SET prep_status = 'in_progress', updated_at = CURRENT_TIMESTAMP 
          WHERE id = ?
        `).run(tcId);

        await logActivity(db, 'review_test_case', 'test_case', tcId, tc.case_id, `Marked ${tc.case_id} for preparation review due to requirement change`);
        await logChange(db, {
          entityType: 'test_case',
          entityId: tcId,
          entityRef: tc.case_id,
          changeType: 'review_required',
          oldValues: { prep_status: tc.prep_status },
          newValues: { prep_status: 'in_progress' },
          reason: reason || 'Review required due to requirement change',
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
