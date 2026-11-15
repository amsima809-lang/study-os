/**
 * Her exams this term, from every source, in one place: the final as the registrar printed it,
 * a date she entered for a faculty-arranged exam (migration 043), her e-Testing booking
 * (migration 041) and the room and seat she copied from e-Service. Everything that needs "when is
 * her exam for this course" asks here: the study plan, Today's countdown, the Exams page and the
 * exam-day reminders.
 *
 * The date to PREPARE for is the earliest one still ahead: a booked e-Test comes before the final
 * (pass it and there is no final; fail it and the final is still on: e-Testing office, 2569 manual
 * pp. 1-2, 4), so once the e-Test day has gone the final is next.
 */
import { Router } from "express";
import { z } from "zod";
import type { DB } from "./db.js";
import { bangkokToday, currentTermId, termCourses } from "./api.js";
import { ETESTING_PERIODS } from "./etestingBookings.js";

export type ExamKind = "etesting" | "final" | "own";
export type MyExam = {
  course_code: string;
  name_th: string;
  name_en: string | null;
  /** As the registrar printed it. */
  final: { date: string; slot: string | null; start: string; end: string } | null;
  /** The registrar prints "the faculty arranges it" instead of a date. */
  facultySet: boolean;
  /** The date she entered for a faculty-arranged exam. */
  own: { date: string; start: string | null; end: string | null } | null;
  booking: { date: string; period: number; centre: string; start: string; end: string } | null;
  seat: string | null;
  /** The next exam to prepare for (date today or later), or null when none is ahead. */
  next: { date: string; kind: ExamKind; start: string | null; end: string | null } | null;
};

const hm = (iso: string) => iso.slice(11, 16);

/** Her chosen courses' exams this term (only courses she registered: plan_items). */
export function myExams(db: DB, userId: string, termId = currentTermId(db), today = bangkokToday()): MyExam[] {
  const codes = termCourses(db, userId, termId);
  if (codes.length === 0) return [];
  const q = codes.map(() => "?").join(",");
  const names = new Map((db.prepare(`SELECT code, name_th, name_en FROM courses WHERE code IN (${q})`).all(...codes) as { code: string; name_th: string; name_en: string | null }[]).map((r) => [r.code, r]));
  const finals = new Map<string, MyExam["final"]>();
  for (const e of db.prepare(`SELECT course_code, datetime_start, datetime_end, slot FROM exams WHERE term_id = ? AND course_code IN (${q}) ORDER BY datetime_start`).all(termId, ...codes) as { course_code: string; datetime_start: string; datetime_end: string; slot: string | null }[]) {
    if (!finals.has(e.course_code)) finals.set(e.course_code, { date: e.datetime_start.slice(0, 10), slot: e.slot, start: hm(e.datetime_start), end: hm(e.datetime_end) });
  }
  const facultySet = new Set((db.prepare(`SELECT course_code FROM term_offerings WHERE term_id = ? AND exam_date IS NULL AND exam_note IS NOT NULL AND course_code IN (${q})`).all(termId, ...codes) as { course_code: string }[]).map((r) => r.course_code));
  const mine = new Map((db.prepare("SELECT course_code, exam_date, start_time, end_time, seat FROM my_exams WHERE user_id = ? AND term_id = ?").all(userId, termId) as { course_code: string; exam_date: string | null; start_time: string | null; end_time: string | null; seat: string | null }[]).map((r) => [r.course_code, r]));
  const bookings = new Map((db.prepare("SELECT course_code, date, period, centre FROM etesting_bookings WHERE user_id = ? AND term_id = ?").all(userId, termId) as { course_code: string; date: string; period: 1 | 2 | 3 | 4; centre: string }[]).map((r) => [r.course_code, r]));

  return codes.map((code) => {
    const final = finals.get(code) ?? null;
    const m = mine.get(code);
    // A date she entered counts only where the registrar gives none.
    const own = m?.exam_date && !final ? { date: m.exam_date, start: m.start_time, end: m.end_time } : null;
    const b = bookings.get(code);
    const booking = b ? { date: b.date, period: b.period, centre: b.centre, start: ETESTING_PERIODS[b.period][0], end: ETESTING_PERIODS[b.period][1] } : null;
    const ahead = [
      booking && { date: booking.date, kind: "etesting" as const, start: booking.start, end: booking.end },
      final && { date: final.date, kind: "final" as const, start: final.start, end: final.end },
      own && { date: own.date, kind: "own" as const, start: own.start, end: own.end },
    ].filter((x): x is NonNullable<typeof x> => !!x && x.date >= today).sort((a, b2) => a.date.localeCompare(b2.date));
    const n = names.get(code);
    return {
      course_code: code, name_th: n?.name_th ?? code, name_en: n?.name_en ?? null,
      final, facultySet: facultySet.has(code) && !final, own, booking, seat: m?.seat ?? null, next: ahead[0] ?? null,
    };
  });
}

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const body = z.object({
  /** Only for a faculty-arranged exam; null clears it. */
  exam_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  start_time: time.nullable().optional(),
  end_time: time.nullable().optional(),
  seat: z.string().trim().max(80).nullable().optional(),
});

export function createMyExamsRouter(db: DB): Router {
  const router = Router();
  router.get("/my-exams", (req, res) => {
    res.json({ term: currentTermId(db), today: bangkokToday(), exams: myExams(db, req.user!.id) });
  });
  // What she writes down for one of her courses this term: a faculty-arranged exam's date, her seat.
  router.put("/my-exams/:code", (req, res) => {
    const userId = req.user!.id, term = currentTermId(db), code = req.params.code;
    const parsed = body.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "bad input", code: "BAD_INPUT" });
    const exam = myExams(db, userId, term).find((e) => e.course_code === code);
    if (!exam) return res.status(404).json({ error: "not one of your courses this term", code: "NOT_REGISTERED" });
    const v = parsed.data;
    if (v.exam_date !== undefined && v.exam_date !== null && !exam.facultySet) return res.status(400).json({ error: "the registrar dates this exam", code: "HAS_DATE" });
    if (v.start_time && v.end_time && v.end_time <= v.start_time) return res.status(400).json({ error: "ends before it starts", code: "BAD_TIME" });
    const was = db.prepare("SELECT exam_date, start_time, end_time, seat FROM my_exams WHERE user_id = ? AND term_id = ? AND course_code = ?").get(userId, term, code) as { exam_date: string | null; start_time: string | null; end_time: string | null; seat: string | null } | undefined;
    const next = {
      exam_date: v.exam_date !== undefined ? v.exam_date : was?.exam_date ?? null,
      start_time: v.start_time !== undefined ? v.start_time : was?.start_time ?? null,
      end_time: v.end_time !== undefined ? v.end_time : was?.end_time ?? null,
      seat: v.seat !== undefined ? (v.seat || null) : was?.seat ?? null,
    };
    // Times belong to a date: clearing the date clears them.
    if (!next.exam_date) { next.start_time = null; next.end_time = null; }
    if (!next.exam_date && !next.seat) db.prepare("DELETE FROM my_exams WHERE user_id = ? AND term_id = ? AND course_code = ?").run(userId, term, code);
    else db.prepare(
      `INSERT INTO my_exams (user_id, term_id, course_code, exam_date, start_time, end_time, seat, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(user_id, term_id, course_code) DO UPDATE SET exam_date = excluded.exam_date, start_time = excluded.start_time, end_time = excluded.end_time, seat = excluded.seat, updated_at = excluded.updated_at`,
    ).run(userId, term, code, next.exam_date, next.start_time, next.end_time, next.seat);
    res.json({ exams: myExams(db, userId, term) });
  });
  return router;
}
