import { describe, it, expect, beforeAll } from "vitest";
import { openDb, type DB } from "../src/db.js";
import { seedDatabase } from "../src/seed.js";
import { studyTargets, findExamClashes, daysBetween, bangkokWeekday, bangkokToday, addDaysISO } from "../src/api.js";

let db: DB;
beforeAll(() => {
  db = openDb(":memory:");
  seedDatabase(db);
});

describe("study targets come from her own study plan (no hidden 36 hours)", () => {
  it("has no target without a plan, so nothing looks behind", () => {
    const t = studyTargets(db, "2/69", "legacy-user-0001");
    expect(t.courses.length).toBeGreaterThan(0);
    expect(t.weeklyTarget).toBeNull();
    expect(t.courses.every((c) => c.weeklyHours === null)).toBe(true);
  });
  it("is what the active plan gives each course this week", () => {
    const user = "legacy-user-0001";
    const code = studyTargets(db, "2/69", user).courses[0].code;
    const plan = Number(db.prepare("INSERT INTO study_plans (user_id, status, generated_at, settings_json, feasibility, warnings_json) VALUES (?, 'active', ?, '{}', 'ok', '[]')").run(user, bangkokToday()).lastInsertRowid);
    const add = db.prepare("INSERT INTO study_tasks (plan_id, course_code, date, task_type, description, minutes, sort_order) VALUES (?, ?, ?, 'read', 'x', ?, 0)");
    add.run(plan, code, bangkokToday(), 90);
    add.run(plan, code, addDaysISO(bangkokToday(), -(bangkokWeekday() - 1)), 30); // Monday
    add.run(plan, code, addDaysISO(bangkokToday(), 8 - bangkokWeekday()), 600); // next Monday: not this week
    const t = studyTargets(db, "2/69", user);
    expect(t.courses.find((c) => c.code === code)!.weeklyHours).toBe(bangkokWeekday() === 1 ? 2 : 2);
    expect(t.weeklyTarget).toBe(2);
    expect(t.courses.filter((c) => c.code !== code).every((c) => c.weeklyHours === 0)).toBe(true);
    db.prepare("DELETE FROM study_tasks WHERE plan_id = ?").run(plan);
    db.prepare("DELETE FROM study_plans WHERE id = ?").run(plan);
  });
});

describe("Phase 2 — exam clashes", () => {
  it("reports no clashes for the seeded plan's 2/69 exams (all on different dates)", () => {
    // The eight courses of the seeded plan for 2/69, not every exam of the term.
    const rows = db
      .prepare(
        `SELECT course_code, name_th, datetime_start, datetime_end, slot, location
         FROM exams e JOIN courses c ON c.code = e.course_code
         WHERE e.term_id = '2/69' AND e.course_code IN (SELECT course_code FROM plan_items WHERE term_id = '2/69' AND course_code IS NOT NULL)`,
      )
      .all() as never[];
    expect(rows.length).toBeGreaterThanOrEqual(8);
    expect(findExamClashes(rows as never)).toHaveLength(0);
  });

  it("detects a same-date same-slot clash", () => {
    const clashes = findExamClashes([
      { course_code: "X1", name_th: "", name_en: null, datetime_start: "2027-03-10T09:30:00+07:00", datetime_end: "", slot: "A", location: null },
      { course_code: "X2", name_th: "", name_en: null, datetime_start: "2027-03-10T09:30:00+07:00", datetime_end: "", slot: "A", location: null },
      { course_code: "X3", name_th: "", name_en: null, datetime_start: "2027-03-10T14:00:00+07:00", datetime_end: "", slot: "B", location: null },
    ]);
    expect(clashes).toHaveLength(1);
    expect(clashes[0].courses).toEqual(["X1", "X2"]);
  });

  it("detects an A,B course overlapping another exam the same day", () => {
    const clashes = findExamClashes([
      { course_code: "Y1", name_th: "", name_en: null, datetime_start: "2027-03-12T09:30:00+07:00", datetime_end: "", slot: "A,B", location: null },
      { course_code: "Y2", name_th: "", name_en: null, datetime_start: "2027-03-12T14:00:00+07:00", datetime_end: "", slot: "B", location: null },
    ]);
    expect(clashes).toHaveLength(1);
  });
});

describe("Phase 2 — date helpers", () => {
  it("counts whole days between dates", () => {
    expect(daysBetween("2026-11-16", "2026-11-16")).toBe(0);
    expect(daysBetween("2026-11-16", "2026-11-17")).toBe(1);
    expect(daysBetween("2027-03-08", "2027-03-09")).toBe(1);
  });

  it("returns an ISO weekday 1..7", () => {
    const wd = bangkokWeekday(new Date("2026-11-16T03:00:00Z")); // Mon 10:00 Bangkok
    expect(wd).toBe(1);
  });
});
