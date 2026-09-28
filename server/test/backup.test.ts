import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync, rmSync, existsSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { filesToPrune, backupNow } from "../src/backup.js";

describe("Phase 9 — backup pruning", () => {
  it("keeps the newest N and marks the rest for deletion", () => {
    const files = [
      "studyos-2026-09-01.db",
      "studyos-2026-09-02.db",
      "studyos-2026-09-03.db",
      "other.txt",
    ];
    expect(filesToPrune(files, 2)).toEqual(["studyos-2026-09-01.db"]);
    expect(filesToPrune(files, 14)).toEqual([]);
  });

  it("ignores non-backup files", () => {
    expect(filesToPrune(["notes.md", "studyos.db-wal"], 1)).toEqual([]);
  });
});

describe("Phase 9 — backupNow", () => {
  let dir: string;
  afterEach(() => {
    if (dir) rmSync(dir, { recursive: true, force: true });
  });

  it("writes a dated copy into a backups/ folder", async () => {
    dir = mkdtempSync(join(tmpdir(), "studyos-bak-"));
    const dbPath = join(dir, "studyos.db");
    const db = new Database(dbPath);
    db.exec("CREATE TABLE t (x); INSERT INTO t VALUES (1);");

    const dest = await backupNow(db, dbPath);
    expect(existsSync(dest)).toBe(true);
    const files = readdirSync(join(dir, "backups"));
    expect(files.some((f) => f.startsWith("studyos-") && f.endsWith(".db"))).toBe(true);
    db.close();
  });
});
