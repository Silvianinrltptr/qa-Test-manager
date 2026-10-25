import Database from 'better-sqlite3';
import { PrismaClient } from '@prisma/client';
import fs from 'fs';
import path from 'path';

const DB_PATH = path.join(process.cwd(), 'data', 'qa-manager.db');

if (!process.env.DATABASE_URL) {
  console.error('❌ Error: DATABASE_URL environment variable is not defined.');
  console.error('👉 Please set DATABASE_URL in .env.local first:');
  console.error('   DATABASE_URL="postgresql://user:password@host:port/dbname?sslmode=require"');
  process.exit(1);
}

if (!fs.existsSync(DB_PATH)) {
  console.error(`❌ SQLite database not found at ${DB_PATH}`);
  process.exit(1);
}

const sqlite = new Database(DB_PATH);
const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Starting SQLite to PostgreSQL migration...');
  console.log(`📂 Source: ${DB_PATH}`);
  console.log(`🌐 Target: ${process.env.DATABASE_URL.replace(/:[^:@]+@/, ':****@')}\n`);

  // 1. Modules
  const modules = sqlite.prepare('SELECT * FROM modules').all();
  console.log(`📦 Migrating ${modules.length} modules...`);
  for (const m of modules) {
    await prisma.module.upsert({
      where: { id: m.id },
      update: {},
      create: {
        id: m.id,
        name: m.name,
        description: m.description,
        prefix: m.prefix,
        status: m.status,
        createdAt: new Date(m.created_at),
        updatedAt: new Date(m.updated_at),
      },
    });
  }

  // 2. Features
  const features = sqlite.prepare('SELECT * FROM features').all();
  console.log(`🧩 Migrating ${features.length} features...`);
  for (const f of features) {
    await prisma.feature.upsert({
      where: { id: f.id },
      update: {},
      create: {
        id: f.id,
        moduleId: f.module_id,
        name: f.name,
        description: f.description,
        status: f.status,
        createdAt: new Date(f.created_at),
        updatedAt: new Date(f.updated_at),
      },
    });
  }

  // 3. Requirements & History
  const requirements = sqlite.prepare('SELECT * FROM requirements').all();
  console.log(`📋 Migrating ${requirements.length} requirements...`);
  for (const r of requirements) {
    await prisma.requirement.upsert({
      where: { id: r.id },
      update: {},
      create: {
        id: r.id,
        moduleId: r.module_id,
        featureId: r.feature_id,
        refId: r.ref_id,
        title: r.title,
        description: r.description,
        changeType: r.change_type,
        status: r.status,
        version: r.version,
        createdAt: new Date(r.created_at),
        updatedAt: new Date(r.updated_at),
      },
    });
  }

  const reqHistory = sqlite.prepare('SELECT * FROM requirement_history').all();
  console.log(`📜 Migrating ${reqHistory.length} requirement history records...`);
  for (const rh of reqHistory) {
    await prisma.requirementHistory.upsert({
      where: { id: rh.id },
      update: {},
      create: {
        id: rh.id,
        requirementId: rh.requirement_id,
        title: rh.title,
        description: rh.description,
        changeType: rh.change_type,
        version: rh.version,
        changedAt: new Date(rh.changed_at),
      },
    });
  }

  // 4. Test Cases
  const testCases = sqlite.prepare('SELECT * FROM test_cases').all();
  console.log(`🧪 Migrating ${testCases.length} test cases...`);
  for (const tc of testCases) {
    await prisma.testCase.upsert({
      where: { id: tc.id },
      update: {},
      create: {
        id: tc.id,
        caseId: tc.case_id,
        moduleId: tc.module_id,
        featureId: tc.feature_id,
        requirementRef: tc.requirement_ref,
        title: tc.title,
        testType: tc.test_type,
        preconditions: tc.preconditions,
        testSteps: tc.test_steps,
        testData: tc.test_data,
        expectedResult: tc.expected_result,
        actualResult: tc.actual_result,
        priority: tc.priority,
        prepStatus: tc.prep_status,
        execStatus: tc.exec_status,
        latestResult: tc.latest_result,
        evidence: tc.evidence,
        defectRef: tc.defect_ref,
        notes: tc.notes,
        lifecycleStatus: tc.lifecycle_status,
        createdAt: new Date(tc.created_at),
        updatedAt: new Date(tc.updated_at),
      },
    });
  }

  // 5. TC Sequence
  const sequences = sqlite.prepare('SELECT * FROM tc_sequence').all();
  console.log(`🔢 Migrating ${sequences.length} sequence records...`);
  for (const s of sequences) {
    await prisma.tcSequence.upsert({
      where: { modulePrefix: s.module_prefix },
      update: { nextSeq: s.next_seq },
      create: {
        modulePrefix: s.module_prefix,
        nextSeq: s.next_seq,
      },
    });
  }

  // 6. Executions
  const executions = sqlite.prepare('SELECT * FROM executions').all();
  console.log(`⚡ Migrating ${executions.length} executions...`);
  for (const e of executions) {
    await prisma.execution.upsert({
      where: { id: e.id },
      update: {},
      create: {
        id: e.id,
        testCaseId: e.test_case_id,
        execDate: new Date(e.exec_date),
        environment: e.environment,
        actualResult: e.actual_result,
        result: e.result,
        evidence: e.evidence,
        defectRef: e.defect_ref,
        notes: e.notes,
        isRetest: e.is_retest,
      },
    });
  }

  // 7. Activity Log & Change Log
  const activities = sqlite.prepare('SELECT * FROM activity_log').all();
  console.log(`📌 Migrating ${activities.length} activity logs...`);
  for (const a of activities) {
    await prisma.activityLog.upsert({
      where: { id: a.id },
      update: {},
      create: {
        id: a.id,
        action: a.action,
        entityType: a.entity_type,
        entityId: a.entity_id,
        entityRef: a.entity_ref,
        description: a.description,
        createdAt: new Date(a.created_at),
      },
    });
  }

  const changeLogs = sqlite.prepare('SELECT * FROM change_log').all();
  console.log(`📝 Migrating ${changeLogs.length} change logs...`);
  for (const cl of changeLogs) {
    await prisma.changeLog.upsert({
      where: { id: cl.id },
      update: {},
      create: {
        id: cl.id,
        entityType: cl.entity_type,
        entityId: cl.entity_id,
        entityRef: cl.entity_ref,
        changeType: cl.change_type,
        changedFields: cl.changed_fields,
        oldValues: cl.old_values,
        newValues: cl.new_values,
        reason: cl.reason,
        requirementRef: cl.requirement_ref,
        changedAt: new Date(cl.changed_at),
      },
    });
  }

  // 8. Weekly Snapshots
  const snapshots = sqlite.prepare('SELECT * FROM weekly_snapshots').all();
  console.log(`📊 Migrating ${snapshots.length} weekly snapshots...`);
  for (const ws of snapshots) {
    await prisma.weeklySnapshot.upsert({
      where: { id: ws.id },
      update: {},
      create: {
        id: ws.id,
        weekStart: new Date(ws.week_start),
        weekEnd: new Date(ws.week_end),
        snapshotData: ws.snapshot_data,
        notes: ws.notes,
        activities: ws.activities,
        nextPriorities: ws.next_priorities,
        createdAt: new Date(ws.created_at),
      },
    });
  }

  // 9. Comments
  const comments = sqlite.prepare('SELECT * FROM test_case_comments').all();
  console.log(`💬 Migrating ${comments.length} test case comments...`);
  for (const c of comments) {
    await prisma.testCaseComment.upsert({
      where: { id: c.id },
      update: {},
      create: {
        id: c.id,
        testCaseId: c.test_case_id,
        authorName: c.author_name,
        authorRole: c.author_role,
        content: c.content,
        status: c.status,
        reply: c.reply,
        repliedAt: c.replied_at ? new Date(c.replied_at) : null,
        createdAt: new Date(c.created_at),
        resolvedAt: c.resolved_at ? new Date(c.resolved_at) : null,
      },
    });
  }

  console.log('\n✨ Data migration from SQLite to PostgreSQL completed successfully!');
}

main()
  .catch((e) => {
    console.error('❌ Migration error:', e);
    process.exit(1);
  })
  .finally(async () => {
    sqlite.close();
    await prisma.$disconnect();
  });
