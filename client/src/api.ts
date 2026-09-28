/** Client-side fetch helpers + shared types for the Phase 2 screens. */

export type StudyTarget = {
  code: string;
  name_th: string;
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
  weekday: number;
  start_time: string;
  end_time: string;
  room: string | null;
};

export type WeekData = { term: string; classes: ClassSession[] };

export type Exam = {
  course_code: string;
  name_th: string;
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
