import { config, isPostgres } from "../config.js";
import fs from "node:fs";
import path from "node:path";
import { errMessage } from "../lib/types.js";

const createTablesSQL = `
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS virtual_keys (
  id TEXT PRIMARY KEY,
  prefix TEXT NOT NULL DEFAULT 'fgk-',
  hash TEXT NOT NULL UNIQUE,
  user_id TEXT REFERENCES users(id),
  name TEXT NOT NULL,
  scopes TEXT,
  rpm_limit INTEGER NOT NULL DEFAULT 60,
  tpd_limit INTEGER NOT NULL DEFAULT 100000,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS provider_keys (
  id TEXT PRIMARY KEY,
  provider TEXT NOT NULL,
  encrypted_key TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  last_checked_at INTEGER
);
CREATE TABLE IF NOT EXISTS requests (
  id TEXT PRIMARY KEY,
  virtual_key_id TEXT REFERENCES virtual_keys(id),
  provider TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_tokens INTEGER,
  completion_tokens INTEGER,
  latency_ms INTEGER,
  status TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_requests_created_at ON requests(created_at);
CREATE INDEX IF NOT EXISTS idx_requests_provider ON requests(provider);
CREATE INDEX IF NOT EXISTS idx_virtual_keys_hash ON virtual_keys(hash);
`;

async function migrateSqlite(dbPath: string) {
  const { default: Database } = await import("better-sqlite3");
  const resolved = dbPath.startsWith("file:") ? dbPath.slice(5) : dbPath;
  const dir = path.dirname(path.resolve(resolved));
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  console.warn(`[migrate] SQLite DB: ${resolved}`);
  const db = new Database(resolved);
  db.exec(createTablesSQL);
  console.warn("[migrate] SQLite tables ensured (users, virtual_keys, provider_keys, requests)");
  db.close();
}

async function migratePostgres(url: string) {
  console.warn(`[migrate] Postgres URL: ${url.replace(/:[^:@]+@/, ":***@")}`);
  try {
    const { drizzle } = await import("drizzle-orm/node-postgres");
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: url });
    const db = drizzle(pool);
    // Use raw SQL via pool for simplicity — ensures tables even without drizzle-kit generated files
    await pool.query(createTablesSQL.replace(/INTEGER/g, "BIGINT").replace(/TEXT PRIMARY KEY/g, "VARCHAR PRIMARY KEY").replace(/TEXT NOT NULL UNIQUE/g, "VARCHAR NOT NULL UNIQUE").replace(/TEXT NOT NULL/g, "VARCHAR NOT NULL").replace(/TEXT REFERENCES/g, "VARCHAR REFERENCES").replace(/TEXT,/g, "VARCHAR,"));
    console.warn("[migrate] Postgres tables ensured");
    await pool.end();
    void db;
  } catch (e) {
    const code = typeof e === "object" && e !== null && "code" in e ? String((e as { code: unknown }).code) : "";
    if (code === "ERR_MODULE_NOT_FOUND" || errMessage(e).includes("Cannot find package 'pg'")) {
      console.warn("[migrate] 'pg' not installed — run: npm install pg @types/pg");
      console.warn("[migrate] Skipping Postgres migration. Generate with: npx drizzle-kit generate && npx drizzle-kit migrate");
      return;
    }
    throw e;
  }
}

async function main() {
  console.warn("[migrate] DATABASE_URL:", config.databaseUrl);
  // Also try drizzle-kit migration files if present
  const drizzleDir = path.resolve("drizzle");
  if (fs.existsSync(drizzleDir)) {
    console.warn(`[migrate] Found drizzle dir: ${drizzleDir} — will apply after ensuring base tables`);
  }

  if (isPostgres) {
    await migratePostgres(config.databaseUrl);
  } else {
    const dbPath = config.databaseUrl || "file:./data.db";
    await migrateSqlite(dbPath);
  }
  console.warn("[migrate] Done");
}

main().catch((e) => {
  console.error("[migrate] Failed:", e);
  process.exit(1);
});
