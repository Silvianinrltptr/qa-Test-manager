import { getDb, logActivity } from '@/lib/db';
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import { requireAuth } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const { errorResponse } = await requireAuth(req, ['qa']);
    if (errorResponse) return errorResponse;

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
    const { errorResponse } = await requireAuth(req, ['qa']);
    if (errorResponse) return errorResponse;

    const db = getDb();
    const body = await req.json();
    const { action } = body;

    if (action === 'seed_sample_data') {
      const tcCount = (db.prepare('SELECT COUNT(*) as c FROM test_cases').get() as { c: number }).c;
      if (tcCount > 0) {
        return NextResponse.json({ message: 'Database already has data. Reseeding is not required.' }, { status: 400 });
      }

      // Create Modules
      const m1 = db.prepare(`INSERT INTO modules (name, description, prefix, status) VALUES (?, ?, ?, 'active')`)
        .run('Authentication & Account', 'Authentication module, registration, forgot password, and user profile', 'AUTH');
      const m2 = db.prepare(`INSERT INTO modules (name, description, prefix, status) VALUES (?, ?, ?, 'active')`)
        .run('Transaction Management', 'Checkout module, payment, invoices, and order history', 'TRX');

      const m1Id = Number(m1.lastInsertRowid);
      const m2Id = Number(m2.lastInsertRowid);

      // Create Features
      const f1 = db.prepare(`INSERT INTO features (module_id, name, description) VALUES (?, ?, ?)`)
        .run(m1Id, 'Login & Registration', 'User login and new account registration feature');
      const f2 = db.prepare(`INSERT INTO features (module_id, name, description) VALUES (?, ?, ?)`)
        .run(m1Id, 'Reset Password', 'Password recovery feature via email OTP');
      const f3 = db.prepare(`INSERT INTO features (module_id, name, description) VALUES (?, ?, ?)`)
        .run(m2Id, 'Payment Gateway', 'VA, QRIS, and Credit Card integration');

      const f1Id = Number(f1.lastInsertRowid);
      const f2Id = Number(f2.lastInsertRowid);
      const f3Id = Number(f3.lastInsertRowid);

      // Create Requirements
      const r1 = db.prepare(`
        INSERT INTO requirements (module_id, feature_id, ref_id, title, description, change_type, status, version)
        VALUES (?, ?, 'REQ-AUTH-001', 'User Login with Email & Password', 'The system must validate email format, verify encrypted password, limit to max 5 failed attempts before a 15-minute lockout, and issue a JWT token.', 'new', 'active', 1)
      `).run(m1Id, f1Id);

      const r2 = db.prepare(`
        INSERT INTO requirements (module_id, feature_id, ref_id, title, description, change_type, status, version)
        VALUES (?, ?, 'REQ-AUTH-002', 'Forgot Password via Email OTP', 'The system sends a 6-digit OTP code valid for 5 minutes to the registered email. After successful OTP verification, the user can set a new password.', 'updated', 'active', 2)
      `).run(m1Id, f2Id);

      const r3 = db.prepare(`
        INSERT INTO requirements (module_id, feature_id, ref_id, title, description, change_type, status, version)
        VALUES (?, ?, 'REQ-TRX-001', 'Static & Dynamic QRIS Payment', 'The system generates a QRIS code that expires in 15 minutes and handles payment completion webhook callbacks.', 'new', 'active', 1)
      `).run(m2Id, f3Id);

      // Create initial history for requirements
      db.prepare(`INSERT INTO requirement_history (requirement_id, title, description, change_type, version) VALUES (?, ?, ?, 'new', 1)`)
        .run(Number(r1.lastInsertRowid), 'User Login', 'Initial requirement');
      db.prepare(`INSERT INTO requirement_history (requirement_id, title, description, change_type, version) VALUES (?, ?, ?, 'updated', 2)`)
        .run(Number(r2.lastInsertRowid), 'Forgot Password via Email OTP', 'Updated OTP duration from 10 minutes to 5 minutes');

      // Create Test Cases
      const sampleCases = [
        {
          case_id: 'AUTH-001', module_id: m1Id, feature_id: f1Id, requirement_ref: 'REQ-AUTH-001',
          title: 'Successful login with valid email and password', test_type: 'functional',
          preconditions: 'User account is active and verified',
          test_steps: '1. Open login page\n2. Enter valid email (user@example.com)\n3. Enter valid password\n4. Click Login button',
          test_data: 'Email: user@example.com, Pass: ValidPass123!',
          expected_result: 'User successfully logs in and is redirected to Dashboard',
          priority: 'critical', prep_status: 'ready', exec_status: 'executed', latest_result: 'pass',
        },
        {
          case_id: 'AUTH-002', module_id: m1Id, feature_id: f1Id, requirement_ref: 'REQ-AUTH-001',
          title: 'Login failure with 5 consecutive incorrect passwords (Lockout)', test_type: 'negative',
          preconditions: 'User account is active',
          test_steps: '1. Enter valid email\n2. Enter incorrect password 5 times\n3. Observe system response on 5th attempt',
          test_data: 'Wrong passwords: wrong1, wrong2, wrong3, wrong4, wrong5',
          expected_result: 'Account is temporarily locked for 15 minutes with error message "Too many failed attempts"',
          priority: 'high', prep_status: 'ready', exec_status: 'executed', latest_result: 'pass',
        },
        {
          case_id: 'AUTH-003', module_id: m1Id, feature_id: f1Id, requirement_ref: 'REQ-AUTH-001',
          title: 'Input validation for email format not conforming to RFC standards', test_type: 'validation',
          preconditions: 'Login page is open',
          test_steps: '1. Enter invalid email format: "user@"\n2. Click Login button',
          test_data: 'Email: invalid-email-format',
          expected_result: 'Field validation displays error message "Invalid email format"',
          priority: 'medium', prep_status: 'ready', exec_status: 'executed', latest_result: 'pass',
        },
        {
          case_id: 'AUTH-004', module_id: m1Id, feature_id: f2Id, requirement_ref: 'REQ-AUTH-002',
          title: 'Verify password reset OTP code is sent to registered email', test_type: 'functional',
          preconditions: 'User requests password reset',
          test_steps: '1. Enter email in forgot password form\n2. Click Send OTP\n3. Check email inbox',
          test_data: 'Email: registered@example.com',
          expected_result: 'OTP email is received within < 30 seconds with a 6-digit code',
          priority: 'high', prep_status: 'ready', exec_status: 'executed', latest_result: 'pass',
        },
        {
          case_id: 'AUTH-005', module_id: m1Id, feature_id: f2Id, requirement_ref: 'REQ-AUTH-002',
          title: 'Verify failure when entering expired OTP code (> 5 minutes)', test_type: 'boundary',
          preconditions: 'OTP code was sent more than 5 minutes ago',
          test_steps: '1. Wait 5 minutes 1 second\n2. Enter OTP code\n3. Click Verify',
          test_data: 'OTP: 123456 (expired)',
          expected_result: 'System rejects code with error message "OTP code has expired"',
          priority: 'high', prep_status: 'ready', exec_status: 'executed', latest_result: 'fail',
          defect_ref: 'BUG-AUTH-042', notes: 'System still accepts OTP at minute 7 due to overly lenient server cache tolerance.',
        },
        {
          case_id: 'TRX-001', module_id: m2Id, feature_id: f3Id, requirement_ref: 'REQ-TRX-001',
          title: 'Generate dynamic QRIS successfully with matching checkout amount', test_type: 'functional',
          preconditions: 'Shopping cart contains items totaling $150',
          test_steps: '1. Click Checkout\n2. Select QRIS payment method\n3. Click Pay Now',
          test_data: 'Amount: $150',
          expected_result: 'Dynamic QRIS code displayed with amount $150 and 15-minute countdown',
          priority: 'critical', prep_status: 'ready', exec_status: 'executed', latest_result: 'pass',
        },
        {
          case_id: 'TRX-002', module_id: m2Id, feature_id: f3Id, requirement_ref: 'REQ-TRX-001',
          title: 'QRIS webhook callback successfully updates order status to PAID', test_type: 'integration',
          preconditions: 'Active QRIS transaction created',
          test_steps: '1. Simulate successful callback payload from Payment Gateway\n2. Check order status in DB and UI',
          test_data: 'Payload: status=settlement',
          expected_result: 'Transaction status instantly updates to PAID and notification sent to user',
          priority: 'critical', prep_status: 'ready', exec_status: 'executed', latest_result: 'blocked',
          defect_ref: 'ENV-TRX-009', notes: 'Sandbox payment gateway timeout on webhook callback URL.',
        },
        {
          case_id: 'TRX-003', module_id: m2Id, feature_id: f3Id, requirement_ref: 'REQ-TRX-001',
          title: 'Handling expired QRIS transaction after 15 minutes without payment', test_type: 'boundary',
          preconditions: 'QRIS created 15 minutes ago',
          test_steps: '1. Wait until QRIS timer reaches 0:00\n2. Attempt to scan and pay via e-wallet',
          test_data: 'Timer: 15m 01s',
          expected_result: 'Payment rejected by bank and order status automatically marked EXPIRED',
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
            tc.latest_result === 'pass' ? 'As expected' : tc.notes || 'Result differs from expectation',
            tc.defect_ref || null,
            tc.notes || null
          );
        }
      }

      // Update sequences
      db.prepare(`INSERT OR REPLACE INTO tc_sequence (module_prefix, next_seq) VALUES ('AUTH', 6)`).run();
      db.prepare(`INSERT OR REPLACE INTO tc_sequence (module_prefix, next_seq) VALUES ('TRX', 4)`).run();

      logActivity(db, 'seed_data', 'system', null, 'SYSTEM', 'Sample QA data initialized (modules, requirements, test cases, executions)');

      return NextResponse.json({ success: true, message: 'Sample data initialized successfully!' });
    }

    return NextResponse.json({ error: 'Unrecognized action' }, { status: 400 });
  } catch (error) {
    console.error('Seed data error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
