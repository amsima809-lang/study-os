import { describe, it, expect, beforeEach } from "vitest";
import { openDb, type DB } from "../src/db.js";
import { seedDatabase } from "../src/seed.js";
import { findOrCreateUser } from "../src/auth.js";
import { setSetting } from "../src/api.js";
import { courseResults, passedCourses, passedCreditsByCategory, setPassedList, setResult } from "../src/results.js";
import { calculateGpa, gradesFor } from "../src/planner.js";
import { answerTermCheck, termCheck, loadTrailInput } from "../src/trailRoutes.js";
import { buildTrail } from "../src/trail.js";

let db: DB;
let ann: string;
let ben: string;
const SCALE = [{ grade: "A", points: 4 }, { grade: "B", points: 3 }, { grade: "C", points: 2 }, { grade: "D", points: 1 }];
const student = (email: string) => {
  const id = findOrCreateUser(db, { email, name: email, avatar: "" });
  db.prepare("UPDATE user_profiles SET program_id = 'bus-mkt', university_id = 'ru', entry_year = '69', onboarded = 1 WHERE user_id = ?").run(id);
  setSetting(db, "grade_scale", JSON.stringify(SCALE), id);
  return id;
};
const choose = (user: string, term: string, ...codes: string[]) => {
  for (const c of codes) db.prepare("INSERT INTO plan_items (user_id, term_id, course_code) VALUES (?, ?, ?)").run(user, term, c);
};
const setTerm = (t: string) => db.prepare("UPDATE settings SET value = ? WHERE key = 'current_term_id'").run(t);

beforeEach(() => {
  db = openDb(":memory:");
  seedDatabase(db, { reset: false });
  ann = student("ann@studyos.test");
  ben = student("ben@studyos.test");
});

describe("Phase 63 — one record of results", () => {
  it("keeps each student's result for the same course in the same term (it used to be one row for everyone)", () => {
    choose(ann, "2/69", "ACC1103");
    choose(ben, "2/69", "ACC1103");
    setResult(db, ann, "ACC1103", "PASSED", "A");
    setResult(db, ben, "ACC1103", "FAILED");
    expect(courseResults(db, ann)).toEqual([{ course_code: "ACC1103", term_id: "2/69", status: "PASSED", grade: "A", credits: 3 }]);
    expect(courseResults(db, ben)).toEqual([{ course_code: "ACC1103", term_id: "2/69", status: "FAILED", grade: null, credits: 3 }]);
    const key = (db.prepare("PRAGMA table_info(enrollments)").all() as { name: string; pk: number }[]).filter((c) => c.pk > 0).map((c) => c.name).sort();
    expect(key).toEqual(["course_code", "term_id", "user_id"]);
  });

  it("records a course against the term it was taken in, keeps its grade, and can clear it", () => {
    choose(ann, "2/69", "RAM1111");
    expect(setResult(db, ann, "RAM1111", "PASSED", "B")).toBe(true);
    setResult(db, ann, "RAM1111", "PASSED"); // said again without a grade: the grade stays
    expect(courseResults(db, ann)[0]).toMatchObject({ term_id: "2/69", status: "PASSED", grade: "B" });
    setResult(db, ann, "RAM1111", "PASSED", null); // grade taken away on purpose
    expect(courseResults(db, ann)[0].grade).toBeNull();
    setResult(db, ann, "RAM1111", null);
    expect(courseResults(db, ann)).toEqual([]);
    expect(setResult(db, ann, "ZZZ9999", "PASSED")).toBe(false); // no such course
  });

  it("a course passed before she used the app has no term, and can still carry a grade", () => {
    setResult(db, ann, "ECO1121", "PASSED", "A");
    expect(courseResults(db, ann)).toEqual([{ course_code: "ECO1121", term_id: null, status: "PASSED", grade: "A", credits: 3 }]);
    expect(passedCourses(db, ann)).toEqual(["ECO1121"]);
    setResult(db, ann, "ECO1121", "FAILED"); // "failed" with no term cannot be kept: it is simply not passed
    expect(courseResults(db, ann)).toEqual([]);
  });

  it("a course failed once and passed later keeps both results", () => {
    choose(ann, "2/69", "ACC1103");
    setResult(db, ann, "ACC1103", "FAILED");
    db.prepare("INSERT OR IGNORE INTO plan_terms (term_id, ord, max_credits) VALUES ('1/70', 1, 24)").run();
    choose(ann, "1/70", "ACC1103"); // taken again
    setResult(db, ann, "ACC1103", "PASSED", "C");
    expect(courseResults(db, ann).map((r) => `${r.term_id} ${r.status}`).sort()).toEqual(["1/70 PASSED", "2/69 FAILED"]);
    expect(passedCourses(db, ann)).toEqual(["ACC1103"]);
  });

  it("the tick list and the grades agree: unticking removes the pass, a course left ticked keeps its grade", () => {
    choose(ann, "2/69", "ACC1103", "RAM1111");
    setResult(db, ann, "ACC1103", "PASSED", "A");
    setPassedList(db, ann, ["ACC1103", "RAM1111", "ECO1121"]); // two more ticked
    expect(passedCourses(db, ann).sort()).toEqual(["ACC1103", "ECO1121", "RAM1111"]);
    expect(courseResults(db, ann).find((r) => r.course_code === "ACC1103")!.grade).toBe("A");
    expect(courseResults(db, ann).find((r) => r.course_code === "RAM1111")!.term_id).toBe("2/69"); // she took it here: recorded in its term
    expect(courseResults(db, ann).find((r) => r.course_code === "ECO1121")!.term_id).toBeNull(); // never chosen here: before the app
    setPassedList(db, ann, ["RAM1111"]);
    expect(passedCourses(db, ann)).toEqual(["RAM1111"]);
    expect(passedCourses(db, ben)).toEqual([]); // nobody else's list moved
  });
});

describe("Phase 63 — the grades page", () => {
  it("shows the terms she has courses in, courses passed before the app, and one average over both", () => {
    choose(ann, "2/69", "ACC1103", "RAM1111", "RAM1101");
    setResult(db, ann, "ACC1103", "PASSED", "A"); // 3 credits x 4
    setResult(db, ann, "RAM1111", "PASSED", "C"); // 3 credits x 2
    setResult(db, ann, "RAM1101", "FAILED");
    setResult(db, ann, "ECO1121", "PASSED", "B"); // before the app: 3 credits x 3
    const g = gradesFor(db, ann);
    expect(g.terms.map((t) => t.term_id)).toEqual(["2/69"]); // no empty terms, no future terms
    expect(g.terms[0].items.map((i) => `${i.course_code} ${i.status} ${i.grade ?? "-"}`)).toEqual(["ACC1103 PASSED A", "RAM1111 PASSED C", "RAM1101 FAILED -"]);
    expect(g.terms[0].gpa).toBe(3);
    expect(g.before).toEqual([{ course_code: "ECO1121", name_th: expect.any(String), name_en: expect.any(String), credits: 3, grade: "B" }]);
    expect(g.gpa).toMatchObject({ gpa: 3, totalCredits: 9, courseCount: 3 });
    expect(gradesFor(db, ben)).toMatchObject({ terms: [], before: [], gpa: { gpa: null } });
  });

  it("leaves a course with no grade, or a grade not on the scale, out of the average", () => {
    expect(calculateGpa([{ credits: 3, grade: "A" }, { credits: 3, grade: null }, { credits: 3, grade: "S" }], SCALE)).toMatchObject({ gpa: 4, totalCredits: 3, courseCount: 1 });
    expect(calculateGpa([], SCALE).gpa).toBeNull();
  });
});

describe("Phase 63 — progress through the curriculum", () => {
  it("counts passed credits by the part of HER curriculum each course is in; a course outside it is a free elective", () => {
    setPassedList(db, ann, ["ACC1103", "RAM1111", "MKT2101"]);
    const category = (code: string) => (db.prepare("SELECT category FROM program_courses WHERE program_id = 'bus-mkt' AND course_code = ?").get(code) as { category: string }).category;
    const expected: Record<string, number> = {};
    for (const c of ["ACC1103", "RAM1111", "MKT2101"]) expected[category(c)] = (expected[category(c)] ?? 0) + 3;
    expect(passedCreditsByCategory(db, ann)).toEqual(expected);
    const outside = (db.prepare("SELECT code FROM courses WHERE code NOT IN (SELECT course_code FROM program_courses WHERE program_id = 'bus-mkt') AND credits = 3 LIMIT 1").get() as { code: string }).code;
    setResult(db, ann, outside, "PASSED");
    expect(passedCreditsByCategory(db, ann).FREE).toBe((expected.FREE ?? 0) + 3);
  });
});

describe("Phase 63 — the new-term question writes the same record", () => {
  it("ticked courses are passed in their term, the others are 'not passed', and none is asked about again", () => {
    choose(ann, "2/69", "ACC1103", "RAM1111", "RAM1101");
    db.prepare("INSERT OR IGNORE INTO plan_terms (term_id, ord, max_credits) VALUES ('1/70', 1, 24), ('2/70', 2, 24)").run();
    setTerm("1/70");
    expect(termCheck(db, ann).courses.map((c) => c.code)).toEqual(["ACC1103", "RAM1101", "RAM1111"]);
    answerTermCheck(db, ann, ["ACC1103", "RAM1111"]);
    expect(gradesFor(db, ann).terms[0].items.map((i) => `${i.course_code} ${i.status}`)).toEqual(["ACC1103 PASSED", "RAM1111 PASSED", "RAM1101 FAILED"]);
    // the course she did not pass is back in the plan to graduate
    expect(buildTrail(loadTrailInput(db, ann)!).terms.flatMap((t) => t.items.map((i) => i.code))).toContain("RAM1101");
    // a term later she is not asked about last year's course again
    db.prepare("UPDATE user_profiles SET term_reviewed = NULL WHERE user_id = ?").run(ann);
    setTerm("2/70");
    expect(termCheck(db, ann).due).toBe(false);
  });
});
