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

/** Add `n` days to a "YYYY-MM-DD" date, returning "YYYY-MM-DD". */
export function addDaysISO(dateISO: string, n: number): string {
  const d = new Date(`${dateISO}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
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
type CourseRow = { code: string; name_th: string; name_en: string | null; difficulty: number };

/** Real courses (not placeholders) planned in the current term. */
function currentTermCourses(db: DB, termId: string): CourseRow[] {
  return db
    .prepare(
      `SELECT c.code, c.name_th, c.name_en, c.difficulty
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
        name_en: c.name_en,
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
  name_en: string | null;
  weekday: number;
  start_time: string;
  end_time: string;
  room: string | null;
};

function weekClasses(db: DB, termId: string): ClassRow[] {
  return db
    .prepare(
      `SELECT cs.course_code, c.name_th, c.name_en, cs.weekday, cs.start_time, cs.end_time, cs.room
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
  name_en: string | null;
  datetime_start: string;
  datetime_end: string;
  slot: string | null;
  location: string | null;
};

function termExams(db: DB, termId: string): ExamRow[] {
  return db
    .prepare(
      `SELECT e.course_code, c.name_th, c.name_en, e.datetime_start, e.datetime_end, e.slot, e.location
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
            name_en: nextExam.name_en,
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

  router.get("/calendar", (req, res) => {
    const month = (req.query.month as string) || bangkokToday().slice(0, 7);
    const term = currentTermId(db);

    const year = Number(month.slice(0, 4));
    const mon = Number(month.slice(5, 7));
    const firstDay = `${month}-01`;
    const lastDay = new Date(Date.UTC(year, mon, 0)).toISOString().slice(0, 10);

    const classes = weekClasses(db, term);
    const exams = termExams(db, term);

    type CalEvent = {
      type: "class" | "exam" | "task";
      course_code: string;
      name_th: string;
      name_en: string | null;
      start_time?: string;
      end_time?: string;
      room?: string | null;
      slot?: string | null;
      location?: string | null;
      task_type?: string;
      description?: string;
      done?: boolean;
    };

    const events: Record<string, CalEvent[]> = {};
    function push(date: string, ev: CalEvent) {
      (events[date] ??= []).push(ev);
    }

    // map weekday-based classes to actual dates in the month
    const d = new Date(`${firstDay}T00:00:00Z`);
    while (d.toISOString().slice(0, 10) <= lastDay) {
      const iso = d.toISOString().slice(0, 10);
      const wd = d.getUTCDay() === 0 ? 7 : d.getUTCDay(); // 1=Mon..7=Sun
      for (const c of classes) {
        if (c.weekday === wd) {
          push(iso, {
            type: "class",
            course_code: c.course_code,
            name_th: c.name_th,
            name_en: c.name_en,
            start_time: c.start_time,
            end_time: c.end_time,
            room: c.room,
          });
        }
      }
      d.setUTCDate(d.getUTCDate() + 1);
    }

    // exams in this month
    for (const e of exams) {
      const eDate = e.datetime_start.slice(0, 10);
      if (eDate >= firstDay && eDate <= lastDay) {
        push(eDate, {
          type: "exam",
          course_code: e.course_code,
          name_th: e.name_th,
          name_en: e.name_en,
          start_time: e.datetime_start.slice(11, 16),
          end_time: e.datetime_end.slice(11, 16),
          slot: e.slot,
          location: e.location,
        });
      }
    }

    // study tasks in this month (from active plan)
    const plan = db
      .prepare("SELECT id FROM study_plans WHERE status = 'active' ORDER BY id DESC LIMIT 1")
      .get() as { id: number } | undefined;
    if (plan) {
      const tasks = db
        .prepare(
          `SELECT st.course_code, c.name_th, c.name_en, st.date, st.task_type, st.description, st.done
           FROM study_tasks st
           JOIN courses c ON c.code = st.course_code
           WHERE st.plan_id = ? AND st.date >= ? AND st.date <= ?
           ORDER BY st.sort_order`,
        )
        .all(plan.id, firstDay, lastDay) as Array<{
        course_code: string;
        name_th: string;
        name_en: string | null;
        date: string;
        task_type: string;
        description: string;
        done: number;
      }>;
      for (const t of tasks) {
        push(t.date, {
          type: "task",
          course_code: t.course_code,
          name_th: t.name_th,
          name_en: t.name_en,
          task_type: t.task_type,
          description: t.description,
          done: t.done === 1,
        });
      }
    }

    res.json({ month, term, today: bangkokToday(), events });
  });

  router.get("/exams", (_req, res) => {
    const term = currentTermId(db);
    const today = bangkokToday();
    const exams = termExams(db, term).map((e) => ({
      course_code: e.course_code,
      name_th: e.name_th,
      name_en: e.name_en,
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
