import "server-only";

import initSqlJs, { type Database as SqlJsDatabase } from "sql.js";
import fs from "fs";
import path from "path";

const DB_PATH = path.join(process.cwd(), "data", "ai-master.db");
const WASM_PATH = path.join(process.cwd(), "node_modules", "sql.js", "dist", "sql-wasm.wasm");

interface IDbGlobal {
  db: SqlJsDatabase | undefined;
  initPromise: Promise<SqlJsDatabase> | undefined;
}

const globalDb = globalThis as unknown as IDbGlobal;

async function createDbInstance(): Promise<SqlJsDatabase> {
  const SQL = await initSqlJs({ locateFile: () => WASM_PATH });

  let instance: SqlJsDatabase;
  if (fs.existsSync(DB_PATH)) {
    instance = new SQL.Database(fs.readFileSync(DB_PATH));
  } else {
    instance = new SQL.Database();
  }

  instance.run("PRAGMA journal_mode=WAL");
  instance.run("PRAGMA foreign_keys=ON");

  instance.run(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      login TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'player',
      display_name TEXT NOT NULL DEFAULT '',
      avatar TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  try { instance.run("ALTER TABLE users ADD COLUMN display_name TEXT NOT NULL DEFAULT ''"); } catch { /* already exists */ }
  try { instance.run("ALTER TABLE users ADD COLUMN avatar TEXT NOT NULL DEFAULT ''"); } catch { /* already exists */ }

  return instance;
}

export async function getDb(): Promise<SqlJsDatabase> {
  if (globalDb.db) return globalDb.db;

  if (!globalDb.initPromise) {
    globalDb.initPromise = createDbInstance();
  }

  globalDb.db = await globalDb.initPromise;
  return globalDb.db;
}

export function saveDb(): void {
  if (!globalDb.db) return;
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DB_PATH, Buffer.from(globalDb.db.export()));
}
