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
      <h1 className="text-2xl font-bold text-slate-800">{t("stats.pageTitle")}</h1>
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
      // keep the timer usable even if logging fails
    }
  }

  // countdown
  useEffect(() => {
    if (!running) return;
    tick.current = setInterval(() => {
      setSecondsLeft((s) => {
        if (s > 1) return s - 1;
        // phase finished
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
      <h2 className="font-semibold text-slate-700 mb-3">{t("pomo.title")}</h2>

      <select
        value={courseCode}
        onChange={(e) => setCourseCode(e.target.value)}
        className="w-full rounded-lg border border-slate-200 px-3 py-2 bg-white text-sm mb-3"
      >
        <option value="">{t("pomo.selectCourse")}</option>
        {courses.map((c) => (
          <option key={c.code} value={c.code}>
            {c.code} {c.name_th}
          </option>
        ))}
      </select>

      <div className="text-center">
        <div className={`text-xs font-medium ${phase === "focus" ? "text-indigo-600" : "text-green-600"}`}>
          {t(phase === "focus" ? "pomo.focus" : "pomo.break")}
        </div>
        <div className="text-5xl font-bold text-slate-800 tabular-nums my-1">
          {mm}:{ss}
        </div>
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
          <div
            className={phase === "focus" ? "h-full bg-indigo-500" : "h-full bg-green-500"}
            style={{ width: `${pct}%` }}
          />
        </div>
      </div>

      {logged != null && (
        <p className="text-center text-xs text-green-600 mt-2">{t("pomo.logged", { m: logged })}</p>
      )}

      <div className="flex gap-2 mt-3">
        <button
          onClick={() => {
            setLogged(null);
            setRunning((r) => !r);
          }}
          className="flex-1 bg-indigo-600 text-white font-medium rounded-lg py-2"
        >
          {running ? t("pomo.pause") : t("pomo.start")}
        </button>
        <button onClick={finishAndLog} className="flex-1 bg-slate-800 text-white font-medium rounded-lg py-2">
          {t("pomo.finish")}
        </button>
        <button onClick={reset} className="px-4 text-slate-500 text-sm">
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
      <h2 className="font-semibold text-slate-700">{t("an.title")}</h2>
      {data.courses.length === 0 ? (
        <p className="text-slate-400 text-sm">{t("an.empty")}</p>
      ) : (
        data.courses.map((c) => <CourseRow key={c.code} c={c} />)
      )}
    </div>
  );
}

const RISK_STYLE: Record<string, string> = {
  green: "bg-green-100 text-green-700",
  yellow: "bg-amber-100 text-amber-700",
  red: "bg-red-100 text-red-700",
};

function CourseRow({ c }: { c: CourseAnalytics }) {
  const { t } = useT();
  const hoursPct = c.targetWeeklyHours > 0 ? Math.min((c.actualWeeklyHours / c.targetWeeklyHours) * 100, 100) : 0;

  return (
    <Card>
      <div className="flex justify-between items-start gap-2">
        <CourseTitle
          code={c.code}
          name_th={c.name_th}
          name_en={c.name_en}
          className="font-medium text-slate-800 text-sm flex-1"
        />
        <span className={`text-xs font-semibold rounded-full px-2 py-0.5 whitespace-nowrap ${RISK_STYLE[c.risk]}`}>
          {t(`risk.${c.risk}`)}
        </span>
      </div>

      {/* hours vs target */}
      <div className="mt-2">
        <div className="flex justify-between text-xs text-slate-500">
          <span>{t("an.hours")}</span>
          <span>{t("an.hoursValue", { actual: c.actualWeeklyHours, target: c.targetWeeklyHours })}</span>
        </div>
        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mt-1">
          <div className="h-full bg-indigo-500" style={{ width: `${hoursPct}%` }} />
        </div>
      </div>

      {/* quiz + exam */}
      <div className="flex justify-between text-xs mt-2">
        <span className="text-slate-500">
          {t("an.quizAvg")}:{" "}
          <span className="text-slate-700 font-medium">
            {c.quizAverage != null ? `${c.quizAverage}%` : t("an.noQuiz")}
          </span>
        </span>
        <span className="text-slate-400">
          {c.daysToExam != null ? t("an.daysToExam", { n: c.daysToExam }) : t("an.noExam")}
        </span>
      </div>

      {/* weak topics */}
      {c.weakestTopics.length > 0 && (
        <div className="flex flex-wrap gap-1 mt-2">
          <span className="text-xs text-slate-400">{t("an.weak")}:</span>
          {c.weakestTopics.map((w, i) => (
            <span key={i} className="bg-red-50 text-red-600 text-xs rounded-full px-2 py-0.5">
              {w.name} {w.mastery}%
            </span>
          ))}
        </div>
      )}
    </Card>
  );
}
