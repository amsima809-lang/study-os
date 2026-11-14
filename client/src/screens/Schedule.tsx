import { useEffect, useState } from "react";
import { useT } from "../i18n.tsx";
import { getJSON } from "../api.ts";
import { Card } from "../components/ui.tsx";
import Icon from "../components/Icon.tsx";
import TermCoursesPicker from "../components/TermCourses.tsx";
import Week from "./Week.tsx";
import Exams from "./Exams.tsx";

/** Combines the weekly timetable and the exam list under one tab. */
export default function Schedule() {
  const { t } = useT();
  const [view, setView] = useState<"week" | "exams">("week");
  // Until a student has chosen their courses for the term, both views show
  // every course of their major. Say so, and offer the picker right here.
  const [courses, setCourses] = useState<{ chosen: number; options: number } | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [version, setVersion] = useState(0); // bumped after choosing, to reload the views

  useEffect(() => {
    getJSON<{ chosen: string[]; options: unknown[] }>("/api/term-courses")
      .then((d) => setCourses({ chosen: d.chosen.length, options: d.options.length }))
      .catch(() => setCourses(null));
  }, [version]);

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

      {courses && courses.options > 0 && (
        courses.chosen === 0 ? (
          <Card>
            <div className="flex items-start gap-3">
              <Icon name="graduationCap" size={22} style={{ color: "var(--accent-2, var(--accent-text))", marginTop: 2 }} />
              <div className="flex-1 min-w-0 space-y-2">
                <p className="font-semibold" style={{ color: "var(--text-primary)" }}>{t("tc.promptTitle")}</p>
                <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{t("tc.prompt")}</p>
                <button
                  onClick={() => setChoosing(true)}
                  className="rounded-xl px-4 min-h-11 text-sm font-semibold"
                  style={{ backgroundColor: "var(--accent)", color: "#fff" }}
                >
                  {t("tc.choose")}
                </button>
              </div>
            </div>
          </Card>
        ) : (
          <button onClick={() => setChoosing(true)} className="tap-area text-sm font-medium" style={{ color: "var(--accent-text)" }}>
            {t("tc.link", { n: courses.chosen })} ›
          </button>
        )
      )}
      {choosing && (
        <TermCoursesPicker
          onClose={() => {
            setChoosing(false);
            setVersion((n) => n + 1);
          }}
        />
      )}

      {view === "week" ? <Week key={`week-${version}`} /> : <Exams key={`exams-${version}`} />}
    </div>
  );
}
