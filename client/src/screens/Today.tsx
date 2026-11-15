import { useCallback, useEffect, useState } from "react";
import { useT } from "../i18n.tsx";
import { getJSON, type TodayData, type TodayStudyTask } from "../api.ts";
import { formatDate, timeRange, weekdayName } from "../format.ts";
import ClassRows from "../components/ClassRows.tsx";
import { Card, ErrorBox, Loading } from "../components/ui.tsx";
import { CourseChip, CourseTitle } from "../components/CourseTitle.tsx";
import Calendar from "../components/Calendar.tsx";
import Icon from "../components/Icon.tsx";
import { ReminderRow, setDone, useRemindersChanged } from "../components/Reminders.tsx";
import { postJSON } from "../api.ts";
import { navigateTo } from "../destinations.tsx";
import { bangkokTime } from "../reminderAlerts.ts";
import { ChooseCoursesCard } from "../components/TermCourses.tsx";

/**
 * Today's reminders and to-dos, soonest first, with a one-line quick add.
 * A timed item is marked "due now" once its time has arrived.
 */
function TodayTodos({ data }: { data: TodayData }) {
  const { t } = useT();
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(bangkokTime());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(bangkokTime()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  async function quickAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || busy) return;
    setBusy(true);
    try {
      await postJSON("/api/reminders", { kind: "todo", title: title.trim(), date: data.today });
      setTitle("");
      window.dispatchEvent(new Event("studyos:reminders-changed"));
    } finally {
      setBusy(false);
    }
  }

  const open = data.reminders.filter((o) => !o.done).length;

  return (
    <Card>
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>
          {t("today.todos")}
          {open > 0 && <span className="ml-2 text-sm font-normal" style={{ color: "var(--text-tertiary)" }}>{open}</span>}
        </h2>
        <button onClick={() => navigateTo("reminders")} className="text-sm min-h-11 px-1" style={{ color: "var(--accent-text)" }}>
          {t("today.seeAll")} ›
        </button>
      </div>

      {data.reminders.length === 0 ? (
        <p className="text-sm pb-2" style={{ color: "var(--text-tertiary)" }}>{t("rem.empty.today")}</p>
      ) : (
        <ul className="-mx-2">
          {data.reminders.map((o) => {
            const dueNow = !o.done && !o.overdue && !!o.time && o.time <= now;
            return (
              <ReminderRow
                key={`${o.id}-${o.on}`}
                item={o} on={o.on} done={o.done} overdue={o.overdue} today={data.today} hideDate={!o.overdue}
                badge={dueNow ? t("rem.dueNow") : undefined}
                onToggle={() => setDone(o.id, o.on, !o.done)}
                onOpen={() => navigateTo("reminders")}
              />
            );
          })}
        </ul>
      )}

      <form onSubmit={quickAdd} className="flex gap-2 mt-1">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={200}
          placeholder={t("today.quickAdd")}
          aria-label={t("today.quickAdd")}
          className="flex-1 min-w-0 rounded-xl border px-3 py-2.5 min-h-11"
          style={{ backgroundColor: "var(--bg-base)", borderColor: "var(--border)", color: "var(--text-primary)" }}
        />
        <button
          type="submit"
          disabled={!title.trim() || busy}
          aria-label={t("rem.add")}
          className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0 disabled:opacity-40"
          style={{ backgroundColor: "var(--accent)", color: "#fff" }}
        >
          <Icon name="plus" size={20} />
        </button>
      </form>
    </Card>
  );
}

type TrailSummary = { available: boolean; goal?: { target: string; isDefault: boolean }; trail?: { achievable: boolean; finishTerm: string | null; credits: { left: number } } };

/** One line on the trail to the degree, linking to the planner. Hidden when there is nothing to plan. */
function TrailCard() {
  const { t } = useT();
  const [d, setD] = useState<TrailSummary | null>(null);
  useEffect(() => { getJSON<TrailSummary>("/api/trail").then(setD).catch(() => setD(null)); }, []);
  if (!d?.available || !d.trail || !d.goal || d.trail.credits.left === 0) return null;
  const termName = (id: string) => { const [k, yy] = id.split("/"); return k === "S" ? t("trail.summerOf", { year: `25${yy}` }) : t("trail.termOf", { n: k, year: `25${yy}` }); };
  const on = d.trail.achievable && d.trail.finishTerm;
  // A goal she has not set herself is a starting point: said calmly, never "not on track".
  const starting = d.goal.isDefault;
  return (
    <button onClick={() => navigateTo("trail")} className="block w-full text-left">
      <Card>
        <div className="flex items-center gap-3">
          <Icon name="flag" size={22} style={{ color: starting ? "var(--accent-text)" : on ? "var(--success)" : "var(--warning, var(--danger))" }} />
          <div className="flex-1 min-w-0">
            <p className="font-semibold" style={{ color: "var(--text-primary)" }}>
              {starting
                ? t("trail.cardStart", { term: termName(d.trail.finishTerm ?? d.goal.target) })
                : on ? t("trail.cardOn", { term: termName(d.trail.finishTerm!) }) : t("trail.cardOff", { term: termName(d.goal.target) })}
            </p>
            <p className="text-sm" style={{ color: "var(--accent-text)" }}>{t(starting ? "trail.cardSet" : "trail.cardOpen")} ›</p>
          </div>
        </div>
      </Card>
    </button>
  );
}

/**
 * Today's study: the tasks her own study plan put on today, tickable here. Replaces the old
 * per-course targets, which split a hidden 36 hours a week (owner 2026-11-15: calm defaults).
 * With no plan, one line pointing to the Study plan page.
 */
function StudyTodayCard({ data, onChanged }: { data: TodayData["studyToday"]; onChanged: () => void }) {
  const { t } = useT();
  const [tasks, setTasks] = useState<TodayStudyTask[]>(data.tasks);
  useEffect(() => setTasks(data.tasks), [data.tasks]);
  const toggle = (id: number) =>
    postJSON<{ id: number; done: number }>(`/api/studyplan/tasks/${id}/toggle`, {})
      .then((r) => setTasks((prev) => prev.map((x) => (x.id === r.id ? { ...x, done: r.done } : x))))
      .catch(() => onChanged());
  return (
    <Card>
      <div className="flex justify-between items-baseline mb-1 gap-2">
        <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>{t("today.study")}</h2>
        <button onClick={() => navigateTo("studyplan")} className="text-sm min-h-11" style={{ color: "var(--accent-text)" }}>
          {t(data.hasPlan ? "today.studyOpen" : "today.studyMake")} ›
        </button>
      </div>
      {!data.hasPlan ? (
        <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>{t("today.studyNone")}</p>
      ) : tasks.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>{t("today.studyFree")}</p>
      ) : (
        <ul className="space-y-1">
          {tasks.map((task) => (
            <li key={task.id}>
              <button onClick={() => toggle(task.id)} className="w-full flex items-start gap-3 text-left min-h-11 py-1" aria-pressed={!!task.done}>
                <Icon name={task.done ? "checkCircle" : "square"} size={20} style={{ color: task.done ? "var(--success)" : "var(--text-tertiary)", flexShrink: 0, marginTop: 2 }} />
                <span className="flex-1 min-w-0 text-sm" style={{ color: task.done ? "var(--text-tertiary)" : "var(--text-primary)", textDecoration: task.done ? "line-through" : "none" }}>
                  <CourseChip code={task.course_code} kind="task" className="mr-1.5" /> {task.description}
                </span>
                <span className="text-xs whitespace-nowrap" style={{ color: "var(--text-tertiary)" }}>{t("today.minutes", { n: task.minutes })}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {data.overdue > 0 && (
        <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>{t("today.studyOverdue", { n: data.overdue })}</p>
      )}
    </Card>
  );
}

export default function Today() {
  const { t, lang } = useT();
  const [data, setData] = useState<TodayData | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(() => {
    setError(false);
    return getJSON<TodayData>("/api/today").then(setData).catch(() => setError(true));
  }, []);
  useEffect(() => { load(); }, [load]);
  useRemindersChanged(load);

  if (error && !data) return <ErrorBox onRetry={load} />;
  if (!data) return <Loading>{t("status.connecting")}</Loading>;

  // Phone order: to-dos, calendar, the rest. On a wide window (see .today-grid
  // in index.css) the calendar takes the left column and the lists sit beside it.
  return (
    <div className="today-grid space-y-4">
      <header className="today-head">
        <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>{t("today.title")}</h1>
        <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
          {/* The term written the way the trail writes it ("Term 2/2569"), not "Term 2/69". */}
          {formatDate(data.today, lang)} · {(() => { const [k, yy] = data.term.split("/"); return k === "S" ? t("trail.summerOf", { year: `25${yy}` }) : t("trail.termOf", { n: k, year: `25${yy}` }); })()}
        </p>
      </header>

      <div className="today-top space-y-4">
      <TodayTodos data={data} />

      {/* Not chosen yet: the timetable is empty. Straight after onboarding the picker opens by itself. */}
      <ChooseCoursesCard onChanged={load} />
      <TrailCard />
      </div>

      <div className="today-cal"><Calendar /></div>

      <div className="today-rest space-y-4">
      <Card>
        <h2 className="font-semibold mb-1" style={{ color: "var(--text-primary)" }}>{t("today.nextExam")}</h2>
        {data.nextExam ? (
          <div className="flex items-center justify-between">
            <div>
              <CourseTitle
                code={data.nextExam.course_code}
                name_th={data.nextExam.name_th}
                name_en={data.nextExam.name_en}
                className="font-medium"
                kind={data.nextExam.kind === "etesting" ? "etbooked" : "exam"}
              />
              <div className="text-sm" style={{ color: "var(--text-tertiary)" }}>
                {formatDate(data.nextExam.date, lang)}
                {data.nextExam.start && data.nextExam.end ? ` · ${timeRange(data.nextExam.start, data.nextExam.end)}` : ""}
                {data.nextExam.kind === "etesting" ? ` · ${t("today.examEtesting")}` : data.nextExam.kind === "own" ? ` · ${t("today.examOwn")}` : ""}
              </div>
              {data.nextExam.seat && <div className="text-sm" style={{ color: "var(--text-secondary)" }}>{t("exam.seat")}: {data.nextExam.seat}</div>}
            </div>
            <span className="font-semibold" style={{ color: "var(--accent-text)" }}>
              {data.nextExam.daysLeft === 0
                ? t("today.examToday")
                : t("today.daysLeft", { n: data.nextExam.daysLeft })}
            </span>
          </div>
        ) : (
          <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>{t("today.noExam")}</p>
        )}
      </Card>

      <Card>
        {/* Editing this term's courses is on the trail screen, where the plan re-shapes around them. */}
        <h2 className="font-semibold mb-1" style={{ color: "var(--text-primary)" }}>{t("today.classes")}</h2>
        {data.classes.length === 0 && (
          <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>{t("today.noClasses")}</p>
        )}
        {data.classes.length === 0 && data.nextClasses && (
          <p className="text-sm font-medium mt-3 mb-1" style={{ color: "var(--text-secondary)" }}>
            {t("today.nextClasses", { day: weekdayName(data.nextClasses.weekday, lang) })}
          </p>
        )}
        <ClassRows classes={data.classes.length > 0 ? data.classes : data.nextClasses?.classes ?? []} />
      </Card>

      <Card>
        <div className="flex justify-between items-center">
          <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>{t("today.review")}</h2>
          <span className="font-semibold" style={{ color: "var(--accent-text)" }}>
            {t("today.cards", { n: data.dueFlashcards })}
          </span>
        </div>
      </Card>

      <StudyTodayCard data={data.studyToday} onChanged={load} />
      </div>
    </div>
  );
}
