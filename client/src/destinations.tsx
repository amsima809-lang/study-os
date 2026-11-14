/**
 * Every screen the student can open, and which of them sit in the main nav.
 * The nav is the student's own choice: "+" in More pins a screen to the nav,
 * press-and-hold on a nav item moves it back to More. Saved in localStorage.
 */
import { useState, type ComponentType } from "react";
import Today from "./screens/Today.tsx";
import Notes from "./screens/Notes.tsx";
import Quiz from "./screens/Quiz.tsx";
import Review from "./screens/Review.tsx";
import Schedule from "./screens/Schedule.tsx";
import Stats from "./screens/Stats.tsx";
import Planner from "./screens/Planner.tsx";
import Mock from "./screens/Mock.tsx";
import Library from "./screens/Library.tsx";
import Weakness from "./screens/Weakness.tsx";
import StudyPlan from "./screens/StudyPlan.tsx";
import Costs from "./screens/Costs.tsx";
import Reminders from "./screens/Reminders.tsx";

export type DestId =
  | "today" | "notes" | "quiz" | "review"
  | "reminders" | "studyplan" | "library" | "schedule" | "stats" | "planner" | "mock" | "weakness" | "costs";

export type Destination = {
  id: DestId;
  icon: string;
  /** i18n key of the short label used in the nav. */
  navLabel: string;
  /** i18n key of the full label used in the More list. */
  label: string;
  Screen: ComponentType;
};

export const DESTINATIONS: Destination[] = [
  { id: "today", icon: "calendar", navLabel: "nav.today", label: "nav.today", Screen: Today },
  { id: "notes", icon: "notebook", navLabel: "nav.notes", label: "nav.notes", Screen: Notes },
  { id: "quiz", icon: "target", navLabel: "nav.quiz", label: "nav.quiz", Screen: Quiz },
  { id: "review", icon: "refresh", navLabel: "nav.review", label: "nav.review", Screen: Review },
  { id: "reminders", icon: "bell", navLabel: "nav.reminders", label: "rem.screen", Screen: Reminders },
  { id: "studyplan", icon: "calendarCheck", navLabel: "nav.studyplan", label: "more.studyplan", Screen: StudyPlan },
  { id: "library", icon: "library", navLabel: "nav.library", label: "more.library", Screen: Library },
  { id: "schedule", icon: "calendarRange", navLabel: "nav.schedule", label: "more.schedule", Screen: Schedule },
  { id: "stats", icon: "chartBar", navLabel: "nav.stats", label: "more.stats", Screen: Stats },
  { id: "planner", icon: "graduationCap", navLabel: "nav.planner", label: "more.planner", Screen: Planner },
  { id: "mock", icon: "fileEdit", navLabel: "nav.mock", label: "more.mock", Screen: Mock },
  { id: "weakness", icon: "crosshair", navLabel: "nav.weakness", label: "more.weakness", Screen: Weakness },
  { id: "costs", icon: "coins", navLabel: "nav.costs", label: "more.costs", Screen: Costs },
];

export const destination = (id: DestId) => DESTINATIONS.find((d) => d.id === id)!;

/** Ask the app shell to open a screen, from anywhere (e.g. a "see all" link). */
export const NAVIGATE_EVENT = "studyos:navigate";
export function navigateTo(id: DestId) {
  window.dispatchEvent(new CustomEvent<DestId>(NAVIGATE_EVENT, { detail: id }));
}

const DEFAULT_NAV: DestId[] = ["today", "notes", "quiz", "review"];
/** The phone nav bar fits this many screens plus the "More" button. */
export const MAX_NAV = 5;
const STORAGE_KEY = "studyos.nav";

function readNav(): DestId[] {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");
    if (Array.isArray(raw)) {
      const known = raw.filter((id): id is DestId => DESTINATIONS.some((d) => d.id === id));
      return [...new Set(known)].slice(0, MAX_NAV);
    }
  } catch { /* blocked or corrupt storage: use the default */ }
  return DEFAULT_NAV;
}

export function useNav() {
  const [nav, setNav] = useState<DestId[]>(readNav);

  function save(next: DestId[]) {
    setNav(next);
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ok */ }
  }

  return {
    nav,
    canPin: nav.length < MAX_NAV,
    pin: (id: DestId) => { if (!nav.includes(id) && nav.length < MAX_NAV) save([...nav, id]); },
    unpin: (id: DestId) => save(nav.filter((n) => n !== id)),
    /** Put `incoming` in the nav in the place of `outgoing` (used when the nav is full). */
    replace: (outgoing: DestId, incoming: DestId) => {
      if (nav.includes(outgoing) && !nav.includes(incoming)) save(nav.map((n) => (n === outgoing ? incoming : n)));
    },
  };
}
