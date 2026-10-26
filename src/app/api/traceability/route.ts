import { getDb } from '@/lib/db';
import { Module, Feature, Requirement, TestCase, Execution } from '@/lib/types';
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { errorResponse } = await requireAuth(req, ['qa', 'dev_pm']);
    if (errorResponse) return errorResponse;

    const db = getDb();
    const { searchParams } = new URL(req.url);
    const moduleId = searchParams.get('moduleId');

    const modFilter = moduleId ? 'WHERE m.id = ?' : '';
    const modParams = moduleId ? [Number(moduleId)] : [];

    // Modules
    const modules = ((await db.prepare(`SELECT * FROM modules ${modFilter} ORDER BY name`).all(...modParams)) as Module[]) || [];

    // Features
    const features = ((await db.prepare(`SELECT * FROM features ORDER BY name`).all()) as Feature[]) || [];

    // Requirements
    const requirements = ((await db.prepare(`SELECT * FROM requirements WHERE status != 'archived' ORDER BY ref_id`).all()) as (Requirement & { ref_id: string })[]) || [];

    // Test cases
    const testCases = ((await db.prepare(`
      SELECT tc.*, m.name as module_name, f.name as feature_name
      FROM test_cases tc
      LEFT JOIN modules m ON m.id = tc.module_id
      LEFT JOIN features f ON f.id = tc.feature_id
      WHERE tc.lifecycle_status != 'archived'
      ORDER BY tc.case_id
    `).all()) as (TestCase & { module_name?: string; feature_name?: string })[]) || [];

    // Executions (latest execution per test case)
    const executions = ((await db.prepare(`
      SELECT * FROM executions ORDER BY exec_date DESC
    `).all()) as Execution[]) || [];

    // Build hierarchical tree
    const matrix = modules.map(mod => {
      const modFeatures = features.filter(f => f.module_id === mod.id);
      const modReqs = requirements.filter(r => r.module_id === mod.id);
      const modCases = testCases.filter(tc => tc.module_id === mod.id);

      const featureItems = modFeatures.map(feat => {
        const featReqs = modReqs.filter(r => r.feature_id === feat.id);
        const featCases = modCases.filter(tc => tc.feature_id === feat.id);

        const reqItems = featReqs.map(req => {
          const linkedCases = featCases.filter(tc => 
            (tc.requirement_ref && tc.requirement_ref.trim().toLowerCase() === req.ref_id.trim().toLowerCase())
          ).map(tc => {
            const caseExecs = executions.filter(e => e.test_case_id === tc.id);
            return {
              ...tc,
              executions: caseExecs.slice(0, 3),
              hasExecutions: caseExecs.length > 0,
            };
          });

          return {
            ...req,
            testCases: linkedCases,
            isCovered: linkedCases.length > 0,
          };
        });

        // Test cases in this feature not linked to any requirement
        const unlinkedCases = featCases.filter(tc => 
          !tc.requirement_ref || !featReqs.some(r => r.ref_id.trim().toLowerCase() === tc.requirement_ref?.trim().toLowerCase())
        ).map(tc => {
          const caseExecs = executions.filter(e => e.test_case_id === tc.id);
          return {
            ...tc,
            executions: caseExecs.slice(0, 3),
            hasExecutions: caseExecs.length > 0,
          };
        });

        return {
          ...feat,
          requirements: reqItems,
          unlinkedCases,
        };
      });

      return {
        ...mod,
        features: featureItems,
      };
    });

    // Coverage statistics
    const totalReqs = requirements.length;
    let coveredReqsCount = 0;
    for (const r of requirements) {
      const hasCase = testCases.some(tc => tc.requirement_ref && tc.requirement_ref.trim().toLowerCase() === r.ref_id.trim().toLowerCase());
      if (hasCase) coveredReqsCount++;
    }

    const totalCases = testCases.length;
    const casesWithReq = testCases.filter(tc => tc.requirement_ref && tc.requirement_ref.trim() !== '').length;
    const casesExecuted = testCases.filter(tc => executions.some(e => e.test_case_id === tc.id)).length;

    const stats = {
      totalRequirements: totalReqs,
      coveredRequirements: coveredReqsCount,
      uncoveredRequirements: totalReqs - coveredReqsCount,
      reqCoveragePct: totalReqs > 0 ? Math.round((coveredReqsCount / totalReqs) * 100) : 0,
      totalTestCases: totalCases,
      casesWithRequirement: casesWithReq,
      casesWithoutRequirement: totalCases - casesWithReq,
      casesExecuted,
      executionCoveragePct: totalCases > 0 ? Math.round((casesExecuted / totalCases) * 100) : 0,
    };

    return NextResponse.json({
      matrix,
      stats,
    });
  } catch (error) {
    console.error('Traceability API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
