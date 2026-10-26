import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:3000';

async function testExports() {
  console.log('--- Testing Export & Download Endpoints ---');

  // 1. Login as QA
  const loginRes = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ workspace: 'qa', password: 'qa-admin-2026' }),
  });
  const cookieHeader = loginRes.headers.get('set-cookie') || '';
  const qaCookie = cookieHeader.split(';')[0];
  console.log('QA Login status:', loginRes.status, qaCookie ? 'Got cookie' : 'No cookie');

  const tests = [
    { type: 'template', format: 'csv', auth: false, expectContentType: 'text/csv' },
    { type: 'template', format: 'xlsx', auth: false, expectContentType: 'spreadsheetml' },
    { type: 'test-cases', format: 'csv', auth: true, lang: 'en', expectContentType: 'text/csv' },
    { type: 'test-cases', format: 'xlsx', auth: true, lang: 'en', expectContentType: 'spreadsheetml' },
    { type: 'test-cases', format: 'csv', auth: true, lang: 'id', expectContentType: 'text/csv' },
    { type: 'test-cases', format: 'xlsx', auth: true, lang: 'id', expectContentType: 'spreadsheetml' },
    { type: 'executions', format: 'csv', auth: true, expectContentType: 'text/csv' },
    { type: 'executions', format: 'xlsx', auth: true, expectContentType: 'spreadsheetml' },
    { type: 'change-log', format: 'csv', auth: true, expectContentType: 'text/csv' },
    { type: 'change-log', format: 'xlsx', auth: true, expectContentType: 'spreadsheetml' },
  ];

  let passed = 0;
  for (const t of tests) {
    const url = new URL(`${BASE_URL}/api/export`);
    url.searchParams.set('type', t.type);
    url.searchParams.set('format', t.format);
    if (t.lang) url.searchParams.set('lang', t.lang);

    const headers = {};
    if (t.auth && qaCookie) headers['Cookie'] = qaCookie;

    const res = await fetch(url.toString(), { headers });
    const contentType = res.headers.get('content-type') || '';
    const contentDisp = res.headers.get('content-disposition') || '';
    const buffer = await res.arrayBuffer();

    const ok = res.status === 200 &&
               contentType.includes(t.expectContentType) &&
               contentDisp.includes('attachment') &&
               buffer.byteLength > 0;

    if (t.format === 'csv') {
      const text = Buffer.from(buffer).toString('utf-8');
      const hasBom = text.charCodeAt(0) === 0xFEFF;
      console.log(`[${ok ? 'PASS' : 'FAIL'}] ${t.type} (${t.format}, ${t.lang || 'default'}): size=${buffer.byteLength}b, BOM=${hasBom ? 'YES' : 'NO'}`);
      if (!hasBom) console.warn('Warning: Missing UTF-8 BOM in CSV');
    } else {
      console.log(`[${ok ? 'PASS' : 'FAIL'}] ${t.type} (${t.format}, ${t.lang || 'default'}): size=${buffer.byteLength}b, status=${res.status}`);
    }

    if (ok) passed++;
  }

  console.log(`\nExport Tests: ${passed}/${tests.length} passed.`);
  if (passed !== tests.length) process.exit(1);
}

testExports().catch(err => {
  console.error(err);
  process.exit(1);
});
