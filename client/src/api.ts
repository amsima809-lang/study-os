import { withBase } from "./base.ts";
/** Client-side fetch helpers + shared types for the Phase 2 screens. */

/** A study task of today, from her active plan. */
export type TodayStudyTask = { id: number; course_code: string; name_th: string; name_en: string | null; task_type: "read" | "quiz" | "review" | "mock"; description: string; minutes: number; done: number };

export type TodayData = {
  term: string;
  today: string;
  weekday: number;
  classes: ClassSession[];
  /** With no class today: the next day of the week that has classes. */
  nextClasses?: { weekday: number; classes: ClassSession[] } | null;
  nextExam: {
    course_code: string;
    name_th: string;
    name_en: string | null;
    date: string;
    slot: string | null;
    /** A booked e-Test (before the final), the final, or a faculty-arranged exam she dated. */
    kind: "etesting" | "final" | "own";
    start: string | null;
    end: string | null;
    /** Her room and seat, as she copied them from e-Service. */
    seat: string | null;
    daysLeft: number;
  } | null;
  dueFlashcards: number;
  reminders: ReminderOccurrence[];
  chosenCourses: number;
  canChooseCourses: boolean;
  studyToday: { hasPlan: boolean; tasks: TodayStudyTask[]; overdue: number };
};

export type ReminderRule = {
  id: number;
  kind: "reminder" | "todo" | "event";
  title: string;
  note: string | null;
  course_code: string | null;
  course_name_th: string | null;
  course_name_en: string | null;
  date: string | null;
  time: string | null;
  /** Events only: when it ends. */
  end_time: string | null;
  repeat: "none" | "daily" | "weekdays" | "weekly" | "monthly";
  repeat_until: string | null;
};
/** A rule on one day. `on` is "" for a to-do with no date. */
export type ReminderOccurrence = ReminderRule & { on: string; done: boolean; overdue: boolean };
/** A rule in the manage list: `next` is the next day it falls on. */
export type ReminderListItem = ReminderRule & { next: string | null; finished: boolean; overdue: boolean };

export type ClassSession = {
  course_code: string;
  name_th: string;
  name_en: string | null;
  weekday: number;
  start_time: string;
  end_time: string;
  room: string | null;
};

export type WeekData = { term: string; classes: ClassSession[]; /** False until the student has chosen their courses for the term. */ chosen?: boolean };

export type Exam = {
  course_code: string;
  name_th: string;
  name_en: string | null;
  date: string;
  start: string;
  end: string;
  slot: string | null;
  location: string | null;
  daysLeft: number;
};

export type ExamsData = {
  term: string;
  today: string;
  exams: Exam[];
  clashes: Array<{ date: string; courses: string[] }>;
  /** Courses whose exam the faculty arranges itself: the university publishes no date. */
  facultyArranged?: { course_code: string; name_th: string; name_en: string | null; note: string }[];
  /** False until the student has chosen their courses for the term: nothing is listed until then. */
  chosen?: boolean;
  /** Her e-Testing bookings, dates she entered and seats, by course (server/src/myExams.ts). */
  mine?: MyExam[];
};

/** One of her courses' exams this term, from every source (server/src/myExams.ts). */
export type MyExam = {
  course_code: string;
  name_th: string;
  name_en: string | null;
  final: { date: string; slot: string | null; start: string; end: string } | null;
  facultySet: boolean;
  own: { date: string; start: string | null; end: string | null } | null;
  booking: { date: string; period: number; centre: string; start: string; end: string } | null;
  seat: string | null;
  next: { date: string; kind: "etesting" | "final" | "own"; start: string | null; end: string | null } | null;
};

// ---------- Calendar ----------
export type CalEvent = {
  /** "etesting": the university's e-Testing days (registration, testing); "etbooked": an e-Testing exam she booked. */
  type: "class" | "exam" | "task" | "etesting" | "etbooked" | "reminder" | "todo" | "event";
  /** For "etesting": a registration day, or a day the central centre tests. */
  etesting_kind?: "registration" | "testing";
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
  /** Set for reminders and to-dos: the rule this occurrence comes from. */
  reminder_id?: number;
  repeat?: string;
};

export type CalendarData = {
  month: string;
  term: string;
  today: string;
  events: Record<string, CalEvent[]>;
};

/** Fired when the server says the student is no longer signed in. */
export const SIGNED_OUT = "studyos:signed-out";

/**
 * Every request goes through here, so two things are handled in one place:
 * - no connection: fail with a clear OFFLINE error instead of a raw exception;
 * - the session has ended (401): tell the app, which returns to the login page.
 */
async function send(url: string, init?: RequestInit): Promise<Response> {
  let r: Response;
  try {
    r = await fetch(withBase(url), init);
  } catch {
    throw { error: "ออฟไลน์อยู่ เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ ลองใหม่เมื่อมีอินเทอร์เน็ต", code: "OFFLINE" } as ApiError;
  }
  if (r.status === 401 && !url.startsWith("/api/auth/")) window.dispatchEvent(new Event(SIGNED_OUT));
  return r;
}

export async function getJSON<T>(url: string): Promise<T> {
  // Never an answer kept from before (the server also says no-store): screens re-read after a save.
  const r = await send(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`${r.status} ${url}`);
  return (await r.json()) as T;
}

// ---------- Phase 3: notes ----------
export type Course = { code: string; name_th: string; name_en: string | null; category: string };

export type KeyTerm = { term: string; definition: string };

export type NoteLearning = {
  id?: number;
  summary_md: string;
  key_terms: KeyTerm[];
  mindmap_md: string;
  topics: string[];
  image_paths?: string[];
  ai_skipped?: boolean;
};

export type NoteListItem = {
  id: number;
  course_code: string | null;
  course_name: string | null;
  course_name_en: string | null;
  title: string | null;
  created_at: string;
};

export type NoteDetail = {
  id: number;
  course_code: string | null;
  created_at: string;
  title: string | null;
  raw_text: string | null;
  image_paths: string[];
  ai_summary_md: string | null;
  ai_mindmap_md: string | null;
  key_terms: KeyTerm[];
  topics: string[];
};

/** One result of a note search (GET /api/notes/search). */
export type NoteHit = { id: number; course_code: string | null; title: string | null; created_at: string; snippet: string };

export type ApiError = { error: string; code?: string };

/** POST multipart form; returns parsed JSON or throws an ApiError-shaped error. */
export async function postForm<T>(url: string, form: FormData): Promise<T> {
  const r = await send(url, { method: "POST", body: form });
  const data = await r.json().catch(() => ({ error: "unknown" }));
  if (!r.ok) throw data as ApiError;
  return data as T;
}

/** POST JSON; returns parsed JSON or throws an ApiError-shaped error. */
export async function postJSON<T>(url: string, body: unknown): Promise<T> {
  const r = await send(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({ error: "unknown" }));
  if (!r.ok) throw data as ApiError;
  return data as T;
}

/** PUT JSON; returns parsed JSON or throws. */
export async function putJSON<T>(url: string, body: unknown): Promise<T> {
  const r = await send(url, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await r.json().catch(() => ({ error: "unknown" }));
  if (!r.ok) throw data as ApiError;
  return data as T;
}

/** DELETE request; returns parsed JSON or throws. */
export async function deleteJSON<T>(url: string): Promise<T> {
  const r = await send(url, { method: "DELETE" });
  const data = await r.json().catch(() => ({ error: "unknown" }));
  if (!r.ok) throw data as ApiError;
  return data as T;
}

// ---------- Phase 1 (materials / chapters) ----------
export type Material = {
  id: number;
  course_code: string;
  course_name?: string;
  filename: string;
  file_type: "pdf" | "image" | "text";
  material_kind: "textbook" | "past_exam" | "notes" | "other";
  file_size: number;
  total_pages: number | null;
  pages_done: number;
  upload_status: "pending" | "processing" | "done" | "error";
  error_message?: string;
  created_at: string;
};

export type MaterialPage = {
  page_num: number;
  extracted_text: string | null;
  extraction_method: "pdf_text" | "ai_ocr" | "manual" | null;
  confidence: number | null;
  image_path: string | null;
};

export type Chapter = {
  id: number;
  course_code: string;
  name: string;
  sort_order: number;
  ai_suggested: number;
  created_at: string;
};

// ---------- Phase 4: quiz ----------
export type QuizQuestion = {
  id: number;
  topic: string;
  question: string;
  type: "short" | "mcq";
  choices: string[];
};

export type AnswerResult = {
  score: number;
  feedback: string;
  modelAnswer: string;
  flashcardCreated: boolean;
  explanation?: string | null;
  sourceRef?: { chapter_id?: number; chapter_name?: string; material_ids?: number[]; source_page?: number | null } | null;
};

// ---------- Phase 8: mock exam ----------
export type MockCourse = {
  code: string;
  name_th: string;
  name_en: string | null;
  daysToExam: number;
  bankCount: number;
  available: boolean;
};

export type MockResult = {
  score: number;
  maxScore: number;
  questionCount: number;
  weakTopics: { name: string; mastery: number }[];
};

export type MockChapterScore = {
  chapter_id: number;
  name: string;
  score: number;
  max: number;
  pct: number;
  count: number;
};

export type GradeCutoff = { label: string; min_pct: number };

// ---------- Grades (began as the Phase 7 degree planner) ----------
export type PlanItem = {
  course_code: string | null;
  placeholder_label: string | null;
  name_th: string | null;
  name_en: string | null;
  credits: number;
  category: string | null;
  status: "PLANNED" | "PASSED" | "FAILED" | null;
  grade: string | null;
};

export type PlanTerm = {
  term_id: string;
  ord: number;
  max_credits: number;
  credits: number;
  items: PlanItem[];
  gpa: number | null;
};

export type GpaResult = {
  gpa: number | null;
  totalCredits: number;
  totalPoints: number;
  courseCount: number;
};

export type PlanGradeScale = { grade: string; points: number };

export type WhatIfResult = {
  currentGpa: number | null;
  whatIfGpa: number | null;
  currentCredits: number;
  whatIfCredits: number;
  change: number | null;
};

export type PlanData = {
  /** The terms she has courses in, with how each course went. */
  terms: PlanTerm[];
  /** Courses passed before she used the app: no term. */
  before: { course_code: string; name_th: string; name_en: string | null; credits: number; grade: string | null }[];
  blocked: { course_code: string; name_th: string; dueTo: string[] }[];
  gpa: GpaResult;
  gradeScale: PlanGradeScale[];
};

// ---------- Phase 6: analytics ----------
export type CourseAnalytics = {
  code: string;
  name_th: string;
  name_en: string | null;
  difficulty: number;
  /** What her study plan gives it this week; null with no plan. */
  targetWeeklyHours: number | null;
  actualWeeklyHours: number;
  quizAverage: number | null;
  attempts: number;
  daysToExam: number | null;
  weakestTopics: { name: string; mastery: number }[];
  risk: "green" | "yellow" | "red";
  riskScore: number;
};

export type AnalyticsData = {
  term: string;
  weekStart: string;
  weeklyTarget: number | null;
  courses: CourseAnalytics[];
};

// ---------- Phase 5/Phase 2: flashcards (SM-2) ----------
export type DueCard = {
  id: number;
  box: number;
  easiness: number;
  interval: number;
  totalReviews: number;
  correctReviews: number;
  question: string;
  model_answer: string;
  type: "short" | "mcq";
  choices: string[];
  topic: string | null;
  course_code: string | null;
  course_name: string | null;
  course_name_en: string | null;
  chapter_name: string | null;
};

export type FlashcardStats = {
  total: number;
  due: number;
  byBox: Record<number, number>;
  avgEasiness: number;
  limit: number;
};

export type ReviewHistoryDay = {
  date: string;
  reviews: number;
  avg_confidence: number;
  correct: number;
};

export type WeaknessData = {
  courses: Array<{
    course_code: string;
    name_th: string;
    name_en: string | null;
    avg_mastery: number;
    min_mastery: number;
    topics: number;
  }>;
  weakTopics: Array<{
    course_code: string;
    topic: string;
    mastery_score: number;
    total_attempts: number;
    correct_attempts: number;
    chapter_name: string | null;
    course_name: string | null;
  }>;
  reviewStats: {
    total_cards: number;
    due: number;
    avg_easiness: number | null;
    avg_retention: number | null;
  };
};

// ---------- Phase 3: study planner ----------
export type PlanSettings = {
  weekday_hours: number;
  weekend_hours: number;
  reading_speed: number;
  blocked_dates: string[];
  /** Hours on a long day (6 h or more of her own events, such as a work shift). */
  workday_hours: number;
};

export type PlanChapter = {
  id: number;
  course_code: string;
  name: string;
  sort_order: number;
  page_count: number;
  mastery: number;
};

export type PlanCourse = {
  course_code: string;
  name_th: string;
  name_en: string | null;
  exam_date: string;
  /** What the plan prepares for: a booked e-Test, the final, or a date she entered. */
  exam_kind: "etesting" | "final" | "own";
  chapters: PlanChapter[];
  total_pages: number;
};

export type StudyTask = {
  id: number;
  plan_id: number;
  course_code: string;
  course_name: string;
  date: string;
  task_type: "read" | "quiz" | "review" | "mock";
  chapter_id: number | null;
  chapter_name: string | null;
  description: string;
  page_start: number | null;
  page_end: number | null;
  minutes: number;
  sort_order: number;
  done: number;
  done_at: string | null;
};

export type CourseStatus = {
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
  extra_hours_needed: number;
};

export type StudyPlanData = {
  plan: {
    id: number;
    generated_at: string;
    feasibility: "ok" | "tight" | "impossible";
    warnings: string[];
    /** Her courses, exams, chapters, hours or shifts changed since it was made. */
    stale: boolean;
  } | null;
  tasks: StudyTask[];
  /** Courses in the plan with no exam ahead (over, or dropped): their tasks are not overdue. */
  expired?: string[];
  statuses: CourseStatus[];
  today: string;
};
