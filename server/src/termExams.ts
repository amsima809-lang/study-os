/**
 * The exams of a term, for choosing courses (the course picker) and on the trail: each course's
 * final as the registrar prints it (term_offerings: a date and period A or B, or "the faculty
 * arranges it"), whether it can also be taken early by e-Testing (etesting_courses), the
 * finals fortnight and the e-Testing window (etesting_schedule).
 *
 * Periods: A 09:30–12:00, B 14:00–16:30 (EXAM_PERIODS in termSchedule.ts, from the admission
 * guide). e-Testing is optional and booked by the student herself (centre, day, period); the
 * app knows only which courses are on the list and the window.
 */
import type { DB } from "./db.js";
import { termIndex } from "./trail.js";

export type CourseExam = {
  exam_date: string | null;
  exam_slot: "A" | "B" | null;
  /** The registrar's note when there is no date, e.g. "คณะจัดสอบเอง" (the faculty arranges it). */
  exam_note: string | null;
  /** On this term's e-Testing list. */
  etesting: boolean;
  /** Part essay: its e-Testing result is not known at once. */
  etesting_essay: boolean;
};

export type TermExamWindows = {
  /** The first day of classes (plan_terms.start_date), when known. */
  term_start: string | null;
  /** First and last day of the university's finals this term. */
  finals: { from: string; to: string } | null;
  etesting: {
    registration_start: string; registration_end: string; registration_opens: string | null; registration_closes: string | null;
    exam_start: string; exam_end: string; central_closed: [string, string][];
  } | null;
};

export function courseExams(db: DB, term: string, codes: string[]): Record<string, CourseExam> {
  if (codes.length === 0) return {};
  const marks = codes.map(() => "?").join(",");
  const exams = db.prepare(`SELECT course_code, exam_date, exam_slot, exam_note FROM term_offerings WHERE term_id = ? AND course_code IN (${marks})`)
    .all(term, ...codes) as { course_code: string; exam_date: string | null; exam_slot: "A" | "B" | null; exam_note: string | null }[];
  const et = new Map((db.prepare(`SELECT course_code, has_essay FROM etesting_courses WHERE term_id = ? AND course_code IN (${marks})`)
    .all(term, ...codes) as { course_code: string; has_essay: number }[]).map((r) => [r.course_code, r.has_essay === 1]));
  const out: Record<string, CourseExam> = {};
  for (const code of codes) {
    const e = exams.find((x) => x.course_code === code);
    out[code] = {
      exam_date: e?.exam_date ?? null, exam_slot: e?.exam_slot ?? null, exam_note: e?.exam_note ?? null,
      etesting: et.has(code), etesting_essay: et.get(code) ?? false,
    };
  }
  return out;
}

export function termExamWindows(db: DB, term: string): TermExamWindows {
  const f = db.prepare("SELECT MIN(exam_date) AS from_, MAX(exam_date) AS to_ FROM term_offerings WHERE term_id = ? AND exam_date IS NOT NULL")
    .get(term) as { from_: string | null; to_: string | null };
  const s = db.prepare(
    "SELECT registration_start, registration_end, registration_opens, registration_closes, exam_start, exam_end, central_closed FROM etesting_schedule WHERE term_id = ?",
  ).get(term) as (Omit<NonNullable<TermExamWindows["etesting"]>, "central_closed"> & { central_closed: string | null }) | undefined;
  const start = (db.prepare("SELECT start_date FROM plan_terms WHERE term_id = ?").get(term) as { start_date: string | null } | undefined)?.start_date ?? null;
  return {
    term_start: start,
    finals: f.from_ && f.to_ ? { from: f.from_, to: f.to_ } : null,
    etesting: s ? { ...s, central_closed: s.central_closed ? JSON.parse(s.central_closed) : [] } : null,
  };
}

/**
 * For a plan's later terms, whose e-Testing lists are not out: the latest term (up to now) whose
 * list had each course. Evidence, not a promise: the list is announced each term.
 */
export function etestingBefore(db: DB, codes: string[], now: string): Record<string, string> {
  if (codes.length === 0) return {};
  const rows = db.prepare(`SELECT course_code, term_id FROM etesting_courses WHERE course_code IN (${codes.map(() => "?").join(",")})`)
    .all(...codes) as { course_code: string; term_id: string }[];
  const out: Record<string, string> = {};
  for (const r of rows) {
    if (termIndex(r.term_id) > termIndex(now)) continue;
    if (!out[r.course_code] || termIndex(r.term_id) > termIndex(out[r.course_code])) out[r.course_code] = r.term_id;
  }
  return out;
}
