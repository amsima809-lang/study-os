import { useState } from "react";
import { useT } from "../i18n.tsx";
import { ChooseCoursesCard } from "../components/TermCourses.tsx";
import Week from "./Week.tsx";
import Exams from "./Exams.tsx";

/** Combines the weekly timetable and the exam list under one tab. */
export default function Schedule() {
  const { t } = useT();
  const [view, setView] = useState<"week" | "exams">("week");
  const [version, setVersion] = useState(0); // bumped after courses are chosen, to reload the views

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(["week", "exams"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className="flex-1 rounded-lg py-2 text-sm font-medium transition-colors min-h-11"
            style={{
              backgroundColor: view === v ? "var(--accent)" : "var(--bg-surface-hover)",
              color: view === v ? "var(--text-inverse)" : "var(--text-tertiary)",
            }}
          >
            {t(v === "week" ? "sched.week" : "sched.exams")}
          </button>
        ))}
      </div>

      {/* Both views are empty until the student has chosen their courses for the term. */}
      <ChooseCoursesCard showLink onChanged={() => setVersion((n) => n + 1)} />

      {view === "week" ? <Week key={`week-${version}`} /> : <Exams key={`exams-${version}`} />}
    </div>
  );
}
