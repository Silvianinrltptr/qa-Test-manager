import path from 'path';
import fs from 'fs';
import { prisma } from './prisma';

export { prisma } from './prisma';

export interface RunResult {
  changes: number;
  lastInsertRowid: number;
}

export interface Statement<T = any> {
  all(...params: any[]): Promise<T[]>;
  get(...params: any[]): Promise<T | null | undefined>;
  run(...params: any[]): Promise<RunResult>;
}

export interface IDatabase {
  prepare<T = any>(sql: string): Statement<T>;
  exec?(sql: string): Promise<void> | void;
}

// Recursively convert BigInt to Number so JSON.stringify / NextResponse.json never throws
export function sanitizeBigInt<T = any>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'bigint') return Number(obj) as any;
  if (Array.isArray(obj)) return obj.map(sanitizeBigInt) as any;
  if (typeof obj === 'object' && !(obj instanceof Date)) {
    const res: Record<string, any> = {};
    for (const [k, v] of Object.entries(obj)) {
      res[k] = sanitizeBigInt(v);
    }
    return res as any;
  }
  return obj;
}

// Translate common SQLite syntax to PostgreSQL syntax
export function translateSql(sql: string): string {
  let translated = sql
    .replace(/datetime\(\s*'now'\s*,\s*'-7 days'\s*\)/gi, "(NOW() - INTERVAL '7 days')")
    .replace(/datetime\(\s*'now'\s*\)/gi, "NOW()")
    .replace(/strftime\(/gi, "to_char(")
    .replace(/\bAUTOINCREMENT\b/gi, '')
    .replace(/\bLIKE\b/g, 'ILIKE')
    .trim();

  // Convert positional ? to $1, $2, $3, ...
  let paramIdx = 1;
  translated = translated.replace(/\?/g, () => `$${paramIdx++}`);
  return translated;
}

class PgDatabase implements IDatabase {
  prepare<T = any>(sql: string): Statement<T> {
    return {
      all: async (...params: any[]): Promise<T[]> => {
        const pgSql = translateSql(sql);
        const rows = await prisma.$queryRawUnsafe(pgSql, ...params);
        return sanitizeBigInt(rows) as T[];
      },
      get: async (...params: any[]): Promise<T | undefined> => {
        const pgSql = translateSql(sql);
        const rows = (await prisma.$queryRawUnsafe(pgSql, ...params)) as any[];
        const first = rows && rows.length > 0 ? rows[0] : undefined;
        return sanitizeBigInt(first) as T | undefined;
      },
      run: async (...params: any[]): Promise<RunResult> => {
        let pgSql = translateSql(sql);
        const isInsert = /^\s*INSERT\s+INTO/i.test(pgSql);
        if (isInsert) {
          if (!/RETURNING/i.test(pgSql)) {
            pgSql += ' RETURNING id';
          }
          try {
            const rows = (await prisma.$queryRawUnsafe(pgSql, ...params)) as any[];
            const id = rows && rows.length > 0 && rows[0].id ? Number(rows[0].id) : 0;
            return { changes: rows.length, lastInsertRowid: id };
          } catch (err: any) {
            // In case table does not have 'id' column, execute without RETURNING
            const count = await prisma.$executeRawUnsafe(translateSql(sql), ...params);
            return { changes: Number(count), lastInsertRowid: 0 };
          }
        } else {
          const count = await prisma.$executeRawUnsafe(pgSql, ...params);
          return { changes: Number(count), lastInsertRowid: 0 };
        }
      },
    };
  }
}

class SqliteDatabaseAdapter implements IDatabase {
  private rawDb: any;
  constructor(rawDb: any) {
    this.rawDb = rawDb;
  }
  prepare<T = any>(sql: string): Statement<T> {
    const stmt = this.rawDb.prepare(sql);
    return {
      all: async (...params: any[]): Promise<T[]> => stmt.all(...params),
      get: async (...params: any[]): Promise<T | undefined> => stmt.get(...params),
      run: async (...params: any[]): Promise<RunResult> => {
        const res = stmt.run(...params);
        return { changes: res.changes, lastInsertRowid: Number(res.lastInsertRowid) };
      },
    };
  }
}

let activeDb: IDatabase | null = null;

export function getDb(): IDatabase {
  if (activeDb) return activeDb;

  // If DATABASE_URL is configured (PostgreSQL on Neon / Supabase / Railway or local PG),
  // use the Prisma PostgreSQL driver
  if (process.env.DATABASE_URL && process.env.DATABASE_URL.startsWith('postgres')) {
    activeDb = new PgDatabase();
    return activeDb;
  }

  // Graceful local SQLite fallback
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const BetterSqlite3 = require('better-sqlite3');
    const DB_DIR = path.join(process.cwd(), 'data');
    const DB_PATH = path.join(DB_DIR, 'qa-manager.db');

    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }

    const sqlite = new BetterSqlite3(DB_PATH);
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');
    activeDb = new SqliteDatabaseAdapter(sqlite);
    return activeDb;
  } catch (err) {
    // If better-sqlite3 cannot be loaded (e.g. read-only filesystem or serverless), fallback to PgDatabase
    activeDb = new PgDatabase();
    return activeDb;
  }
}

// ─── Utility helpers ─────────────────────────────────────────────────────────

export async function generateCaseId(db: IDatabase, prefix: string): Promise<string> {
  const row = (await db.prepare('SELECT next_seq FROM tc_sequence WHERE module_prefix = ?').get(prefix)) as { next_seq: number } | undefined;
  const seq = row && row.next_seq !== null && row.next_seq !== undefined ? Number(row.next_seq) : 1;
  await db.prepare(`
    INSERT INTO tc_sequence (module_prefix, next_seq) VALUES (?, ?)
    ON CONFLICT(module_prefix) DO UPDATE SET next_seq = EXCLUDED.next_seq
  `).run(prefix, seq + 1);
  return `${prefix}-${String(seq).padStart(3, '0')}`;
}

export async function logActivity(
  db: IDatabase,
  action: string,
  entityType: string,
  entityId: number | null,
  entityRef: string,
  description: string
) {
  try {
    await db.prepare(`
      INSERT INTO activity_log (action, entity_type, entity_id, entity_ref, description)
      VALUES (?, ?, ?, ?, ?)
    `).run(action, entityType, entityId, entityRef, description);
  } catch (err) {
    console.error('Failed to log activity:', err);
  }
}

export async function logChange(
  db: IDatabase,
  opts: {
    entityType: string;
    entityId: number;
    entityRef: string;
    changeType: string;
    changedFields?: string;
    oldValues?: unknown;
    newValues?: unknown;
    reason?: string;
    requirementRef?: string;
  }
) {
  try {
    await db.prepare(`
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
  } catch (err) {
    console.error('Failed to log change:', err);
  }
}
