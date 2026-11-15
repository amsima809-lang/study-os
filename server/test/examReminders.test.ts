/**
 * Reminders from her own exams (examReminders in universityReminders.ts, owner 2026-11-15): the
 * evening before each final and booked e-Test, a week before the finals for her seat, four weeks
 * before them to ask for time off; they follow her courses and never undo her own edits.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { openDb, type DB } from "../src/db.js";
import { seedDatabase } from "../src/seed.js";
import { findOrCreateUser } from "../src/auth.js";
import { examReminders, syncUniversityReminders } from "../src/universityReminders.js";

let db: DB;
beforeAll(() => { db = openDb(":memory:"); seedDatabase(db, { reset: false }); });

const TERM = "2/69";
const NOW = new Date("2027-01-02T03:00:00Z"); // 2 Jan 2027, 10:00 in Bangkok
function student(email: string, codes: string[]): string {
  const id = findOrCreateUser(db, { email, name: email, avatar: "" });
  db.prepare("UPDATE user_profiles SET program_id = 'bus-mkt', university_id = 'ru', entry_year = '69', onboarded = 1 WHERE user_id = ?").run(id);
  for (const c of codes) db.prepare("INSERT INTO plan_items (user_id, term_id, course_code) VALUES (?, ?, ?)").run(id, TERM, c);
  return id;
}
const mine = (u: string) => db.prepare("SELECT s.source_key, r.id, r.title, r.note, r.date, r.time FROM reminder_sources s JOIN reminders r ON r.id = s.reminder_id WHERE s.user_id = ? AND s.source_key NOT LIKE 'etesting:%' ORDER BY s.source_key").all(u) as { source_key: string; id: number; title: string; note: string; date: string; time: string }[];

describe("reminders from her own exams", () => {
  it("makes the evening-before, seat and time-off reminders with the right days", () => {
    const u = student("exam-rem@example.com", ["MKT2101", "RAM1131"]);
    db.prepare("INSERT INTO etesting_bookings (user_id, term_id, course_code, centre, date, period) VALUES (?, ?, 'RAM1131', 'central', '2027-01-12', 2)").run(u, TERM);
    const list = examReminders(db, u, "2027-01-02");
    const byKey = Object.fromEntries(list.map((r) => [r.key, r]));
    // Finals: RAM1131 9 Mar 2027 (A), MKT2101 13 Mar 2027 (B).
    expect(byKey["final:2/69:RAM1131"]).toMatchObject({ date: "2027-03-08", time: "19:00" });
    expect(byKey["final:2/69:MKT2101"]).toMatchObject({ date: "2027-03-12", time: "19:00" });
    expect(byKey["final:2/69:RAM1131"].note.en).toContain("if you passed this course's e-Testing, there is no final");
    expect(byKey["etbooked:2/69:RAM1131"]).toMatchObject({ date: "2027-01-11", time: "19:00" });
    expect(byKey["etbooked:2/69:RAM1131"].note.en).toContain("12:00–14:30");
    expect(byKey["seat:2/69"]).toMatchObject({ date: "2027-03-02" });
    expect(byKey["leave:2/69"]).toMatchObject({ date: "2027-02-09" });
    // The time-off list has every exam day, the e-Test first.
    expect(byKey["leave:2/69"].note.en).toMatch(/12 Jan 2027 12:00–14:30 \(RAM1131\).*9 Mar 2027 09:30–12:00 \(RAM1131\).*13 Mar 2027 14:00–16:30 \(MKT2101\)/);
    expect(byKey["seat:2/69"].note.en).not.toContain("{app}");

    syncUniversityReminders(db, u, "en", NOW);
    expect(mine(u).map((r) => r.source_key)).toEqual(["etbooked:2/69:RAM1131", "final:2/69:MKT2101", "final:2/69:RAM1131", "leave:2/69", "seat:2/69"]);
    // Nothing new on a second round.
    expect(syncUniversityReminders(db, u, "en", NOW)).toBe(0);
  });

  it("follows her courses and her seat, keeps her edits, and never brings back one she deleted", () => {
    const u = student("exam-rem2@example.com", ["MKT2101", "RAM1131"]);
    syncUniversityReminders(db, u, "en", NOW);
    const before = mine(u);
    // A seat recorded: the untouched final reminder says it.
    db.prepare("INSERT INTO my_exams (user_id, term_id, course_code, seat) VALUES (?, ?, 'MKT2101', 'SB 305 seat 41')").run(u, TERM);
    expect(syncUniversityReminders(db, u, "en", NOW)).toBeGreaterThan(0);
    expect(mine(u).find((r) => r.source_key === "final:2/69:MKT2101")!.note).toContain("SB 305 seat 41");
    // She edits RAM1131's and deletes the seat reminder.
    const ram = before.find((r) => r.source_key === "final:2/69:RAM1131")!;
    db.prepare("UPDATE reminders SET title = 'pack calculator' WHERE id = ?").run(ram.id);
    db.prepare("DELETE FROM reminders WHERE id = ?").run(before.find((r) => r.source_key === "seat:2/69")!.id);
    // She drops both courses but RAM1131: MKT2101's untouched reminder goes; nothing comes back.
    db.prepare("DELETE FROM plan_items WHERE user_id = ? AND course_code = 'MKT2101'").run(u);
    syncUniversityReminders(db, u, "en", NOW);
    const after = mine(u).map((r) => r.source_key);
    expect(after).not.toContain("final:2/69:MKT2101");
    expect(after).not.toContain("seat:2/69");
    expect(mine(u).find((r) => r.source_key === "final:2/69:RAM1131")!.title).toBe("pack calculator");
    // Dropping RAM1131 too: her edited one stays hers.
    db.prepare("DELETE FROM plan_items WHERE user_id = ?").run(u);
    syncUniversityReminders(db, u, "en", NOW);
    expect(db.prepare("SELECT title FROM reminders WHERE id = ?").get(ram.id)).toEqual({ title: "pack calculator" });
  });

  it("skips what is already past and is only for Ramkhamhaeng students", () => {
    const u = student("exam-rem3@example.com", ["MKT2101"]);
    // On 1 Mar 2027 the time-off reminder (9 Feb) is gone; the seat one (6 Mar) and the eve are still ahead.
    syncUniversityReminders(db, u, "en", new Date("2027-03-01T03:00:00Z"));
    expect(mine(u).map((r) => r.source_key)).toEqual(["final:2/69:MKT2101", "seat:2/69"]);
    const other = student("exam-rem4@example.com", ["MKT2101"]);
    db.prepare("UPDATE user_profiles SET university_id = 'cu' WHERE user_id = ?").run(other);
    expect(syncUniversityReminders(db, other, "en", NOW)).toBe(0);
  });
});
