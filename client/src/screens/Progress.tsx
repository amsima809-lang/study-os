/**
 * Progress: how the studying is going. One page for what used to be two ("Stats & tracker" and
 * "Weaknesses & review stats"), which both listed weak topics and scored each course:
 *   - the study timer, which is what fills in "hours this week"
 *   - flashcard numbers and the last 30 days of reviewing
 *   - each of this term's courses once: risk, hours against the target, quiz average, mastery
 *   - the weak topics, once, across all courses
 */
import { useEffect, useRef, useState } from "react";
import { useT } from "../i18n.tsx";
import {
  getJSON,
  postJSON,
  type Course,
  type AnalyticsData,
  type CourseAnalytics,
  type WeaknessData,
  type ReviewHistoryDay,
} from "../api.ts";
import { Card, ErrorBox, Loading } from "../components/ui.tsx";
import { CourseChip, CourseTitle } from "../components/CourseTitle.tsx";

const FOCUS_MIN = 45;
const BREAK_MIN = 10;

type Everything = { analytics: AnalyticsData; weakness: WeaknessData; history: ReviewHistoryDay[] };

export default function Progress() {
  const { t } = useT();
  const [data, setData] = useState<Everything | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setFailed(false);
    Promise.all([
      getJSON<AnalyticsData>("/api/analytics"),
      getJSON<WeaknessData>("/api/weakness"),
      getJSON<{ history: ReviewHistoryDay[] }>("/api/flashcards/history?days=30"),
    ])
      .then(([analytics, weakness, h]) => setData({ analytics, weakness, history: h.history }))
      .catch(() => setFailed(true));
  }, [attempt]);

  return (
    <div className="wide-grid space-y-4">
      <h1 className="span-all text-2xl font-bold" style={{ color: "var(--text-primary)" }}>{t("progress.title")}</h1>
      <Pomodoro />
      {failed ? <ErrorBox onRetry={() => setAttempt((n) => n + 1)} /> : !data ? <Loading>{t("status.connecting")}</Loading> : <Numbers data={data} />}
    </div>
  );
}

function Numbers({ data }: { data: Everything }) {
  const { t, lang } = useT();
  const { analytics, weakness, history } = data;
  const stats = weakness.reviewStats;
  const mastery = new Map(weakness.courses.map((c) => [c.course_code, c.avg_mastery]));
  const thisTerm = new Set(analytics.courses.map((c) => c.code));
  // Courses with a mastery score that are not this term's (earlier terms): listed after, briefly.
  const others = weakness.courses.filter((c) => !thisTerm.has(c.course_code));
  const tiles: [string, string, string][] = [
    [String(stats.total_cards ?? 0), "weak.totalCards", "var(--accent-text)"],
    [String(stats.due ?? 0), "weak.dueToday", "var(--warning)"], // (no cards at all: the server sends null)
    [stats.avg_retention ? `${Math.round(stats.avg_retention * 100)}%` : "-", "weak.retention", "var(--success)"],
    [stats.avg_easiness ? stats.avg_easiness.toFixed(2) : "-", "weak.easiness", "var(--text-secondary)"],
  ];

  return (
    <>
      {/* Flashcards */}
      <Card>
        <h2 className="font-semibold mb-3" style={{ color: "var(--text-primary)" }}>{t("progress.cards")}</h2>
        <div className="grid grid-cols-4 gap-2">
          {tiles.map(([value, label, colour]) => (
            <div key={label} className="text-center">
              <p className="text-xl font-bold" style={{ color: colour }}>{value}</p>
              <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>{t(label)}</p>
            </div>
          ))}
        </div>
        {history.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-medium mb-2" style={{ color: "var(--text-secondary)" }}>{t("weak.historyTitle")}</h3>
            <HistoryBars history={history} />
            <div className="flex justify-between mt-1" style={{ fontSize: 12, color: "var(--text-tertiary)" }}>
              <span>{history[0]?.date.slice(5)}</span>
              <span>{history[history.length - 1]?.date.slice(5)}</span>
            </div>
          </div>
        )}
      </Card>

      {/* This term's courses, each once */}
      <h2 className="span-all font-semibold" style={{ color: "var(--text-primary)" }}>{t("an.title")}</h2>
      {analytics.courses.length === 0 ? (
        <p className="span-all text-sm" style={{ color: "var(--text-tertiary)" }}>{t("an.empty")}</p>
      ) : (
        analytics.courses.map((c) => <CourseRow key={c.code} c={c} mastery={mastery.get(c.code) ?? null} />)
      )}

      {/* The weak topics, once, across every course */}
      {weakness.weakTopics.length > 0 && (
        <Card>
          <h2 className="font-semibold mb-2" style={{ color: "var(--text-primary)" }}>{t("weak.weakTopics")}</h2>
          <ul className="space-y-2">
            {weakness.weakTopics.map((wt, i) => (
              <li key={i} className="flex items-center justify-between gap-2 text-sm">
                <div className="min-w-0">
                  <p className="truncate" style={{ color: "var(--text-primary)" }}>{wt.chapter_name ?? wt.topic}</p>
                  <p className="text-xs flex items-center gap-1.5" style={{ color: "var(--text-tertiary)" }}>
                    <CourseChip code={wt.course_code} />
                    <span className="truncate">{wt.course_name}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2 whitespace-nowrap">
                  <span className="font-medium" style={{ color: masteryColour(wt.mastery_score) }}>{Math.round(wt.mastery_score)}%</span>
                  <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{wt.correct_attempts}/{wt.total_attempts}</span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {others.length > 0 && (
        <Card>
          <h2 className="font-semibold mb-2" style={{ color: "var(--text-primary)" }}>{t("progress.otherCourses")}</h2>
          <ul className="space-y-2">
            {others.map((c) => (
              <li key={c.course_code} className="flex items-center justify-between gap-2 text-sm">
                <span className="min-w-0 truncate" style={{ color: "var(--text-secondary)" }}>
                  <CourseChip code={c.course_code} className="mr-1.5" />
                  {lang === "en" && c.name_en ? c.name_en : c.name_th}
                </span>
                <span className="font-medium" style={{ color: masteryColour(c.avg_mastery) }}>{Math.round(c.avg_mastery)}%</span>
              </li>
            ))}
          </ul>
        </Card>
      )}
    </>
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

      <select aria-label={t("field.course")}
        value={courseCode}
        onChange={(e) => setCourseCode(e.target.value)}
        className="w-full rounded-lg border px-3 py-2 text-sm mb-3 min-h-11"
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
          className="flex-1 font-medium rounded-lg py-2 min-h-11"
          style={{ backgroundColor: "var(--accent)", color: "#fff" }}
        >
          {running ? t("pomo.pause") : t("pomo.start")}
        </button>
        <button
          onClick={finishAndLog}
          className="flex-1 font-medium rounded-lg py-2 min-h-11"
          style={{ backgroundColor: "var(--text-primary)", color: "var(--text-inverse)" }}
        >
          {t("pomo.finish")}
        </button>
        <button onClick={reset} className="px-4 text-sm min-h-11" style={{ color: "var(--text-tertiary)" }}>
          {t("pomo.reset")}
        </button>
      </div>
    </Card>
  );
}

function CourseRow({ c, mastery }: { c: CourseAnalytics; mastery: number | null }) {
  const { t } = useT();
  // The target is what her study plan gives this course this week; with no plan, hours only.
  const target = c.targetWeeklyHours;
  const hoursPct = target ? Math.min((c.actualWeeklyHours / target) * 100, 100) : 0;

  const riskStyle: Record<string, { bg: string; text: string }> = {
    green: { bg: "var(--success-bg)", text: "var(--success)" },
    yellow: { bg: "var(--warning-bg)", text: "var(--warning)" },
    red: { bg: "var(--danger-bg)", text: "var(--danger)" },
  };
  const rs = riskStyle[c.risk] ?? riskStyle.green;

  return (
    <Card>
      <div className="flex justify-between items-start gap-2">
        <CourseTitle code={c.code} name_th={c.name_th} name_en={c.name_en} className="font-medium text-sm flex-1" />
        <span className="text-xs font-semibold rounded-full px-2 py-0.5 whitespace-nowrap" style={{ backgroundColor: rs.bg, color: rs.text }}>
          {t(`risk.${c.risk}`)}
        </span>
      </div>

      <div className="mt-2">
        <div className="flex justify-between text-xs" style={{ color: "var(--text-tertiary)" }}>
          <span>{t("an.hours")}</span>
          <span>{target ? t("an.hoursValue", { actual: c.actualWeeklyHours, target }) : t("an.hoursOnly", { actual: c.actualWeeklyHours })}</span>
        </div>
        {target ? (
          <div className="h-1.5 rounded-full overflow-hidden mt-1" style={{ backgroundColor: "var(--border-light)" }}>
            <div className="h-full rounded-full" style={{ width: `${hoursPct}%`, background: "linear-gradient(90deg, var(--accent), var(--accent-2, var(--accent)))" }} />
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap justify-between gap-x-3 gap-y-1 text-xs mt-2" style={{ color: "var(--text-tertiary)" }}>
        <span>
          {t("an.quizAvg")}:{" "}
          <span className="font-medium" style={{ color: "var(--text-primary)" }}>{c.quizAverage != null ? `${c.quizAverage}%` : t("an.noQuiz")}</span>
        </span>
        {mastery != null && (
          <span>
            {t("progress.mastery")}:{" "}
            <span className="font-medium" style={{ color: masteryColour(mastery) }}>{Math.round(mastery)}%</span>
          </span>
        )}
        <span>{c.daysToExam != null ? t("an.daysToExam", { n: c.daysToExam }) : t("an.noExam")}</span>
      </div>
    </Card>
  );
}

function HistoryBars({ history }: { history: ReviewHistoryDay[] }) {
  const maxR = Math.max(...history.map((h) => h.reviews), 1);
  return (
    <div className="flex items-end gap-1 h-24">
      {history.map((d) => {
        const pct = (d.reviews / maxR) * 100;
        const color = d.avg_confidence >= 3 ? "var(--success)" : d.avg_confidence >= 2 ? "var(--warning)" : "var(--danger)";
        return (
          <div key={d.date} className="flex-1 flex flex-col items-center gap-0.5" title={`${d.date}: ${d.reviews} reviews`}>
            <div className="w-full rounded-t" style={{ height: `${Math.max(pct, 4)}%`, backgroundColor: color }} />
          </div>
        );
      })}
    </div>
  );
}

function masteryColour(score: number): string {
  if (score >= 70) return "var(--success)";
  if (score >= 40) return "var(--warning)";
  return "var(--danger)";
}
