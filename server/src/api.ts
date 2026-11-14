/**
 * Phase 2 API: Today, weekly schedule, and exams (with clash warnings).
 * All date logic is in Asia/Bangkok. Dates are stored/returned as ISO strings.
 */
import { Router } from "express";
import type { DB } from "./db.js";
import { itemsForToday, occurrencesInRange } from "./reminders.js";

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
export function getSetting(db: DB, key: string, fallback: string, userId?: string): string {
  if (userId) {
    const userRow = db.prepare("SELECT value FROM user_settings WHERE key = ? AND user_id = ?").get(key, userId) as
      | { value: string }
      | undefined;
    if (userRow) return userRow.value;
  }
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as
    | { value: string }
    | undefined;
  return row?.value ?? fallback;
}

export function setSetting(db: DB, key: string, value: string, userId?: string): void {
  if (userId) {
    db.prepare(
      `INSERT INTO user_settings (user_id, key, value) VALUES (?, ?, ?)
       ON CONFLICT(user_id, key) DO UPDATE SET value = excluded.value`,
    ).run(userId, key, value);
  } else {
    db.prepare(
      "INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    ).run(key, value);
  }
}

function currentTermId(db: DB): string {
  return getSetting(db, "current_term_id", "2/69");
}

// ---------- shared queries ----------
type CourseRow = { code: string; name_th: string; name_en: string | null; difficulty: number };

/** Real courses (not placeholders) planned in the current term for a user. */
function currentTermCourses(db: DB, termId: string, userId: string): CourseRow[] {
  return db
    .prepare(
      `SELECT c.code, c.name_th, c.name_en, c.difficulty
       FROM plan_items pi
       JOIN courses c ON c.code = pi.course_code
       WHERE pi.term_id = ? AND pi.user_id = ?
       ORDER BY c.code`,
    )
    .all(termId, userId) as CourseRow[];
}

/**
 * Weekly + daily study-hour target per course, using the points system:
 * difficulty 3=3pts, 2=2pts, 1=1pt. weekly_target_hours / total points =
 * hours per point; a course's weekly hours = its points × hours-per-point.
 */
export function studyTargets(db: DB, termId: string, userId: string) {
  const courses = currentTermCourses(db, termId, userId);
  const weeklyTarget = Number(getSetting(db, "weekly_target_hours", "36", userId));
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

/**
 * The timetable and exam data belong to Ramkhamhaeng only. A student who chose
 * another university at onboarding has no catalogue yet, so they get none of it.
 * (university_id is null for accounts created before the university step.)
 */
export function hasCatalog(db: DB, userId: string): boolean {
  const row = db.prepare("SELECT university_id FROM user_profiles WHERE user_id = ?").get(userId) as
    { university_id: string | null } | undefined;
  return !row?.university_id || row.university_id === "ru";
}

/**
 * SQL filter that keeps only courses in the student's own program (major).
 * Add `sql` to a WHERE clause and append `params` to the query's parameters.
 * Accounts with no program yet (never onboarded) are left unfiltered.
 */
export function programFilter(db: DB, userId: string, column: string): { sql: string; params: string[] } {
  const row = db.prepare("SELECT program_id FROM user_profiles WHERE user_id = ?").get(userId) as
    { program_id: string | null } | undefined;
  if (!row?.program_id) return { sql: "", params: [] };
  return {
    sql: ` AND ${column} IN (SELECT course_code FROM program_courses WHERE program_id = ?)`,
    params: [row.program_id],
  };
}

/** The courses a student has chosen for a term (plan_items), in code order. */
export function termCourses(db: DB, userId: string, termId: string): string[] {
  return (
    db
      .prepare("SELECT DISTINCT course_code FROM plan_items WHERE user_id = ? AND term_id = ? AND course_code IS NOT NULL ORDER BY course_code")
      .all(userId, termId) as { course_code: string }[]
  ).map((r) => r.course_code);
}

/**
 * SQL filter for "my courses this term": the courses the student has chosen
 * for the term, and nothing else. Until they choose, it keeps NOTHING: showing
 * every course of the major instead (as it once did) put some sixty classes
 * that were not theirs on a new student's timetable, and looked broken.
 */
export function myCoursesFilter(db: DB, userId: string, termId: string, column: string): { sql: string; params: string[] } {
  if (termCourses(db, userId, termId).length === 0) return { sql: " AND 0", params: [] };
  return {
    sql: ` AND ${column} IN (SELECT course_code FROM plan_items WHERE user_id = ? AND term_id = ? AND course_code IS NOT NULL)`,
    params: [userId, termId],
  };
}

export function weekClasses(db: DB, termId: string, userId: string): ClassRow[] {
  if (!hasCatalog(db, userId)) return [];
  const mine = myCoursesFilter(db, userId, termId, "cs.course_code");
  return db
    .prepare(
      `SELECT cs.course_code, c.name_th, c.name_en, cs.weekday, cs.start_time, cs.end_time, cs.room
       FROM class_sessions cs
       JOIN courses c ON c.code = cs.course_code
       WHERE cs.term_id = ?${mine.sql}
       ORDER BY cs.weekday, cs.start_time`,
    )
    .all(termId, ...mine.params) as ClassRow[];
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

export function termExams(db: DB, termId: string, userId: string): ExamRow[] {
  if (!hasCatalog(db, userId)) return [];
  const mine = myCoursesFilter(db, userId, termId, "e.course_code");
  return db
    .prepare(
      `SELECT e.course_code, c.name_th, c.name_en, e.datetime_start, e.datetime_end, e.slot, e.location
       FROM exams e
       JOIN courses c ON c.code = e.course_code
       WHERE e.term_id = ?${mine.sql}
       ORDER BY e.datetime_start`,
    )
    .all(termId, ...mine.params) as ExamRow[];
}

/**
 * The student's courses this term whose exam the university does NOT schedule:
 * the registrar prints "คณะจัดสอบเอง" (the faculty arranges it) instead of a date.
 * They have no row in `exams`, so without this list they would look exam-free.
 */
export function facultyArrangedExams(db: DB, termId: string, userId: string): Array<{ course_code: string; name_th: string; name_en: string | null; note: string }> {
  if (!hasCatalog(db, userId)) return [];
  const mine = myCoursesFilter(db, userId, termId, "o.course_code");
  return db
    .prepare(
      `SELECT o.course_code, c.name_th, c.name_en, o.exam_note AS note
       FROM term_offerings o JOIN courses c ON c.code = o.course_code
       WHERE o.term_id = ? AND o.exam_date IS NULL AND o.exam_note IS NOT NULL${mine.sql}
       ORDER BY o.course_code`,
    )
    .all(termId, ...mine.params) as Array<{ course_code: string; name_th: string; name_en: string | null; note: string }>;
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

function dueFlashcardCount(db: DB, today: string, userId: string): number {
  return (
    db.prepare("SELECT COUNT(*) n FROM flashcards WHERE next_review_date <= ? AND user_id = ?").get(today, userId) as {
      n: number;
    }
  ).n;
}

// ---------- routes ----------
export function createApiRouter(db: DB): Router {
  const router = Router();

  router.get("/today", (req, res) => {
    const userId = req.user!.id;
    const term = currentTermId(db);
    const today = bangkokToday();
    const weekday = bangkokWeekday();

    const todayClasses = weekClasses(db, term, userId).filter((c) => c.weekday === weekday);

    const exams = termExams(db, term, userId);
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
      dueFlashcards: dueFlashcardCount(db, today, userId),
      reminders: itemsForToday(db, userId, today),
      // How many courses the student chose for this term (0 = not chosen: the whole program shows).
      chosenCourses: termCourses(db, userId, term).length,
      canChooseCourses: hasCatalog(db, userId),
      studyTargets: studyTargets(db, term, userId),
    });
  });

  // --- the student's courses for the current term ---
  // `options` are the courses of their program that the university offers this
  // term (the registrar's record, term_offerings), with the registrar's note on
  // who may register; `chosen` is what they picked (empty = not chosen yet).
  router.get("/term-courses", (req, res) => {
    const userId = req.user!.id;
    const term = currentTermId(db);
    if (!hasCatalog(db, userId)) return res.json({ term, chosen: [], options: [] });
    const mine = programFilter(db, userId, "c.code");
    const options = db
      .prepare(
        `SELECT c.code, c.name_th, c.name_en, COALESCE(pc.category, c.category) AS category,
                (SELECT GROUP_CONCAT(cs.weekday || ' ' || cs.start_time || '-' || cs.end_time, ';')
                   FROM class_sessions cs WHERE cs.course_code = c.code AND cs.term_id = @term) AS classes,
                (SELECT o.notes FROM term_offerings o WHERE o.course_code = c.code AND o.term_id = @term) AS note
         FROM courses c
         LEFT JOIN program_courses pc ON pc.course_code = c.code
              AND pc.program_id = (SELECT program_id FROM user_profiles WHERE user_id = @user)
         WHERE (EXISTS (SELECT 1 FROM term_offerings o WHERE o.course_code = c.code AND o.term_id = @term)
             OR EXISTS (SELECT 1 FROM class_sessions cs WHERE cs.course_code = c.code AND cs.term_id = @term)
             OR EXISTS (SELECT 1 FROM exams e WHERE e.course_code = c.code AND e.term_id = @term))
           ${mine.sql.replace("?", "@program")}
         ORDER BY c.code`,
      )
      .all({ term, user: userId, program: mine.params[0] ?? null });
    res.json({ term, chosen: termCourses(db, userId, term), options });
  });

  // Replace the student's courses for the current term. Placeholders in the plan are kept.
  router.put("/term-courses", (req, res) => {
    const userId = req.user!.id;
    const term = currentTermId(db);
    const codes = req.body?.codes;
    if (!Array.isArray(codes) || codes.length > 40 || !codes.every((c) => typeof c === "string" && /^[A-Z]{3}\d{4}$/.test(c))) {
      return res.status(400).json({ error: "รายการวิชาไม่ถูกต้อง", code: "BAD_COURSES" });
    }
    const wanted = [...new Set(codes as string[])];
    const known = new Set(
      (db.prepare(`SELECT code FROM courses WHERE code IN (${wanted.map(() => "?").join(",") || "''"})`).all(...wanted) as { code: string }[]).map((r) => r.code),
    );
    if (wanted.some((c) => !known.has(c))) return res.status(400).json({ error: "ไม่พบบางวิชา", code: "BAD_COURSES" });
    if (!db.prepare("SELECT 1 FROM plan_terms WHERE term_id = ?").get(term)) {
      return res.status(400).json({ error: "ยังไม่มีข้อมูลภาคเรียนนี้", code: "NO_TERM" });
    }
    const tx = db.transaction(() => {
      db.prepare("DELETE FROM plan_items WHERE user_id = ? AND term_id = ? AND course_code IS NOT NULL").run(userId, term);
      const ins = db.prepare("INSERT INTO plan_items (user_id, term_id, course_code) VALUES (?, ?, ?)");
      for (const c of wanted) ins.run(userId, term, c);
    });
    tx();
    res.json({ term, chosen: termCourses(db, userId, term) });
  });

  router.get("/schedule/week", (req, res) => {
    const term = currentTermId(db);
    // `chosen` lets the screen tell "pick your courses first" from "no class this week".
    res.json({ term, classes: weekClasses(db, term, req.user!.id), chosen: termCourses(db, req.user!.id, term).length > 0 });
  });

  router.get("/calendar", (req, res) => {
    const userId = req.user!.id;
    const month = (req.query.month as string) || bangkokToday().slice(0, 7);
    const term = currentTermId(db);

    const year = Number(month.slice(0, 4));
    const mon = Number(month.slice(5, 7));
    const firstDay = `${month}-01`;
    const lastDay = new Date(Date.UTC(year, mon, 0)).toISOString().slice(0, 10);

    const classes = weekClasses(db, term, userId);
    const exams = termExams(db, term, userId);

    // term date boundaries: classes run from start_date to day before first exam
    const termRow = db
      .prepare("SELECT start_date FROM plan_terms WHERE term_id = ?")
      .get(term) as { start_date: string | null } | undefined;
    const termStart = termRow?.start_date ?? null;
    const firstExamDate = exams.length > 0 ? exams[0].datetime_start.slice(0, 10) : null;

    type CalEvent = {
      type: "class" | "exam" | "task" | "etesting" | "reminder" | "todo" | "event";
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
      note?: string | null;
      event_id?: number;
      reminder_id?: number;
      repeat?: string;
    };

    const events: Record<string, CalEvent[]> = {};
    function push(date: string, ev: CalEvent) {
      (events[date] ??= []).push(ev);
    }

    // map weekday-based classes to actual dates in the month (only within term)
    const d = new Date(`${firstDay}T00:00:00Z`);
    while (d.toISOString().slice(0, 10) <= lastDay) {
      const iso = d.toISOString().slice(0, 10);
      if (termStart && iso < termStart) { d.setUTCDate(d.getUTCDate() + 1); continue; }
      if (firstExamDate && iso >= firstExamDate) { d.setUTCDate(d.getUTCDate() + 1); continue; }
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
      .prepare("SELECT id FROM study_plans WHERE status = 'active' AND user_id = ? ORDER BY id DESC LIMIT 1")
      .get(userId) as { id: number } | undefined;
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

    // e-Testing exam period events
    const etestingSched = db.prepare("SELECT * FROM etesting_schedule WHERE term_id = ?").get(term) as
      { exam_start: string; exam_end: string } | undefined;
    if (etestingSched) {
      const eStart = etestingSched.exam_start;
      const eEnd = etestingSched.exam_end;
      if (eStart <= lastDay && eEnd >= firstDay) {
        const regStart = eStart < firstDay ? firstDay : eStart;
        const regEnd = eEnd > lastDay ? lastDay : eEnd;
        const ed = new Date(`${regStart}T00:00:00Z`);
        const regEndD = new Date(`${regEnd}T00:00:00Z`);
        while (ed <= regEndD) {
          const iso = ed.toISOString().slice(0, 10);
          push(iso, {
            type: "etesting",
            course_code: "",
            name_th: "ช่วงสอบ e-Testing",
            name_en: "e-Testing exam period",
            description: "09:00–20:30",
          });
          ed.setUTCDate(ed.getUTCDate() + 1);
        }
      }
    }

    // the student's reminders, to-dos and events (repeating ones are expanded per day)
    for (const [date, list] of Object.entries(occurrencesInRange(db, userId, firstDay, lastDay))) {
      for (const o of list) {
        push(date, {
          type: o.kind,
          course_code: "",
          name_th: o.title,
          name_en: null,
          start_time: o.time ?? undefined,
          end_time: o.end_time ?? undefined,
          note: o.note,
          description: o.course_code ?? undefined,
          done: o.done,
          reminder_id: o.id,
          repeat: o.repeat,
        });
      }
    }

    // Within a day: earliest first; things with no time go last.
    for (const list of Object.values(events)) {
      list.sort((a, b) => (a.start_time ?? "99:99").localeCompare(b.start_time ?? "99:99"));
    }

    res.json({ month, term, today: bangkokToday(), events });
  });

  router.get("/exams", (req, res) => {
    const userId = req.user!.id;
    const term = currentTermId(db);
    const today = bangkokToday();
    const exams = termExams(db, term, userId).map((e) => ({
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
    // `chosen` lets the screen tell "pick your courses first" from "no exam".
    const chosen = termCourses(db, userId, term).length > 0;
    res.json({
      term, today, exams, chosen,
      clashes: chosen ? findExamClashes(termExams(db, term, userId)) : [],
      facultyArranged: facultyArrangedExams(db, term, userId),
    });
  });

  // ── Custom events CRUD ──
  // ── Fee structure + cost calculator ──
  router.get("/fees", (_req, res) => {
    const fees = db.prepare("SELECT * FROM fee_structure ORDER BY category, campus").all();
    res.json(fees);
  });

  router.get("/cost-estimate", (req, res) => {
    const userId = req.user!.id;
    const campus = (req.query.campus as string) ?? "central";
    const numCourses = Number(req.query.courses ?? 7);
    const numEtesting = Number(req.query.etesting ?? 0);
    const numRetake = Number(req.query.retake ?? 0);
    const creditsPerCourse = Number(req.query.credits_per_course ?? 3);

    const totalCredits = numCourses * creditsPerCourse;
    const creditFee = campus === "regional" ? 50 : 25;
    const termMaintenance = campus === "regional" ? 600 : 800;
    const itFee = 100;
    const examFee = campus === "regional" ? 60 * numCourses : 0;
    const etestingFee = numEtesting * (campus === "regional" ? 300 : 200);
    const retakeFee = numRetake * 60;

    const semesterCost = totalCredits * creditFee + termMaintenance + itFee + examFee + etestingFee + retakeFee;

    const profileRow = db.prepare("SELECT program_id FROM user_profiles WHERE user_id = ?").get(userId) as
      { program_id: string | null } | undefined;
    const programId = profileRow?.program_id;
    let requiredCredits = 132;
    if (programId) {
      const req2 = db.prepare("SELECT SUM(required_credits) AS total FROM program_credit_requirements WHERE program_id = ?")
        .get(programId) as { total: number | null } | undefined;
      if (req2?.total) requiredCredits = req2.total;
    }

    const targetYearsRow = db.prepare("SELECT target_years FROM user_profiles WHERE user_id = ?").get(userId) as
      { target_years: number | null } | undefined;
    const targetYears = targetYearsRow?.target_years ?? 4;
    const totalTerms = targetYears * 2;
    const enrollmentFees = campus === "regional" ? 1700 : 2300;
    const totalProjection = enrollmentFees + totalTerms * (termMaintenance + itFee);

    res.json({
      campus,
      semester: {
        courses: numCourses,
        credits: totalCredits,
        credit_fee: totalCredits * creditFee,
        maintenance: termMaintenance,
        it_fee: itFee,
        exam_fee: examFee,
        etesting_fee: etestingFee,
        retake_fee: retakeFee,
        total: semesterCost,
      },
      projection: {
        required_credits: requiredCredits,
        target_years: targetYears,
        total_terms: totalTerms,
        enrollment_fees: enrollmentFees,
        term_fees_total: totalTerms * (termMaintenance + itFee),
        total_estimate: totalProjection,
      },
    });
  });

  return router;
}
