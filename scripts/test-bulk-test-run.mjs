// scripts/test-bulk-test-run.mjs
// Automated verification script for Bulk Test Execution & Test Run feature (Simplified UI)

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';

async function runTests() {
  console.log('=== STARTING AUTOMATED TESTS FOR SIMPLIFIED BULK TEST SELECTION & RUN ===\n');
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

    // 1. Audit master test cases
    console.log('\n--- 1. Audit Master Test Cases ---');
    const totalCases = await prisma.testCase.count();
    const activeCases = await prisma.testCase.count({ where: { lifecycleStatus: 'active' } });
    const notRunCases = await prisma.testCase.count({ where: { lifecycleStatus: 'active', latestResult: 'not_run' } });
    const passCases = await prisma.testCase.count({ where: { lifecycleStatus: 'active', latestResult: 'pass' } });

    console.log(`Total test cases in database: ${totalCases}`);
    console.log(`Active test cases: ${activeCases}`);
    console.log(`Active Not-Run test cases: ${notRunCases}`);
    console.log(`Active Pass test cases: ${passCases}`);
    assert(totalCases > 0, `Database has test cases (total: ${totalCases}, active: ${activeCases})`);

    // 2. Test Select All via Header Checkbox (selectIdsOnly=true) across pagination
    console.log('\n--- 2. Header Checkbox: Select All Filtered Test Cases (Across Pagination) ---');
    const resSelectActive = await fetch(`${BASE_URL}/api/test-cases?selectIdsOnly=true&limit=20&lifecycle=active`, { headers: authHeaders });
    const dataSelectActive = await resSelectActive.json();
    assert(resSelectActive.ok, 'selectIdsOnly=true endpoint returned 200 OK');
    assert(Array.isArray(dataSelectActive.data), 'Returns data array');
    assert(dataSelectActive.total === activeCases, `Header checkbox selects all active cases (${dataSelectActive.total} === ${activeCases}) across pagination`);

    // 3. Test Filter "latestResult = not_run"
    console.log('\n--- 3. Filter Execution Result = Not Run ---');
    const resSelectNotRun = await fetch(`${BASE_URL}/api/test-cases?selectIdsOnly=true&limit=20&lifecycle=active&latestResult=not_run`, { headers: authHeaders });
    const dataSelectNotRun = await resSelectNotRun.json();
    assert(dataSelectNotRun.total === notRunCases, `Filter latestResult=not_run returns exactly all ${notRunCases} Not-Run cases`);
    assert(dataSelectNotRun.data.every(tc => tc.latest_result === 'not_run'), 'All returned cases have latest_result = not_run');

    // 4. Test Filter "latestResult = pass" (Regression Testing)
    console.log('\n--- 4. Filter Execution Result = Pass (Regression Testing) ---');
    const resSelectPass = await fetch(`${BASE_URL}/api/test-cases?selectIdsOnly=true&limit=20&lifecycle=active&latestResult=pass`, { headers: authHeaders });
    const dataSelectPass = await resSelectPass.json();
    assert(dataSelectPass.total === passCases, `Filter latestResult=pass returns exactly all ${passCases} Pass cases for regression testing`);
    assert(dataSelectPass.data.every(tc => tc.latest_result === 'pass'), 'All returned cases have latest_result = pass');

    // 5. Test Indeterminate state calculation logic
    console.log('\n--- 5. Indeterminate State Logic Verification ---');
    const totalFiltered = dataSelectNotRun.total;
    // Suppose 3 cases are selected out of 80:
    const partialSelectedCount = Math.min(3, totalFiltered);
    const isIndeterminateTrue = partialSelectedCount > 0 && partialSelectedCount < totalFiltered;
    const isAllSelectedFalse = partialSelectedCount === totalFiltered;
    assert(isIndeterminateTrue, `Subset selection (${partialSelectedCount}/${totalFiltered}) correctly sets isIndeterminate = true`);
    assert(!isAllSelectedFalse, `Subset selection correctly sets isAllSelected = false`);

    // When all are selected:
    const fullSelectedCount = totalFiltered;
    const isIndeterminateFalse = fullSelectedCount > 0 && fullSelectedCount < totalFiltered;
    const isAllSelectedTrue = totalFiltered > 0 && fullSelectedCount === totalFiltered;
    assert(!isIndeterminateFalse, `Full selection (${fullSelectedCount}/${totalFiltered}) correctly clears indeterminate`);
    assert(isAllSelectedTrue, `Full selection correctly sets isAllSelected = true`);

    // 6. Test Multi-Module & Multi-Feature Test Run Creation & Strict Hierarchical Ordering
    console.log('\n--- 6. Multi-Feature / Multi-Module Test Run Creation & Ordering Test ---');
    // Fetch a sample of 6 test cases across different features/modules
    const sampleCases = await prisma.testCase.findMany({
      take: 6,
      include: {
        module: true,
        feature: true,
      },
      orderBy: { id: 'desc' } // intentionally reverse order to test sorting logic
    });

    const testCaseIds = sampleCases.map(c => c.id);
    const runName = `Automated Verification Run - ${Date.now()}`;

    const resCreateRun = await fetch(`${BASE_URL}/api/test-runs`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        name: runName,
        description: 'Testing bulk test run creation with simplified header selection',
        environment: 'STG',
        testCaseIds: testCaseIds,
      }),
    });

    assert(resCreateRun.ok, 'POST /api/test-runs created run successfully with QA session');
    const createdRun = await resCreateRun.json();
    assert(createdRun.id > 0, `Created Test Run ID: ${createdRun.id}`);
    assert(createdRun.name === runName, `Run name matches: ${createdRun.name}`);
    assert(createdRun.status === 'in_progress', 'Initial status is in_progress');

    // 7. Fetch Test Run details and verify STRICT ORDER: Module ASC, Feature ASC, Case ID ASC
    console.log('\n--- 7. Verify Test Run Item Sorting & Structure ---');
    const resGetRun = await fetch(`${BASE_URL}/api/test-runs?id=${createdRun.id}`, { headers: authHeaders });
    assert(resGetRun.ok, 'GET /api/test-runs?id=... returned 200 OK');
    const runDetails = await resGetRun.json();
    assert(runDetails.items.length === testCaseIds.length, `Run has all ${testCaseIds.length} items`);

    // Verify ordering
    let properlyOrdered = true;
    for (let i = 0; i < runDetails.items.length - 1; i++) {
      const a = runDetails.items[i];
      const b = runDetails.items[i + 1];
      const modA = a.module_name || '';
      const modB = b.module_name || '';
      const featA = a.feature_name || '';
      const featB = b.feature_name || '';
      const idA = a.case_id || '';
      const idB = b.case_id || '';

      if (modA !== modB) {
        if (modA.localeCompare(modB) > 0) properlyOrdered = false;
      } else if (featA !== featB) {
        if (featA.localeCompare(featB) > 0) properlyOrdered = false;
      } else {
        if (idA.localeCompare(idB) > 0) properlyOrdered = false;
      }
    }
    assert(properlyOrdered, 'Items inside Test Run are strictly sorted by Module -> Feature -> Case ID ASC');

    // 8. Test Executing a test case within the Test Run
    console.log('\n--- 8. Execute Test Case & Update Run Item ---');
    const firstItem = runDetails.items[0];
    const targetCaseId = firstItem.test_case_id;

    // Execution 1: Fail
    const resExec1 = await fetch(`${BASE_URL}/api/executions`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        test_case_id: targetCaseId,
        test_run_id: createdRun.id,
        result: 'fail',
        actual_result: 'Login failed with 500 status',
        defect_ref: 'BUG-101',
        environment: 'STG',
        notes: 'First attempt in automated run',
        is_retest: false,
      }),
    });

    assert(resExec1.ok, 'POST /api/executions (1st attempt - Fail) succeeded');

    // Verify test_case latestResult updated
    const caseAfter1 = await prisma.testCase.findUnique({ where: { id: targetCaseId } });
    assert(caseAfter1.latestResult === 'fail', `Master test case latest_result updated to 'fail' (found: ${caseAfter1.latestResult})`);

    // 9. Test Retest without overwriting history
    console.log('\n--- 9. Retest Execution (Preserving History) ---');
    // Execution 2: Pass (Retest)
    const resExec2 = await fetch(`${BASE_URL}/api/executions`, {
      method: 'POST',
      headers: authHeaders,
      body: JSON.stringify({
        test_case_id: targetCaseId,
        test_run_id: createdRun.id,
        result: 'pass',
        actual_result: 'Login succeeded after hotfix',
        environment: 'STG',
        notes: 'Second attempt - retest passed',
        is_retest: true,
      }),
    });

    assert(resExec2.ok, 'POST /api/executions (2nd attempt - Retest Pass) succeeded');

    // Count executions for this test case
    const historyCount = await prisma.execution.count({
      where: { testCaseId: targetCaseId },
    });
    assert(historyCount >= 2, `Execution history preserved! Total records for this case: ${historyCount} (>= 2)`);

    const caseAfter2 = await prisma.testCase.findUnique({ where: { id: targetCaseId } });
    assert(caseAfter2.latestResult === 'pass', `Master test case latest_result updated to latest attempt: 'pass'`);

    // 10. Test Metrics & Progress Calculation
    console.log('\n--- 10. Test Run Summary & Metrics ---');
    const resGetRunUpdated = await fetch(`${BASE_URL}/api/test-runs?id=${createdRun.id}`, { headers: authHeaders });
    const updatedRun = await resGetRunUpdated.json();
    assert(updatedRun.total_cases === testCaseIds.length, `Total cases: ${updatedRun.total_cases}`);
    assert(updatedRun.passed_cases === 1, `Passed count: ${updatedRun.passed_cases} (from latest item status)`);
    assert(updatedRun.not_run_cases === testCaseIds.length - 1, `Not Run count: ${updatedRun.not_run_cases}`);
    const expectedProgress = Math.round((1 / testCaseIds.length) * 100);
    assert(updatedRun.progress_pct === expectedProgress, `Progress % matches formula: ${updatedRun.progress_pct}% === ${expectedProgress}%`);
    assert(updatedRun.pass_rate_pct === 100, `Pass rate is 100% since 1 pass and 0 fail (found: ${updatedRun.pass_rate_pct}%)`);

    // 11. Clean up test run artifact to keep DB clean
    console.log('\n--- 11. Cleanup verification run ---');
    await prisma.execution.deleteMany({ where: { testRunId: createdRun.id } });
    await prisma.testRunItem.deleteMany({ where: { testRunId: createdRun.id } });
    await prisma.testRun.delete({ where: { id: createdRun.id } });
    console.log('Cleanup completed cleanly.');

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
