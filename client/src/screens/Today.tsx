import { useCallback, useEffect, useState } from "react";
import { useT } from "../i18n.tsx";
import { getJSON, type TodayData } from "../api.ts";
import { formatDate, timeRange } from "../format.ts";
import { Card, ErrorBox, Loading } from "../components/ui.tsx";
import { CourseTitle } from "../components/CourseTitle.tsx";
import Calendar from "../components/Calendar.tsx";
import Icon from "../components/Icon.tsx";
import { ReminderRow, setDone, useRemindersChanged } from "../components/Reminders.tsx";
import { postJSON } from "../api.ts";
import { navigateTo } from "../destinations.tsx";
import { bangkokTime } from "../reminderAlerts.ts";
import TermCoursesPicker, { ChooseCoursesCard } from "../components/TermCourses.tsx";

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

type TrailSummary = { available: boolean; goal?: { target: string }; trail?: { achievable: boolean; finishTerm: string | null; credits: { left: number } } };

/** One line on the trail to the degree, linking to the planner. Hidden when there is nothing to plan. */
function TrailCard() {
  const { t } = useT();
  const [d, setD] = useState<TrailSummary | null>(null);
  useEffect(() => { getJSON<TrailSummary>("/api/trail").then(setD).catch(() => setD(null)); }, []);
  if (!d?.available || !d.trail || !d.goal || d.trail.credits.left === 0) return null;
  const termName = (id: string) => { const [k, yy] = id.split("/"); return k === "S" ? t("trail.summerOf", { year: `25${yy}` }) : t("trail.termOf", { n: k, year: `25${yy}` }); };
  const on = d.trail.achievable && d.trail.finishTerm;
  return (
    <button onClick={() => navigateTo("trail")} className="block w-full text-left">
      <Card>
        <div className="flex items-center gap-3">
          <Icon name="flag" size={22} style={{ color: on ? "var(--success)" : "var(--warning, var(--danger))" }} />
          <div className="flex-1 min-w-0">
            <p className="font-semibold" style={{ color: "var(--text-primary)" }}>
              {on ? t("trail.cardOn", { term: termName(d.trail.finishTerm!) }) : t("trail.cardOff", { term: termName(d.goal.target) })}
            </p>
            <p className="text-sm" style={{ color: "var(--accent-text)" }}>{t("trail.cardOpen")} ›</p>
          </div>
        </div>
      </Card>
    </button>
  );
}

export default function Today() {
  const { t, lang } = useT();
  const [data, setData] = useState<TodayData | null>(null);
  const [error, setError] = useState(false);
  const [choosing, setChoosing] = useState(false);

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
          {formatDate(data.today, lang)} · {t("today.term", { term: data.term })}
        </p>
      </header>

      <div className="today-top space-y-4">
      <TodayTodos data={data} />

      {/* Not chosen yet: the timetable is empty. Straight after onboarding the picker opens by itself. */}
      <ChooseCoursesCard onChanged={load} />
      <TrailCard />
      {choosing && <TermCoursesPicker onClose={() => setChoosing(false)} />}
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
              />
              <div className="text-sm" style={{ color: "var(--text-tertiary)" }}>{formatDate(data.nextExam.date, lang)}</div>
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
        <div className="flex items-center justify-between gap-2 mb-1">
          <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>{t("today.classes")}</h2>
          {data.canChooseCourses && data.chosenCourses > 0 && (
            <button onClick={() => setChoosing(true)} className="text-sm min-h-11 px-1" style={{ color: "var(--accent-text)" }}>
              {t("tc.link", { n: data.chosenCourses })} ›
            </button>
          )}
        </div>
        {data.classes.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>{t("today.noClasses")}</p>
        ) : (
          <ul className="space-y-2">
            {data.classes.map((c, i) => (
              <li key={`${c.course_code}-${i}`} className="flex justify-between text-sm gap-2">
                <CourseTitle
                  code={c.course_code}
                  name_th={c.name_th}
                  name_en={c.name_en}
                  className="font-medium"
                />
                <span className="text-right whitespace-nowrap" style={{ color: "var(--text-tertiary)" }}>
                  {timeRange(c.start_time, c.end_time)}
                  {c.room ? ` · ${c.room}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <div className="flex justify-between items-center">
          <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>{t("today.review")}</h2>
          <span className="font-semibold" style={{ color: "var(--accent-text)" }}>
            {t("today.cards", { n: data.dueFlashcards })}
          </span>
        </div>
      </Card>

      <Card>
        <div className="flex justify-between items-baseline mb-2">
          <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>{t("today.targets")}</h2>
          <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            {t("today.weekTarget", { h: data.studyTargets.weeklyTarget })}
          </span>
        </div>
        <ul className="space-y-2">
          {data.studyTargets.courses.map((c) => (
            <li key={c.code} className="text-sm">
              <div className="flex justify-between gap-2">
                <CourseTitle
                  code={c.code}
                  name_th={c.name_th}
                  name_en={c.name_en}
                  className="font-medium"
                />
                <span className="whitespace-nowrap" style={{ color: "var(--text-primary)" }}>{t("today.perDay", { h: c.dailyHours })}</span>
              </div>
              <div className="flex justify-between text-xs" style={{ color: "var(--text-tertiary)" }}>
                <span>{t(`diff.${c.difficulty}`)}</span>
                <span>{t("today.perWeek", { h: c.weeklyHours })}</span>
              </div>
            </li>
          ))}
        </ul>
      </Card>
      </div>
    </div>
  );
}
