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
    expect(count("SELECT COUNT(*) n FROM courses")).toBeGreaterThan(before.courses);
    expect(count("SELECT COUNT(*) n FROM courses WHERE category = 'GE'")).toBeGreaterThan(0);
    expect(count("SELECT COUNT(*) n FROM courses WHERE code LIKE 'MKT%'")).toBeGreaterThan(0);
    expect(count("SELECT COUNT(*) n FROM plan_terms")).toBeGreaterThan(0);
    expect(count("SELECT COUNT(*) n FROM settings WHERE key = 'current_term_id'")).toBe(1);
  });

  it("keeps the migrations' timetable and exams, with no duplicates", () => {
    expect(count("SELECT COUNT(*) n FROM class_sessions")).toBe(before.classes);
    expect(count("SELECT COUNT(*) n FROM exams")).toBe(before.exams);
    // The seed knows the room for RAM1111; it fills it in on the existing row.
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
    // TODO(data): migration 017 inserted 60 courses with no name. They are not
    // in the 2566 or 2567 guide, so they are left empty rather than guessed.
    expect(rows.filter((r) => !r.name_th).length).toBe(60);
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
    expect(count("SELECT COUNT(*) n FROM course_lectures")).toBe(52);
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
