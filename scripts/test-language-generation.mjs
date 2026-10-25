import assert from 'node:assert';

const BASE_URL = 'http://localhost:3000';

async function run() {
  console.log('--- Testing Language-Aware AI Generation ---');

  // 1. Login as QA
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspace: 'qa', password: 'qa-admin-2026' }),
  });
  assert.strictEqual(loginRes.status, 200, 'Login failed');
  const setCookie = loginRes.headers.get('set-cookie');
  const cookie = setCookie ? setCookie.split(';')[0] : '';

  // 2. Test English generation
  console.log('\n[1/3] Testing English Language Generation...');
  const enRes = await fetch(`${BASE_URL}/api/ai/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({
      module_id: 1,
      feature_id: 1,
      requirement_text: 'User must be able to log in with valid email and password. Account is locked after 5 failed attempts.',
      provider: 'deepseek',
      language: 'English',
      session_id: 'test-lang-en'
    })
  });
  assert.strictEqual(enRes.status, 200, 'English generation failed');
  const enData = await enRes.json();
  assert(enData.drafts && enData.drafts.length > 0, 'No drafts returned for English');
  const firstEn = enData.drafts[0];
  console.log('Sample English Test Case:');
  console.log('  Title:', firstEn.title);
  console.log('  Preconditions:', firstEn.preconditions);
  console.log('  Steps:', firstEn.test_steps?.replace(/\n/g, ' '));
  console.log('  Expected Result:', firstEn.expected_result);

  // 3. Test Bahasa Indonesia generation
  console.log('\n[2/3] Testing Bahasa Indonesia Language Generation...');
  const idRes = await fetch(`${BASE_URL}/api/ai/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({
      module_id: 1,
      feature_id: 1,
      requirement_text: 'Pengguna harus dapat login dengan email dan password. Akun terkunci otomatis setelah 5 kali gagal berturut-turut.',
      provider: 'deepseek',
      language: 'Bahasa Indonesia',
      session_id: 'test-lang-id'
    })
  });
  const idText = await idRes.text();
  let idData;
  try {
    idData = JSON.parse(idText);
  } catch {
    idData = { raw: idText };
  }
  if (!idRes.ok) {
    console.error('Bahasa Indonesia generation failed with status', idRes.status, idData);
  }
  assert.strictEqual(idRes.status, 200, `Bahasa Indonesia generation failed: ${JSON.stringify(idData)}`);
  assert(idData.drafts && idData.drafts.length > 0, 'No drafts returned for Bahasa Indonesia');
  const firstId = idData.drafts[0];
  console.log('Sample Bahasa Indonesia Test Case:');
  console.log('  Title:', firstId.title);
  console.log('  Preconditions:', firstId.preconditions);
  console.log('  Steps:', firstId.test_steps?.replace(/\n/g, ' '));
  console.log('  Expected Result:', firstId.expected_result);

  // 4. Test default language fallback (when language is omitted)
  console.log('\n[3/3] Testing default fallback (language omitted)...');
  const defRes = await fetch(`${BASE_URL}/api/ai/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', cookie },
    body: JSON.stringify({
      module_id: 1,
      feature_id: 1,
      requirement_text: 'User can reset password via email OTP.',
      provider: 'deepseek',
      session_id: 'test-lang-default'
    })
  });
  assert.strictEqual(defRes.status, 200, 'Default generation failed');
  const defData = await defRes.json();
  assert(defData.drafts && defData.drafts.length > 0, 'No drafts returned for default');
  console.log('Sample Default Fallback Test Case:');
  console.log('  Title:', defData.drafts[0].title);
  console.log('  Expected Result:', defData.drafts[0].expected_result);

  console.log('\n✅ All language generation tests passed successfully!');
}

run().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
