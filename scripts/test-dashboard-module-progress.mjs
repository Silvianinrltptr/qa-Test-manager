import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const prisma = new PrismaClient();
const BASE_URL = 'http://localhost:3000';

async function main() {
  console.log('--- STARTING VERIFICATION: Module Progress Consistency & Not Run Column ---');

  // 1. Verify Database Integrity: Ensure no data deleted or wiped
  const totalActiveCases = await prisma.testCase.count({
    where: { lifecycleStatus: 'active' },
  });
  console.log(`[1] Total ACTIVE test cases in database: ${totalActiveCases}`);
  if (totalActiveCases !== 130) {
    throw new Error(`Expected 130 active test cases, found ${totalActiveCases}`);
  }

  // 2. Authenticate as QA
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspace: 'qa', password: 'qa-admin-2026' }),
  });
  if (!loginRes.ok) throw new Error('QA login failed');
  const setCookie = loginRes.headers.get('set-cookie');
  const qaCookie = setCookie ? setCookie.split(';')[0] : '';

  // 3. Query Dashboard API
  const res = await fetch(`${BASE_URL}/api/dashboard`, {
    headers: { Cookie: qaCookie },
  });
  if (!res.ok) {
    throw new Error(`Failed to fetch /api/dashboard: ${res.statusText}`);
  }
  const data = await res.json();
  console.log('[2] Dashboard API response retrieved successfully.');

  // 4. Verify Summary Metrics
  console.log('\n--- Dashboard Summary Metrics ---');
  console.log(`Total Active: ${data.totalActive}`);
  console.log(`Prep Progress: ${data.prepProgress.ready} / ${data.prepProgress.total} (${data.prepProgress.pct}%)`);
  console.log(`Exec Progress: ${data.execProgress.executed} / ${data.execProgress.readyTotal} (${data.execProgress.pct}%)`);
  console.log(`Results: Pass=${data.results.pass}, Fail=${data.results.fail}, Blocked=${data.results.blocked}, NotRun=${data.results.not_run}, Unclassified=${data.results.unclassified}`);

  // 5. Verify Each Module in byModule
  console.log('\n--- Progress by Module Table Data ---');
  console.log(
    'Module'.padEnd(22),
    'Total TC'.padStart(9),
    'Ready'.padStart(7),
    'Executed'.padStart(9),
    'Pass'.padStart(6),
    'Fail'.padStart(6),
    'Blocked'.padStart(8),
    'Not Run'.padStart(8),
    'Unclass'.padStart(8)
  );
  console.log('-'.repeat(90));

  let sumTotal = 0;
  let sumReady = 0;
  let sumExecuted = 0;
  let sumPass = 0;
  let sumFail = 0;
  let sumBlocked = 0;
  let sumNotRun = 0;
  let sumUnclassified = 0;

  for (const m of data.byModule) {
    console.log(
      m.module.padEnd(22),
      String(m.total).padStart(9),
      String(m.ready).padStart(7),
      String(m.executed).padStart(9),
      String(m.pass).padStart(6),
      String(m.fail).padStart(6),
      String(m.blocked).padStart(8),
      String(m.not_run).padStart(8),
      String(m.unclassified).padStart(8)
    );

    // Rule: Executed + Not Run == Ready
    if (m.executed + m.not_run !== m.ready) {
      throw new Error(`Module ${m.module}: Executed (${m.executed}) + Not Run (${m.not_run}) !== Ready (${m.ready})`);
    }

    // Rule: Pass + Fail + Blocked <= Executed
    const classifiedSum = m.pass + m.fail + m.blocked;
    if (classifiedSum > m.executed) {
      throw new Error(`Module ${m.module}: Pass + Fail + Blocked (${classifiedSum}) > Executed (${m.executed})`);
    }

    // Rule: Executed - classifiedSum === unclassified
    if (m.executed - classifiedSum !== m.unclassified) {
      throw new Error(`Module ${m.module}: Executed - Classified !== Unclassified`);
    }

    sumTotal += m.total;
    sumReady += m.ready;
    sumExecuted += m.executed;
    sumPass += m.pass;
    sumFail += m.fail;
    sumBlocked += m.blocked;
    sumNotRun += m.not_run;
    sumUnclassified += m.unclassified;
  }

  console.log('-'.repeat(90));
  console.log(
    'Total'.padEnd(22),
    String(sumTotal).padStart(9),
    String(sumReady).padStart(7),
    String(sumExecuted).padStart(9),
    String(sumPass).padStart(6),
    String(sumFail).padStart(6),
    String(sumBlocked).padStart(8),
    String(sumNotRun).padStart(8),
    String(sumUnclassified).padStart(8)
  );

  // 6. Verify Module Sums Match Dashboard Totals
  if (sumTotal !== data.totalActive) throw new Error(`sumTotal (${sumTotal}) !== data.totalActive (${data.totalActive})`);
  if (sumReady !== data.prepProgress.ready) throw new Error(`sumReady (${sumReady}) !== prepProgress.ready (${data.prepProgress.ready})`);
  if (sumExecuted !== data.execProgress.executed) throw new Error(`sumExecuted (${sumExecuted}) !== execProgress.executed (${data.execProgress.executed})`);
  if (sumPass !== data.results.pass) throw new Error(`sumPass (${sumPass}) !== results.pass (${data.results.pass})`);
  if (sumFail !== data.results.fail) throw new Error(`sumFail (${sumFail}) !== results.fail (${data.results.fail})`);
  if (sumBlocked !== data.results.blocked) throw new Error(`sumBlocked (${sumBlocked}) !== results.blocked (${data.results.blocked})`);
  if (sumNotRun !== data.results.not_run) throw new Error(`sumNotRun (${sumNotRun}) !== results.not_run (${data.results.not_run})`);
  if (sumUnclassified !== data.results.unclassified) throw new Error(`sumUnclassified (${sumUnclassified}) !== results.unclassified (${data.results.unclassified})`);

  console.log('\n[PASS] All module column totals strictly match dashboard summary metrics!');

  // 7. Verify Component Source Code Requirements
  const qaDashboardSrc = fs.readFileSync(path.resolve('src/app/dashboard/page.tsx'), 'utf8');
  const pmDashboardSrc = fs.readFileSync(path.resolve('src/app/project-viewer/page.tsx'), 'utf8');

  // Verify headers in both dashboards
  const expectedQAHeaders = [
    "t('common.module', 'Module')",
    "t('common.totalTC', 'Total TC')",
    "t('common.statusReady', 'Ready')",
    "t('dashboard.testExecProgress', 'Executed')",
    "t('common.resultPass', 'Pass')",
    "t('common.resultFail', 'Fail')",
    "t('common.resultBlocked', 'Blocked')",
    "t('common.resultNotRun', 'Not Run')",
  ];

  for (const h of expectedQAHeaders) {
    if (!qaDashboardSrc.includes(h)) {
      throw new Error(`QA Dashboard source missing column header expression: ${h}`);
    }
  }

  const expectedPMHeaders = [
    "t('projectViewer.colModule', 'Module')",
    "t('projectViewer.colTotalTC', 'Total TC')",
    "t('projectViewer.colReady', 'Ready')",
    "t('projectViewer.colExecuted', 'Executed')",
    "t('projectViewer.colPass', 'Pass')",
    "t('projectViewer.colFail', 'Fail')",
    "t('projectViewer.colBlocked', 'Blocked')",
    "t('projectViewer.colNotRun', 'Not Run')",
  ];

  for (const h of expectedPMHeaders) {
    if (!pmDashboardSrc.includes(h)) {
      throw new Error(`PM Dashboard source missing column header expression: ${h}`);
    }
  }

  // Verify tfoot total rows are removed from both dashboards (as totals are displayed in top summary cards)
  if (qaDashboardSrc.includes('<tfoot>')) {
    throw new Error('QA Dashboard table must not contain tfoot Total row');
  }
  if (pmDashboardSrc.includes('<tfoot>')) {
    throw new Error('PM Dashboard table must not contain tfoot Total row');
  }

  // Verify unclassified warning in both dashboards
  if (!qaDashboardSrc.includes('unclassifiedNotice')) {
    throw new Error('QA Dashboard missing unclassifiedNotice');
  }
  if (!pmDashboardSrc.includes('unclassifiedNotice')) {
    throw new Error('PM Dashboard missing unclassifiedNotice');
  }

  console.log('\n[PASS] Both QA Dashboard and PM Dashboard sources have matching 8-column structures, tfoot totals, and unclassified warning handling!');

  // 8. Verify Translations in both English and Indonesian
  const enSrc = fs.readFileSync(path.resolve('src/lib/i18n/locales/en.ts'), 'utf8');
  const idSrc = fs.readFileSync(path.resolve('src/lib/i18n/locales/id.ts'), 'utf8');

  if (!enSrc.includes("totalTC: 'Total TC'")) throw new Error("en.ts missing common.totalTC");
  if (!idSrc.includes("totalTC: 'Total TC'")) throw new Error("id.ts missing common.totalTC");
  if (!enSrc.includes("colNotRun: 'Not Run'")) throw new Error("en.ts missing projectViewer.colNotRun");
  if (!idSrc.includes("colNotRun: 'Belum Dijalankan'")) throw new Error("id.ts missing projectViewer.colNotRun");

  console.log('\n[PASS] Translations verified in en.ts and id.ts!');

  console.log('\n=== ALL 8 ACCEPTANCE CRITERIA VERIFIED SUCCESSFULLY ===');
}

main()
  .catch(err => {
    console.error('VERIFICATION ERROR:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
