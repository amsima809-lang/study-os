import { useEffect, useRef, useState } from "react";
import { useT } from "../i18n.tsx";
import {
  getJSON,
  postJSON,
  type Course,
  type AnalyticsData,
  type CourseAnalytics,
} from "../api.ts";
import { Card, Loading } from "../components/ui.tsx";
import { CourseTitle } from "../components/CourseTitle.tsx";

const FOCUS_MIN = 45;
const BREAK_MIN = 10;

export default function Stats() {
  const { t } = useT();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>{t("stats.pageTitle")}</h1>
      <Pomodoro />
      <Analytics />
    </div>
  );
}

function Pomodoro() {
  const { t } = useT();
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseCode, setCourseCode] = useState("");
  const [phase, setPhase] = useState<"focus" | "break">("focus");
  const [secondsLeft, setSecondsLeft] = useState(FOCUS_MIN * 60);
  const [running, setRunning] = useState(false);
  const [logged, setLogged] = useState<number | null>(null);
  const tick = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    getJSON<{ courses: Course[] }>("/api/courses")
      .then((d) => setCourses(d.courses))
      .catch(() => setCourses([]));
  }, []);

  async function logSession(minutes: number) {
    if (minutes < 1) return;
    setLogged(minutes);
    try {
      await postJSON("/api/study-sessions", {
        course_code: courseCode || null,
        minutes,
        kind: "read",
      });
    } catch {
      /* keep the timer usable */
    }
  }

  useEffect(() => {
    if (!running) return;
    tick.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s > 1) return s - 1;
        if (phase === "focus") {
          void logSession(FOCUS_MIN);
          setPhase("break");
          return BREAK_MIN * 60;
        } else {
          setPhase("focus");
          setRunning(false);
          return FOCUS_MIN * 60;
        }
      });
    }, 1000);
    return () => {
      if (tick.current) clearInterval(tick.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [running, phase]);

  function reset() {
    setRunning(false);
    setPhase("focus");
    setSecondsLeft(FOCUS_MIN * 60);
  }

  function finishAndLog() {
    if (phase === "focus") {
      const elapsed = Math.round((FOCUS_MIN * 60 - secondsLeft) / 60);
      void logSession(elapsed);
    }
    reset();
  }

  const total = (phase === "focus" ? FOCUS_MIN : BREAK_MIN) * 60;
  const pct = ((total - secondsLeft) / total) * 100;
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
  const ss = String(secondsLeft % 60).padStart(2, "0");

  return (
    <Card>
      <h2 className="font-semibold mb-3" style={{ color: "var(--text-primary)" }}>{t("pomo.title")}</h2>

      <select
        value={courseCode}
        onChange={(e) => setCourseCode(e.target.value)}
        className="w-full rounded-lg border px-3 py-2 text-sm mb-3"
        style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-primary)" }}
      >
        <option value="">{t("pomo.selectCourse")}</option>
        {courses.map((c) => (
          <option key={c.code} value={c.code}>
            {c.code} {c.name_th}
          </option>
        ))}
      </select>

      <div className="text-center">
        <div className="text-xs font-medium" style={{ color: phase === "focus" ? "var(--accent-text)" : "var(--success)" }}>
          {t(phase === "focus" ? "pomo.focus" : "pomo.break")}
        </div>
        <div className="text-5xl font-bold tabular-nums my-1" style={{ color: "var(--text-primary)" }}>
          {mm}:{ss}
        </div>
        <div className="h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--border-light)" }}>
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${pct}%`, backgroundColor: phase === "focus" ? "var(--accent)" : "var(--success)" }}
          />
        </div>
      </div>

      {logged != null && (
        <p className="text-center text-xs mt-2" style={{ color: "var(--success)" }}>{t("pomo.logged", { m: logged })}</p>
      )}

      <div className="flex gap-2 mt-3">
        <button
          onClick={() => {
            setLogged(null);
            setRunning((r) => !r);
          }}
          className="flex-1 font-medium rounded-lg py-2"
          style={{ backgroundColor: "var(--accent)", color: "var(--text-inverse)" }}
        >
          {running ? t("pomo.pause") : t("pomo.start")}
        </button>
        <button
          onClick={finishAndLog}
          className="flex-1 font-medium rounded-lg py-2"
          style={{ backgroundColor: "var(--text-primary)", color: "var(--text-inverse)" }}
        >
          {t("pomo.finish")}
        </button>
        <button onClick={reset} className="px-4 text-sm" style={{ color: "var(--text-tertiary)" }}>
          {t("pomo.reset")}
        </button>
      </div>
    </Card>
  );
}

function Analytics() {
  const { t } = useT();
  const [data, setData] = useState<AnalyticsData | null>(null);

  useEffect(() => {
    getJSON<AnalyticsData>("/api/analytics").then(setData).catch(() => setData(null));
  }, []);

  if (!data) return <Loading>{t("status.connecting")}</Loading>;

  return (
    <div className="space-y-3">
      <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>{t("an.title")}</h2>
      {data.courses.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>{t("an.empty")}</p>
      ) : (
        data.courses.map((c) => <CourseRow key={c.code} c={c} />)
      )}
    </div>
  );
}

function CourseRow({ c }: { c: CourseAnalytics }) {
  const { t } = useT();
  const hoursPct = c.targetWeeklyHours > 0 ? Math.min((c.actualWeeklyHours / c.targetWeeklyHours) * 100, 100) : 0;

  const riskStyle: Record<string, { bg: string; text: string }> = {
    green: { bg: "var(--success-bg)", text: "var(--success)" },
    yellow: { bg: "var(--warning-bg)", text: "var(--warning)" },
    red: { bg: "var(--danger-bg)", text: "var(--danger)" },
  };
  const rs = riskStyle[c.risk] ?? riskStyle.green;

  return (
    <Card>
      <div className="flex justify-between items-start gap-2">
        <CourseTitle
          code={c.code}
          name_th={c.name_th}
          name_en={c.name_en}
          className="font-medium text-sm flex-1"
        />
        <span
          className="text-xs font-semibold rounded-full px-2 py-0.5 whitespace-nowrap"
          style={{ backgroundColor: rs.bg, color: rs.text }}
        >
          {t(`risk.${c.risk}`)}
        </span>
      </div>

      <div className="mt-2">
        <div className="flex justify-between text-xs" style={{ color: "var(--text-tertiary)" }}>
          <span>{t("an.hours")}</span>
          <span>{t("an.hoursValue", { actual: c.actualWeeklyHours, target: c.targetWeeklyHours })}</span>
        </div>
        <div className="h-1.5 rounded-full overflow-hidden mt-1" style={{ backgroundColor: "var(--border-light)" }}>
          <div className="h-full rounded-full" style={{ width: `${hoursPct}%`, backgroundColor: "var(--accent)" }} />
        </div>
      </div>

      <div className="flex justify-between text-xs mt-2">
        <span style={{ color: "var(--text-tertiary)" }}>
          {t("an.quizAvg")}:{" "}
          <span className="font-medium" style={{ color: "var(--text-primary)" }}>
            {c.quizAverage != null ? `${c.quizAverage}%` : t("an.noQuiz")}
          </span>
        </span>
        <span style={{ color: "var(--text-tertiary)" }}>
          {c.daysToExam != null ? t("an.daysToExam", { n: c.daysToExam }) : t("an.noExam")}
        </span>
      </div>

      {c.weakestTopics.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{t("an.weak")}:</span>
          {c.weakestTopics.map((w, i) => (
            <span
              key={i}
              className="text-xs rounded-full px-2 py-0.5"
              style={{ backgroundColor: "var(--danger-bg)", color: "var(--danger)" }}
            >
              {w.name} {w.mastery}%
            </span>
          ))}
        </div>
      )}
    </Card>
  );
}
