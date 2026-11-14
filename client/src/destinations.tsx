/**
 * Every screen the student can open, and how they are grouped.
 *
 * The app has FIVE sections, the same for everyone, and they are the main menu: Today, Classes,
 * Study, Practice, Degree. Each section holds a few pages, shown as tabs across the top of the
 * section (and as rows under the section's name in the desktop sidebar). Settings (theme, font,
 * time format, sign out) is a page of its own behind the gear, not a section.
 *
 * A new screen goes into the section whose question it answers:
 *   Today    — what do I do today?
 *   Classes  — when and where are my classes and exams?
 *   Study    — my material: notes, documents, recorded lectures
 *   Practice — test myself, and see how I am doing
 *   Degree   — the long view: the plan to graduate, grades, cost
 */
import { useState, type ComponentType } from "react";
import Today from "./screens/Today.tsx";
import Notes from "./screens/Notes.tsx";
import Quiz from "./screens/Quiz.tsx";
import Review from "./screens/Review.tsx";
import Week from "./screens/Week.tsx";
import Exams from "./screens/Exams.tsx";
import Stats from "./screens/Stats.tsx";
import Planner from "./screens/Planner.tsx";
import Mock from "./screens/Mock.tsx";
import Library from "./screens/Library.tsx";
import Weakness from "./screens/Weakness.tsx";
import StudyPlan from "./screens/StudyPlan.tsx";
import Costs from "./screens/Costs.tsx";
import Reminders from "./screens/Reminders.tsx";
import Trail from "./screens/Trail.tsx";
import CampusMap from "./screens/CampusMap.tsx";
import { ChooseCoursesCard } from "./components/TermCourses.tsx";

import { SECTIONS, sectionOf, pageNamed, type DestId, type SectionId } from "./sections.ts";

export { SECTIONS, sectionOf, pageNamed };
export type { DestId, SectionId };

export type Destination = {
  id: DestId;
  icon: string;
  /** i18n key of the page's name: its tab, and its row in the sidebar. */
  label: string;
  Screen: ComponentType;
  /** A reading or form screen: keeps a reading-width column even on a wide window. */
  narrow?: boolean;
};

/** The timetable and the exam list are both empty until the student has chosen their courses. */
function withCourses(View: ComponentType): ComponentType {
  return function ClassesPage() {
    const [version, setVersion] = useState(0); // bumped after courses are chosen, to load the view again
    return (
      <div className="space-y-4">
        <ChooseCoursesCard showLink onChanged={() => setVersion((n) => n + 1)} />
        <View key={version} />
      </div>
    );
  };
}

export const DESTINATIONS: Destination[] = [
  { id: "today", icon: "calendar", label: "nav.today", Screen: Today },
  { id: "reminders", icon: "bell", label: "nav.reminders", Screen: Reminders, narrow: true },
  { id: "studyplan", icon: "calendarCheck", label: "nav.studyplan", Screen: StudyPlan, narrow: true },
  { id: "timetable", icon: "calendarRange", label: "nav.timetable", Screen: withCourses(Week) },
  { id: "exams", icon: "fileEdit", label: "nav.exams", Screen: withCourses(Exams) },
  { id: "map", icon: "mapPin", label: "nav.map", Screen: CampusMap },
  { id: "notes", icon: "notebook", label: "nav.notes", Screen: Notes },
  { id: "library", icon: "library", label: "nav.documents", Screen: Library },
  { id: "quiz", icon: "target", label: "nav.quiz", Screen: Quiz, narrow: true },
  { id: "review", icon: "refresh", label: "nav.flashcards", Screen: Review, narrow: true },
  { id: "mock", icon: "fileEdit", label: "nav.mock", Screen: Mock },
  { id: "stats", icon: "chartBar", label: "nav.stats", Screen: Stats },
  { id: "weakness", icon: "crosshair", label: "nav.weakness", Screen: Weakness, narrow: true },
  { id: "trail", icon: "flag", label: "nav.trail", Screen: Trail, narrow: true },
  { id: "planner", icon: "graduationCap", label: "nav.grades", Screen: Planner },
  { id: "costs", icon: "coins", label: "nav.costs", Screen: Costs, narrow: true },
];

export const destination = (id: DestId) => DESTINATIONS.find((d) => d.id === id)!;

/** Ask the app shell to open a page, from anywhere (e.g. a "see all" link). */
export const NAVIGATE_EVENT = "studyos:navigate";
export function navigateTo(id: DestId) {
  window.dispatchEvent(new CustomEvent<DestId>(NAVIGATE_EVENT, { detail: id }));
}
