/**
 * Phase 3: Study planner — backward scheduling from exam dates.
 * Algorithm: reserve last 7 days before each exam for review/mock only,
 * distribute reading across earlier days weighted by chapter weakness.
 * 20% buffer kept unscheduled. Auto-reschedule on missed tasks.
 */
import { Router } from "express";
import type { DB } from "./db.js";
import { bangkokToday, bangkokWeekday, daysBetween, addDaysISO } from "./api.js";

// ---- types ----

type PlanSettings = {
  weekday_hours: number;
  weekend_hours: number;
  reading_speed: number; // pages/hour
  blocked_dates: string[]; // YYYY-MM-DD[]
};

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
  exam_date: string; // YYYY-MM-DD
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

function getSettings(db: DB): PlanSettings {
  const get = (k: string, def: string) => {
    const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(k) as { value: string } | undefined;
    return row?.value ?? def;
  };
  return {
    weekday_hours: Number(get("sp_weekday_hours", "2")),
    weekend_hours: Number(get("sp_weekend_hours", "5")),
    reading_speed: Number(get("sp_reading_speed", "10")),
    blocked_dates: JSON.parse(get("sp_blocked_dates", "[]")) as string[],
  };
}

function saveSettings(db: DB, s: Partial<PlanSettings>): void {
  const upsert = db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
  if (s.weekday_hours != null) upsert.run("sp_weekday_hours", String(s.weekday_hours));
  if (s.weekend_hours != null) upsert.run("sp_weekend_hours", String(s.weekend_hours));
  if (s.reading_speed != null) upsert.run("sp_reading_speed", String(s.reading_speed));
  if (s.blocked_dates != null) upsert.run("sp_blocked_dates", JSON.stringify(s.blocked_dates));
}

/** Is the date a weekend (Sat=6, Sun=7)? */
function isWeekend(dateStr: string): boolean {
  const d = new Date(`${dateStr}T12:00:00Z`);
  const day = d.getUTCDay(); // 0=Sun, 6=Sat
  return day === 0 || day === 6;
}

/** Get available minutes for a date (after 20% buffer). */
function availableMinutes(dateStr: string, settings: PlanSettings): number {
  if (settings.blocked_dates.includes(dateStr)) return 0;
  const hours = isWeekend(dateStr) ? settings.weekend_hours : settings.weekday_hours;
  return Math.floor(hours * 60 * 0.8); // 20% buffer
}

/** Get courses with upcoming exams and their chapters. */
function getCoursesForPlanning(db: DB, today: string): CourseExam[] {
  const exams = db.prepare(
    `SELECT e.course_code, c.name_th, c.name_en,
            DATE(e.datetime_start) AS exam_date
     FROM exams e
     JOIN courses c ON c.code = e.course_code
     JOIN plan_terms pt ON pt.term_id = e.term_id
     WHERE DATE(e.datetime_start) > ?
     ORDER BY e.datetime_start ASC`,
  ).all(today) as Array<{ course_code: string; name_th: string; name_en: string | null; exam_date: string }>;

  // Deduplicate by course (take earliest exam)
  const seen = new Set<string>();
  const unique = exams.filter((e) => {
    if (seen.has(e.course_code)) return false;
    seen.add(e.course_code);
    return true;
  });

  return unique.map((e) => {
    const chapters = db.prepare(
      `SELECT ch.id, ch.course_code, ch.name, ch.sort_order,
              COALESCE(ch.page_count,
                (SELECT SUM(mc.end_page - mc.start_page + 1)
                 FROM material_chunks mc WHERE mc.chapter_id = ch.id), 20) AS page_count,
              COALESCE(cm.mastery_score, 0) AS mastery
       FROM chapters ch
       LEFT JOIN chapter_mastery cm ON cm.chapter_id = ch.id AND cm.course_code = ch.course_code
       WHERE ch.course_code = ?
       ORDER BY ch.sort_order ASC`,
    ).all(e.course_code) as ChapterInfo[];

    const total_pages = chapters.reduce((sum, ch) => sum + ch.page_count, 0);
    return { ...e, chapters, total_pages };
  });
}

// ---- scheduling algorithm ----

function generatePlan(db: DB): {
  tasks: TaskInsert[];
  feasibility: "ok" | "tight" | "impossible";
  warnings: string[];
} {
  const today = bangkokToday();
  const settings = getSettings(db);
  const courses = getCoursesForPlanning(db, today);
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
      allWork.push({
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

  // Build available days list (today+1 to each course's study deadline)
  const allDates = new Set<string>();
  const maxDeadline = Object.values(courseDeadlines).sort().pop() || today;
  let d = addDaysISO(today, 1);
  while (d <= maxDeadline) {
    allDates.add(d);
    d = addDaysISO(d, 1);
  }

  // Track remaining minutes per day
  const dayMinutes: Record<string, number> = {};
  for (const date of allDates) {
    dayMinutes[date] = availableMinutes(date, settings);
  }

  const tasks: TaskInsert[] = [];
  let sortCounter = 0;
  const unplaced: WorkItem[] = [];

  // Group work by course, then distribute across days for that course
  const workByCourse: Record<string, WorkItem[]> = {};
  for (const w of allWork) {
    (workByCourse[w.course_code] ??= []).push(w);
  }

  // Round-robin across courses, day by day
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

  // Iterate day by day, round-robin across courses
  const sortedDates = [...allDates].sort();
  for (const date of sortedDates) {
    if (dayMinutes[date] <= 0) continue;

    let remaining = dayMinutes[date];

    // Try each course in round-robin
    for (const ck of courseKeys) {
      const deadline = courseDeadlines[ck];
      if (!deadline || date > deadline) continue;

      const queue = courseQueues[ck];
      while (queue.length > 0 && remaining >= 15) {
        const item = queue[0];
        if (item.minutes <= remaining) {
          tasks.push({
            course_code: item.course_code,
            date,
            task_type: item.task_type,
            chapter_id: item.chapter_id,
            description: item.description,
            page_start: item.page_start,
            page_end: item.page_end,
            minutes: item.minutes,
            sort_order: sortCounter++,
          });
          remaining -= item.minutes;
          queue.shift();
        } else {
          break;
        }
      }
    }
  }

  // Check for unplaced items
  for (const ck of courseKeys) {
    if (courseQueues[ck].length > 0) {
      unplaced.push(...courseQueues[ck]);
    }
  }

  // Add review zone tasks (last 7 days before each exam)
  for (const course of courses) {
    for (let i = 7; i >= 1; i--) {
      const reviewDate = addDaysISO(course.exam_date, -i);
      if (reviewDate <= today) continue;
      const mins = availableMinutes(reviewDate, settings);
      if (mins <= 0) continue;

      if (i >= 3) {
        // Days -7 to -3: review cards + quiz weak chapters
        tasks.push({
          course_code: course.course_code,
          date: reviewDate,
          task_type: "review",
          chapter_id: null,
          description: `ทบทวนการ์ด ${course.course_code} (25 ใบ)`,
          page_start: null,
          page_end: null,
          minutes: Math.min(30, mins),
          sort_order: sortCounter++,
        });
        if (mins > 30) {
          tasks.push({
            course_code: course.course_code,
            date: reviewDate,
            task_type: "quiz",
            chapter_id: null,
            description: `ทำควิซทบทวน ${course.course_code} (${Math.min(mins - 30, 40)} นาที)`,
            page_start: null,
            page_end: null,
            minutes: Math.min(mins - 30, 40),
            sort_order: sortCounter++,
          });
        }
      } else {
        // Days -2 and -1: mock exam
        tasks.push({
          course_code: course.course_code,
          date: reviewDate,
          task_type: "mock",
          chapter_id: null,
          description: `สอบจำลอง ${course.course_code} (${mins} นาที)`,
          page_start: null,
          page_end: null,
          minutes: mins,
          sort_order: sortCounter++,
        });
      }
    }
  }

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

function getCourseStatuses(db: DB, planId: number, today: string): CourseStatus[] {
  const rows = db.prepare(
    `SELECT st.course_code, c.name_th,
            (SELECT DATE(e.datetime_start) FROM exams e WHERE e.course_code = st.course_code ORDER BY e.datetime_start LIMIT 1) AS exam_date,
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

  return rows.map((r) => {
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

// ---- router ----

export function createStudyPlanRouter(db: DB): Router {
  const router = Router();

  // Get planner settings
  router.get("/studyplan/settings", (_req, res) => {
    res.json(getSettings(db));
  });

  // Update planner settings
  router.put("/studyplan/settings", (req, res) => {
    const { weekday_hours, weekend_hours, reading_speed, blocked_dates } = req.body;
    const update: Partial<PlanSettings> = {};
    if (weekday_hours != null && weekday_hours >= 0.5 && weekday_hours <= 12) update.weekday_hours = weekday_hours;
    if (weekend_hours != null && weekend_hours >= 0.5 && weekend_hours <= 16) update.weekend_hours = weekend_hours;
    if (reading_speed != null && reading_speed >= 1 && reading_speed <= 100) update.reading_speed = reading_speed;
    if (Array.isArray(blocked_dates)) update.blocked_dates = blocked_dates;
    saveSettings(db, update);
    res.json({ ok: true, ...getSettings(db) });
  });

  // List courses available for planning (with exam + chapters)
  router.get("/studyplan/courses", (_req, res) => {
    const today = bangkokToday();
    const courses = getCoursesForPlanning(db, today);
    res.json({ courses, today });
  });

  // Update a chapter's page count
  router.put("/studyplan/chapters/:id", (req, res) => {
    const id = Number(req.params.id);
    const pageCount = Number(req.body.page_count);
    if (!pageCount || pageCount < 1) return res.status(400).json({ error: "page_count ต้อง >= 1" });
    db.prepare("UPDATE chapters SET page_count = ? WHERE id = ?").run(pageCount, id);
    res.json({ ok: true });
  });

  // Generate a new study plan
  router.post("/studyplan/generate", (_req, res) => {
    const today = bangkokToday();

    // Archive any existing active plan
    db.prepare("UPDATE study_plans SET status = 'archived' WHERE status = 'active'").run();

    const { tasks, feasibility, warnings } = generatePlan(db);
    const settings = getSettings(db);

    const result = db.prepare(
      `INSERT INTO study_plans (status, generated_at, settings_json, feasibility, warnings_json)
       VALUES ('active', ?, ?, ?, ?)`,
    ).run(today, JSON.stringify(settings), feasibility, JSON.stringify(warnings));

    const planId = result.lastInsertRowid as number;

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
  router.get("/studyplan", (_req, res) => {
    const plan = db.prepare("SELECT * FROM study_plans WHERE status = 'active' ORDER BY id DESC LIMIT 1").get() as
      | { id: number; status: string; generated_at: string; feasibility: string; warnings_json: string }
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

    const statuses = getCourseStatuses(db, plan.id, today);

    res.json({
      plan: {
        id: plan.id,
        generated_at: plan.generated_at,
        feasibility: plan.feasibility,
        warnings: JSON.parse(plan.warnings_json || "[]"),
      },
      tasks,
      statuses,
      today,
    });
  });

  // Toggle task done/undone
  router.post("/studyplan/tasks/:id/toggle", (req, res) => {
    const id = Number(req.params.id);
    const task = db.prepare("SELECT id, done FROM study_tasks WHERE id = ?").get(id) as { id: number; done: number } | undefined;
    if (!task) return res.status(404).json({ error: "ไม่พบงานนี้" });

    const newDone = task.done ? 0 : 1;
    const doneAt = newDone ? new Date().toISOString() : null;
    db.prepare("UPDATE study_tasks SET done = ?, done_at = ? WHERE id = ?").run(newDone, doneAt, id);
    res.json({ id, done: newDone });
  });

  // Reschedule: move overdue undone tasks to future dates
  router.post("/studyplan/reschedule", (_req, res) => {
    const plan = db.prepare("SELECT id FROM study_plans WHERE status = 'active' ORDER BY id DESC LIMIT 1").get() as { id: number } | undefined;
    if (!plan) return res.status(404).json({ error: "ไม่มีแผนที่ใช้งานอยู่" });

    const today = bangkokToday();
    const settings = getSettings(db);

    // Get overdue undone tasks
    const overdue = db.prepare(
      `SELECT * FROM study_tasks WHERE plan_id = ? AND done = 0 AND date < ? ORDER BY date ASC, sort_order ASC`,
    ).all(plan.id) as Array<{ id: number; course_code: string; date: string; minutes: number; sort_order: number }>;

    if (overdue.length === 0) return res.json({ rescheduled: 0 });

    // Get future dates with remaining capacity
    const futureTasks = db.prepare(
      `SELECT date, SUM(minutes) AS used FROM study_tasks WHERE plan_id = ? AND date >= ? AND done = 0 GROUP BY date`,
    ).all(plan.id, today) as Array<{ date: string; used: number }>;

    const usedByDate: Record<string, number> = {};
    for (const ft of futureTasks) usedByDate[ft.date] = ft.used;

    // Get max sort_order
    let maxSort = (db.prepare("SELECT MAX(sort_order) AS m FROM study_tasks WHERE plan_id = ?").get(plan.id) as { m: number }).m || 0;

    let rescheduled = 0;
    const update = db.prepare("UPDATE study_tasks SET date = ?, sort_order = ? WHERE id = ?");

    for (const task of overdue) {
      // Find first future date with enough capacity
      let d = today;
      let placed = false;
      for (let i = 0; i < 120; i++) {
        d = addDaysISO(today, i);
        const capacity = availableMinutes(d, settings);
        const used = usedByDate[d] || 0;
        if (capacity - used >= task.minutes) {
          maxSort++;
          update.run(d, maxSort, task.id);
          usedByDate[d] = used + task.minutes;
          rescheduled++;
          placed = true;
          break;
        }
      }
      if (!placed) {
        // Can't fit — just move to today
        maxSort++;
        update.run(today, maxSort, task.id);
        rescheduled++;
      }
    }

    res.json({ rescheduled });
  });

  // ICS export
  router.get("/studyplan/ics", (_req, res) => {
    const plan = db.prepare("SELECT id FROM study_plans WHERE status = 'active' ORDER BY id DESC LIMIT 1").get() as { id: number } | undefined;
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
