/**
 * The official record of a term, and the timetable and exams built from it.
 *
 * `term_offerings` holds every course Ramkhamhaeng offers in a term, read from
 * the registrar's ม.ร.30 and exam list by scripts/import-ru-term.mjs (which
 * writes a migration). `class_sessions` and `exams` hold the same facts for the
 * courses in the app's catalogue, in the shape the screens use.
 */
import type { DB } from "./db.js";

/**
 * Clock times of the university's exam periods at the central campus. The ม.ร.30 and the exam
 * list print only "A" or "B"; the 2569 admission guide's key to abbreviations (printed page 32,
 * https://www.ru.ac.th/th/Center_study_plan/21/02_69.pdf) gives A = 0930-1200, B = 1400-1630,
 * and C = 1700-1930 (not used in 2/69). Regional exam centres keep other times.
 * scripts/import-ru-term.mjs writes the same pair into each term's migration.
 */
export const EXAM_PERIODS = { A: { start: "09:30", end: "12:00" }, B: { start: "14:00", end: "16:30" } } as const;

/**
 * Rebuild one term's timetable and exams from `term_offerings`, for the courses
 * now in the catalogue. Safe to run again: it replaces the term's rows. The
 * migration runs the same statements; the seed runs this afterwards because it
 * adds courses the migration could not yet see on a brand-new database.
 */
export function rebuildTermSchedule(db: DB, termId: string): { classes: number; exams: number } {
  const hasRecord = db.prepare("SELECT 1 FROM term_offerings WHERE term_id = ? LIMIT 1").get(termId);
  if (!hasRecord) return { classes: 0, exams: 0 }; // no official record for this term: leave what is there
  const run = db.transaction(() => {
    db.prepare("DELETE FROM class_sessions WHERE term_id = ?").run(termId);
    db.prepare("DELETE FROM exams WHERE term_id = ?").run(termId);
    const classes = db
      .prepare(
        `INSERT INTO class_sessions (course_code, term_id, weekday, start_time, end_time, room, instructor, kind)
         SELECT o.course_code, o.term_id, json_extract(s.value, '$.weekday'), json_extract(s.value, '$.start'), json_extract(s.value, '$.end'),
                NULLIF(json_extract(s.value, '$.room'), ''), o.teachers, NULLIF(json_extract(s.value, '$.kind'), '')
         FROM term_offerings o, json_each(o.sessions) s
         WHERE o.term_id = ? AND json_extract(s.value, '$.weekday') IS NOT NULL AND o.course_code IN (SELECT code FROM courses)
         ORDER BY o.course_code, s.key`,
      )
      .run(termId).changes;
    const exams = db
      .prepare(
        `INSERT INTO exams (course_code, term_id, datetime_start, datetime_end, slot, location)
         SELECT course_code, term_id,
                exam_date || CASE exam_slot WHEN 'A' THEN 'T${EXAM_PERIODS.A.start}:00+07:00' ELSE 'T${EXAM_PERIODS.B.start}:00+07:00' END,
                exam_date || CASE exam_slot WHEN 'A' THEN 'T${EXAM_PERIODS.A.end}:00+07:00' ELSE 'T${EXAM_PERIODS.B.end}:00+07:00' END,
                exam_slot, NULL
         FROM term_offerings
         WHERE term_id = ? AND exam_date IS NOT NULL AND course_code IN (SELECT code FROM courses)
         ORDER BY course_code`,
      )
      .run(termId).changes;
    return { classes, exams };
  });
  return run();
}

export type Offering = {
  course_code: string;
  credits: number;
  name_en: string;
  notes: string | null;
  sessions: { kind: string; text: string; weekday: number | null; start: string | null; end: string | null; room: string }[];
  teachers: string | null;
  exam_date: string | null;
  exam_slot: string | null;
  exam_note: string | null;
};

/** The official record of one course in a term, or undefined if it is not offered. */
export function offering(db: DB, termId: string, code: string): Offering | undefined {
  const row = db.prepare("SELECT * FROM term_offerings WHERE term_id = ? AND course_code = ?").get(termId, code) as
    (Omit<Offering, "sessions"> & { sessions: string }) | undefined;
  return row && { ...row, sessions: JSON.parse(row.sessions) as Offering["sessions"] };
}
