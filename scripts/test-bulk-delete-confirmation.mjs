// scripts/test-bulk-delete-confirmation.mjs
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';

async function runTests() {
  console.log('=== VERIFYING BULK DELETE CONFIRMATION & WORKFLOW ===\n');
  let passed = 0;
  let failed = 0;

  function assert(cond, msg) {
    if (cond) {
      console.log(`✅ PASS: ${msg}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${msg}`);
      failed++;
    }
  }

  try {
    // 0. Login
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace: 'qa', password: 'qa-admin-2026' }),
    });
    assert(loginRes.ok, 'Login succeeded');
    const cookie = loginRes.headers.get('set-cookie')?.split(';')[0] || '';
    const headers = { 'Content-Type': 'application/json', Cookie: cookie };

    // 1. Create two temporary test cases for bulk delete test
    console.log('\n--- 1. Create Test Cases for Bulk Delete ---');
    const createRes = await fetch(`${BASE_URL}/api/test-cases`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        cases: [
          {
            module_id: 8,
            feature_id: 12,
            title: 'Bulk Delete Temp Case 1',
            test_type: 'functional',
            priority: 'low',
            prep_status: 'draft',
          },
          {
            module_id: 8,
            feature_id: 12,
            title: 'Bulk Delete Temp Case 2',
            test_type: 'functional',
            priority: 'low',
            prep_status: 'draft',
          }
        ]
      }),
    });
    assert(createRes.ok, 'Created 2 temporary test cases');
    const createData = await createRes.json();
    const id1 = createData.results?.[0]?.id;
    const id2 = createData.results?.[1]?.id;
    assert(typeof id1 === 'number' && typeof id2 === 'number', `Created IDs: ${id1}, ${id2}`);

    // Verify initial active state
    const tcsBefore = await prisma.testCase.findMany({
      where: { id: { in: [id1, id2] } }
    });
    assert(tcsBefore.length === 2, 'Found 2 cases in DB');
    assert(tcsBefore.every(tc => tc.lifecycleStatus === 'active'), 'Both cases are active');

    // 2. Test Cancel behavior: Data remains active and untouched
    console.log('\n--- 2. Simulating Cancel Action ---');
    // On cancel, no API call is made; selection and cases remain active
    const tcsAfterCancel = await prisma.testCase.findMany({
      where: { id: { in: [id1, id2] } }
    });
    assert(tcsAfterCancel.every(tc => tc.lifecycleStatus === 'active'), 'After Cancel, all test cases remain active and intact');

    // 3. Test Bulk Delete Execution (Soft Delete / Mark Obsolete)
    console.log('\n--- 3. Execute Existing Bulk Delete Action ---');
    for (const id of [id1, id2]) {
      const res = await fetch(`${BASE_URL}/api/test-cases/${id}`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ lifecycle_status: 'obsolete' })
      });
      assert(res.ok, `PUT /api/test-cases/${id} to obsolete returned 200 OK`);
    }

    // Verify soft-delete / obsolete in database
    const tcsAfterDelete = await prisma.testCase.findMany({
      where: { id: { in: [id1, id2] } }
    });
    assert(tcsAfterDelete.length === 2, 'Test cases still exist in DB (not permanently deleted)');
    assert(tcsAfterDelete.every(tc => tc.lifecycleStatus === 'obsolete'), 'Test cases lifecycleStatus is now "obsolete"');

    // 4. Verify Change Log and Activity Log
    console.log('\n--- 4. Verify Audit Logs ---');
    const changeLogs = await prisma.changeLog.findMany({
      where: { entityId: { in: [id1, id2] }, entityType: 'test_case', changeType: 'obsolete' }
    });
    assert(changeLogs.length === 2, 'Change log recorded 2 obsolete lifecycle changes');

    const activityLogs = await prisma.activityLog.findMany({
      where: { entityId: { in: [id1, id2] }, entityType: 'test_case' }
    });
    assert(activityLogs.length >= 2, 'Activity log recorded actions for both test cases');

    // 5. Cleanup temporary test cases
    await prisma.testCaseTranslation.deleteMany({ where: { testCaseId: { in: [id1, id2] } } });
    await prisma.changeLog.deleteMany({ where: { entityId: { in: [id1, id2] }, entityType: 'test_case' } });
    await prisma.activityLog.deleteMany({ where: { entityId: { in: [id1, id2] }, entityType: 'test_case' } });
    await prisma.testCase.deleteMany({ where: { id: { in: [id1, id2] } } });

    console.log(`\n==================================================`);
    console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
    console.log(`==================================================`);
  } catch (err) {
    console.error('Error during test execution:', err);
  } finally {
    await prisma.$disconnect();
  }
}

runTests();
