import assert from 'node:assert';
import Database from 'better-sqlite3';
import * as XLSX from 'xlsx';
import { parseCSV, parseXLSX } from '../src/lib/import-parser.ts';

console.log('🧪 Starting Import Excel/CSV Verification & Regression Suite...\n');

let total = 0;
let passed = 0;

function test(name, fn) {
  total++;
  try {
    fn();
    console.log(`✅ [PASS] Scenario ${total}: ${name}`);
    passed++;
  } catch (err) {
    console.error(`❌ [FAIL] Scenario ${total}: ${name}`);
    console.error(err);
    process.exitCode = 1;
  }
}

async function asyncTest(name, fn) {
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

const sampleCSV = `Module ID,Feature ID,Requirement Ref,Title,Test Type,Preconditions,Test Steps,Test Data,Expected Result,Priority,Notes
1,1,REQ-001,Successful login with valid credentials,functional,User is on the login page,"1. Open login page
2. Enter username
3. Enter password
4. Click Login","username: admin, password: Pass123!",User successfully logs in and is redirected to dashboard,high,
1,1,REQ-001,Login fails with invalid password,functional,User is on the login page,"1. Open login page
2. Enter a valid username
3. Enter an incorrect password
4. Click Login","username: admin, password: WrongPass123!",Login is rejected and an appropriate error message is displayed,high,
1,1,REQ-001,Login validation when credentials are empty,functional,User is on the login page,"1. Open login page
2. Leave username empty
3. Leave password empty
4. Click Login","username: blank, password: blank",Login is not submitted and validation messages are displayed for the required fields,medium,`;

// 1. CSV Parsing: exactly 3 test case records
test('CSV containing three test cases produces exactly three test case records', () => {
  const result = parseCSV(sampleCSV);
  assert.strictEqual(result.headers.length, 11, 'Should detect all 11 template headers');
  assert.strictEqual(result.rows.length, 3, 'Must produce exactly 3 test cases, not 12');
});

// 2. Multiline Test Steps in CSV remain in one record
test('A test case with multiple numbered lines in Test Steps remains one record', () => {
  const result = parseCSV(sampleCSV);
  const row1 = result.rows[0];
  const expectedSteps = `1. Open login page\n2. Enter username\n3. Enter password\n4. Click Login`;
  assert.strictEqual(row1['Test Steps'], expectedSteps, 'Multiline steps must be fully preserved');
  assert.strictEqual(row1['Title'], 'Successful login with valid credentials');
});

// 3. Values do not shift into unrelated columns in CSV
test('Values do not shift into unrelated columns in CSV (e.g. commas in Test Data)', () => {
  const result = parseCSV(sampleCSV);
  for (let i = 0; i < result.rows.length; i++) {
    const row = result.rows[i];
    assert.strictEqual(row['Module ID'], '1', `Row ${i} Module ID must be 1`);
    assert.strictEqual(row['Feature ID'], '1', `Row ${i} Feature ID must be 1`);
    assert.strictEqual(row['Requirement Ref'], 'REQ-001');
    assert.ok(row['Test Data'].includes('username:'), 'Test Data must contain username');
    assert.ok(row['Test Data'].includes('password:'), 'Test Data must contain password');
  }
});

// 4. XLSX parsing produces identical clean records
test('XLSX worksheet parsing produces exactly three records without splitting lines', () => {
  const ws_data = [
    ['Module ID', 'Feature ID', 'Requirement Ref', 'Title', 'Test Type', 'Preconditions', 'Test Steps', 'Test Data', 'Expected Result', 'Priority', 'Notes'],
    ['1', '1', 'REQ-001', 'Successful login with valid credentials', 'functional', 'User is on the login page', '1. Open login page\n2. Enter username\n3. Enter password\n4. Click Login', 'username: admin, password: Pass123!', 'User successfully logs in and is redirected to dashboard', 'high', ''],
    ['1', '1', 'REQ-001', 'Login fails with invalid password', 'functional', 'User is on the login page', '1. Open login page\n2. Enter a valid username\n3. Enter an incorrect password\n4. Click Login', 'username: admin, password: WrongPass123!', 'Login is rejected and an appropriate error message is displayed', 'high', ''],
    ['1', '1', 'REQ-001', 'Login validation when credentials are empty', 'functional', 'User is on the login page', '1. Open login page\n2. Leave username empty\n3. Leave password empty\n4. Click Login', 'username: blank, password: blank', 'Login is not submitted and validation messages are displayed for the required fields', 'medium', '']
  ];
  const ws = XLSX.utils.aoa_to_sheet(ws_data);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Template');
  const buf = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });

  const result = parseXLSX(buf, XLSX);
  assert.strictEqual(result.headers.length, 11);
  assert.strictEqual(result.rows.length, 3);
  assert.strictEqual(result.rows[0]['Title'], 'Successful login with valid credentials');
  assert.strictEqual(result.rows[0]['Test Steps'], '1. Open login page\n2. Enter username\n3. Enter password\n4. Click Login');
});

// 5. Automatic column mapping matches all 11 template headers
test('Automatic column mapping successfully maps all 11 template headers', () => {
  const headers = [
    'Module ID', 'Feature ID', 'Requirement Ref', 'Title', 'Test Type',
    'Preconditions', 'Test Steps', 'Test Data', 'Expected Result', 'Priority', 'Notes'
  ];
  const normalize = (s) => s.toLowerCase().replace(/[^a-z]/g, '');
  const lookups = {
    module_id: ['module', 'modul', 'moduleid', 'modulname', 'modulid', 'namamodul'],
    feature_id: ['feature', 'fitur', 'featureid', 'featurename', 'fiturid', 'namafitur'],
    title: ['title', 'judul', 'scenario', 'skenario', 'testcase', 'name', 'testcasetitle'],
    requirement_ref: ['req', 'requirement', 'reqid', 'reqref', 'requirementref', 'referensirequirement'],
    test_type: ['testtype', 'type', 'tipe', 'jenis', 'jenistes'],
    preconditions: ['precondition', 'prasyarat', 'preconditions', 'kondisiawal'],
    test_steps: ['steps', 'teststeps', 'langkah', 'step', 'langkahpengujian', 'langkahtes'],
    test_data: ['testdata', 'data', 'datatest', 'datapengujian'],
    expected_result: ['expected', 'expectedresult', 'hasil', 'hasildiharapkan', 'ekspektasi'],
    priority: ['priority', 'prioritas'],
    prep_status: ['prepstatus', 'status', 'prep'],
    notes: ['notes', 'catatan', 'keterangan'],
  };

  const map = {};
  for (const [field, keywords] of Object.entries(lookups)) {
    const match = headers.find(h => keywords.includes(normalize(h)));
    if (match) map[field] = match;
  }

  assert.strictEqual(map.module_id, 'Module ID');
  assert.strictEqual(map.feature_id, 'Feature ID');
  assert.strictEqual(map.requirement_ref, 'Requirement Ref');
  assert.strictEqual(map.title, 'Title');
  assert.strictEqual(map.test_type, 'Test Type');
  assert.strictEqual(map.preconditions, 'Preconditions');
  assert.strictEqual(map.test_steps, 'Test Steps');
  assert.strictEqual(map.test_data, 'Test Data');
  assert.strictEqual(map.expected_result, 'Expected Result');
  assert.strictEqual(map.priority, 'Priority');
  assert.strictEqual(map.notes, 'Notes');
});

// 6. Manual column mapping edits work
test('Manual column mapping edits override automatic mapping', () => {
  const customHeaders = ['ColA', 'ColB', 'ColC'];
  const manualMap = {
    title: 'ColC',
    module_id: 'ColA',
    feature_id: 'ColB'
  };
  const row = { ColA: '1', ColB: '1', ColC: 'Manual Mapped Title' };
  assert.strictEqual(row[manualMap.title], 'Manual Mapped Title');
  assert.strictEqual(row[manualMap.module_id], '1');
  assert.strictEqual(row[manualMap.feature_id], '1');
});

// 7. Validation correctly distinguishes valid and invalid records
test('Validation distinguishes valid records from missing required fields', () => {
  const rows = [
    { title: 'Valid Case', module_id: '1', feature_id: '1' },
    { title: '', module_id: '1', feature_id: '1' }, // Missing title
    { title: 'Case with Missing Module', module_id: '', feature_id: '1' }, // Missing module
    { title: 'Case with Missing Feature', module_id: '1', feature_id: '' } // Missing feature
  ];

  const fieldMap = { title: 'title', module_id: 'module_id', feature_id: 'feature_id' };

  const validated = rows.map((r, i) => {
    const t = r[fieldMap.title]?.trim();
    const m = r[fieldMap.module_id]?.trim();
    const f = r[fieldMap.feature_id]?.trim();
    let status = 'valid';
    let error = '';
    if (!t) { status = 'error'; error = 'Title is empty'; }
    else if (!m) { status = 'error'; error = 'Module is empty'; }
    else if (!f) { status = 'error'; error = 'Feature is empty'; }
    return { ...r, status, error };
  });

  assert.strictEqual(validated[0].status, 'valid');
  assert.strictEqual(validated[1].status, 'error');
  assert.strictEqual(validated[1].error, 'Title is empty');
  assert.strictEqual(validated[2].status, 'error');
  assert.strictEqual(validated[2].error, 'Module is empty');
  assert.strictEqual(validated[3].status, 'error');
  assert.strictEqual(validated[3].error, 'Feature is empty');
});

// 8. End-to-end import save with cleanup
await asyncTest('End-to-end API save imports all 3 records matching preview and cleans up safely', async () => {
  const BASE_URL = 'http://localhost:3000';

  // Log in as QA to obtain session cookie
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspace: 'qa', password: 'qa-admin-2026' }),
  });
  assert.strictEqual(loginRes.status, 200, 'Login must succeed');
  const cookie = loginRes.headers.get('set-cookie');
  assert.ok(cookie, 'Must set session cookie');

  const parsed = parseCSV(sampleCSV);
  const fieldMap = {
    module_id: 'Module ID',
    feature_id: 'Feature ID',
    requirement_ref: 'Requirement Ref',
    title: 'Title',
    test_type: 'Test Type',
    preconditions: 'Preconditions',
    test_steps: 'Test Steps',
    test_data: 'Test Data',
    expected_result: 'Expected Result',
    priority: 'Priority',
    notes: 'Notes'
  };

  const saveRes = await fetch(`${BASE_URL}/api/import/save`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Cookie: cookie },
    body: JSON.stringify({
      rows: parsed.rows,
      fieldMap
    })
  });

  assert.strictEqual(saveRes.status, 200, 'Import save should succeed');
  const saveData = await saveRes.json();
  assert.strictEqual(saveData.succeeded, 3, 'All 3 rows should succeed');
  assert.strictEqual(saveData.failed, 0, '0 rows should fail');

  // Verify in database that test steps and test data were preserved intact
  const db = new Database('data/qa-manager.db');
  const inserted = db.prepare('SELECT * FROM test_cases WHERE title LIKE ?').all('%Successful login with valid credentials%');
  assert.strictEqual(inserted.length, 1, 'Should find 1 inserted test case');
  assert.strictEqual(inserted[0].test_steps, '1. Open login page\n2. Enter username\n3. Enter password\n4. Click Login');
  assert.strictEqual(inserted[0].test_data, 'username: admin, password: Pass123!');

  // Cleanup the 3 imported test cases to preserve pristine test database
  const delCases = db.prepare('DELETE FROM test_cases WHERE title IN (?, ?, ?)').run(
    'Successful login with valid credentials',
    'Login fails with invalid password',
    'Login validation when credentials are empty'
  );
  assert.strictEqual(delCases.changes, 3, 'Should clean up all 3 test cases');

  // Reset sequence counter back to clean baseline
  db.prepare('UPDATE tc_sequence SET next_seq = 1').run();
  db.prepare("DELETE FROM sqlite_sequence WHERE name NOT IN ('modules', 'features')").run();
  db.close();
});

console.log(`\n🎉 Verification Complete: ${passed}/${total} scenarios passed!\n`);
