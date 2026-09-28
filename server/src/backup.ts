/**
 * Phase 9: daily SQLite backup into <dataDir>/backups, keeping the last 14.
 */
import { mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { join, dirname } from "node:path";
import type { DB } from "./db.js";
import { bangkokToday } from "./api.js";

const KEEP = 14;
const PREFIX = "studyos-";

/** Given backup filenames, return the ones to delete (oldest beyond `keep`). */
export function filesToPrune(files: string[], keep = KEEP): string[] {
  const backups = files
    .filter((f) => f.startsWith(PREFIX) && f.endsWith(".db"))
    .sort(); // names are date-stamped, so lexical sort = chronological
  return backups.slice(0, Math.max(0, backups.length - keep));
}

/** Back up the database to <dataDir>/backups/studyos-YYYY-MM-DD.db and prune old ones. */
export async function backupNow(db: DB, dbPath: string): Promise<string> {
  const backupsDir = join(dirname(dbPath), "backups");
  mkdirSync(backupsDir, { recursive: true });
  const dest = join(backupsDir, `${PREFIX}${bangkokToday()}.db`);

  await db.backup(dest);

  // prune to the newest KEEP files
  const all = readdirSync(backupsDir)
    .filter((f) => f.startsWith(PREFIX) && f.endsWith(".db"))
    .sort();
  for (const old of all.slice(0, Math.max(0, all.length - KEEP))) {
    unlinkSync(join(backupsDir, old));
  }
  return dest;
}

/** Run a backup now, then once a day. */
export function scheduleDailyBackups(db: DB, dbPath: string): void {
  const run = () =>
    backupNow(db, dbPath)
      .then((p) => console.log(`[StudyOS] backup written: ${p}`))
      .catch((e) => console.error("[StudyOS] backup failed:", e));
  run();
  setInterval(run, 24 * 60 * 60 * 1000);
}
