/**
 * The five sections of the app and the pages in each (see destinations.tsx, which adds each
 * page's screen). Plain data, with no screens imported, so it can be tested on its own.
 */
export const PAGE_IDS = [
  "today", "reminders", "studyplan",
  "timetable", "exams", "map",
  "library", "notes",
  "quiz", "review", "mock", "stats",
  "trail", "planner", "costs",
] as const;
export type DestId = (typeof PAGE_IDS)[number];
export type SectionId = "today" | "classes" | "study" | "practice" | "degree";

export const SECTIONS: { id: SectionId; icon: string; label: string; pages: DestId[] }[] = [
  { id: "today", icon: "calendar", label: "sec.today", pages: ["today", "reminders", "studyplan"] },
  { id: "classes", icon: "calendarRange", label: "sec.classes", pages: ["timetable", "exams", "map"] },
  { id: "study", icon: "notebook", label: "sec.study", pages: ["library", "notes"] },
  { id: "practice", icon: "target", label: "sec.practice", pages: ["quiz", "review", "mock", "stats"] },
  { id: "degree", icon: "graduationCap", label: "sec.degree", pages: ["trail", "planner", "costs"] },
];
export const sectionOf = (id: DestId) => SECTIONS.find((s) => s.pages.includes(id))!;

/** Names a page used to be opened by, still accepted from links and old code. */
const FORMER: Record<string, DestId> = { schedule: "timetable", weakness: "stats" };
/** The page a name stands for, or null if it is no page at all. */
export function pageNamed(name: unknown): DestId | null {
  if (typeof name !== "string") return null;
  const id = FORMER[name] ?? name;
  return (PAGE_IDS as readonly string[]).includes(id) ? (id as DestId) : null;
}
