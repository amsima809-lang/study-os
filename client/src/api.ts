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
};

export type NoteListItem = {
  id: number;
  course_code: string | null;
  course_name: string | null;
  course_name_en: string | null;
  title: string | null;
  created_at: string;
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

// ---------- Phase 5: flashcards ----------
export type DueCard = {
  id: number;
  box: number;
  question: string;
  model_answer: string;
  type: "short" | "mcq";
  choices: string[];
  topic: string | null;
  course_code: string | null;
  course_name: string | null;
  course_name_en: string | null;
};
