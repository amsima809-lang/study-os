/** Client-side fetch helpers + shared types for the Phase 2 screens. */

export type StudyTarget = {
  code: string;
  name_th: string;
  name_en: string | null;
  difficulty: number;
  weeklyHours: number;
  dailyHours: number;
};

export type TodayData = {
  term: string;
  today: string;
  weekday: number;
  classes: ClassSession[];
  nextExam: {
    course_code: string;
    name_th: string;
    name_en: string | null;
    date: string;
    slot: string | null;
    daysLeft: number;
  } | null;
  dueFlashcards: number;
  studyTargets: { weeklyTarget: number; totalPoints: number; courses: StudyTarget[] };
};

export type ClassSession = {
  course_code: string;
  name_th: string;
  name_en: string | null;
  weekday: number;
  start_time: string;
  end_time: string;
  room: string | null;
};

export type WeekData = { term: string; classes: ClassSession[] };

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
};

export async function getJSON<T>(url: string): Promise<T> {
  const r = await fetch(url);
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

export type ApiError = { error: string; code?: string };

/** POST multipart form; returns parsed JSON or throws an ApiError-shaped error. */
export async function postForm<T>(url: string, form: FormData): Promise<T> {
  const r = await fetch(url, { method: "POST", body: form });
  const data = await r.json().catch(() => ({ error: "unknown" }));
  if (!r.ok) throw data as ApiError;
  return data as T;
}

/** POST JSON; returns parsed JSON or throws an ApiError-shaped error. */
export async function postJSON<T>(url: string, body: unknown): Promise<T> {
  const r = await fetch(url, {
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
  const r = await fetch(url, {
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
  const r = await fetch(url, { method: "DELETE" });
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

// ---------- Phase 7: degree planner ----------
export type PlanItem = {
  course_code: string | null;
  placeholder_label: string | null;
  name_th: string | null;
  name_en: string | null;
  credits: number;
  category: string | null;
  difficulty: number | null;
  status: "PLANNED" | "PASSED" | "FAILED" | "ENROLLED" | "WITHDRAWN" | null;
};

export type PlanTerm = {
  term_id: string;
  ord: number;
  max_credits: number;
  credits: number;
  runningTotal: number;
  items: PlanItem[];
};

export type PlanData = {
  terms: PlanTerm[];
  totalPassedCredits: number;
  totalPlannedCredits: number;
  categoryProgress: { category: string; required: number; passed: number }[];
  failed: { course_code: string; name_th: string; retakeTerm: string | null }[];
  blocked: { course_code: string; name_th: string; dueTo: string[] }[];
  internship: { eligible: boolean; rules: { id: string; ok: boolean; detail: string }[] };
};

// ---------- Phase 6: analytics ----------
export type CourseAnalytics = {
  code: string;
  name_th: string;
  name_en: string | null;
  difficulty: number;
  targetWeeklyHours: number;
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
  weeklyTarget: number;
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
  } | null;
  tasks: StudyTask[];
  statuses: CourseStatus[];
  today: string;
};
