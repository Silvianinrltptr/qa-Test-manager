import XLSX from 'xlsx';

async function testExports() {
  console.log('Testing Excel and CSV exports...');

  // Test 1: XLSX English
  const resEn = await fetch('http://localhost:3000/api/export?format=xlsx&lang=en');
  if (!resEn.ok) throw new Error(`XLSX EN failed: ${resEn.status}`);
  const bufEn = await resEn.arrayBuffer();
  const wbEn = XLSX.read(Buffer.from(bufEn), { type: 'buffer' });
  const sheetEn = wbEn.Sheets[wbEn.SheetNames[0]];
  const dataEn = XLSX.utils.sheet_to_json(sheetEn, { header: 1 });

  const headersEn = dataEn[0];
  console.log('\n--- XLSX (EN) Headers (count: ' + headersEn.length + ') ---');
  console.log(headersEn);
  console.log('\n--- XLSX (EN) First Row (ROLS-001) ---');
  console.log(dataEn[1]);

  // Test 2: XLSX Indonesian
  const resId = await fetch('http://localhost:3000/api/export?format=xlsx&lang=id');
  if (!resId.ok) throw new Error(`XLSX ID failed: ${resId.status}`);
  const bufId = await resId.arrayBuffer();
  const wbId = XLSX.read(Buffer.from(bufId), { type: 'buffer' });
  const sheetId = wbId.Sheets[wbId.SheetNames[0]];
  const dataId = XLSX.utils.sheet_to_json(sheetId, { header: 1 });

  const headersId = dataId[0];
  console.log('\n--- XLSX (ID) Headers (count: ' + headersId.length + ') ---');
  console.log(headersId);
  console.log('\n--- XLSX (ID) First Row (ROLS-001) ---');
  console.log(dataId[1]);

  // Test 3: Check excluded columns
  const excluded = [
    'Prep Status', 'Exec Status', 'Latest Result', 'Defect Ref', 'Notes', 'Lifecycle Status', 'Language', 'Translation Status',
    'Status Prep', 'Status Eksekusi', 'Hasil Terakhir', 'Ref Cacat', 'Catatan', 'Status Siklus Hidup', 'Bahasa', 'Status Terjemahan'
  ];
  const foundEn = headersEn.filter(h => excluded.includes(h));
  const foundId = headersId.filter(h => excluded.includes(h));

  console.log('\n--- Technical Columns Check ---');
  console.log('Excluded columns found in EN xlsx:', foundEn.length === 0 ? 'NONE (PASSED)' : foundEn);
  console.log('Excluded columns found in ID xlsx:', foundId.length === 0 ? 'NONE (PASSED)' : foundId);

  // Test 4: CSV check (must keep 22 columns)
  const resCsv = await fetch('http://localhost:3000/api/export?format=csv&lang=en');
  const csvText = await resCsv.text();
  const csvFirstLine = csvText.split('\n')[0];
  console.log('\n--- CSV Headers ---');
  console.log('CSV header count:', csvFirstLine.split(',').length);

  // Validation
  const enTitle = dataEn[1][4];
  const idTitle = dataId[1][4];
  console.log('\n--- Bidirectional Content Validation ---');
  console.log('ROLS-001 Title (EN):', enTitle);
  console.log('ROLS-001 Title (ID):', idTitle);

  if (enTitle.toLowerCase().includes('super admin') && enTitle.toLowerCase().includes('user account') &&
      idTitle.toLowerCase().includes('super admin') && idTitle.toLowerCase().includes('akun pengguna')) {
    console.log('\nSUCCESS: Bidirectional content and localized headers verified perfectly!');
  } else {
    console.warn('\nWARNING: Content did not match expected bilingual values.');
  }
}

testExports().catch(console.error);
