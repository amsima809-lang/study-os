import { describe, it, expect, beforeAll } from "vitest";
import { openDb, type DB } from "../src/db.js";
import { seedDatabase } from "../src/seed.js";
import { searchNotes } from "../src/notes.js";

describe("note search", () => {
  let db: DB;
  const A = "legacy-user-0001";
  const B = "other-user";

  beforeAll(() => {
    db = openDb(":memory:");
    seedDatabase(db);
    db.prepare("INSERT INTO users (id, email, name, created_at) VALUES (?, 'b@test', 'B', '2026-11-01T00:00:00')").run(B);
    const add = db.prepare("INSERT INTO notes (user_id, course_code, created_at, title, raw_text, ai_summary_md) VALUES (?, ?, ?, ?, ?, ?)");
    add.run(A, null, "2026-11-01T10:00:00", "Debits and credits", "Assets = Liabilities + Equity. Every debit has a credit.", null);
    add.run(A, null, "2026-11-05T10:00:00", "บทที่ 2", "ส่วนประสมการตลาด 4P ได้แก่ ผลิตภัณฑ์ ราคา ช่องทาง การส่งเสริม", "สรุป: 4P ของการตลาด");
    add.run(A, null, "2026-11-03T10:00:00", null, "100% of marks need the journal_entry format", null);
    add.run(B, null, "2026-11-06T10:00:00", "Private", "Equity notes of another student", null);
  });

  it("finds a word in the title, the text or the summary, newest first", () => {
    expect(searchNotes(db, A, "debit").map((n) => n.title)).toEqual(["Debits and credits"]);
    expect(searchNotes(db, A, "การตลาด").map((n) => n.title)).toEqual(["บทที่ 2"]);
    expect(searchNotes(db, A, "สรุป")).toHaveLength(1);
  });

  it("needs every word, in any order, ignoring case", () => {
    expect(searchNotes(db, A, "EQUITY assets")).toHaveLength(1);
    expect(searchNotes(db, A, "equity ราคา")).toHaveLength(0);
  });

  it("never returns another student's notes", () => {
    expect(searchNotes(db, A, "equity").map((n) => n.title)).toEqual(["Debits and credits"]);
    expect(searchNotes(db, B, "equity").map((n) => n.title)).toEqual(["Private"]);
  });

  it("treats % and _ as plain characters", () => {
    expect(searchNotes(db, A, "100%")).toHaveLength(1);
    expect(searchNotes(db, A, "journal_entry")).toHaveLength(1);
    expect(searchNotes(db, A, "%")).toHaveLength(1);
    expect(searchNotes(db, A, "journalXentry")).toHaveLength(0);
  });

  it("returns a snippet around the match, and nothing for an empty query", () => {
    expect(searchNotes(db, A, "liabilities")[0].snippet).toContain("Liabilities + Equity");
    expect(searchNotes(db, A, "   ")).toEqual([]);
  });
});
