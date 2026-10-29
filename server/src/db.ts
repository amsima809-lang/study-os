/**
 * Database access + a tiny migration runner.
 * Migrations are plain .sql files in server/migrations, applied in filename
 * order and recorded in the `_migrations` table so each runs only once.
 */
import Database from "better-sqlite3";
import { readdirSync, readFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

export type DB = Database.Database;

const MIGRATIONS_DIR = fileURLToPath(new URL("../migrations", import.meta.url));

/** Open a SQLite database, apply pragmas, and run any pending migrations. */
export function openDb(dbPath: string): DB {
  if (dbPath !== ":memory:") {
    mkdirSync(dirname(dbPath), { recursive: true });
  }
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  runMigrations(db);
  return db;
}

function runMigrations(db: DB): void {
  db.exec(
    `CREATE TABLE IF NOT EXISTS _migrations (
       name TEXT PRIMARY KEY,
       applied_at TEXT NOT NULL
     )`,
  );

  const applied = new Set<string>(
    db.prepare("SELECT name FROM _migrations").all().map((r) => (r as { name: string }).name),
  );

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const record = db.prepare("INSERT INTO _migrations (name, applied_at) VALUES (?, ?)");
  const pending = files.filter((f) => !applied.has(f));
  if (pending.length === 0) return;

  db.pragma("foreign_keys = OFF");
  for (const file of pending) {
    const sql = readFileSync(`${MIGRATIONS_DIR}/${file}`, "utf8");
    const tx = db.transaction(() => {
      db.exec(sql);
      record.run(file, new Date().toISOString());
    });
    tx();
    console.log(`[StudyOS] migration applied: ${file}`);
  }
  db.pragma("foreign_keys = ON");
}
