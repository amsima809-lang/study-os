/**
 * The e-Testing exams a student has booked (migration 041), checked against the e-Testing
 * office's rules so a typo cannot record a day or period that does not exist:
 * - the course is one she is registered in this term, and on this term's e-Testing list;
 * - the day is inside the testing window; at the central centre (Hua Mak) not a closed day; at a
 *   regional centre one of its listed days;
 * - period 4 (18:00-20:30) only on Saturday and Sunday;
 * - one course per period (a day holds up to four).
 * Sources: the 2/2569 announcement (etesting_schedule, migration 040) and the office's 2569
 * registration manual (https://easi.ru.ac.th).
 */
import { Router } from "express";
import { z } from "zod";
import type { DB } from "./db.js";
import { getSetting, termCourses } from "./api.js";

/** The periods as the announcement prints them. */
export const ETESTING_PERIODS = { 1: ["09:00", "11:30"], 2: ["12:00", "14:30"], 3: ["15:00", "17:30"], 4: ["18:00", "20:30"] } as const;
export type Centre = "central" | "regional";
export type Booking = { course_code: string; centre: Centre; date: string; period: 1 | 2 | 3 | 4 };

type Schedule = { exam_start: string; exam_end: string; central_closed: string | null; regional_dates: string | null };

const weekend = (iso: string) => { const d = new Date(`${iso}T00:00:00Z`).getUTCDay(); return d === 0 || d === 6; };

/** The days a centre tests in a term's window. */
export function testingDays(s: Schedule, centre: Centre): string[] {
  // The regional centres' own listed days are the whole truth for them: in 2/2569 they start on
  // 9 January, before Hua Mak opens on the 12th.
  if (centre === "regional") return (s.regional_dates ? (JSON.parse(s.regional_dates) as string[]) : []).slice().sort();
  const closed = (s.central_closed ? JSON.parse(s.central_closed) : []) as [string, string][];
  const out: string[] = [];
  for (const d = new Date(`${s.exam_start}T00:00:00Z`), end = new Date(`${s.exam_end}T00:00:00Z`); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    if (!closed.some(([a, b]) => iso >= a && iso <= b)) out.push(iso);
  }
  return out;
}
/** The periods a day has: three on weekdays, four at weekends. */
export const periodsOn = (iso: string): (1 | 2 | 3 | 4)[] => (weekend(iso) ? [1, 2, 3, 4] : [1, 2, 3]);

export type BookingError = "NOT_REGISTERED" | "NOT_ON_LIST" | "NO_SCHEDULE" | "NOT_A_TESTING_DAY" | "NO_SUCH_PERIOD" | "PERIOD_TAKEN";

/** Why a booking cannot be right, or null if it can. `existing`: her other bookings this term. */
export function checkBooking(db: DB, userId: string, term: string, b: Booking): BookingError | null {
  if (!termCourses(db, userId, term).includes(b.course_code)) return "NOT_REGISTERED";
  if (!db.prepare("SELECT 1 FROM etesting_courses WHERE term_id = ? AND course_code = ?").get(term, b.course_code)) return "NOT_ON_LIST";
  const s = db.prepare("SELECT exam_start, exam_end, central_closed, regional_dates FROM etesting_schedule WHERE term_id = ?").get(term) as Schedule | undefined;
  if (!s) return "NO_SCHEDULE";
  if (!testingDays(s, b.centre).includes(b.date)) return "NOT_A_TESTING_DAY";
  if (!periodsOn(b.date).includes(b.period)) return "NO_SUCH_PERIOD";
  const taken = db.prepare("SELECT 1 FROM etesting_bookings WHERE user_id = ? AND term_id = ? AND date = ? AND period = ? AND course_code <> ?")
    .get(userId, term, b.date, b.period, b.course_code);
  if (taken) return "PERIOD_TAKEN";
  return null;
}

export function bookingsFor(db: DB, userId: string, term: string): Booking[] {
  return db.prepare("SELECT course_code, centre, date, period FROM etesting_bookings WHERE user_id = ? AND term_id = ? ORDER BY date, period")
    .all(userId, term) as Booking[];
}

const Body = z.object({ centre: z.enum(["central", "regional"]), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), period: z.number().int().min(1).max(4) });

export function createEtestingRouter(db: DB): Router {
  const router = Router();
  const term = () => getSetting(db, "current_term_id", "2/69");

  router.get("/etesting/bookings", (req, res) => {
    const t = term();
    const s = db.prepare("SELECT exam_start, exam_end, central_closed, regional_dates FROM etesting_schedule WHERE term_id = ?").get(t) as Schedule | undefined;
    res.json({
      term: t,
      bookings: bookingsFor(db, req.user!.id, t),
      // The days each centre tests, so the form offers only real days (and their periods).
      days: s ? { central: testingDays(s, "central"), regional: testingDays(s, "regional") } : { central: [], regional: [] },
      periods: ETESTING_PERIODS,
    });
  });

  router.put("/etesting/bookings/:code", (req, res) => {
    const parsed = Body.safeParse(req.body);
    const code = String(req.params.code);
    if (!parsed.success || !/^[A-Z]{3}\d{4}$/.test(code)) return res.status(400).json({ error: "bad booking", code: "BAD_BOOKING" });
    const t = term();
    const b: Booking = { course_code: code, ...parsed.data, period: parsed.data.period as Booking["period"] };
    const why = checkBooking(db, req.user!.id, t, b);
    if (why) return res.status(400).json({ error: why, code: why });
    db.prepare(
      `INSERT INTO etesting_bookings (user_id, term_id, course_code, centre, date, period) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT (user_id, term_id, course_code) DO UPDATE SET centre = excluded.centre, date = excluded.date, period = excluded.period`,
    ).run(req.user!.id, t, code, b.centre, b.date, b.period);
    res.json({ ok: true, bookings: bookingsFor(db, req.user!.id, t) });
  });

  router.delete("/etesting/bookings/:code", (req, res) => {
    const t = term();
    db.prepare("DELETE FROM etesting_bookings WHERE user_id = ? AND term_id = ? AND course_code = ?").run(req.user!.id, t, String(req.params.code));
    res.json({ ok: true, bookings: bookingsFor(db, req.user!.id, t) });
  });

  return router;
}
