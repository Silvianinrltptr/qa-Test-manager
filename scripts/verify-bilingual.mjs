import assert from 'node:assert';
import fs from 'node:fs';
import path from 'node:path';

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

console.log('🌐 Starting Global Bilingual Verification Suite for TestBloom / QAE-Studio...');

async function test(name, fn) {
  try {
    await fn();
    console.log(`✅ [PASS] ${name}`);
  } catch (err) {
    console.error(`❌ [FAIL] ${name}`);
    console.error(err);
    process.exit(1);
  }
}

async function run() {
  // 1. Landing page before login
  await test('Landing page (/) is strictly English and contains NO language switcher', async () => {
    const res = await fetch(`${BASE_URL}/`);
    assert.strictEqual(res.status, 200, `Expected 200, got ${res.status}`);
    const html = await res.text();
    
    // Must contain English branding
    assert(html.includes('QAE Studio') || html.includes('Test Management Workspace'), 'Must contain English title');
    assert(html.includes('Sign in as QA'), 'Must contain English login button');
    assert(html.includes('Project Overview'), 'Must contain Project Overview card');
    
    // MUST NOT contain LanguageSwitcher or ENG/IDN buttons before login
    assert(!html.includes('id="lang-switcher"'), 'Language switcher must NOT be on landing page');
    assert(!html.includes('aria-label="Language selector"'), 'Language selector must NOT be on landing page');
    assert(!html.includes('>IDN<'), 'IDN option must NOT be on landing page');
  });

  // 2. Parity check between en.ts and id.ts dictionaries
  await test('100% Translation Dictionary Key Parity between EN and ID', async () => {
    const enText = fs.readFileSync('src/lib/i18n/locales/en.ts', 'utf8');
    const idText = fs.readFileSync('src/lib/i18n/locales/id.ts', 'utf8');

    // Extract all property keys (e.g. key: 'value' or key: { )
    const extractKeys = (content) => {
      const keys = [];
      const lines = content.split('\n');
      let currentSection = '';
      for (const line of lines) {
        const trimmed = line.trim();
        // Section start: common: {
        const secMatch = trimmed.match(/^([a-zA-Z0-9_]+):\s*\{/);
        if (secMatch) {
          currentSection = secMatch[1];
          continue;
        }
        if (trimmed.startsWith('},')) {
          currentSection = '';
          continue;
        }
        // Property line: save: 'Save',
        const propMatch = trimmed.match(/^([a-zA-Z0-9_]+):\s*['"]/);
        if (propMatch && currentSection) {
          keys.push(`${currentSection}.${propMatch[1]}`);
        }
      }
      return keys;
    };

    const enKeys = extractKeys(enText);
    const idKeys = extractKeys(idText);

    const missingInId = enKeys.filter(k => !idKeys.includes(k));
    const missingInEn = idKeys.filter(k => !enKeys.includes(k));

    assert.strictEqual(missingInId.length, 0, `Keys missing in ID dictionary: ${missingInId.join(', ')}`);
    assert.strictEqual(missingInEn.length, 0, `Keys missing in EN dictionary: ${missingInEn.join(', ')}`);
    assert(enKeys.length > 50, `Expected comprehensive dictionary, found ${enKeys.length} keys`);
  });

  // 3. Authenticated session & Language Preference API with PostgreSQL
  let sessionCookie = '';
  await test('QA Login succeeds and provides session cookie', async () => {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workspace: 'qa', password: 'qa-admin-2026' }),
    });
    assert.strictEqual(res.status, 200, 'Login failed');
    const cookie = res.headers.get('set-cookie');
    assert(cookie && cookie.includes('qastudio_session='), 'Session cookie missing');
    sessionCookie = cookie.split(';')[0];
  });

  await test('Preferences API stores and returns user language preference via database', async () => {
    // 3a. Check GET defaults to en
    const getRes1 = await fetch(`${BASE_URL}/api/preferences`, {
      headers: { Cookie: sessionCookie }
    });
    assert.strictEqual(getRes1.status, 200);
    const data1 = await getRes1.json();
    assert(['en', 'id'].includes(data1.language), 'Must return valid language code');

    // 3b. Update preference to 'id'
    const postRes = await fetch(`${BASE_URL}/api/preferences`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie
      },
      body: JSON.stringify({ language: 'id' }),
    });
    assert.strictEqual(postRes.status, 200);
    const postData = await postRes.json();
    assert.strictEqual(postData.success, true);
    assert.strictEqual(postData.language, 'id');

    // 3c. Verify GET returns 'id'
    const getRes2 = await fetch(`${BASE_URL}/api/preferences`, {
      headers: { Cookie: sessionCookie }
    });
    assert.strictEqual(getRes2.status, 200);
    const data2 = await getRes2.json();
    assert.strictEqual(data2.language, 'id', 'Preference must persist as id');

    // 3d. Restore preference to 'en'
    const postRes2 = await fetch(`${BASE_URL}/api/preferences`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: sessionCookie
      },
      body: JSON.stringify({ language: 'en' }),
    });
    assert.strictEqual(postRes2.status, 200);
  });

  // 4. Verification that LanguageSwitcher is integrated on all authenticated page headers
  await test('LanguageSwitcher component is integrated across all authenticated views', async () => {
    const pagesToCheck = [
      'src/app/dashboard/page.tsx',
      'src/app/modules/page.tsx',
      'src/app/requirements/page.tsx',
      'src/app/test-cases/page.tsx',
      'src/app/feedback/page.tsx',
      'src/app/ai-generator/page.tsx',
      'src/app/bulk-add/page.tsx',
      'src/app/import/page.tsx',
      'src/app/execution/page.tsx',
      'src/app/impact-analysis/page.tsx',
      'src/app/traceability/page.tsx',
      'src/app/reports/page.tsx',
      'src/app/weekly-progress/page.tsx',
      'src/app/change-log/page.tsx',
      'src/app/settings/page.tsx',
      'src/app/project-viewer/page.tsx',
    ];

    for (const pagePath of pagesToCheck) {
      const code = fs.readFileSync(path.resolve(pagePath), 'utf8');
      assert(code.includes('LanguageSwitcher'), `${pagePath} must import and include LanguageSwitcher`);
      assert(code.includes('useI18n'), `${pagePath} must use useI18n hook`);
    }
  });

  // 5. Verification that Sidebar includes localized navigation sections
  await test('Sidebar includes dynamic getNavSections with localization bindings', async () => {
    const sidebarCode = fs.readFileSync(path.resolve('src/components/layout/Sidebar.tsx'), 'utf8');
    assert(sidebarCode.includes('getNavSections(t)'), 'Sidebar must dynamically generate nav with t()');
    assert(sidebarCode.includes('useI18n'), 'Sidebar must use useI18n hook');
  });

  // 6. Settings Page has Language Preference Card
  await test('Settings page contains Language Preference control', async () => {
    const settingsCode = fs.readFileSync(path.resolve('src/app/settings/page.tsx'), 'utf8');
    assert(settingsCode.includes('setLanguage'), 'Settings page must allow changing language');
    assert(settingsCode.includes('Language Preference'), 'Settings page must have Language Preference section');
  });

  // 7. Verify Data Integrity: Database status enums remain canonical
  await test('Database enums and user test data remain untouched by translation layers', async () => {
    const tcRes = await fetch(`${BASE_URL}/api/test-cases?limit=5`);
    assert.strictEqual(tcRes.status, 200);
    const tcData = await tcRes.json();
    assert(Array.isArray(tcData.data), 'Expected test cases array');

    for (const tc of tcData.data) {
      // Internal enums must strictly be canonical values
      assert(['pass', 'fail', 'blocked', 'not_run'].includes(tc.latest_result), `Invalid result enum: ${tc.latest_result}`);
      assert(['ready', 'draft', 'in_progress', 'review'].includes(tc.prep_status), `Invalid prep_status enum: ${tc.prep_status}`);
      assert(['active', 'draft', 'obsolete', 'archived'].includes(tc.lifecycle_status), `Invalid lifecycle_status enum: ${tc.lifecycle_status}`);
    }
  });

  console.log('\n======================================================');
  console.log('🎉 ALL BILINGUAL ACCEPTANCE CRITERIA VERIFIED SUCCESSFULLY!');
  console.log('======================================================\n');
}

run();
