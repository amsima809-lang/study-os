import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { openDb, type DB } from "../src/db.js";
import { seedDatabase } from "../src/seed.js";
import { weekClasses, termExams } from "../src/api.js";
import { findOrCreateUser } from "../src/auth.js";

// Each major's courses as the faculty's 2569 curriculum prints them (admission guide,
// Business Administration chapter), loaded by migration 033, which
// scripts/import-ru-curriculum.mjs generated. Expected values below were read from the
// printed pages: the credits in the section headings, and courses seen in the lists.
let db: DB;
const count = (sql: string, ...p: unknown[]) => (db.prepare(sql).get(...p) as { n: number }).n;
const listOf = (program: string, category: string) =>
  (db.prepare("SELECT course_code FROM program_courses WHERE program_id = ? AND category = ? ORDER BY course_code").all(program, category) as { course_code: string }[]).map((r) => r.course_code);
const creditsOf = (program: string, category: string) =>
  count("SELECT COALESCE(SUM(c.credits), 0) n FROM program_courses pc JOIN courses c ON c.code = pc.course_code WHERE pc.program_id = ? AND pc.category = ?", program, category);
const required = (program: string) =>
  Object.fromEntries((db.prepare("SELECT category, required_credits FROM program_credit_requirements WHERE program_id = ?").all(program) as { category: string; required_credits: number }[]).map((r) => [r.category, r.required_credits]));

beforeAll(() => {
  db = openDb(":memory:");
  seedDatabase(db, { reset: false });
});

describe("the faculty's majors", () => {
  it("are the ten the chapter prints: eight B.B.A. majors of 132 credits and two B.Acc. of 129", () => {
    const programs = db.prepare("SELECT id, degree, total_credits FROM programs ORDER BY id").all();
    expect(programs).toEqual([
      { id: "bus-acc", degree: "B.Acc", total_credits: 129 },
      { id: "bus-accfin", degree: "B.Acc", total_credits: 129 },
      { id: "bus-adpr", degree: "BBA", total_credits: 132 },
      { id: "bus-fin", degree: "BBA", total_credits: 132 },
      { id: "bus-hrm", degree: "BBA", total_credits: 132 },
      { id: "bus-ib", degree: "BBA", total_credits: 132 },
      { id: "bus-mgt", degree: "BBA", total_credits: 132 },
      { id: "bus-mkt", degree: "BBA", total_credits: 132 },
      { id: "bus-sbm", degree: "BBA", total_credits: 132 },
      { id: "bus-tour", degree: "BBA", total_credits: 132 },
    ]);
  });

  it("each state the credits their section headings print, adding up to the degree total", () => {
    expect(required("bus-mgt")).toEqual({ GE: 30, CORE: 42, MAJOR_REQ: 27, MAJOR_ELEC: 27, FREE: 6 });
    expect(required("bus-mkt")).toEqual({ GE: 30, CORE: 42, MAJOR_REQ: 33, MAJOR_ELEC: 21, FREE: 6 });
    expect(required("bus-tour")).toEqual({ GE: 30, CORE: 30, MAJOR_REQ: 36, MAJOR_ELEC: 30, FREE: 6 });
    expect(required("bus-acc")).toEqual({ GE: 30, CORE: 42, MAJOR_REQ: 42, MAJOR_ELEC: 9, FREE: 6 });
    for (const p of db.prepare("SELECT id, total_credits FROM programs").all() as { id: string; total_credits: number }[]) {
      expect(Object.values(required(p.id)).reduce((a, b) => a + b, 0), p.id).toBe(p.total_credits);
    }
  });

  it("list, under 'core' and 'major required', exactly the credits required", () => {
    for (const p of db.prepare("SELECT id FROM programs").all() as { id: string }[]) {
      const need = required(p.id);
      expect(creditsOf(p.id, "CORE"), `${p.id} core`).toBe(need.CORE);
      expect(creditsOf(p.id, "MAJOR_REQ"), `${p.id} major required`).toBe(need.MAJOR_REQ);
      expect(creditsOf(p.id, "MAJOR_ELEC"), `${p.id} electives offered`).toBeGreaterThanOrEqual(need.MAJOR_ELEC);
      expect(listOf(p.id, "GE"), `${p.id} general education`).toHaveLength(37);
    }
  });

  it("Management, as printed on pages 95 and 96 of the guide", () => {
    expect(listOf("bus-mgt", "CORE")).toEqual(["ACC1103", "ACC1104", "DBC2101", "ECO1121", "ECO1122", "FIN2101", "HRM2101", "LAW2116", "MGT2101", "MGT2102", "MGT3101", "MGT3102", "MKT2101", "STA2016"]);
    expect(listOf("bus-mgt", "MAJOR_REQ")).toEqual(["MGT2201", "MGT2202", "MGT3203", "MGT3204", "MGT3205", "MGT4206", "MGT4207", "MGT4208", "MGT4209"]);
    expect(listOf("bus-mgt", "MAJOR_ELEC")).toHaveLength(27);
    expect(listOf("bus-mgt", "MAJOR_ELEC")).toContain("MGT4011");
  });

  it("Hospitality and Tourism: its own foundation courses, the real electives, and none of the invented codes", () => {
    expect(listOf("bus-tour", "CORE")).toEqual(["ACC1104", "FIN2101", "HOT1101", "HOT2101", "HOT2102", "HOT2103", "HOT2104", "MGT2101", "MKT2101", "STA2016"]);
    expect(listOf("bus-tour", "MAJOR_REQ")).toContain("HOT4500"); // the 6-credit practicum
    const electives = listOf("bus-tour", "MAJOR_ELEC");
    expect(electives).toHaveLength(36);
    for (const code of ["HOT4304", "HOT4321", "HOT4327", "HOT2402", "HOT3401", "ENS3404"]) expect(electives).toContain(code);
    for (const code of ["HOT2203", "HOT3207", "HOT4202"]) expect(count("SELECT COUNT(*) n FROM program_courses WHERE course_code = ?", code)).toBe(0);
    expect(db.prepare("SELECT name_th, name_en, credits FROM courses WHERE code = 'HOT4327'").get()).toEqual({
      name_th: "ธุรกิจไมซ์", name_en: "MICE Business (Meetings, Incentives, Conventions and Exhibitions)", credits: 3,
    });
  });

  it("does not list as a major's course what is printed after 'free electives' (courses a student may NOT take)", () => {
    for (const code of ["ACC1130", "MGT1001", "ECO1101", "ENG1001"]) expect(count("SELECT COUNT(*) n FROM program_courses WHERE course_code = ?", code)).toBe(0);
    // the seeded student's own free elective is not part of Marketing's list
    expect(count("SELECT COUNT(*) n FROM program_courses WHERE program_id = 'bus-mkt' AND course_code = 'FIN4319'")).toBe(0);
    expect(count("SELECT COUNT(*) n FROM program_courses WHERE category = 'FREE'")).toBe(0);
  });

  it("leaves no placement pointing at a missing course, and no course without a name", () => {
    expect(count("SELECT COUNT(*) n FROM program_courses WHERE course_code NOT IN (SELECT code FROM courses)")).toBe(0);
    expect(count("SELECT COUNT(*) n FROM courses WHERE name_th IS NULL OR name_th = ''")).toBe(0);
    expect(count("SELECT COUNT(*) n FROM program_courses")).toBe(819);
    expect(count("SELECT COUNT(DISTINCT course_code) n FROM program_courses")).toBe(322);
  });
});

describe("what follows from the corrected lists", () => {
  it("a Tourism student now gets the classes and exams of courses that were missing", () => {
    const user = findOrCreateUser(db, { email: "tour-student@studyos.test", name: "T", avatar: "" });
    db.prepare("UPDATE user_profiles SET program_id = 'bus-tour', university_id = 'ru', onboarded = 1 WHERE user_id = ?").run(user);
    expect(weekClasses(db, "2/69", user)).toEqual([]); // nothing until they choose
    for (const code of ["HOT4304", "HOT4321", "HOT2402", "HOT1101"]) db.prepare("INSERT INTO plan_items (user_id, term_id, course_code) VALUES (?, '2/69', ?)").run(user, code);
    const classes = weekClasses(db, "2/69", user).map((c) => c.course_code);
    for (const code of ["HOT4304", "HOT4321", "HOT2402"]) expect(classes).toContain(code); // offered in 2/69 per the registrar
    expect(termExams(db, "2/69", user).map((e) => e.course_code)).toContain("HOT4304");
  });

  it("the new major, Accounting and Financial, can be chosen and has its own lists", () => {
    expect(db.prepare("SELECT name_th, name_en FROM programs WHERE id = 'bus-accfin'").get()).toEqual({ name_th: "การบัญชีและการเงิน", name_en: "Accounting and Financial" });
    expect(listOf("bus-accfin", "MAJOR_REQ")).toContain("FIN3205");
    expect(listOf("bus-acc", "MAJOR_REQ")).not.toContain("FIN3205");
  });
});

describe("the migration's own safety list", () => {
  it("names every table that points at a course, so a course in use is never removed", () => {
    const tables = (db.prepare(
      "SELECT m.name FROM sqlite_master m JOIN pragma_table_info(m.name) p WHERE m.type = 'table' AND p.name = 'course_code' ORDER BY 1",
    ).all() as { name: string }[]).map((r) => r.name).filter((n) => n !== "program_courses" && n !== "term_offerings");
    const script = readFileSync(fileURLToPath(new URL("../../scripts/import-ru-curriculum.mjs", import.meta.url)), "utf8");
    const listed = JSON.parse(/const REFERRING = (\[[^\]]*\]);/.exec(script)![1]) as string[];
    for (const t of tables) expect(listed, t).toContain(t);
  });
});
