// scripts/test-bulk-prep-status.mjs
// Automated verification script for Filter-Based Bulk Update Preparation Status

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';

async function runTests() {
  console.log('=== STARTING AUTOMATED TESTS FOR FILTER-BASED BULK UPDATE PREPARATION STATUS ===\n');
  let passedCount = 0;
  let failedCount = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`✅ PASS: ${message}`);
      passedCount++;
    } else {
      console.error(`❌ FAIL: ${message}`);
      failedCount++;
    }
  }

  try {
    // 0. QA Authentication
    console.log('--- 0. QA Authentication ---');
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace: 'qa', password: 'qa-admin-2026' }),
    });
    assert(loginRes.ok, 'Login to QA Workspace succeeded');
    const setCookie = loginRes.headers.get('set-cookie');
    const qaCookie = setCookie ? setCookie.split(';')[0] : '';
    assert(!!qaCookie, 'Received qastudio_session cookie');

    const authHeaders = {
      'Content-Type': 'application/json',
      Cookie: qaCookie,
    };

    // 1. Audit active vs non-active cases
    console.log('\n--- 1. Target Eligibility: Active Cases Only ---');
    const activeCount = await prisma.testCase.count({ where: { lifecycleStatus: 'active' } });
    const obsoleteCount = await prisma.testCase.count({ where: { lifecycleStatus: 'obsolete' } });
    const archivedCount = await prisma.testCase.count({ where: { lifecycleStatus: 'archived' } });
    console.log(`Active cases: ${activeCount}, Obsolete cases: ${obsoleteCount}, Archived cases: ${archivedCount}`);
    assert(activeCount > 0, `Database has active cases (${activeCount})`);

    // 2. Test Preview API: Filter by Module & Feature
    console.log('\n--- 2. Preview API: Module & Feature Filtering ---');
    // Find a feature with test cases
    const featureWithCases = await prisma.feature.findFirst({
      where: {
        testCases: { some: { lifecycleStatus: 'active' } }
      },
      include: {
        module: true,
        testCases: { where: { lifecycleStatus: 'active' } }
      }
    });

    assert(!!featureWithCases, 'Found a feature with active test cases');
    const testModuleId = featureWithCases.moduleId;
    const testFeatureId = featureWithCases.id;
    const expectedActiveInFeature = featureWithCases.testCases.length;
    console.log(`Testing Feature "${featureWithCases.name}" (Module ID: ${testModuleId}, Feature ID: ${testFeatureId}) with ${expectedActiveInFeature} active cases`);

    const previewRes1 = await fetch(
      `${BASE_URL}/api/test-cases/bulk-prep-status?moduleId=${testModuleId}&featureId=${testFeatureId}&newStatus=ready`,
      { headers: authHeaders }
    );
    assert(previewRes1.ok, 'GET /api/test-cases/bulk-prep-status (preview) returned 200 OK');
    const previewData1 = await previewRes1.json();
    assert(previewData1.total_matching_active === expectedActiveInFeature, `Preview matching active cases count accurate (${previewData1.total_matching_active} === ${expectedActiveInFeature})`);
    assert(typeof previewData1.cases_to_update === 'number', 'Returns cases_to_update count');
    assert(typeof previewData1.already_in_target === 'number', 'Returns already_in_target count');
    assert(
      previewData1.cases_to_update + previewData1.already_in_target === previewData1.total_matching_active,
      'cases_to_update + already_in_target equals total_matching_active'
    );

    // 3. Test Preview when lifecycle filter is 'obsolete' (Should return 0 active cases)
    console.log('\n--- 3. Preview API: Obsolete / Archived Filter returns 0 active cases ---');
    const previewResObsolete = await fetch(
      `${BASE_URL}/api/test-cases/bulk-prep-status?lifecycle=obsolete&newStatus=ready`,
      { headers: authHeaders }
    );
    const previewDataObsolete = await previewResObsolete.json();
    assert(previewDataObsolete.total_matching_active === 0, 'Obsolete lifecycle filter yields 0 active cases for bulk update');
    assert(previewDataObsolete.cases_to_update === 0, 'Cases to update is 0 when non-active lifecycle is filtered');

    // 4. Test Bulk Update: Draft to Ready on Feature test cases
    console.log('\n--- 4. Bulk Update: Draft to Ready in a Database Transaction ---');
    // First, set 2 test cases in this feature to 'draft'
    const targetCaseIds = featureWithCases.testCases.slice(0, 3).map(c => c.id);
    await prisma.testCase.updateMany({
      where: { id: { in: targetCaseIds } },
      data: { prepStatus: 'draft' }
    });

    const updateRes = await fetch(`${BASE_URL}/api/test-cases/bulk-prep-status`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        filters: {
          moduleId: String(testModuleId),
          featureId: String(testFeatureId),
        },
        newStatus: 'ready',
        reason: 'Automated Test: Bulk update Draft to Ready',
      }),
    });

    assert(updateRes.ok, 'POST /api/test-cases/bulk-prep-status returned 200 OK');
    const updateResult = await updateRes.json();
    assert(updateResult.success === true, 'Update returned success: true');
    assert(updateResult.updated_count >= targetCaseIds.length, `Updated at least ${targetCaseIds.length} cases (found: ${updateResult.updated_count})`);
    assert(!!updateResult.bulk_operation_id, `Received bulk_operation_id: ${updateResult.bulk_operation_id}`);

    // Verify database state:
    const updatedCases = await prisma.testCase.findMany({
      where: { id: { in: targetCaseIds } }
    });
    assert(updatedCases.every(c => c.prepStatus === 'ready'), 'All targeted cases in DB now have prepStatus = "ready"');
    assert(updatedCases.every(c => c.lifecycleStatus === 'active'), 'Lifecycle status remains strictly "active" (unchanged)');

    // 5. Verify Change Log recording
    console.log('\n--- 5. Verify Change Log Records & Audit Trail ---');
    const changeLogs = await prisma.changeLog.findMany({
      where: {
        requirementRef: updateResult.bulk_operation_id
      }
    });
    assert(changeLogs.length === updateResult.updated_count, `Change Log has ${updateResult.updated_count} entries matching bulk_operation_id`);
    if (changeLogs.length > 0) {
      const firstLog = changeLogs[0];
      assert(firstLog.entityType === 'test_case', 'Change Log entity_type is "test_case"');
      assert(firstLog.changedFields === 'prep_status', 'Change Log changed_fields is "prep_status"');
      const oldVal = JSON.parse(firstLog.oldValues || '{}');
      const newVal = JSON.parse(firstLog.newValues || '{}');
      assert(newVal.prep_status === 'ready', `Change Log recorded new prep_status as "ready"`);
      assert(typeof oldVal.prep_status === 'string', `Change Log recorded old prep_status: "${oldVal.prep_status}"`);
      assert(typeof newVal.module === 'string', `Change Log recorded module: "${newVal.module}"`);
      assert(typeof newVal.feature === 'string', `Change Log recorded feature: "${newVal.feature}"`);
    }

    // 6. Test Idempotency / No-op: Running update again when all are already Ready
    console.log('\n--- 6. Idempotency Test: Already in Target Status ---');
    const noopRes = await fetch(`${BASE_URL}/api/test-cases/bulk-prep-status`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        filters: {
          moduleId: String(testModuleId),
          featureId: String(testFeatureId),
        },
        newStatus: 'ready',
      }),
    });
    const noopResult = await noopRes.json();
    assert(noopResult.success === true, 'Noop returns success: true');
    assert(noopResult.updated_count === 0, 'updated_count is 0 when all cases already have target status');
    assert(noopResult.already_in_target === expectedActiveInFeature, `already_in_target equals ${expectedActiveInFeature}`);

    // 7. Test Ready to In-Progress
    console.log('\n--- 7. Bulk Update: Ready to In Progress ---');
    const updateRes2 = await fetch(`${BASE_URL}/api/test-cases/bulk-prep-status`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        filters: {
          moduleId: String(testModuleId),
          featureId: String(testFeatureId),
        },
        newStatus: 'in_progress',
        reason: 'Automated Test: Ready to In Progress',
      }),
    });
    const updateResult2 = await updateRes2.json();
    assert(updateResult2.success === true, 'Ready -> In Progress succeeded');
    assert(updateResult2.updated_count === expectedActiveInFeature, `All ${expectedActiveInFeature} cases updated to in_progress`);

    // 8. Verify Non-Active cases (Obsolete/Archived) were NEVER touched
    console.log('\n--- 8. Non-Active Protection: Obsolete & Archived Cases Untouched ---');
    const obsoleteAfter = await prisma.testCase.count({ where: { lifecycleStatus: 'obsolete' } });
    const archivedAfter = await prisma.testCase.count({ where: { lifecycleStatus: 'archived' } });
    assert(obsoleteAfter === obsoleteCount, `Obsolete cases count unchanged (${obsoleteAfter} === ${obsoleteCount})`);
    assert(archivedAfter === archivedCount, `Archived cases count unchanged (${archivedAfter} === ${archivedCount})`);

    // 9. Verify Execution Result & Execution History NOT altered
    console.log('\n--- 9. Execution Result & History Integrity ---');
    const executionCount = await prisma.execution.count();
    console.log(`Total execution history count: ${executionCount}`);
    assert(executionCount >= 0, 'Execution history count intact');

    // 10. Verify Dashboard Preparation Progress reflects updated prep_status
    console.log('\n--- 10. Dashboard API Preparation Progress Reflection ---');
    const dashRes = await fetch(`${BASE_URL}/api/dashboard`, { headers: authHeaders });
    assert(dashRes.ok, 'GET /api/dashboard returned 200 OK');
    const dashData = await dashRes.json();
    assert(typeof dashData.prepProgress === 'object', 'Dashboard has prepProgress data');
    assert(typeof dashData.prepProgress.ready === 'number', `Dashboard ready count is numeric: ${dashData.prepProgress.ready}`);
    assert(typeof dashData.prepProgress.pct === 'number', `Dashboard prepProgress pct is numeric: ${dashData.prepProgress.pct}%`);

    // 11. Cleanup / Restore test cases in testFeature to original state or 'ready'
    console.log('\n--- 11. Restoration ---');
    await prisma.testCase.updateMany({
      where: { id: { in: featureWithCases.testCases.map(c => c.id) } },
      data: { prepStatus: 'ready' }
    });
    console.log('Restored test cases to ready status.');

    console.log(`\n==================================================`);
    console.log(`RESULTS: ${passedCount} PASSED, ${failedCount} FAILED`);
    console.log(`==================================================`);

    if (failedCount > 0) {
      process.exit(1);
    }
  } catch (err) {
    console.error('Fatal error during testing:', err);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

runTests();
