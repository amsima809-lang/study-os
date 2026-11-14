import { describe, it, expect, beforeAll } from "vitest";
import { openDb, type DB } from "../src/db.js";
import { seedDatabase } from "../src/seed.js";
import { studyTargets, findExamClashes, daysBetween, bangkokWeekday } from "../src/api.js";

let db: DB;
beforeAll(() => {
  db = openDb(":memory:");
  seedDatabase(db);
});

describe("Phase 2 — study targets", () => {
  it("splits the 36h weekly target across 2/69 courses by difficulty points", () => {
    const t = studyTargets(db, "2/69", "legacy-user-0001");
    expect(t.totalPoints).toBeGreaterThan(0);
    expect(t.courses.length).toBeGreaterThan(0);

    const total = t.courses.reduce((s, c) => s + c.weeklyHours, 0);
    expect(total).toBeCloseTo(36, 0);

    // A difficulty-2 course gets 2 * (36/totalPoints) weekly hours.
    const eng = t.courses.find((c) => c.code === "RAM1111")!; // difficulty 2
    expect(eng.weeklyHours).toBeCloseTo(36 / t.totalPoints * 2, 1);
    // A difficulty-1 course gets 1 * (36/totalPoints) weekly hours.
    const ram = t.courses.find((c) => c.code === "RAM1301")!; // difficulty 1
    expect(ram.weeklyHours).toBeCloseTo(36 / t.totalPoints, 1);
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
