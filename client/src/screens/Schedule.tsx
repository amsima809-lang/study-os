import { useState } from "react";
import { useT } from "../i18n.tsx";
import Week from "./Week.tsx";
import Exams from "./Exams.tsx";

/** Combines the weekly timetable and the exam list under one tab. */
export default function Schedule() {
  const { t } = useT();
  const [view, setView] = useState<"week" | "exams">("week");

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        {(["week", "exams"] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`flex-1 rounded-lg py-2 text-sm font-medium ${
              view === v ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500"
            }`}
          >
            {t(v === "week" ? "sched.week" : "sched.exams")}
          </button>
        ))}
      </div>
      {view === "week" ? <Week /> : <Exams />}
    </div>
  );
}
