import { describe, it, expect, beforeAll } from "vitest";
import { openDb, type DB } from "../src/db.js";
import { seedDatabase } from "../src/seed.js";
import { hasCatalog, weekClasses, termExams, termCourses } from "../src/api.js";

let db: DB;
const USER = "legacy-user-0001";
beforeAll(() => {
  db = openDb(":memory:");
  seedDatabase(db);
});

describe("Phase 22 — university at onboarding", () => {
  const setUni = (id: string | null) =>
    db.prepare("UPDATE user_profiles SET university_id = ? WHERE user_id = ?").run(id, USER);

  it("gives the Ramkhamhaeng catalogue to RU students and to accounts with no university yet", () => {
    setUni("ru");
    expect(hasCatalog(db, USER)).toBe(true);
    setUni(null);
    expect(hasCatalog(db, USER)).toBe(true);
  });

  it("withholds it from students of other universities", () => {
    setUni("cmu");
    expect(hasCatalog(db, USER)).toBe(false);
  });

  it("lists programs in the faculty's official order", () => {
    const codes = (db.prepare("SELECT code FROM programs ORDER BY rowid").all() as { code: string }[]).map((p) => p.code);
    expect(codes).toEqual(["MKT", "MGT", "FIN", "HRM", "IB", "ADPR", "SBM", "TOUR", "ACC", "ACCFIN"]);
  });
});

describe("Phase 23 — timetable and exams follow the student's program", () => {
  // Two courses with a class + exam each; only A belongs to Marketing.
  beforeAll(() => {
    db.pragma("foreign_keys = OFF");
    db.exec(`
      INSERT OR IGNORE INTO courses (code, name_th, credits, category) VALUES
        ('TSTA101', 'วิชา A', 3, 'MAJOR_REQ'), ('TSTB101', 'วิชา B', 3, 'MAJOR_REQ');
      DELETE FROM class_sessions; DELETE FROM exams; DELETE FROM program_courses;
      INSERT INTO class_sessions (course_code, term_id, weekday, start_time, end_time) VALUES
        ('TSTA101', '2/69', 1, '09:30', '11:20'), ('TSTB101', '2/69', 2, '09:30', '11:20');
      INSERT INTO exams (course_code, term_id, datetime_start, datetime_end, slot) VALUES
        ('TSTA101', '2/69', '2027-03-10T09:30:00+07:00', '2027-03-10T12:00:00+07:00', 'A'),
        ('TSTB101', '2/69', '2027-03-11T09:30:00+07:00', '2027-03-11T12:00:00+07:00', 'A');
      INSERT INTO program_courses (program_id, course_code, category) VALUES
        ('bus-mkt', 'TSTA101', 'MAJOR_REQ'), ('bus-mgt', 'TSTB101', 'MAJOR_REQ');
      -- This student has not chosen their courses for the term yet, so the
      -- program decides what they see (the seed gives the legacy user a plan).
      DELETE FROM plan_items;
    `);
  });

  const setProfile = (uni: string | null, program: string | null) =>
    db.prepare("UPDATE user_profiles SET university_id = ?, program_id = ? WHERE user_id = ?").run(uni, program, USER);
  const codes = (rows: { course_code: string }[]) => rows.map((r) => r.course_code);

  it("shows a Marketing student only Marketing classes and exams", () => {
    setProfile("ru", "bus-mkt");
    expect(codes(weekClasses(db, "2/69", USER))).toEqual(["TSTA101"]);
    expect(codes(termExams(db, "2/69", USER))).toEqual(["TSTA101"]);
  });

  it("shows a Management student only Management classes and exams", () => {
    setProfile("ru", "bus-mgt");
    expect(codes(weekClasses(db, "2/69", USER))).toEqual(["TSTB101"]);
    expect(codes(termExams(db, "2/69", USER))).toEqual(["TSTB101"]);
  });

  it("leaves an account with no program unfiltered", () => {
    setProfile(null, null);
    expect(codes(weekClasses(db, "2/69", USER))).toEqual(["TSTA101", "TSTB101"]);
  });

  it("shows nothing to a student of a university without a catalogue", () => {
    setProfile("cmu", null);
    expect(weekClasses(db, "2/69", USER)).toEqual([]);
    expect(termExams(db, "2/69", USER)).toEqual([]);
  });
});

describe("Phase 34 — timetable follows the courses chosen for the term", () => {
  const TERM = "2/69";
  const choose = (user: string, ...codes: string[]) => {
    db.prepare("DELETE FROM plan_items WHERE user_id = ? AND term_id = ?").run(user, TERM);
    for (const c of codes) db.prepare("INSERT INTO plan_items (user_id, term_id, course_code) VALUES (?, ?, ?)").run(user, TERM, c);
  };
  const classes = (user = USER) => weekClasses(db, TERM, user).map((r) => r.course_code);

  beforeAll(() => {
    db.prepare("UPDATE user_profiles SET university_id = 'ru', program_id = 'bus-mkt' WHERE user_id = ?").run(USER);
    db.exec(`
      INSERT OR IGNORE INTO courses (code, name_th, credits, category) VALUES ('TSTC101', 'วิชา C', 3, 'GE');
      INSERT INTO class_sessions (course_code, term_id, weekday, start_time, end_time) VALUES ('TSTC101', '2/69', 3, '13:00', '15:00');
      INSERT INTO exams (course_code, term_id, datetime_start, datetime_end, slot) VALUES
        ('TSTC101', '2/69', '2027-03-12T09:30:00+07:00', '2027-03-12T12:00:00+07:00', 'A');
      INSERT INTO program_courses (program_id, course_code, category) VALUES ('bus-mkt', 'TSTC101', 'GE');
    `);
  });

  it("shows the whole program until the student chooses", () => {
    choose(USER);
    expect(termCourses(db, USER, TERM)).toEqual([]);
    expect(classes()).toEqual(["TSTA101", "TSTC101"]);
  });

  it("shows only the chosen courses once they have", () => {
    choose(USER, "TSTC101");
    expect(classes()).toEqual(["TSTC101"]);
    expect(termExams(db, TERM, USER).map((e) => e.course_code)).toEqual(["TSTC101"]);
  });

  it("ignores placeholders in the plan and other terms", () => {
    choose(USER);
    db.prepare("INSERT INTO plan_items (user_id, term_id, course_code, placeholder_label) VALUES (?, ?, NULL, 'วิชาโท #1')").run(USER, TERM);
    db.prepare("INSERT INTO plan_items (user_id, term_id, course_code) VALUES (?, '1/70', 'TSTC101')").run(USER);
    expect(termCourses(db, USER, TERM)).toEqual([]);
    expect(classes()).toEqual(["TSTA101", "TSTC101"]);
  });

  it("keeps one student's choice from affecting another", () => {
    db.prepare("INSERT OR IGNORE INTO users (id, email, name, created_at, last_login_at) VALUES ('other', 'o@x.test', 'O', datetime('now'), datetime('now'))").run();
    db.prepare("INSERT OR IGNORE INTO user_profiles (user_id, university_id, program_id, onboarded) VALUES ('other', 'ru', 'bus-mkt', 1)").run();
    choose("other", "TSTA101");
    expect(classes("other")).toEqual(["TSTA101"]);
    expect(classes()).toEqual(["TSTA101", "TSTC101"]);
  });
});
