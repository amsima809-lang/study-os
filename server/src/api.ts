/**
 * Phase 2 API: Today, weekly schedule, and exams (with clash warnings).
 * All date logic is in Asia/Bangkok. Dates are stored/returned as ISO strings.
 */
import { Router } from "express";
import type { DB } from "./db.js";

// ---------- date helpers (Asia/Bangkok) ----------
const TZ = "Asia/Bangkok";
const WD_SHORT: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/** Today's date in Bangkok as "YYYY-MM-DD". */
export function bangkokToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** Today's ISO weekday in Bangkok (1=Mon .. 7=Sun). */
export function bangkokWeekday(now = new Date()): number {
  const short = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(now);
  return WD_SHORT[short] ?? 1;
}

/** Whole days from date-only `from` to `to` (both "YYYY-MM-DD"). */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

// ---------- settings ----------
function getSetting(db: DB, key: string, fallback: string): string {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? fallback;
}

function currentTermId(db: DB): string {
  return getSetting(db, "current_term_id", "2/69");
}

// ---------- shared queries ----------
type CourseRow = { code: string; name_th: string; difficulty: number };

/** Real courses (not placeholders) planned in the current term. */
function currentTermCourses(db: DB, termId: string): CourseRow[] {
  return db
    .prepare(
      `SELECT c.code, c.name_th, c.difficulty
       FROM plan_items pi
       JOIN courses c ON c.code = pi.course_code
       WHERE pi.term_id = ?
       ORDER BY c.code`,
    )
    .all(termId) as CourseRow[];
}

/**
 * Weekly + daily study-hour target per course, using the points system:
 * difficulty 3=3pts, 2=2pts, 1=1pt. weekly_target_hours / total points =
 * hours per point; a course's weekly hours = its points × hours-per-point.
 */
export function studyTargets(db: DB, termId: string) {
  const courses = currentTermCourses(db, termId);
  const weeklyTarget = Number(getSetting(db, "weekly_target_hours", "36"));
  const totalPoints = courses.reduce((s, c) => s + c.difficulty, 0);
  const hoursPerPoint = totalPoints > 0 ? weeklyTarget / totalPoints : 0;

  return {
    weeklyTarget,
    totalPoints,
    courses: courses.map((c) => {
      const weekly = c.difficulty * hoursPerPoint;
      return {
        code: c.code,
        name_th: c.name_th,
        difficulty: c.difficulty,
        weeklyHours: Math.round(weekly * 10) / 10,
        dailyHours: Math.round((weekly / 7) * 10) / 10,
      };
    }),
  };
}

type ClassRow = {
  course_code: string;
  name_th: string;
  weekday: number;
  start_time: string;
  end_time: string;
  room: string | null;
};

function weekClasses(db: DB, termId: string): ClassRow[] {
  return db
    .prepare(
      `SELECT cs.course_code, c.name_th, cs.weekday, cs.start_time, cs.end_time, cs.room
       FROM class_sessions cs
       JOIN courses c ON c.code = cs.course_code
       WHERE cs.term_id = ?
       ORDER BY cs.weekday, cs.start_time`,
    )
    .all(termId) as ClassRow[];
}

type ExamRow = {
  course_code: string;
  name_th: string;
  datetime_start: string;
  datetime_end: string;
  slot: string | null;
  location: string | null;
};

function termExams(db: DB, termId: string): ExamRow[] {
  return db
    .prepare(
      `SELECT e.course_code, c.name_th, e.datetime_start, e.datetime_end, e.slot, e.location
       FROM exams e
       JOIN courses c ON c.code = e.course_code
       WHERE e.term_id = ?
       ORDER BY e.datetime_start`,
    )
    .all(termId) as ExamRow[];
}

/**
 * A clash = two exams on the same date whose slots overlap.
 * Slots may be "A", "B", or "A,B" (a course occupying both slots that day).
 * Returns the set of exam indexes that are involved in any clash.
 */
export function findExamClashes(exams: ExamRow[]): Array<{ date: string; courses: string[] }> {
  const byDate = new Map<string, ExamRow[]>();
  for (const e of exams) {
    const date = e.datetime_start.slice(0, 10);
    (byDate.get(date) ?? byDate.set(date, []).get(date)!).push(e);
  }

  const clashes: Array<{ date: string; courses: string[] }> = [];
  for (const [date, list] of byDate) {
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const a = new Set((list[i].slot ?? "").split(",").map((s) => s.trim()));
        const b = new Set((list[j].slot ?? "").split(",").map((s) => s.trim()));
        const overlap = [...a].some((s) => s && b.has(s));
        if (overlap) {
          clashes.push({ date, courses: [list[i].course_code, list[j].course_code] });
        }
      }
    }
  }
  return clashes;
}

function dueFlashcardCount(db: DB, today: string): number {
  return (
    db.prepare("SELECT COUNT(*) n FROM flashcards WHERE next_review_date <= ?").get(today) as {
      n: number;
    }
  ).n;
}

// ---------- routes ----------
export function createApiRouter(db: DB): Router {
  const router = Router();

  router.get("/today", (_req, res) => {
    const term = currentTermId(db);
    const today = bangkokToday();
    const weekday = bangkokWeekday();

    const todayClasses = weekClasses(db, term).filter((c) => c.weekday === weekday);

    const exams = termExams(db, term);
    const upcoming = exams
      .map((e) => ({ ...e, daysLeft: daysBetween(today, e.datetime_start.slice(0, 10)) }))
      .filter((e) => e.daysLeft >= 0)
      .sort((a, b) => a.daysLeft - b.daysLeft);
    const nextExam = upcoming[0] ?? null;

    res.json({
      term,
      today,
      weekday,
      classes: todayClasses,
      nextExam: nextExam
        ? {
            course_code: nextExam.course_code,
            name_th: nextExam.name_th,
            date: nextExam.datetime_start.slice(0, 10),
            slot: nextExam.slot,
            daysLeft: nextExam.daysLeft,
          }
        : null,
      dueFlashcards: dueFlashcardCount(db, today),
      studyTargets: studyTargets(db, term),
    });
  });

  router.get("/schedule/week", (_req, res) => {
    const term = currentTermId(db);
    res.json({ term, classes: weekClasses(db, term) });
  });

  router.get("/exams", (_req, res) => {
    const term = currentTermId(db);
    const today = bangkokToday();
    const exams = termExams(db, term).map((e) => ({
      course_code: e.course_code,
      name_th: e.name_th,
      date: e.datetime_start.slice(0, 10),
      start: e.datetime_start,
      end: e.datetime_end,
      slot: e.slot,
      location: e.location,
      daysLeft: daysBetween(today, e.datetime_start.slice(0, 10)),
    }));
    res.json({ term, today, exams, clashes: findExamClashes(termExams(db, term)) });
  });

  return router;
}
