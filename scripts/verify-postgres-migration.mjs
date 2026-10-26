import assert from 'node:assert';

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';

async function run() {
  console.log(`\n🔍 Running Comprehensive PostgreSQL Migration & Route Verification on ${BASE_URL}...\n`);

  let passed = 0;
  let failed = 0;

  // Obtain QA session cookie
  let sessionCookie = '';
  try {
    const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace: 'qa', password: 'qa-admin-2026' }),
    });
    const setCookie = loginRes.headers.get('set-cookie');
    if (setCookie) {
      sessionCookie = setCookie.split(';')[0];
    }
  } catch (err) {
    console.warn('Could not pre-authenticate:', err.message);
  }

  async function check(name, fn) {
    try {
      await fn();
      console.log(`✅ [PASS] ${name}`);
      passed++;
    } catch (err) {
      console.error(`❌ [FAIL] ${name}:`, err.message);
      failed++;
    }
  }

  const authHeaders = sessionCookie ? { Cookie: sessionCookie } : {};

  // 1. API Endpoints
  console.log('--- 1. Testing Backend API Routes (PostgreSQL Data Source) ---');

  await check('GET /api/dashboard returns 200 and valid metrics structure', async () => {
    const res = await fetch(`${BASE_URL}/api/dashboard`);
    assert.strictEqual(res.status, 200, `Status code ${res.status}`);
    const data = await res.json();
    assert.strictEqual(typeof data.totalActive, 'number', 'totalActive must be a number');
    assert(Array.isArray(data.byModule), 'byModule must be an array');
    assert(typeof data.prepProgress === 'object', 'prepProgress must be an object');
    assert(typeof data.execProgress === 'object', 'execProgress must be an object');
    assert(typeof data.passRate === 'object', 'passRate must be an object');
    assert(typeof data.results === 'object', 'results must be an object');
    assert(typeof data.weeklyChange === 'object', 'weeklyChange must be an object');
    assert(Array.isArray(data.recentActivity), 'recentActivity must be an array');
  });

  await check('GET /api/modules returns 200 and modules array', async () => {
    const res = await fetch(`${BASE_URL}/api/modules`);
    assert.strictEqual(res.status, 200, `Status code ${res.status}`);
    const data = await res.json();
    assert(Array.isArray(data), 'modules must be an array');
    assert(data.length > 0, 'must have seeded modules');
    assert(data.some(m => m.prefix === 'AUTH'), 'must have AUTH module');
  });

  await check('GET /api/features returns 200 and features array', async () => {
    const res = await fetch(`${BASE_URL}/api/features`);
    assert.strictEqual(res.status, 200, `Status code ${res.status}`);
    const data = await res.json();
    assert(Array.isArray(data), 'features must be an array');
    assert(data.length > 0, 'must have seeded features');
  });

  await check('GET /api/requirements returns 200 and requirements array', async () => {
    const res = await fetch(`${BASE_URL}/api/requirements`);
    assert.strictEqual(res.status, 200, `Status code ${res.status}`);
    const data = await res.json();
    assert(Array.isArray(data), 'requirements must be an array');
  });

  await check('GET /api/test-cases returns 200 and pagination data', async () => {
    const res = await fetch(`${BASE_URL}/api/test-cases`);
    assert.strictEqual(res.status, 200, `Status code ${res.status}`);
    const data = await res.json();
    assert(Array.isArray(data.data), 'test cases data must be an array');
    assert(typeof data.pagination === 'object', 'pagination must be an object');
  });

  await check('GET /api/executions returns 200 and execution history', async () => {
    const res = await fetch(`${BASE_URL}/api/executions`);
    assert.strictEqual(res.status, 200, `Status code ${res.status}`);
    const data = await res.json();
    assert(Array.isArray(data), 'executions must be an array');
  });

  await check('GET /api/comments/inbox returns 200 and feedback list', async () => {
    const res = await fetch(`${BASE_URL}/api/comments/inbox`, { headers: authHeaders });
    assert.strictEqual(res.status, 200, `Status code ${res.status}`);
    const data = await res.json();
    assert(Array.isArray(data.comments), 'comments inbox must be an array');
    assert(typeof data.stats === 'object', 'stats must be an object');
  });

  await check('GET /api/reports returns 200 and report structure', async () => {
    const now = new Date();
    const startDate = new Date(now.getTime() - 7 * 86400000).toISOString().split('T')[0];
    const endDate = now.toISOString().split('T')[0];
    const res = await fetch(`${BASE_URL}/api/reports?startDate=${startDate}&endDate=${endDate}&period=weekly`, { headers: authHeaders });
    assert.strictEqual(res.status, 200, `Status code ${res.status}`);
    const data = await res.json();
    assert(typeof data.currentTotals === 'object', 'currentTotals must be an object');
    assert(typeof data.periodMetrics === 'object', 'periodMetrics must be an object');
  });

  await check('GET /api/traceability returns 200 and matrix', async () => {
    const res = await fetch(`${BASE_URL}/api/traceability`, { headers: authHeaders });
    assert.strictEqual(res.status, 200, `Status code ${res.status}`);
    const data = await res.json();
    assert(Array.isArray(data.matrix), 'matrix must be an array');
    assert(typeof data.stats === 'object', 'stats must be an object');
  });

  await check('GET /api/impact-analysis returns 200 and impacts array', async () => {
    const res = await fetch(`${BASE_URL}/api/impact-analysis`, { headers: authHeaders });
    assert.strictEqual(res.status, 200, `Status code ${res.status}`);
    const data = await res.json();
    assert(Array.isArray(data.impacts), 'impacts must be an array');
  });

  await check('GET /api/change-log returns 200 and changes list', async () => {
    const res = await fetch(`${BASE_URL}/api/change-log`, { headers: authHeaders });
    assert.strictEqual(res.status, 200, `Status code ${res.status}`);
    const data = await res.json();
    assert(Array.isArray(data.data), 'change logs must be an array');
  });

  await check('GET /api/settings returns 200 and settings object', async () => {
    const res = await fetch(`${BASE_URL}/api/settings`, { headers: authHeaders });
    assert.strictEqual(res.status, 200, `Status code ${res.status}`);
    const data = await res.json();
    assert(typeof data === 'object', 'settings must be an object');
  });

  // 2. Application Routes / Pages
  console.log('\n--- 2. Testing Application Routes / Pages (HTTP 200) ---');

  const routes = [
    '/dashboard',
    '/modules',
    '/requirements',
    '/test-cases',
    '/feedback',
    '/ai-generator',
    '/bulk-add',
    '/import',
    '/execution',
    '/impact-analysis',
    '/traceability',
    '/reports',
    '/settings',
    '/project-viewer',
  ];

  for (const route of routes) {
    await check(`Page route ${route} responds with HTTP 200`, async () => {
      const res = await fetch(`${BASE_URL}${route}`);
      assert.strictEqual(res.status, 200, `Route ${route} returned status ${res.status}`);
      const text = await res.text();
      assert(text.length > 500, `Route ${route} returned unexpectedly short response`);
    });
  }

  console.log(`\n========================================`);
  console.log(`Verification Summary: Passed: ${passed}, Failed: ${failed}`);
  console.log(`========================================\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
