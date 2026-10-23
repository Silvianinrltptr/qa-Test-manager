import { getDb, logActivity } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const db = getDb();
    const apiKey = process.env.GEMINI_API_KEY;

    // Database counts
    const moduleCount = (db.prepare('SELECT COUNT(*) as c FROM modules').get() as { c: number }).c;
    const featureCount = (db.prepare('SELECT COUNT(*) as c FROM features').get() as { c: number }).c;
    const reqCount = (db.prepare('SELECT COUNT(*) as c FROM requirements').get() as { c: number }).c;
    const tcCount = (db.prepare('SELECT COUNT(*) as c FROM test_cases').get() as { c: number }).c;
    const execCount = (db.prepare('SELECT COUNT(*) as c FROM executions').get() as { c: number }).c;
    const activityCount = (db.prepare('SELECT COUNT(*) as c FROM activity_log').get() as { c: number }).c;

    const dbPath = path.join(process.cwd(), 'data', 'qa-manager.db');
    let dbSize = 0;
    if (fs.existsSync(dbPath)) {
      dbSize = fs.statSync(dbPath).size;
    }

    return NextResponse.json({
      ai: {
        configured: Boolean(apiKey && apiKey.trim().length > 0),
        model: 'gemini-2.0-flash',
        keyMasked: apiKey ? `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}` : null,
      },
      database: {
        path: dbPath,
        sizeBytes: dbSize,
        sizeKb: Math.round(dbSize / 1024),
        counts: {
          modules: moduleCount,
          features: featureCount,
          requirements: reqCount,
          testCases: tcCount,
          executions: execCount,
          activities: activityCount,
        }
      }
    });
  } catch (error) {
    console.error('Settings API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Seed sample data for testing if DB is empty
export async function POST(req: NextRequest) {
  try {
    const db = getDb();
    const body = await req.json();
    const { action } = body;

    if (action === 'seed_sample_data') {
      const tcCount = (db.prepare('SELECT COUNT(*) as c FROM test_cases').get() as { c: number }).c;
      if (tcCount > 0) {
        return NextResponse.json({ message: 'Database sudah memiliki data. Tidak perlu seed ulang.' }, { status: 400 });
      }

      // Create Modules
      const m1 = db.prepare(`INSERT INTO modules (name, description, prefix, status) VALUES (?, ?, ?, 'active')`)
        .run('Autentikasi & Akun', 'Modul autentikasi, registrasi, lupa password dan profil user', 'AUTH');
      const m2 = db.prepare(`INSERT INTO modules (name, description, prefix, status) VALUES (?, ?, ?, 'active')`)
        .run('Manajemen Transaksi', 'Modul checkout, pembayaran, invoice, dan riwayat pesanan', 'TRX');

      const m1Id = Number(m1.lastInsertRowid);
      const m2Id = Number(m2.lastInsertRowid);

      // Create Features
      const f1 = db.prepare(`INSERT INTO features (module_id, name, description) VALUES (?, ?, ?)`)
        .run(m1Id, 'Login & Registrasi', 'Fitur masuk dan pendaftaran akun pengguna baru');
      const f2 = db.prepare(`INSERT INTO features (module_id, name, description) VALUES (?, ?, ?)`)
        .run(m1Id, 'Reset Password', 'Fitur pemulihan kata sandi via email OTP');
      const f3 = db.prepare(`INSERT INTO features (module_id, name, description) VALUES (?, ?, ?)`)
        .run(m2Id, 'Payment Gateway', 'Integrasi VA, QRIS, dan Kartu Kredit');

      const f1Id = Number(f1.lastInsertRowid);
      const f2Id = Number(f2.lastInsertRowid);
      const f3Id = Number(f3.lastInsertRowid);

      // Create Requirements
      const r1 = db.prepare(`
        INSERT INTO requirements (module_id, feature_id, ref_id, title, description, change_type, status, version)
        VALUES (?, ?, 'REQ-AUTH-001', 'Login Pengguna dengan Email & Password', 'Sistem harus memvalidasi format email, mengecek password terenkripsi, membatasi max 5 attempt salah sebelum lockout 15 menit, dan menerbitkan JWT token.', 'new', 'active', 1)
      `).run(m1Id, f1Id);

      const r2 = db.prepare(`
        INSERT INTO requirements (module_id, feature_id, ref_id, title, description, change_type, status, version)
        VALUES (?, ?, 'REQ-AUTH-002', 'Lupa Password via OTP Email', 'Sistem mengirimkan kode OTP 6 digit berlaku 5 menit ke email terdaftar. Setelah verifikasi OTP berhasil, pengguna dapat memasukkan password baru.', 'updated', 'active', 2)
      `).run(m1Id, f2Id);

      const r3 = db.prepare(`
        INSERT INTO requirements (module_id, feature_id, ref_id, title, description, change_type, status, version)
        VALUES (?, ?, 'REQ-TRX-001', 'Pembayaran QRIS Statis & Dinamis', 'Sistem menghasilkan QRIS yang kedaluwarsa dalam 15 menit dan menerima callback webhook penyelesaian pembayaran.', 'new', 'active', 1)
      `).run(m2Id, f3Id);

      // Create initial history for requirements
      db.prepare(`INSERT INTO requirement_history (requirement_id, title, description, change_type, version) VALUES (?, ?, ?, 'new', 1)`)
        .run(Number(r1.lastInsertRowid), 'Login Pengguna', 'Requirement awal');
      db.prepare(`INSERT INTO requirement_history (requirement_id, title, description, change_type, version) VALUES (?, ?, ?, 'updated', 2)`)
        .run(Number(r2.lastInsertRowid), 'Lupa Password via OTP Email', 'Update durasi OTP dari 10 menit ke 5 menit');

      // Create Test Cases
      const sampleCases = [
        {
          case_id: 'AUTH-001', module_id: m1Id, feature_id: f1Id, requirement_ref: 'REQ-AUTH-001',
          title: 'Login berhasil dengan email dan password valid', test_type: 'functional',
          preconditions: 'Akun user sudah aktif dan terverifikasi',
          test_steps: '1. Buka halaman login\n2. Masukkan email valid (user@example.com)\n3. Masukkan password valid\n4. Klik tombol Masuk',
          test_data: 'Email: user@example.com, Pass: ValidPass123!',
          expected_result: 'User berhasil login dan diarahkan ke halaman Dashboard',
          priority: 'critical', prep_status: 'ready', exec_status: 'executed', latest_result: 'pass',
        },
        {
          case_id: 'AUTH-002', module_id: m1Id, feature_id: f1Id, requirement_ref: 'REQ-AUTH-001',
          title: 'Login gagal dengan password salah 5 kali berturut-turut (Lockout)', test_type: 'negative',
          preconditions: 'Akun user aktif',
          test_steps: '1. Masukkan email valid\n2. Masukkan password salah sebanyak 5 kali\n3. Amati respon sistem pada attempt ke-5',
          test_data: 'Password salah: wrong1, wrong2, wrong3, wrong4, wrong5',
          expected_result: 'Akun terkunci sementara selama 15 menit dengan pesan error "Terlalu banyak percobaan salah"',
          priority: 'high', prep_status: 'ready', exec_status: 'executed', latest_result: 'pass',
        },
        {
          case_id: 'AUTH-003', module_id: m1Id, feature_id: f1Id, requirement_ref: 'REQ-AUTH-001',
          title: 'Validasi input format email tidak sesuai standar RFC', test_type: 'validation',
          preconditions: 'Halaman login terbuka',
          test_steps: '1. Masukkan format email salah: "user@"\n2. Klik tombol Masuk',
          test_data: 'Email: invalid-email-format',
          expected_result: 'Validasi field menampilkan pesan "Format email tidak valid"',
          priority: 'medium', prep_status: 'ready', exec_status: 'executed', latest_result: 'pass',
        },
        {
          case_id: 'AUTH-004', module_id: m1Id, feature_id: f2Id, requirement_ref: 'REQ-AUTH-002',
          title: 'Verifikasi pengiriman kode OTP reset password ke email terdaftar', test_type: 'functional',
          preconditions: 'User meminta reset password',
          test_steps: '1. Masukkan email di form lupa password\n2. Klik Kirim OTP\n3. Periksa inbox email',
          test_data: 'Email: registered@example.com',
          expected_result: 'Email OTP diterima dalam < 30 detik dengan kode 6 digit',
          priority: 'high', prep_status: 'ready', exec_status: 'executed', latest_result: 'pass',
        },
        {
          case_id: 'AUTH-005', module_id: m1Id, feature_id: f2Id, requirement_ref: 'REQ-AUTH-002',
          title: 'Verifikasi kegagalan saat memasukkan kode OTP kedaluwarsa (> 5 menit)', test_type: 'boundary',
          preconditions: 'Kode OTP telah dikirim lebih dari 5 menit yang lalu',
          test_steps: '1. Tunggu 5 menit 1 detik\n2. Masukkan kode OTP\n3. Klik Verifikasi',
          test_data: 'OTP: 123456 (expired)',
          expected_result: 'Sistem menolak kode dengan pesan "Kode OTP telah kedaluwarsa"',
          priority: 'high', prep_status: 'ready', exec_status: 'executed', latest_result: 'fail',
          defect_ref: 'BUG-AUTH-042', notes: 'Sistem masih menerima OTP pada menit ke-7 karena toleransi cache server terlalu longgar.',
        },
        {
          case_id: 'TRX-001', module_id: m2Id, feature_id: f3Id, requirement_ref: 'REQ-TRX-001',
          title: 'Generate QRIS dinamis berhasil dengan nominal checkout sesuai', test_type: 'functional',
          preconditions: 'Keranjang belanja terisi produk senilai Rp 150.000',
          test_steps: '1. Klik Checkout\n2. Pilih metode pembayaran QRIS\n3. Klik Bayar Sekarang',
          test_data: 'Nominal: Rp 150.000',
          expected_result: 'Tampil QRIS code dinamis dengan nominal Rp 150.000 dan countdown 15 menit',
          priority: 'critical', prep_status: 'ready', exec_status: 'executed', latest_result: 'pass',
        },
        {
          case_id: 'TRX-002', module_id: m2Id, feature_id: f3Id, requirement_ref: 'REQ-TRX-001',
          title: 'Callback webhook QRIS sukses mengubah status pesanan menjadi PAID', test_type: 'integration',
          preconditions: 'Transaksi QRIS aktif dibuat',
          test_steps: '1. Simulasikan payload callback sukses dari Payment Gateway\n2. Cek status order di DB dan UI',
          test_data: 'Payload: status=settlement',
          expected_result: 'Status transaksi berubah menjadi PAID secara instan dan notifikasi dikirim ke user',
          priority: 'critical', prep_status: 'ready', exec_status: 'executed', latest_result: 'blocked',
          defect_ref: 'ENV-TRX-009', notes: 'Sandbox payment gateway timeout pada webhook callback URL.',
        },
        {
          case_id: 'TRX-003', module_id: m2Id, feature_id: f3Id, requirement_ref: 'REQ-TRX-001',
          title: 'Penanganan transaksi QRIS expired setelah 15 menit tanpa pembayaran', test_type: 'boundary',
          preconditions: 'QRIS dibuat 15 menit lalu',
          test_steps: '1. Biarkan QRIS sampai timer 0:00\n2. Coba scan dan bayar melalui aplikasi e-wallet',
          test_data: 'Timer: 15m 01s',
          expected_result: 'Pembayaran ditolak bank dan status pesanan otomatis berubah EXPIRED',
          priority: 'medium', prep_status: 'ready', exec_status: 'not_run', latest_result: 'not_run',
        },
      ];

      const stmtTc = db.prepare(`
        INSERT INTO test_cases (
          case_id, module_id, feature_id, requirement_ref, title, test_type,
          preconditions, test_steps, test_data, expected_result, priority,
          prep_status, exec_status, latest_result, defect_ref, notes, lifecycle_status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
      `);

      for (const tc of sampleCases) {
        const res = stmtTc.run(
          tc.case_id, tc.module_id, tc.feature_id, tc.requirement_ref, tc.title, tc.test_type,
          tc.preconditions, tc.test_steps, tc.test_data, tc.expected_result, tc.priority,
          tc.prep_status, tc.exec_status, tc.latest_result, tc.defect_ref || null, tc.notes || null
        );

        const newTcId = Number(res.lastInsertRowid);

        // Add execution record if executed
        if (tc.exec_status === 'executed') {
          db.prepare(`
            INSERT INTO executions (test_case_id, result, environment, actual_result, defect_ref, notes, is_retest)
            VALUES (?, ?, 'Staging Server', ?, ?, ?, 0)
          `).run(
            newTcId,
            tc.latest_result,
            tc.latest_result === 'pass' ? 'Sesuai ekspektasi' : tc.notes || 'Hasil berbeda dari ekspektasi',
            tc.defect_ref || null,
            tc.notes || null
          );
        }
      }

      // Update sequences
      db.prepare(`INSERT OR REPLACE INTO tc_sequence (module_prefix, next_seq) VALUES ('AUTH', 6)`).run();
      db.prepare(`INSERT OR REPLACE INTO tc_sequence (module_prefix, next_seq) VALUES ('TRX', 4)`).run();

      logActivity(db, 'seed_data', 'system', null, 'SYSTEM', 'Inisialisasi data sampel QA (modul, requirement, test cases, executions)');

      return NextResponse.json({ success: true, message: 'Data sampel berhasil diinisialisasi!' });
    }

    return NextResponse.json({ error: 'Aksi tidak dikenali' }, { status: 400 });
  } catch (error) {
    console.error('Seed data error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
