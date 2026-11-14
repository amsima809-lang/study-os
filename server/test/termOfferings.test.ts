import { describe, it, expect, beforeAll } from "vitest";
import { openDb, type DB } from "../src/db.js";
import { seedDatabase } from "../src/seed.js";
import { rebuildTermSchedule, offering, EXAM_PERIODS } from "../src/termSchedule.js";
import { facultyArrangedExams, termExams, weekClasses } from "../src/api.js";
import { findOrCreateUser } from "../src/auth.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Term 2/69 as the registrar published it (ม.ร.30 and the exam list, both dated 26 Aug 2026),
// loaded by migration 032, which scripts/import-ru-term.mjs generated. The expected values
// below were read from the printed pages, not from the migration.
let db: DB;
const count = (sql: string, ...p: unknown[]) => (db.prepare(sql).get(...p) as { n: number }).n;
const classesOf = (code: string) =>
  db.prepare("SELECT weekday, start_time, end_time, room, instructor, kind FROM class_sessions WHERE course_code = ? AND term_id = '2/69' ORDER BY weekday, start_time").all(code);
const examOf = (code: string) => db.prepare("SELECT datetime_start, datetime_end, slot FROM exams WHERE course_code = ? AND term_id = '2/69'").all(code);

beforeAll(() => {
  db = openDb(":memory:");
  seedDatabase(db, { reset: false });
});

describe("the official record of term 2/69", () => {
  it("holds every course the university offers: 2,762, the total both documents print", () => {
    expect(count("SELECT COUNT(*) n FROM term_offerings WHERE term_id = '2/69'")).toBe(2762);
    expect(count("SELECT COUNT(*) n FROM term_offerings WHERE name_en = '' OR credits IS NULL")).toBe(0);
    expect(count("SELECT COUNT(*) n FROM term_offerings WHERE exam_date IS NOT NULL")).toBe(1303);
    expect(count("SELECT COUNT(*) n FROM term_offerings WHERE exam_date IS NULL AND exam_note = 'คณะจัดสอบเอง'")).toBe(1458);
    expect(count("SELECT COUNT(*) n FROM term_offerings WHERE (exam_date IS NULL) <> (exam_slot IS NULL)")).toBe(0);
  });

  it("reads a course as printed (page 1: ACC1101)", () => {
    const o = offering(db, "2/69", "ACC1101")!;
    expect(o.credits).toBe(3);
    expect(o.name_en).toBe("PRINCIPLES OF ACCOUNTING 1");
    expect(o.sessions).toEqual([{ kind: "", text: "TH 0830-1100", weekday: 4, start: "08:30", end: "11:00", room: "KTB 201" }]);
    expect(o.teachers).toBe("DR.NARINTIP, DR.MATAWEE");
    expect([o.exam_date, o.exam_slot]).toEqual(["2027-03-15", "A"]);
    expect(o.notes).toContain("สำหรับนักศึกษา รหัส 62-64 คณะบริหารธุรกิจทุกสาขา");
  });

  it("keeps lecture and laboratory as separate sessions, and a Monday-to-Friday class as five", () => {
    expect(offering(db, "2/69", "ATF2003")!.sessions.map((s) => [s.kind, s.weekday, s.start, s.end])).toEqual([
      ["LEC.", 3, "07:30", "09:20"],
      ["LAB.", 3, "09:30", "12:30"],
    ]);
    expect(offering(db, "2/69", "ATF4908")!.sessions.map((s) => s.weekday)).toEqual([1, 2, 3, 4, 5]);
  });

  it("records a course with no lecture, and an exam the faculty arranges, without inventing a time or date", () => {
    const o = offering(db, "2/69", "HOT4500")!;
    expect(o.sessions).toEqual([{ kind: "", text: "ไม่มีบรรยาย", weekday: null, start: null, end: null, room: "" }]);
    expect([o.exam_date, o.exam_slot, o.exam_note]).toEqual([null, null, "คณะจัดสอบเอง"]);
    expect(o.credits).toBe(6);
  });

  it("is not offered = not in the record", () => {
    expect(offering(db, "2/69", "HIT3301")).toBeUndefined(); // in a curriculum, not offered this term
    expect(offering(db, "2/69", "XXX0000")).toBeUndefined();
  });
});

describe("the timetable and exams built from it", () => {
  it("gives a catalogue course the printed time, room and lecturers", () => {
    expect(classesOf("ACC1101")).toEqual([{ weekday: 4, start_time: "08:30", end_time: "11:00", room: "KTB 201", instructor: "DR.NARINTIP, DR.MATAWEE", kind: null }]);
    expect(classesOf("MKT2101")).toEqual([{ weekday: 4, start_time: "09:30", end_time: "11:20", room: "KLB 201", instructor: "DR.USA, THITIKUL", kind: null }]);
    // these four were wrong before (migration 018): now as printed on pages 59 to 61
    expect(classesOf("DBC2101").map((c: any) => [c.weekday, c.start_time])).toEqual([[1, "09:30"]]);
    expect(classesOf("DBC3101").map((c: any) => [c.weekday, c.start_time])).toEqual([[2, "11:30"]]);
    expect(classesOf("DBC3112").map((c: any) => [c.weekday, c.start_time])).toEqual([[4, "09:30"]]);
    expect(classesOf("DBC4114").map((c: any) => [c.weekday, c.start_time])).toEqual([[4, "09:30"]]);
  });

  it("gives the exam its printed date and period", () => {
    const { A, B } = EXAM_PERIODS;
    expect(examOf("ACC1101")).toEqual([{ datetime_start: `2027-03-15T${A.start}:00+07:00`, datetime_end: `2027-03-15T${A.end}:00+07:00`, slot: "A" }]);
    // wrong before, now as printed on page 2
    expect(examOf("ACC4200")).toEqual([{ datetime_start: `2027-03-16T${B.start}:00+07:00`, datetime_end: `2027-03-16T${B.end}:00+07:00`, slot: "B" }]);
    expect(examOf("ACC4209").map((e: any) => [e.datetime_start.slice(0, 10), e.slot])).toEqual([["2027-03-16", "A"]]);
    expect(examOf("ACC4252").map((e: any) => [e.datetime_start.slice(0, 10), e.slot])).toEqual([["2027-03-19", "A"]]);
    // the faculty arranges this one: no date may be shown (it had one before)
    expect(examOf("ACC3349")).toEqual([]);
  });

  it("matches the record exactly: nothing extra, nothing missing, no duplicates", () => {
    const expectedClasses = count(
      `SELECT COUNT(*) n FROM term_offerings o, json_each(o.sessions) s
       WHERE o.term_id = '2/69' AND json_extract(s.value, '$.weekday') IS NOT NULL AND o.course_code IN (SELECT code FROM courses)`,
    );
    expect(count("SELECT COUNT(*) n FROM class_sessions WHERE term_id = '2/69'")).toBe(expectedClasses);
    expect(expectedClasses).toBeGreaterThan(200);
    expect(count("SELECT COUNT(*) n FROM exams WHERE term_id = '2/69'")).toBe(
      count("SELECT COUNT(*) n FROM term_offerings WHERE term_id = '2/69' AND exam_date IS NOT NULL AND course_code IN (SELECT code FROM courses)"),
    );
    expect(count("SELECT COUNT(*) n FROM (SELECT course_code, weekday, start_time, kind FROM class_sessions WHERE term_id = '2/69' GROUP BY 1, 2, 3, 4 HAVING COUNT(*) > 1)")).toBe(0);
    expect(count("SELECT COUNT(*) n FROM (SELECT course_code FROM exams WHERE term_id = '2/69' GROUP BY 1 HAVING COUNT(*) > 1)")).toBe(0);
    for (const table of ["class_sessions", "exams"]) {
      expect(count(`SELECT COUNT(*) n FROM ${table} WHERE term_id = '2/69' AND course_code NOT IN (SELECT course_code FROM term_offerings WHERE term_id = '2/69')`)).toBe(0);
    }
  });

  it("can be rebuilt any number of times with the same result", () => {
    const snapshot = () => JSON.stringify([
      db.prepare("SELECT course_code, weekday, start_time, end_time, room, instructor, kind FROM class_sessions WHERE term_id = '2/69' ORDER BY 1, 2, 3").all(),
      db.prepare("SELECT course_code, datetime_start, datetime_end, slot FROM exams WHERE term_id = '2/69' ORDER BY 1").all(),
    ]);
    const before = snapshot();
    const made = rebuildTermSchedule(db, "2/69");
    expect(snapshot()).toBe(before);
    expect(made.classes).toBeGreaterThan(200);
    expect(rebuildTermSchedule(db, "9/99")).toEqual({ classes: 0, exams: 0 }); // no record: nothing is touched
  });

  it("on a database that already has its courses, the migration alone gives the same timetable", () => {
    // An existing installation: all courses are there when migration 032 runs, and the seed does not run again.
    const fresh = openDb(":memory:");
    seedDatabase(fresh, { reset: false });
    const rows = (d: DB) => JSON.stringify(d.prepare("SELECT course_code, weekday, start_time, end_time, room, instructor, kind FROM class_sessions WHERE term_id = '2/69' ORDER BY 1, 2, 3").all());
    const want = rows(fresh);
    // run the migration's own rebuild statements again on the full catalogue
    fresh.exec(migrationRebuild());
    expect(rows(fresh)).toBe(want);
  });
});

describe("what a student sees", () => {
  it("shows a student only their own major's classes and exams, all from the record", () => {
    const user = findOrCreateUser(db, { email: "acc-student@studyos.test", name: "A", avatar: "" });
    db.prepare("UPDATE user_profiles SET program_id = 'bus-acc', university_id = 'ru', onboarded = 1 WHERE user_id = ?").run(user);
    const classes = weekClasses(db, "2/69", user).map((c) => c.course_code);
    expect(classes).toContain("ACC2201");
    expect(classes).not.toContain("DBC3101"); // another major's course
    expect(classes.every((c) => count("SELECT COUNT(*) n FROM program_courses WHERE program_id = 'bus-acc' AND course_code = ?", c) === 1)).toBe(true);
    const exams = termExams(db, "2/69", user).map((e) => e.course_code);
    expect(exams).toContain("ACC4200");
    expect(exams).not.toContain("ACC3349");
  });

  it("lists the exams the faculty arranges, so they do not look exam-free", () => {
    const user = findOrCreateUser(db, { email: "acc-student@studyos.test", name: "A", avatar: "" });
    const list = facultyArrangedExams(db, "2/69", user);
    expect(list.map((e) => e.course_code)).toContain("ACC3349");
    expect(list.every((e) => e.note === "คณะจัดสอบเอง")).toBe(true);
    expect(list.map((e) => e.course_code)).not.toContain("ACC4200"); // has a date
    // once the student has chosen their courses, only those are listed
    db.prepare("INSERT INTO plan_items (user_id, term_id, course_code) VALUES (?, '2/69', 'ACC4200')").run(user);
    expect(facultyArrangedExams(db, "2/69", user)).toEqual([]);
    db.prepare("INSERT INTO plan_items (user_id, term_id, course_code) VALUES (?, '2/69', 'ACC3349')").run(user);
    expect(facultyArrangedExams(db, "2/69", user).map((e) => e.course_code)).toEqual(["ACC3349"]);
  });
});

/** The "rebuild" part of migration 032, as written in the file. */
function migrationRebuild(): string {
  const text = readFileSync(fileURLToPath(new URL("../migrations/032_term_2_69_official.sql", import.meta.url)), "utf8");
  return text.slice(text.indexOf("DELETE FROM class_sessions WHERE term_id"));
}
