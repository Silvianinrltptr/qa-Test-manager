// scripts/test-bulk-prep-filter-and-delete.mjs
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';

async function runTests() {
  console.log('=== VERIFYING FILTER CONSISTENCY & DELETE WORKFLOW ===\n');
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

    // 1. Module 8 (Master Data) has 49 active test cases; Feature 12 (Countries) has 12 active test cases
    console.log('\n--- 1. Testing Specific Master Data & Countries Filter Consistency ---');
    const masterDataRes = await fetch(`${BASE_URL}/api/test-cases/bulk-prep-status?moduleId=8&lifecycle=active`, { headers });
    const masterDataPreview = await masterDataRes.json();
    assert(masterDataPreview.total_matching_active === 49, `Master Data module alone has 49 active cases (found: ${masterDataPreview.total_matching_active})`);

    const countriesRes = await fetch(`${BASE_URL}/api/test-cases/bulk-prep-status?moduleId=8&featureId=12&lifecycle=active`, { headers });
    const countriesPreview = await countriesRes.json();
    assert(countriesPreview.total_matching_active === 12, `Master Data + Countries filter returns exactly 12 active cases, NOT 49 (found: ${countriesPreview.total_matching_active})`);

    // Verify /api/test-cases matches preview count
    const tcListRes = await fetch(`${BASE_URL}/api/test-cases?moduleId=8&featureId=12&lifecycle=active`, { headers });
    const tcListData = await tcListRes.json();
    assert(tcListData.pagination.total === countriesPreview.total_matching_active, `Test Cases list count (${tcListData.pagination.total}) exactly equals Bulk Prep Preview count (${countriesPreview.total_matching_active})`);

    // 2. Multi-filter combination: Module + Feature + Priority + Prep Status
    console.log('\n--- 2. Multi-Filter Combinations ---');
    // Let's test with Priority or Prep Status
    const comboPreviewRes = await fetch(`${BASE_URL}/api/test-cases/bulk-prep-status?moduleId=8&featureId=12&prepStatus=ready&lifecycle=active`, { headers });
    const comboPreview = await comboPreviewRes.json();
    const comboTcRes = await fetch(`${BASE_URL}/api/test-cases?moduleId=8&featureId=12&prepStatus=ready&lifecycle=active`, { headers });
    const comboTcData = await comboTcRes.json();
    assert(comboPreview.total_matching_active === comboTcData.pagination.total, `Combo filter matches page total (${comboPreview.total_matching_active} === ${comboTcData.pagination.total})`);

    // 3. Search query filter
    console.log('\n--- 3. Search Query Filter Consistency ---');
    const searchParam = 'Country';
    const searchPreviewRes = await fetch(`${BASE_URL}/api/test-cases/bulk-prep-status?moduleId=8&search=${searchParam}&lifecycle=active`, { headers });
    const searchPreview = await searchPreviewRes.json();
    const searchTcRes = await fetch(`${BASE_URL}/api/test-cases?moduleId=8&search=${searchParam}&lifecycle=active`, { headers });
    const searchTcData = await searchTcRes.json();
    assert(searchPreview.total_matching_active === searchTcData.pagination.total, `Search filter matches page total (${searchPreview.total_matching_active} === ${searchTcData.pagination.total})`);

    // 4. Affected Cases payload in preview
    console.log('\n--- 4. Affected Cases Structure in Preview ---');
    assert(Array.isArray(countriesPreview.affected_cases), 'Preview returns affected_cases array');
    assert(countriesPreview.affected_cases.length === 12, `affected_cases has 12 items`);
    const firstAffected = countriesPreview.affected_cases[0];
    assert(!!firstAffected.case_id, 'affected case has case_id');
    assert(!!firstAffected.feature_name, 'affected case has feature_name');
    assert(typeof firstAffected.current_prep_status === 'string', 'affected case has current_prep_status');
    assert(typeof firstAffected.new_prep_status === 'string', 'affected case has new_prep_status');

    // 5. Test Delete Mechanism (Soft delete / Archive with confirmation)
    console.log('\n--- 5. Delete Mechanism (Archive) Test ---');
    // Create a temporary test case to delete
    const createTcRes = await fetch(`${BASE_URL}/api/test-cases`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        cases: [
          {
            module_id: 8,
            feature_id: 12,
            title: 'Temp Test Case for Delete Confirmation Verification',
            test_type: 'functional',
            priority: 'low',
            prep_status: 'draft',
          }
        ]
      }),
    });
    assert(createTcRes.ok, 'Created temporary test case');
    const createTcData = await createTcRes.json();
    const createdId = createTcData.results?.[0]?.id;
    assert(typeof createdId === 'number', `Got created testcase ID (${createdId})`);

    const dbTcBefore = await prisma.testCase.findUnique({ where: { id: createdId } });
    assert(dbTcBefore?.lifecycleStatus === 'active', 'Created testcase has active lifecycle');

    // Perform DELETE
    const delRes = await fetch(`${BASE_URL}/api/test-cases/${createdId}`, {
      method: 'DELETE',
      headers,
    });
    assert(delRes.ok, 'DELETE /api/test-cases/:id returned 200 OK');

    // Verify it is archived in DB, not permanently deleted
    const dbTcAfter = await prisma.testCase.findUnique({ where: { id: createdId } });
    assert(!!dbTcAfter, 'Test case row still exists in DB');
    assert(dbTcAfter.lifecycleStatus === 'archived', 'Test case lifecycleStatus is archived');

    // Verify activity log
    const delActivity = await prisma.activityLog.findFirst({
      where: { entityType: 'test_case', entityId: createdId, action: 'archived' }
    });
    assert(!!delActivity, 'Deletion logged as archived in activity_log');

    // Clean up temporary test case
    await prisma.testCaseTranslation.deleteMany({ where: { testCaseId: createdId } });
    await prisma.changeLog.deleteMany({ where: { entityId: createdId, entityType: 'test_case' } });
    await prisma.activityLog.deleteMany({ where: { entityId: createdId, entityType: 'test_case' } });
    await prisma.testCase.delete({ where: { id: createdId } });

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
