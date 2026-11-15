/**
 * Phase 3: Study planner — backward scheduling from exam dates.
 * Algorithm: reserve last 7 days before each exam for review/mock only,
 * distribute reading across earlier days weighted by chapter weakness.
 * 20% buffer kept unscheduled. Auto-reschedule on missed tasks.
 */
import { Router } from "express";
import type { DB } from "./db.js";
import { bangkokToday, daysBetween, addDaysISO, getSetting, setSetting, hasCatalog } from "./api.js";
import { myExams, type ExamKind } from "./myExams.js";
import { occurrencesInRange } from "./reminders.js";

// ---- types ----

type PlanSettings = {
  weekday_hours: number;
  weekend_hours: number;
  reading_speed: number; // pages/hour
  blocked_dates: string[]; // YYYY-MM-DD[]
  /** Hours on a long day: one with LONG_DAY_HOURS or more of her own timed events (a work shift). */
  workday_hours: number;
};
/** Her own events adding up to this many hours make a "long day" (owner 2026-11-15: a working student's shift days). */
export const LONG_DAY_HOURS = 6;
/** A mock exam is about as long as a final's period (A 09:30-12:00: two and a half hours). */
const MOCK_MINUTES = 150;

type ChapterInfo = {
  id: number;
  course_code: string;
  name: string;
  sort_order: number;
  page_count: number;
  mastery: number; // 0-100, from chapter_mastery or 0 if unknown
};

type CourseExam = {
  course_code: string;
  name_th: string;
  name_en: string | null;
  exam_date: string; // YYYY-MM-DD: the next exam to prepare for (myExams.ts)
  exam_kind: ExamKind; // a booked e-Test, the final, or a date she entered
  chapters: ChapterInfo[];
  total_pages: number;
};

type TaskInsert = {
  course_code: string;
  date: string;
  task_type: "read" | "quiz" | "review" | "mock";
  chapter_id: number | null;
  description: string;
  page_start: number | null;
  page_end: number | null;
  minutes: number;
  sort_order: number;
};

// ---- helpers ----

function getSettings(db: DB, userId: string): PlanSettings {
  return {
    weekday_hours: Number(getSetting(db, "sp_weekday_hours", "2", userId)),
    weekend_hours: Number(getSetting(db, "sp_weekend_hours", "5", userId)),
    reading_speed: Number(getSetting(db, "sp_reading_speed", "10", userId)),
    blocked_dates: JSON.parse(getSetting(db, "sp_blocked_dates", "[]", userId)) as string[],
    workday_hours: Number(getSetting(db, "sp_workday_hours", "1", userId)),
  };
}

function saveSettings(db: DB, s: Partial<PlanSettings>, userId: string): void {
  if (s.weekday_hours != null) setSetting(db, "sp_weekday_hours", String(s.weekday_hours), userId);
  if (s.weekend_hours != null) setSetting(db, "sp_weekend_hours", String(s.weekend_hours), userId);
  if (s.reading_speed != null) setSetting(db, "sp_reading_speed", String(s.reading_speed), userId);
  if (s.blocked_dates != null) setSetting(db, "sp_blocked_dates", JSON.stringify(s.blocked_dates), userId);
  if (s.workday_hours != null) setSetting(db, "sp_workday_hours", String(s.workday_hours), userId);
}

/** Is the date a weekend (Sat=6, Sun=7)? */
function isWeekend(dateStr: string): boolean {
  const d = new Date(`${dateStr}T12:00:00Z`);
  const day = d.getUTCDay(); // 0=Sun, 6=Sat
  return day === 0 || day === 6;
}

/**
 * Minutes she can study on each day from `from` to `to` (after a 20% buffer): her weekday or
 * weekend hours; on a day off, none; on a long day (her own timed events, such as a work shift,
 * add up to LONG_DAY_HOURS or more), her hours for a long day.
 */
export function dayCapacity(db: DB, userId: string, settings: PlanSettings, from: string, to: string): Record<string, number> {
  const out: Record<string, number> = {};
  if (to < from) return out;
  const busy: Record<string, number> = {};
  for (const [date, list] of Object.entries(occurrencesInRange(db, userId, from, to))) {
    for (const o of list) {
      if (o.kind !== "event" || !o.time || !o.end_time) continue;
      const [h1, m1] = o.time.split(":").map(Number), [h2, m2] = o.end_time.split(":").map(Number);
      busy[date] = (busy[date] ?? 0) + Math.max(0, h2 * 60 + m2 - (h1 * 60 + m1));
    }
  }
  for (let d = from; d <= to; d = addDaysISO(d, 1)) {
    const hours = settings.blocked_dates.includes(d) ? 0
      : (busy[d] ?? 0) >= LONG_DAY_HOURS * 60 ? Math.min(settings.workday_hours, isWeekend(d) ? settings.weekend_hours : settings.weekday_hours)
      : isWeekend(d) ? settings.weekend_hours : settings.weekday_hours;
    out[d] = Math.floor(hours * 60 * 0.8);
  }
  return out;
}

/** Her hours for a date before any events: 0 on a day off. */
function availableOn(settings: PlanSettings, date: string): number {
  return settings.blocked_dates.includes(date) ? 0 : isWeekend(date) ? settings.weekend_hours : settings.weekday_hours;
}

/** Get courses with upcoming exams and their chapters. */
function getCoursesForPlanning(db: DB, today: string, userId: string): CourseExam[] {
  if (!hasCatalog(db, userId)) return [];
  // The next exam of each of her courses this term, after today: a booked e-Test before the final.
  const unique = myExams(db, userId, undefined, addDaysISO(today, 1))
    .filter((e) => e.next)
    .map((e) => ({ course_code: e.course_code, name_th: e.name_th, name_en: e.name_en, exam_date: e.next!.date, exam_kind: e.next!.kind }))
    .sort((a, b) => a.exam_date.localeCompare(b.exam_date) || a.course_code.localeCompare(b.course_code));

  return unique.map((e) => {
    const chapters = db.prepare(
      `SELECT ch.id, ch.course_code, ch.name, ch.sort_order,
              COALESCE(ch.page_count,
                (SELECT SUM(mc.end_page - mc.start_page + 1)
                 FROM material_chunks mc WHERE mc.chapter_id = ch.id), 20) AS page_count,
              COALESCE(cm.mastery_score, 0) AS mastery
       FROM chapters ch
       LEFT JOIN chapter_mastery cm ON cm.chapter_id = ch.id AND cm.course_code = ch.course_code AND cm.user_id = ?
       WHERE ch.course_code = ? AND ch.user_id = ?
       ORDER BY ch.sort_order ASC`,
    ).all(userId, e.course_code, userId) as ChapterInfo[];

    const total_pages = chapters.reduce((sum, ch) => sum + ch.page_count, 0);
    return { ...e, chapters, total_pages };
  });
}

// ---- scheduling algorithm ----

/** A task done in an earlier plan, by what it was (a chapter's pages, a chapter's quiz). */
const doneKey = (t: { task_type: string; chapter_id: number | null; page_start: number | null; page_end: number | null }) =>
  `${t.task_type}|${t.chapter_id}|${t.page_start}|${t.page_end}`;

function generatePlan(db: DB, userId: string, done: Set<string> = new Set()): {
  tasks: TaskInsert[];
  feasibility: "ok" | "tight" | "impossible";
  warnings: string[];
} {
  const today = bangkokToday();
  const settings = getSettings(db, userId);
  const courses = getCoursesForPlanning(db, today, userId);
  const warnings: string[] = [];

  if (courses.length === 0) {
    return { tasks: [], feasibility: "ok", warnings: ["ไม่พบวิชาที่มีตารางสอบข้างหน้า"] };
  }

  // Build per-course work items: reading segments + quiz per chapter
  type WorkItem = {
    course_code: string;
    chapter_id: number;
    chapter_name: string;
    task_type: "read" | "quiz";
    page_start: number | null;
    page_end: number | null;
    minutes: number;
    weight: number; // higher = more urgent/weak
    description: string;
  };

  const allWork: WorkItem[] = [];
  const courseDeadlines: Record<string, string> = {}; // study deadline = exam_date - 8

  for (const course of courses) {
    const studyDeadline = addDaysISO(course.exam_date, -8);
    courseDeadlines[course.course_code] = studyDeadline;
    const daysAvailable = daysBetween(today, studyDeadline);

    if (daysAvailable <= 0) {
      warnings.push(`${course.course_code}: เหลือไม่ถึง 8 วัน → เข้าช่วงทบทวนแล้ว`);
      continue;
    }

    for (const ch of course.chapters) {
      const weaknessMultiplier = ch.mastery < 40 ? 1.5 : ch.mastery < 70 ? 1.2 : 1.0;
      const readMinutes = Math.ceil((ch.page_count / settings.reading_speed) * 60);
      const quizMinutes = 20;

      // Split reading into ~45-min chunks
      const chunkSize = Math.ceil(settings.reading_speed * 0.75); // pages per 45-min chunk
      let pageOffset = 1;
      while (pageOffset <= ch.page_count) {
        const end = Math.min(pageOffset + chunkSize - 1, ch.page_count);
        const chunkPages = end - pageOffset + 1;
        const mins = Math.ceil((chunkPages / settings.reading_speed) * 60);
        // Already read in an earlier plan: not planned again.
        if (done.has(doneKey({ task_type: "read", chapter_id: ch.id, page_start: pageOffset, page_end: end }))) { pageOffset = end + 1; continue; }
        allWork.push({
          course_code: course.course_code,
          chapter_id: ch.id,
          chapter_name: ch.name,
          task_type: "read",
          page_start: pageOffset,
          page_end: end,
          minutes: Math.max(mins, 15),
          weight: weaknessMultiplier * (1 / Math.max(daysAvailable, 1)),
          description: `อ่าน ${ch.name} หน้า ${pageOffset}–${end} (${mins} นาที)`,
        });
        pageOffset = end + 1;
      }

      // Quiz after reading a chapter
      if (!done.has(doneKey({ task_type: "quiz", chapter_id: ch.id, page_start: null, page_end: null }))) allWork.push({
        course_code: course.course_code,
        chapter_id: ch.id,
        chapter_name: ch.name,
        task_type: "quiz",
        page_start: null,
        page_end: null,
        minutes: quizMinutes,
        weight: weaknessMultiplier * (1 / Math.max(daysAvailable, 1)),
        description: `ทำควิซ ${ch.name} (${quizMinutes} นาที)`,
      });
    }
  }

  // Sort work items: higher weight first (more urgent/weak chapters first)
  allWork.sort((a, b) => b.weight - a.weight);

  // Her minutes for each day from tomorrow to the day before the last exam: shifts, days off and
  // a 20% buffer already taken off (dayCapacity). Every task below comes out of the same budget,
  // so two courses never stack more on one day than she has.
  const tasks: TaskInsert[] = [];
  let sortCounter = 0;
  const unplaced: WorkItem[] = [];
  const lastExam = courses.map((c) => c.exam_date).sort().pop() ?? today;
  const dayMinutes = dayCapacity(db, userId, settings, addDaysISO(today, 1), addDaysISO(lastExam, -1));
  let squeezed = 0; // review days that had no time left

  // The week before each exam first, earliest exam first: it is fixed to its days, while reading
  // can move earlier. Days -7 to -3: flashcards and a review quiz; -2 and -1: a mock exam.
  for (const course of courses) {
    for (let i = 7; i >= 1; i--) {
      const reviewDate = addDaysISO(course.exam_date, -i);
      if (reviewDate <= today || !(reviewDate in dayMinutes)) continue;
      let rem = dayMinutes[reviewDate];
      if (rem < 15) { if (availableOn(settings, reviewDate) > 0) squeezed++; continue; }
      const add = (task_type: TaskInsert["task_type"], minutes: number, description: string) => {
        tasks.push({ course_code: course.course_code, date: reviewDate, task_type, chapter_id: null, description, page_start: null, page_end: null, minutes, sort_order: sortCounter++ });
        rem -= minutes;
      };
      if (i >= 3) {
        add("review", Math.min(30, rem), `ทบทวนการ์ด ${course.course_code} (25 ใบ)`);
        if (rem >= 15) { const m = Math.min(rem, 40); add("quiz", m, `ทำควิซทบทวน ${course.course_code} (${m} นาที)`); }
      } else {
        const m = Math.min(rem, MOCK_MINUTES);
        add("mock", m, `สอบจำลอง ${course.course_code} (${m} นาที)`);
      }
      dayMinutes[reviewDate] = rem;
    }
  }

  // Reading, round-robin across courses, day by day, each up to its own deadline (8 days before
  // its exam), in what is left of each day.
  const workByCourse: Record<string, WorkItem[]> = {};
  for (const w of allWork) (workByCourse[w.course_code] ??= []).push(w);
  const courseKeys = Object.keys(workByCourse);
  const courseQueues: Record<string, WorkItem[]> = {};
  for (const ck of courseKeys) {
    // Keep chapter order: sort by chapter sort_order, then read before quiz
    courseQueues[ck] = workByCourse[ck].sort((a, b) => {
      const chA = courses.find((c) => c.course_code === ck)?.chapters.find((ch) => ch.id === a.chapter_id);
      const chB = courses.find((c) => c.course_code === ck)?.chapters.find((ch) => ch.id === b.chapter_id);
      const orderA = chA?.sort_order ?? 0;
      const orderB = chB?.sort_order ?? 0;
      if (orderA !== orderB) return orderA - orderB;
      if (a.task_type !== b.task_type) return a.task_type === "read" ? -1 : 1;
      return (a.page_start ?? 0) - (b.page_start ?? 0);
    });
  }
  for (const date of Object.keys(dayMinutes).sort()) {
    let remaining = dayMinutes[date];
    for (const ck of courseKeys) {
      const deadline = courseDeadlines[ck];
      if (!deadline || date > deadline) continue;
      const queue = courseQueues[ck];
      while (queue.length > 0 && remaining >= 15) {
        const item = queue[0];
        if (item.minutes > remaining) break;
        tasks.push({
          course_code: item.course_code, date, task_type: item.task_type, chapter_id: item.chapter_id,
          description: item.description, page_start: item.page_start, page_end: item.page_end,
          minutes: item.minutes, sort_order: sortCounter++,
        });
        remaining -= item.minutes;
        queue.shift();
      }
    }
    dayMinutes[date] = remaining;
  }
  for (const ck of courseKeys) if (courseQueues[ck].length > 0) unplaced.push(...courseQueues[ck]);
  if (squeezed > 0) warnings.push(`วันทบทวน ${squeezed} วันไม่มีเวลาเหลือ เพราะสอบหลายวิชาใกล้กัน`);

  // Determine feasibility
  let feasibility: "ok" | "tight" | "impossible" = "ok";
  if (unplaced.length > 0) {
    const unplacedMinutes = unplaced.reduce((s, w) => s + w.minutes, 0);
    const totalMinutes = allWork.reduce((s, w) => s + w.minutes, 0);
    if (unplacedMinutes > totalMinutes * 0.3) {
      feasibility = "impossible";
      const unplacedCourses = [...new Set(unplaced.map((w) => w.course_code))];
      warnings.push(
        `เวลาไม่พอ: ยังเหลืองานอีก ${Math.round(unplacedMinutes / 60)} ชม. ไม่ได้จัด ` +
          `(วิชา ${unplacedCourses.join(", ")}). ลองเพิ่มชั่วโมงอ่าน หรือตัดบทที่ออกน้อย`,
      );
    } else {
      feasibility = "tight";
      warnings.push(`แผนแน่น: มีงานอีก ${Math.round(unplacedMinutes / 60)} ชม. ที่ยังจัดไม่ลง — ใช้เวลาสำรองได้`);
    }
  }

  return { tasks, feasibility, warnings };
}

// ---- ICS export ----

function escapeICS(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\n/g, "\\n");
}

function tasksToICS(
  db: DB,
  tasks: Array<{ date: string; description: string; minutes: number; course_code: string; task_type: string }>,
): string {
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//StudyOS//Study Planner//TH",
    "CALSCALE:GREGORIAN",
    "X-WR-CALNAME:StudyOS แผนอ่าน",
    "X-WR-TIMEZONE:Asia/Bangkok",
  ];

  // Group tasks by date, create one event per task
  let startHour = 19; // default start at 19:00 on weekdays
  for (const t of tasks) {
    const isWE = isWeekend(t.date);
    startHour = isWE ? 9 : 19;

    const dateClean = t.date.replace(/-/g, "");
    const endMinutes = startHour * 60 + t.minutes;
    const endH = String(Math.floor(endMinutes / 60)).padStart(2, "0");
    const endM = String(endMinutes % 60).padStart(2, "0");
    const startH = String(startHour).padStart(2, "0");

    lines.push(
      "BEGIN:VEVENT",
      `DTSTART;TZID=Asia/Bangkok:${dateClean}T${startH}0000`,
      `DTEND;TZID=Asia/Bangkok:${dateClean}T${endH}${endM}00`,
      `SUMMARY:${escapeICS(t.description)}`,
      `DESCRIPTION:${escapeICS(`${t.course_code} · ${t.task_type}`)}`,
      `UID:studyos-${t.date}-${t.course_code}-${startHour}@studyos`,
      "END:VEVENT",
    );
    startHour = Math.floor(endMinutes / 60);
  }

  lines.push("END:VCALENDAR");
  return lines.join("\r\n");
}

// ---- course status ----

type CourseStatus = {
  course_code: string;
  name_th: string;
  exam_date: string;
  days_left: number;
  total_tasks: number;
  done_tasks: number;
  total_minutes: number;
  done_minutes: number;
  overdue_tasks: number;
  status: "on_track" | "behind" | "critical";
  extra_hours_needed: number; // hours/day extra needed to catch up
};

function getCourseStatuses(db: DB, userId: string, planId: number, today: string): CourseStatus[] {
  // Each course's next exam (a booked e-Test before the final), else its final.
  const examOf = new Map(myExams(db, userId, undefined, today).map((e) => [e.course_code, e.next?.date ?? e.final?.date ?? e.own?.date ?? null]));
  const rows = db.prepare(
    `SELECT st.course_code, c.name_th,
            NULL AS exam_date,
            COUNT(*) AS total_tasks,
            SUM(CASE WHEN st.done = 1 THEN 1 ELSE 0 END) AS done_tasks,
            SUM(st.minutes) AS total_minutes,
            SUM(CASE WHEN st.done = 1 THEN st.minutes ELSE 0 END) AS done_minutes,
            SUM(CASE WHEN st.done = 0 AND st.date < ? THEN 1 ELSE 0 END) AS overdue_tasks
     FROM study_tasks st
     JOIN courses c ON c.code = st.course_code
     WHERE st.plan_id = ?
     GROUP BY st.course_code`,
  ).all(today, planId) as Array<{
    course_code: string; name_th: string; exam_date: string;
    total_tasks: number; done_tasks: number; total_minutes: number;
    done_minutes: number; overdue_tasks: number;
  }>;

  // Only courses she still takes this term, with an exam on record.
  return rows.filter((r) => examOf.get(r.course_code)).map((r0) => {
    const r = { ...r0, exam_date: examOf.get(r0.course_code)! };
    const daysLeft = daysBetween(today, r.exam_date);
    const remainingMinutes = r.total_minutes - r.done_minutes;
    const minutesPerDay = daysLeft > 0 ? remainingMinutes / daysLeft : remainingMinutes;
    const expectedProgress = r.total_tasks > 0 ? r.done_tasks / r.total_tasks : 1;
    const timeProgress = daysBetween(today, r.exam_date) > 0 ? 1 - (daysLeft / daysBetween(bangkokToday(), r.exam_date)) : 1;

    let status: "on_track" | "behind" | "critical" = "on_track";
    let extraHours = 0;

    if (r.overdue_tasks > 3) {
      status = "behind";
      extraHours = Math.max(0, (minutesPerDay - 120) / 60); // assume 2h/day base
    }
    if (r.overdue_tasks > 7 || (daysLeft < 14 && expectedProgress < 0.3)) {
      status = "critical";
      extraHours = Math.max(0, (minutesPerDay - 120) / 60);
    }

    return {
      course_code: r.course_code,
      name_th: r.name_th,
      exam_date: r.exam_date,
      days_left: daysLeft,
      total_tasks: r.total_tasks,
      done_tasks: r.done_tasks,
      total_minutes: r.total_minutes,
      done_minutes: r.done_minutes,
      overdue_tasks: r.overdue_tasks,
      status,
      extra_hours_needed: Math.round(extraHours * 10) / 10,
    };
  });
}

// ---- out of date ----

/**
 * What a plan was made from: her settings, her courses' next exams (e-Test, final, or her own
 * date), their chapters and pages, and which days are long days or days off. If any of it changes
 * after the plan was made, the plan is out of date and the screen offers to update it.
 */
function planFingerprint(db: DB, userId: string, from: string): string {
  const settings = getSettings(db, userId);
  const courses = getCoursesForPlanning(db, from, userId);
  const last = courses.map((c) => c.exam_date).sort().pop() ?? from;
  return JSON.stringify({
    settings,
    courses: courses.map((c) => [c.course_code, c.exam_date, c.exam_kind, c.chapters.map((ch) => [ch.id, ch.page_count])]),
    capacity: dayCapacity(db, userId, settings, addDaysISO(from, 1), addDaysISO(last, -1)),
  });
}
function planIsStale(db: DB, userId: string, plan: { generated_at: string; settings_json: string | null }, today: string): boolean {
  let saved: string | undefined;
  try { saved = (JSON.parse(plan.settings_json ?? "{}") as { fingerprint?: string }).fingerprint; } catch { /* old plan */ }
  // A plan made before plans kept this record: it cannot be compared, so it is not called stale.
  if (!saved) return false;
  if (saved !== planFingerprint(db, userId, plan.generated_at)) return true;
  // An exam it planned for has gone (an e-Test day), and that course has another exam ahead (the
  // final, if she still sits it): the plan has nothing for it.
  const planned = new Map((JSON.parse(saved) as { courses: [string, string][] }).courses.map(([c, d]) => [c, d]));
  return getCoursesForPlanning(db, addDaysISO(today, -1), userId).some((c) => planned.has(c.course_code) && planned.get(c.course_code)! < today && c.exam_date > planned.get(c.course_code)!);
}

// ---- router ----

export function createStudyPlanRouter(db: DB): Router {
  const router = Router();

  // Get planner settings
  router.get("/studyplan/settings", (req, res) => {
    const userId = req.user!.id;
    res.json(getSettings(db, userId));
  });

  // Update planner settings
  router.put("/studyplan/settings", (req, res) => {
    const userId = req.user!.id;
    const { weekday_hours, weekend_hours, reading_speed, blocked_dates, workday_hours } = req.body;
    const update: Partial<PlanSettings> = {};
    if (weekday_hours != null && weekday_hours >= 0.5 && weekday_hours <= 12) update.weekday_hours = weekday_hours;
    if (weekend_hours != null && weekend_hours >= 0.5 && weekend_hours <= 16) update.weekend_hours = weekend_hours;
    if (reading_speed != null && reading_speed >= 1 && reading_speed <= 100) update.reading_speed = reading_speed;
    if (Array.isArray(blocked_dates)) update.blocked_dates = [...new Set(blocked_dates.filter((d: unknown): d is string => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d)))].sort().slice(0, 366);
    if (workday_hours != null && workday_hours >= 0 && workday_hours <= 12) update.workday_hours = workday_hours;
    saveSettings(db, update, userId);
    res.json({ ok: true, ...getSettings(db, userId) });
  });

  // List courses available for planning (with exam + chapters)
  router.get("/studyplan/courses", (req, res) => {
    const userId = req.user!.id;
    const today = bangkokToday();
    const courses = getCoursesForPlanning(db, today, userId);
    res.json({ courses, today });
  });

  // Update a chapter's page count
  router.put("/studyplan/chapters/:id", (req, res) => {
    const userId = req.user!.id;
    const id = Number(req.params.id);
    const pageCount = Number(req.body.page_count);
    if (!pageCount || pageCount < 1) return res.status(400).json({ error: "page_count ต้อง >= 1" });
    db.prepare("UPDATE chapters SET page_count = ? WHERE id = ? AND user_id = ?").run(pageCount, id, userId);
    res.json({ ok: true });
  });

  // Generate a new study plan
  router.post("/studyplan/generate", (req, res) => {
    const userId = req.user!.id;
    const today = bangkokToday();

    // What she has already ticked in the plan being replaced is kept, and not planned again.
    const old = db.prepare("SELECT id FROM study_plans WHERE status = 'active' AND user_id = ? ORDER BY id DESC LIMIT 1").get(userId) as { id: number } | undefined;
    const doneBefore = old
      ? (db.prepare("SELECT * FROM study_tasks WHERE plan_id = ? AND done = 1").all(old.id) as Array<TaskInsert & { done_at: string | null; chapter_id: number | null }>)
      : [];
    // Archive any existing active plan
    db.prepare("UPDATE study_plans SET status = 'archived' WHERE status = 'active' AND user_id = ?").run(userId);

    const { tasks, feasibility, warnings } = generatePlan(db, userId, new Set(doneBefore.filter((t) => t.chapter_id != null).map(doneKey)));
    const settings = getSettings(db, userId);

    const result = db.prepare(
      `INSERT INTO study_plans (user_id, status, generated_at, settings_json, feasibility, warnings_json)
       VALUES (?, 'active', ?, ?, ?, ?)`,
    ).run(userId, today, JSON.stringify({ ...settings, fingerprint: planFingerprint(db, userId, today) }), feasibility, JSON.stringify(warnings));

    const planId = result.lastInsertRowid as number;
    const keep = db.prepare(
      `INSERT INTO study_tasks (plan_id, course_code, date, task_type, chapter_id, description, page_start, page_end, minutes, sort_order, done, done_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    );
    for (const t of doneBefore) keep.run(planId, t.course_code, t.date, t.task_type, t.chapter_id, t.description, t.page_start, t.page_end, t.minutes, -1, t.done_at);

    const insert = db.prepare(
      `INSERT INTO study_tasks (plan_id, course_code, date, task_type, chapter_id, description, page_start, page_end, minutes, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );

    const insertMany = db.transaction((items: TaskInsert[]) => {
      for (const t of items) {
        insert.run(planId, t.course_code, t.date, t.task_type, t.chapter_id, t.description, t.page_start, t.page_end, t.minutes, t.sort_order);
      }
    });
    insertMany(tasks);

    res.json({ planId, taskCount: tasks.length, feasibility, warnings });
  });

  // Get active plan
  router.get("/studyplan", (req, res) => {
    const userId = req.user!.id;
    const plan = db.prepare("SELECT * FROM study_plans WHERE status = 'active' AND user_id = ? ORDER BY id DESC LIMIT 1").get(userId) as
      | { id: number; status: string; generated_at: string; feasibility: string; warnings_json: string; settings_json: string | null }
      | undefined;

    if (!plan) return res.json({ plan: null, tasks: [], statuses: [] });

    const today = bangkokToday();
    const tasks = db.prepare(
      `SELECT st.*, ch.name AS chapter_name, c.name_th AS course_name
       FROM study_tasks st
       LEFT JOIN chapters ch ON ch.id = st.chapter_id
       JOIN courses c ON c.code = st.course_code
       WHERE st.plan_id = ?
       ORDER BY st.date ASC, st.sort_order ASC`,
    ).all(plan.id);

    const statuses = getCourseStatuses(db, userId, plan.id, today);

    res.json({
      plan: {
        id: plan.id,
        generated_at: plan.generated_at,
        feasibility: plan.feasibility,
        warnings: JSON.parse(plan.warnings_json || "[]"),
        stale: planIsStale(db, userId, plan, today),
      },
      tasks,
      statuses,
      today,
    });
  });

  // Toggle task done/undone
  router.post("/studyplan/tasks/:id/toggle", (req, res) => {
    const userId = req.user!.id;
    const id = Number(req.params.id);
    const task = db.prepare(
      `SELECT st.id, st.done FROM study_tasks st
       JOIN study_plans sp ON sp.id = st.plan_id
       WHERE st.id = ? AND sp.user_id = ?`,
    ).get(id, userId) as { id: number; done: number } | undefined;
    if (!task) return res.status(404).json({ error: "ไม่พบงานนี้" });

    const newDone = task.done ? 0 : 1;
    const doneAt = newDone ? new Date().toISOString() : null;
    db.prepare("UPDATE study_tasks SET done = ?, done_at = ? WHERE id = ?").run(newDone, doneAt, id);
    res.json({ id, done: newDone });
  });

  // Reschedule: move overdue undone tasks to future dates
  router.post("/studyplan/reschedule", (req, res) => {
    const userId = req.user!.id;
    const plan = db.prepare("SELECT id FROM study_plans WHERE status = 'active' AND user_id = ? ORDER BY id DESC LIMIT 1").get(userId) as { id: number } | undefined;
    if (!plan) return res.status(404).json({ error: "ไม่มีแผนที่ใช้งานอยู่" });

    const today = bangkokToday();
    const settings = getSettings(db, userId);

    // Get overdue undone tasks
    const overdue = db.prepare(
      `SELECT * FROM study_tasks WHERE plan_id = ? AND done = 0 AND date < ? ORDER BY date ASC, sort_order ASC`,
    ).all(plan.id, today) as Array<{ id: number; course_code: string; date: string; minutes: number; sort_order: number }>;

    if (overdue.length === 0) return res.json({ rescheduled: 0, noTime: [] });

    // A task moves to a day with room, before its course's exam: never to the exam day or after it.
    const examOf = new Map(getCoursesForPlanning(db, addDaysISO(today, -1), userId).map((c) => [c.course_code, c.exam_date]));
    const last = [...examOf.values()].sort().pop() ?? today;
    const capacity = dayCapacity(db, userId, settings, today, addDaysISO(last, -1));
    const usedByDate: Record<string, number> = {};
    for (const ft of db.prepare(
      `SELECT date, SUM(minutes) AS used FROM study_tasks WHERE plan_id = ? AND date >= ? AND done = 0 GROUP BY date`,
    ).all(plan.id, today) as Array<{ date: string; used: number }>) usedByDate[ft.date] = ft.used;

    let maxSort = (db.prepare("SELECT MAX(sort_order) AS m FROM study_tasks WHERE plan_id = ?").get(plan.id) as { m: number }).m || 0;
    let rescheduled = 0;
    const noTime = new Set<string>();
    const update = db.prepare("UPDATE study_tasks SET date = ?, sort_order = ? WHERE id = ?");
    for (const task of overdue) {
      const exam = examOf.get(task.course_code);
      // Its exam has gone, or the course is no longer hers: nothing to move it to.
      if (!exam) continue;
      let placed = false;
      for (let d = today; d < exam; d = addDaysISO(d, 1)) {
        const used = usedByDate[d] || 0;
        if ((capacity[d] ?? 0) - used >= task.minutes) {
          update.run(d, ++maxSort, task.id);
          usedByDate[d] = used + task.minutes;
          rescheduled++;
          placed = true;
          break;
        }
      }
      // No room before the exam: it stays where it is (overdue), and the screen says so, rather
      // than piling everything onto today.
      if (!placed) noTime.add(task.course_code);
    }

    res.json({ rescheduled, noTime: [...noTime].sort() });
  });

  // ICS export
  router.get("/studyplan/ics", (req, res) => {
    const userId = req.user!.id;
    const plan = db.prepare("SELECT id FROM study_plans WHERE status = 'active' AND user_id = ? ORDER BY id DESC LIMIT 1").get(userId) as { id: number } | undefined;
    if (!plan) return res.status(404).send("ไม่มีแผน");

    const tasks = db.prepare(
      `SELECT date, description, minutes, course_code, task_type FROM study_tasks WHERE plan_id = ? AND done = 0 ORDER BY date, sort_order`,
    ).all(plan.id) as Array<{ date: string; description: string; minutes: number; course_code: string; task_type: string }>;

    const ics = tasksToICS(db, tasks);
    res.setHeader("Content-Type", "text/calendar; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="studyos-plan.ics"');
    res.send(ics);
  });

  return router;
}
