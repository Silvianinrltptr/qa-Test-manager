import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';

const DB_DIR = path.join(process.cwd(), 'data');
const DB_PATH = path.join(DB_DIR, 'qa-manager.db');

let db: Database.Database | null = null;

export function getDb(): Database.Database {
  if (db) return db;
  
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  db = new Database(DB_PATH);
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  initSchema(db);
  return db;
}

function initSchema(db: Database.Database) {
  db.exec(`
    -- Modules
    CREATE TABLE IF NOT EXISTS modules (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      description TEXT,
      prefix TEXT NOT NULL UNIQUE,
      status TEXT NOT NULL DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Features
    CREATE TABLE IF NOT EXISTS features (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      module_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (module_id) REFERENCES modules(id)
    );

    -- Requirements
    CREATE TABLE IF NOT EXISTS requirements (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      module_id INTEGER,
      feature_id INTEGER,
      ref_id TEXT,
      title TEXT NOT NULL,
      description TEXT,
      change_type TEXT DEFAULT 'new',
      status TEXT DEFAULT 'active',
      version INTEGER DEFAULT 1,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (module_id) REFERENCES modules(id),
      FOREIGN KEY (feature_id) REFERENCES features(id)
    );

    -- Requirement history
    CREATE TABLE IF NOT EXISTS requirement_history (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      requirement_id INTEGER NOT NULL,
      title TEXT,
      description TEXT,
      change_type TEXT,
      version INTEGER,
      changed_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (requirement_id) REFERENCES requirements(id)
    );

    -- Test cases
    CREATE TABLE IF NOT EXISTS test_cases (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      case_id TEXT NOT NULL UNIQUE,
      module_id INTEGER NOT NULL,
      feature_id INTEGER NOT NULL,
      requirement_ref TEXT,
      title TEXT NOT NULL,
      test_type TEXT DEFAULT 'functional',
      preconditions TEXT,
      test_steps TEXT,
      test_data TEXT,
      expected_result TEXT,
      actual_result TEXT,
      priority TEXT DEFAULT 'medium',
      prep_status TEXT DEFAULT 'draft',
      exec_status TEXT DEFAULT 'not_run',
      latest_result TEXT DEFAULT 'not_run',
      evidence TEXT,
      defect_ref TEXT,
      notes TEXT,
      lifecycle_status TEXT DEFAULT 'active',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (module_id) REFERENCES modules(id),
      FOREIGN KEY (feature_id) REFERENCES features(id)
    );

    -- Test case sequence per module (for unique IDs)
    CREATE TABLE IF NOT EXISTS tc_sequence (
      module_prefix TEXT PRIMARY KEY,
      next_seq INTEGER DEFAULT 1
    );

    -- Execution history
    CREATE TABLE IF NOT EXISTS executions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      test_case_id INTEGER NOT NULL,
      exec_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      environment TEXT,
      actual_result TEXT,
      result TEXT NOT NULL,
      evidence TEXT,
      defect_ref TEXT,
      notes TEXT,
      is_retest INTEGER DEFAULT 0,
      FOREIGN KEY (test_case_id) REFERENCES test_cases(id)
    );

    -- Change log
    CREATE TABLE IF NOT EXISTS change_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_type TEXT NOT NULL,
      entity_id INTEGER NOT NULL,
      entity_ref TEXT,
      change_type TEXT NOT NULL,
      changed_fields TEXT,
      old_values TEXT,
      new_values TEXT,
      reason TEXT,
      requirement_ref TEXT,
      changed_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Weekly snapshots
    CREATE TABLE IF NOT EXISTS weekly_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      week_start DATE NOT NULL,
      week_end DATE NOT NULL,
      snapshot_data TEXT NOT NULL,
      notes TEXT,
      activities TEXT,
      next_priorities TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- Activity log
    CREATE TABLE IF NOT EXISTS activity_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      action TEXT NOT NULL,
      entity_type TEXT,
      entity_id INTEGER,
      entity_ref TEXT,
      description TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    -- AI drafts (temporary storage for review)
    CREATE TABLE IF NOT EXISTS ai_drafts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      module_id INTEGER,
      feature_id INTEGER,
      draft_data TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (module_id) REFERENCES modules(id),
      FOREIGN KEY (feature_id) REFERENCES features(id)
    );

    -- Test case comments & collaborator feedback
    CREATE TABLE IF NOT EXISTS test_case_comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      test_case_id INTEGER NOT NULL,
      author_name TEXT NOT NULL,
      author_role TEXT NOT NULL DEFAULT 'pm',
      content TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      reply TEXT,
      replied_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      resolved_at DATETIME,
      FOREIGN KEY (test_case_id) REFERENCES test_cases(id) ON DELETE CASCADE
    );
  `);
}

// ─── Utility helpers ─────────────────────────────────────────────────────────

export function generateCaseId(db: Database.Database, prefix: string): string {
  const row = db.prepare('SELECT next_seq FROM tc_sequence WHERE module_prefix = ?').get(prefix) as { next_seq: number } | undefined;
  const seq = row ? row.next_seq : 1;
  db.prepare(`
    INSERT INTO tc_sequence (module_prefix, next_seq) VALUES (?, ?)
    ON CONFLICT(module_prefix) DO UPDATE SET next_seq = excluded.next_seq
  `).run(prefix, seq + 1);
  return `${prefix}-${String(seq).padStart(3, '0')}`;
}

export function logActivity(db: Database.Database, action: string, entityType: string, entityId: number | null, entityRef: string, description: string) {
  db.prepare(`
    INSERT INTO activity_log (action, entity_type, entity_id, entity_ref, description)
    VALUES (?, ?, ?, ?, ?)
  `).run(action, entityType, entityId, entityRef, description);
}

export function logChange(db: Database.Database, opts: {
  entityType: string;
  entityId: number;
  entityRef: string;
  changeType: string;
  changedFields?: string;
  oldValues?: unknown;
  newValues?: unknown;
  reason?: string;
  requirementRef?: string;
}) {
  db.prepare(`
    INSERT INTO change_log (entity_type, entity_id, entity_ref, change_type, changed_fields, old_values, new_values, reason, requirement_ref)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    opts.entityType,
    opts.entityId,
    opts.entityRef,
    opts.changeType,
    opts.changedFields ?? null,
    opts.oldValues ? JSON.stringify(opts.oldValues) : null,
    opts.newValues ? JSON.stringify(opts.newValues) : null,
    opts.reason ?? null,
    opts.requirementRef ?? null
  );
}
