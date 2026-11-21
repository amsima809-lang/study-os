import { describe, it, expect, beforeAll } from "vitest";
import { openDb, type DB } from "../src/db.js";
import { seedDatabase, needsSeed } from "../src/seed.js";
import { weekClasses, termExams } from "../src/api.js";

// A brand-new database, started the way server/src/index.ts starts it.
let db: DB;
let before: { courses: number; classes: number; exams: number };
const count = (sql: string) => (db.prepare(sql).get() as { n: number }).n;
const USER = "legacy-user-0001";

beforeAll(() => {
  db = openDb(":memory:");
  before = {
    courses: count("SELECT COUNT(*) n FROM courses"),
    classes: count("SELECT COUNT(*) n FROM class_sessions"),
    exams: count("SELECT COUNT(*) n FROM exams"),
  };
  expect(needsSeed(db)).toBe(true);
  seedDatabase(db, { reset: false });
});

describe("Phase 24 — first start of a new database", () => {
  it("detects a new database even though migrations already added courses", () => {
    expect(before.courses).toBeGreaterThan(0);
    expect(needsSeed(db)).toBe(false);
  });

  it("adds the seed courses without deleting the migrations' courses", () => {
    // (migration 033 already adds every course the majors name, so the seed adds none of its own)
    expect(count("SELECT COUNT(*) n FROM courses")).toBeGreaterThanOrEqual(before.courses);
    expect(count("SELECT COUNT(*) n FROM courses WHERE category = 'GE'")).toBeGreaterThan(0);
    expect(count("SELECT COUNT(*) n FROM courses WHERE code LIKE 'MKT%'")).toBeGreaterThan(0);
    expect(count("SELECT COUNT(*) n FROM plan_terms")).toBeGreaterThan(0);
    expect(count("SELECT COUNT(*) n FROM settings WHERE key = 'current_term_id'")).toBe(1);
  });

  it("completes the timetable and exams for the courses the seed adds, with no duplicates", () => {
    // Migration 032 builds them for the courses that exist when it runs; the seed
    // then adds its courses and rebuilds from the same official record.
    // (since migration 033 the migrations add every course themselves, so the seed's rebuild finds nothing new)
    expect(count("SELECT COUNT(*) n FROM class_sessions")).toBeGreaterThanOrEqual(before.classes);
    expect(count("SELECT COUNT(*) n FROM exams")).toBeGreaterThanOrEqual(before.exams);
    expect(before.classes).toBeGreaterThan(200);
    expect(count("SELECT COUNT(*) n FROM (SELECT course_code, weekday, start_time FROM class_sessions GROUP BY 1, 2, 3 HAVING COUNT(*) > 1)")).toBe(0);
    const ram = db.prepare("SELECT room FROM class_sessions WHERE course_code = 'RAM1111'").all() as { room: string | null }[];
    expect(ram).toHaveLength(1);
    expect(ram[0].room).toBeTruthy();
  });

  it("leaves no program course, class or exam pointing at a missing course", () => {
    for (const table of ["class_sessions", "exams"]) {
      expect(count(`SELECT COUNT(*) n FROM ${table} WHERE course_code NOT IN (SELECT code FROM courses)`)).toBe(0);
    }
    expect(count("SELECT COUNT(*) n FROM program_courses WHERE course_code NOT IN (SELECT code FROM courses)")).toBe(0);
  });

  it("has no broken characters or merged names in course names", () => {
    const rows = db.prepare("SELECT code, name_th, name_en FROM courses").all() as
      { code: string; name_th: string; name_en: string | null }[];
    // Private-use codes left over from the source PDF's Thai font.
    expect(rows.filter((r) => /[\uE000-\uF8FF]/.test(r.name_th + (r.name_en ?? ""))).map((r) => r.code)).toEqual([]);
    // An English name stuck on the end of the Thai name.
    expect(rows.filter((r) => /[A-Za-z]{3}/.test(r.name_th) && !r.name_en).map((r) => r.code)).toEqual([]);
    // TODO(data): migration 017 inserted 60 courses with no name. Migration 031
    // named the 19 found in the university's older guides; the other 41 are in
    // no official document, so they are left empty rather than guessed.
    // Migration 033 rebuilt the majors from the curriculum; those 41 are in none and are gone.
    expect(rows.filter((r) => !r.name_th).length).toBe(0);
  });

  it("gives Marketing its courses, so a Marketing student has a timetable", () => {
    expect(count("SELECT COUNT(*) n FROM program_courses WHERE program_id = 'bus-mkt'")).toBeGreaterThan(80);
    db.prepare("UPDATE user_profiles SET university_id = 'ru', program_id = 'bus-mkt' WHERE user_id = ?").run(USER);
    const classes = weekClasses(db, "2/69", USER).map((c) => c.course_code);
    expect(classes).toContain("MKT2101"); // major course
    expect(classes).toContain("RAM1111"); // shared general-education course
    expect(classes).not.toContain("HRM3208"); // another program's major course
    expect(termExams(db, "2/69", USER).length).toBeGreaterThan(0);
  });

  it("stores recorded-lecture links only for courses that exist", () => {
    expect(count("SELECT COUNT(*) n FROM course_lectures")).toBe(157); // 52 (migration 025) + 105 (migration 059)
    expect(count("SELECT COUNT(*) n FROM course_lectures WHERE course_code NOT IN (SELECT code FROM courses)")).toBe(0);
    expect(count("SELECT COUNT(*) n FROM course_lectures WHERE url NOT LIKE 'https://sub-demo.ru.ac.th/student/watch.php?session_id=%'")).toBe(0);
  });

  it("gives other programs their shared courses too", () => {
    db.prepare("UPDATE user_profiles SET program_id = 'bus-mgt' WHERE user_id = ?").run(USER);
    const classes = weekClasses(db, "2/69", USER).map((c) => c.course_code);
    expect(classes).toContain("RAM1111");
    expect(classes.some((c) => c.startsWith("MGT"))).toBe(true);
  });
});
