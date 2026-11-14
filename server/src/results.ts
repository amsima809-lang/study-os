/**
 * The one record of how a student's courses went: passed, failed, and with what grade.
 *
 * It lives in two tables, by what is known about the course:
 *   - `enrollments`     a course taken in a term the app knows about (she chose it for that term)
 *   - `passed_courses`  a course passed before she used the app: no term, optionally a grade
 * Everything that reads or writes a result goes through this file, so the trail planner, the
 * grades page, the "courses passed" list and the new-term question always agree.
 */
import type { DB } from "./db.js";

export type ResultStatus = "PASSED" | "FAILED";
export type CourseResult = { course_code: string; term_id: string | null; status: ResultStatus; grade: string | null; credits: number };

/** Every course with a result. A course passed in a term is listed once, with that term. */
export function courseResults(db: DB, userId: string): CourseResult[] {
  const inTerm = db.prepare(
    `SELECT e.course_code, e.term_id, e.status, e.grade, c.credits
     FROM enrollments e JOIN courses c ON c.code = e.course_code
     WHERE e.user_id = ? AND e.status IN ('PASSED', 'FAILED')`,
  ).all(userId) as CourseResult[];
  const passedInTerm = new Set(inTerm.filter((r) => r.status === "PASSED").map((r) => r.course_code));
  const earlier = (db.prepare(
    `SELECT p.course_code, NULL AS term_id, 'PASSED' AS status, p.grade, c.credits
     FROM passed_courses p JOIN courses c ON c.code = p.course_code WHERE p.user_id = ?`,
  ).all(userId) as CourseResult[]).filter((r) => !passedInTerm.has(r.course_code));
  return [...inTerm, ...earlier];
}

/** The courses the student has passed. */
export function passedCourses(db: DB, userId: string): string[] {
  return [...new Set(courseResults(db, userId).filter((r) => r.status === "PASSED").map((r) => r.course_code))];
}

/** The term the student took (chose) a course in: the latest, if she has taken it more than once. */
function termTaken(db: DB, userId: string, courseCode: string): string | null {
  return (db.prepare(
    `SELECT pi.term_id FROM plan_items pi JOIN plan_terms t ON t.term_id = pi.term_id
     WHERE pi.course_code = ? AND pi.user_id = ? ORDER BY t.ord DESC LIMIT 1`,
  ).get(courseCode, userId) as { term_id: string } | undefined)?.term_id ?? null;
}

/**
 * Record how a course went in a term, or clear that (`null`: not taken yet, or still being taken).
 * `termId` is the term it was taken in; left out, it is the latest term she chose the course for,
 * and if she never chose it in the app the course counts as passed before she used the app.
 * `grade` undefined keeps the grade already recorded. An earlier term's result is left alone, so
 * a course failed once and passed later keeps both. Returns false for a course that does not exist.
 */
export function setResult(db: DB, userId: string, courseCode: string, status: ResultStatus | null, grade?: string | null, termId?: string | null): boolean {
  if (!db.prepare("SELECT 1 FROM courses WHERE code = ?").get(courseCode)) return false;
  const term = termId ?? termTaken(db, userId, courseCode);
  db.transaction(() => {
    const before = courseResults(db, userId).find((r) => r.course_code === courseCode && r.status === "PASSED" && (r.term_id === term || r.term_id === null));
    const keep = grade === undefined ? before?.grade ?? null : grade;
    // The record of passing before the app is replaced by whatever is said now.
    db.prepare("DELETE FROM passed_courses WHERE user_id = ? AND course_code = ?").run(userId, courseCode);
    if (term) {
      db.prepare("DELETE FROM enrollments WHERE user_id = ? AND course_code = ? AND term_id = ?").run(userId, courseCode, term);
      if (status) {
        db.prepare("INSERT INTO enrollments (user_id, course_code, term_id, status, grade) VALUES (?, ?, ?, ?, ?)")
          .run(userId, courseCode, term, status, status === "PASSED" ? keep : null);
      }
    } else if (status === "PASSED") {
      db.prepare("INSERT INTO passed_courses (user_id, course_code, grade) VALUES (?, ?, ?)").run(userId, courseCode, keep);
    }
  })();
  return true;
}

/**
 * Make the passed courses exactly this list (the "courses passed" tick list). A course newly
 * ticked is passed with no grade yet; one already passed keeps its grade; one unticked is no
 * longer passed in any term.
 */
export function setPassedList(db: DB, userId: string, codes: string[]): void {
  const wanted = new Set(codes);
  const now = new Set(passedCourses(db, userId));
  db.transaction(() => {
    for (const c of now) {
      if (wanted.has(c)) continue;
      db.prepare("DELETE FROM enrollments WHERE user_id = ? AND course_code = ? AND status = 'PASSED'").run(userId, c);
      db.prepare("DELETE FROM passed_courses WHERE user_id = ? AND course_code = ?").run(userId, c);
    }
    for (const c of wanted) if (!now.has(c)) setResult(db, userId, c, "PASSED");
  })();
}

/** Credits passed in each part of the student's curriculum. A course outside her major's lists counts as a free elective. */
export function passedCreditsByCategory(db: DB, userId: string): Record<string, number> {
  const programId = (db.prepare("SELECT program_id FROM user_profiles WHERE user_id = ?").get(userId) as { program_id: string | null } | undefined)?.program_id ?? null;
  const categoryOf = db.prepare("SELECT category FROM program_courses WHERE program_id = ? AND course_code = ?");
  const out: Record<string, number> = {};
  const seen = new Set<string>();
  for (const r of courseResults(db, userId)) {
    if (r.status !== "PASSED" || seen.has(r.course_code)) continue;
    seen.add(r.course_code);
    const category = (categoryOf.get(programId, r.course_code) as { category: string } | undefined)?.category ?? "FREE";
    out[category] = (out[category] ?? 0) + r.credits;
  }
  return out;
}
