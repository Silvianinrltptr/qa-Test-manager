// Automated Verification Script for QA Studio Access Control & Regression
import assert from 'node:assert';
import Database from 'better-sqlite3';

const BASE_URL = 'http://localhost:3000';

async function runTests() {
  console.log('🚀 Starting Comprehensive QA Studio Security & Regression Tests...\n');
  let passed = 0;
  let total = 0;

  async function test(name, fn) {
    total++;
    try {
      await fn();
      console.log(`✅ [PASS] Scenario ${total}: ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ [FAIL] Scenario ${total}: ${name}`);
      console.error(err);
      process.exitCode = 1;
    }
  }

  // 1. Password-Free Developer & PM Access to Project Viewer and UI Elements
  await test('Developer & PM can access /project-viewer directly without password (200 OK)', async () => {
    const res = await fetch(`${BASE_URL}/project-viewer`);
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const html = await res.text();
    assert(html.includes('Project Viewer'), 'Page must contain Project Viewer branding');
    assert(!html.includes('workspace-password-input'), 'Page must not prompt for password');
  });

  await test('Project Viewer contains restored headings and excludes unwanted elements', async () => {
    const fs = await import('node:fs');
    const pageCode = fs.readFileSync('src/app/project-viewer/page.tsx', 'utf8');
    // 1. Restored elements
    assert(pageCode.includes('Test Cases ({totalCases})'), 'Must contain Test Cases tab button heading');
    assert(pageCode.includes('Execution & Health Summary'), 'Must contain Execution & Health Summary tab button heading');
    // 2. Removed elements
    assert(!pageCode.includes('Read-Only + Commenting'), 'Read-Only + Commenting badge must be absent');
    assert(!pageCode.includes('Switch to QA Workspace'), 'Switch to QA Workspace button must be absent');
    assert(!pageCode.includes('<Eye'), 'Blue eye icon must remain absent');
    assert(!pageCode.includes('Results by Module'), 'Results by Module section must be absent');
    assert(!pageCode.includes('Module Quality Distribution'), 'Module Quality Distribution section must be absent');
    // 3. Kept dashboard sections
    assert(pageCode.includes('Progress by Module'), 'Progress by Module section must be present');
  });

  // 2. Developer & PM Read Access to APIs without password
  await test('Developer & PM can read /api/dashboard without password', async () => {
    const res = await fetch(`${BASE_URL}/api/dashboard`);
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert(typeof data.totalActive === 'number', 'Expected totalActive number in dashboard');
  });

  await test('Developer & PM can read /api/test-cases without password', async () => {
    const res = await fetch(`${BASE_URL}/api/test-cases`);
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const data = await res.json();
    assert(Array.isArray(data.data), 'Expected array of test cases');
    assert(data.data.length >= 1, 'Expected at least 1 test case');
  });

  // 3. Unauthenticated / Dev_PM Mutations Forbidden (Server-Side Authorization)
  await test('Direct API call to create test case without QA session is blocked (401 Unauthorized)', async () => {
    const res = await fetch(`${BASE_URL}/api/test-cases`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cases: [{ module_id: 1, feature_id: 1, title: 'Unauthorized Case' }],
      }),
    });
    assert.strictEqual(res.status, 401, `Expected 401, got ${res.status}`);
    const data = await res.json();
    assert.strictEqual(data.error, 'UNAUTHORIZED');
  });

  await test('Direct API call to update test case without QA session is blocked (401 Unauthorized)', async () => {
    const res = await fetch(`${BASE_URL}/api/test-cases/9`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'Hacked Title' }),
    });
    assert.strictEqual(res.status, 401);
    const data = await res.json();
    assert.strictEqual(data.error, 'UNAUTHORIZED');
  });

  await test('Direct API call to delete test case without QA session is blocked (401 Unauthorized)', async () => {
    const res = await fetch(`${BASE_URL}/api/test-cases/9`, {
      method: 'DELETE',
    });
    assert.strictEqual(res.status, 401);
    const data = await res.json();
    assert.strictEqual(data.error, 'UNAUTHORIZED');
  });

  await test('Direct API call to record execution without QA session is blocked (401 Unauthorized)', async () => {
    const res = await fetch(`${BASE_URL}/api/executions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ test_case_id: 9, result: 'pass' }),
    });
    assert.strictEqual(res.status, 401);
    const data = await res.json();
    assert.strictEqual(data.error, 'UNAUTHORIZED');
  });

  await test('Direct API call to access QA settings without QA session is blocked (401 Unauthorized)', async () => {
    const res = await fetch(`${BASE_URL}/api/settings`);
    assert.strictEqual(res.status, 401);
  });

  await test('Direct API call to access Feedback Inbox without QA session is blocked (401 Unauthorized)', async () => {
    const res = await fetch(`${BASE_URL}/api/comments/inbox`);
    assert.strictEqual(res.status, 401);
  });

  // 4. QA Route Protection
  await test('Unauthenticated user requesting QA page /dashboard is redirected to landing page', async () => {
    const res = await fetch(`${BASE_URL}/dashboard`, { redirect: 'manual' });
    assert([307, 308, 302].includes(res.status), `Expected redirect status, got ${res.status}`);
    const location = res.headers.get('location');
    assert(location && (location.endsWith('/') || location === 'http://localhost:3000/'), `Expected redirect to /, got ${location}`);
  });

  await test('Unauthenticated user requesting QA page /feedback is redirected to landing page', async () => {
    const res = await fetch(`${BASE_URL}/feedback`, { redirect: 'manual' });
    assert([307, 308, 302].includes(res.status), `Expected redirect status, got ${res.status}`);
  });

  // 5. QA Login - Invalid Password
  await test('Incorrect QA password returns 401 error', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace: 'qa', password: 'wrongpassword' }),
    });
    assert.strictEqual(res.status, 401);
    const data = await res.json();
    assert.strictEqual(data.error, 'INVALID_PASSWORD');
  });

  // 6. QA Login - Valid Password
  let qaCookie = '';
  await test('Correct QA password unlocks QA workspace and sets secure cookie', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace: 'qa', password: 'qa-admin-2026' }),
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.success, true);
    assert.strictEqual(data.role, 'qa');
    assert.strictEqual(data.redirectTo, '/dashboard');
    const setCookie = res.headers.get('set-cookie');
    assert(setCookie && setCookie.includes('qastudio_session='), 'Expected qastudio_session cookie');
    qaCookie = setCookie.split(';')[0];
  });

  // 7. QA Authenticated API Access
  await test('QA session can access protected QA dashboard and Feedback Inbox', async () => {
    const inboxRes = await fetch(`${BASE_URL}/api/comments/inbox`, { headers: { Cookie: qaCookie } });
    assert.strictEqual(inboxRes.status, 200);
    const inboxData = await inboxRes.json();
    assert(Array.isArray(inboxData.comments), 'Expected array of comments');

    const settingsRes = await fetch(`${BASE_URL}/api/settings`, { headers: { Cookie: qaCookie } });
    assert.strictEqual(settingsRes.status, 200);
  });

  // 8. Developer & PM Comment Submission (No Password Required)
  let createdCommentId = 0;
  await test('Developer & PM CAN submit comments without password (201 Created)', async () => {
    const res = await fetch(`${BASE_URL}/api/comments`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        test_case_id: 9,
        author_name: 'Regression Test Dev',
        author_role: 'developer',
        content: 'Testing collaborator feedback workflow without password.',
      }),
    });
    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert(data.id, 'Expected new comment ID');
    assert.strictEqual(data.author_name, 'Regression Test Dev');
    assert.strictEqual(data.status, 'pending');
    createdCommentId = data.id;
  });

  // 9. QA Feedback Inbox shows the comment
  await test('QA Feedback Inbox receives comment from password-free collaborator', async () => {
    const res = await fetch(`${BASE_URL}/api/comments/inbox`, { headers: { Cookie: qaCookie } });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    const found = data.comments.find(c => c.id === createdCommentId);
    assert(found, `Comment ${createdCommentId} should be present in QA Feedback Inbox`);
    assert.strictEqual(found.author_name, 'Regression Test Dev');
    assert.strictEqual(found.status, 'pending');
  });

  // 10. QA Resolves Comment and execution result is NOT altered
  await test('QA resolving feedback item preserves test case execution result as not_run', async () => {
    const res = await fetch(`${BASE_URL}/api/comments/${createdCommentId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Cookie: qaCookie },
      body: JSON.stringify({
        status: 'resolved',
        reply: 'Verified and resolved in regression suite.',
      }),
    });
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.status, 'resolved');

    // Verify test case 9 execution status
    const tcRes = await fetch(`${BASE_URL}/api/test-cases/9`, { headers: { Cookie: qaCookie } });
    assert.strictEqual(tcRes.status, 200);
    const tcData = await tcRes.json();
    assert.strictEqual(tcData.testCase.latest_result, 'not_run', 'Resolving comment must NOT change execution result');
    assert.strictEqual(tcData.testCase.exec_status, 'not_run', 'Execution status must remain not_run');
  });

  // 11. Cleanup test comment to preserve exact baseline database rows
  await test('Clean up temporary test comment to protect data integrity', async () => {
    const db = new Database('data/qa-manager.db');
    db.prepare('DELETE FROM test_case_comments WHERE id = ?').run(createdCommentId);
    const remaining = db.prepare('SELECT COUNT(*) as count FROM test_case_comments WHERE test_case_id = 9').get();
    assert.strictEqual(remaining.count, 2, 'Expected exactly 2 original comments on test case 9');
  });

  // 12. Logout Clears Session
  await test('Logout clears cookie and prevents subsequent QA protected access', async () => {
    const logoutRes = await fetch(`${BASE_URL}/api/auth/logout`, { method: 'POST', headers: { Cookie: qaCookie } });
    assert.strictEqual(logoutRes.status, 200);
    const setCookie = logoutRes.headers.get('set-cookie');
    assert(setCookie && (setCookie.includes('Max-Age=0') || setCookie.includes('expires=')), 'Expected cleared cookie');

    const accessRes = await fetch(`${BASE_URL}/dashboard`, {
      headers: { Cookie: 'qastudio_session=' },
      redirect: 'manual',
    });
    assert([307, 308, 302].includes(accessRes.status));
  });

  console.log(`\n🎉 Verification Complete: ${passed}/${total} scenarios passed!\n`);
}

runTests().catch(err => {
  console.error('Test suite failed:', err);
  process.exit(1);
});
