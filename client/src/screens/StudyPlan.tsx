import { useEffect, useState } from "react";
import { useT } from "../i18n.tsx";
import Icon from "../components/Icon.tsx";
import {
  getJSON, postJSON, putJSON,
  type PlanSettings, type PlanCourse, type StudyPlanData, type StudyTask, type CourseStatus,
} from "../api.ts";
import { Card, ErrorBox, Loading } from "../components/ui.tsx";
import { withBase } from "../base.ts";
import { ChooseCoursesCard } from "../components/TermCourses.tsx";

type View = "setup" | "plan";

export default function StudyPlan() {
  const { t } = useT();
  const [view, setView] = useState<View>("plan");
  const [plan, setPlan] = useState<StudyPlanData | null>(null);
  const [loading, setLoading] = useState(true);

  const [failed, setFailed] = useState(false);
  const loadPlan = () => {
    setFailed(false);
    setLoading(true);
    getJSON<StudyPlanData>("/api/studyplan")
      .then((d) => {
        setPlan(d);
        if (!d.plan) setView("setup");
        else setView("plan");
      })
      .catch(() => setFailed(true)) // not "no plan yet": the plan could not be read
      .finally(() => setLoading(false));
  };

  useEffect(loadPlan, []);

  if (loading) return <Loading>{t("status.connecting")}</Loading>;
  if (failed) return <ErrorBox onRetry={loadPlan} />;

  return (
    <div className="space-y-4">
      {/* A plan is built from the exams of the courses chosen for the term: ask for those first. */}
      <ChooseCoursesCard onChanged={loadPlan} />
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>{t("sp.title")}</h1>
        {plan?.plan && (
          <button
            onClick={() => setView(view === "setup" ? "plan" : "setup")}
            className="text-sm min-h-11"
            style={{ color: "var(--accent-text)" }}
          >
            {view === "setup" ? t("sp.viewPlan") : t("sp.settings")}
          </button>
        )}
      </div>

      {view === "setup" ? (
        <Setup onGenerated={loadPlan} hasPlan={!!plan?.plan} />
      ) : plan?.plan ? (
        <PlanView data={plan} onRefresh={loadPlan} />
      ) : (
        <Card><p className="text-center py-4" style={{ color: "var(--text-tertiary)" }}>{t("sp.noPlan")}</p></Card>
      )}
    </div>
  );
}

function Setup({ onGenerated, hasPlan }: { onGenerated: () => void; hasPlan: boolean }) {
  const { t } = useT();
  const [settings, setSettings] = useState<PlanSettings | null>(null);
  const [courses, setCourses] = useState<PlanCourse[]>([]);
  const [saving, setSaving] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{ taskCount: number; feasibility: string; warnings: string[] } | null>(null);

  useEffect(() => {
    Promise.all([
      getJSON<PlanSettings>("/api/studyplan/settings"),
      getJSON<{ courses: PlanCourse[] }>("/api/studyplan/courses"),
    ]).then(([s, c]) => {
      setSettings(s);
      setCourses(c.courses);
    });
  }, []);

  if (!settings) return <Loading>{t("status.connecting")}</Loading>;

  const saveField = (field: keyof PlanSettings, value: number) => {
    const updated = { ...settings, [field]: value };
    setSettings(updated);
    setSaving(true);
    putJSON("/api/studyplan/settings", { [field]: value }).finally(() => setSaving(false));
  };

  const updateChapterPages = async (chapterId: number, pages: number) => {
    await putJSON(`/api/studyplan/chapters/${chapterId}`, { page_count: pages });
    setCourses((prev) =>
      prev.map((c) => ({
        ...c,
        chapters: c.chapters.map((ch) => (ch.id === chapterId ? { ...ch, page_count: pages } : ch)),
        total_pages: c.chapters.reduce((s, ch) => s + (ch.id === chapterId ? pages : ch.page_count), 0),
      })),
    );
  };

  const generate = async () => {
    setGenerating(true);
    try {
      const res = await postJSON<{ taskCount: number; feasibility: string; warnings: string[] }>(
        "/api/studyplan/generate", {},
      );
      setResult(res);
      onGenerated();
    } catch {
      // ignore
    } finally {
      setGenerating(false);
    }
  };

  const inputStyle = { borderColor: "var(--border)", backgroundColor: "var(--bg-surface)", color: "var(--text-primary)" };

  return (
    <div className="space-y-4">
      <Card>
        <h3 className="font-medium mb-3" style={{ color: "var(--text-primary)" }}>{t("sp.availability")}</h3>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm" style={{ color: "var(--text-tertiary)" }}>
            {t("sp.weekdayHours")}
            <input
              type="number" step="0.5" min="0.5" max="12"
              value={settings.weekday_hours}
              onChange={(e) => saveField("weekday_hours", Number(e.target.value))}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm min-h-11"
              style={inputStyle}
            />
          </label>
          <label className="text-sm" style={{ color: "var(--text-tertiary)" }}>
            {t("sp.weekendHours")}
            <input
              type="number" step="0.5" min="0.5" max="16"
              value={settings.weekend_hours}
              onChange={(e) => saveField("weekend_hours", Number(e.target.value))}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm min-h-11"
              style={inputStyle}
            />
          </label>
          <label className="text-sm col-span-2" style={{ color: "var(--text-tertiary)" }}>
            {t("sp.readingSpeed")}
            <input
              type="number" step="1" min="1" max="100"
              value={settings.reading_speed}
              onChange={(e) => saveField("reading_speed", Number(e.target.value))}
              className="mt-1 w-full rounded-lg border px-3 py-2 text-sm min-h-11"
              style={inputStyle}
            />
          </label>
        </div>
      </Card>

      {courses.length > 0 ? (
        <Card>
          <h3 className="font-medium mb-3" style={{ color: "var(--text-primary)" }}>{t("sp.coursesChapters")}</h3>
          <div className="space-y-3">
            {courses.map((c) => (
              <div
                key={c.course_code}
                className="pb-3 last:border-0 last:pb-0"
                style={{ borderBottom: "1px solid var(--border-light)" }}
              >
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{c.course_code} {c.name_th}</span>
                  <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{t("sp.examDate")}: {c.exam_date}</span>
                </div>
                <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>
                  {c.chapters.length} {t("sp.chapters")} · {c.total_pages} {t("sp.pages")}
                </p>
                {c.chapters.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {c.chapters.map((ch) => (
                      <li key={ch.id} className="flex items-center gap-2 text-xs">
                        <span className="truncate flex-1" style={{ color: "var(--text-secondary)" }}>{ch.name}</span>
                        <input aria-label={ch.name}
                          type="number" min="1" value={ch.page_count}
                          onChange={(e) => updateChapterPages(ch.id, Number(e.target.value) || 1)}
                          className="w-16 rounded border px-2 py-1 text-right text-xs min-h-11"
                          style={inputStyle}
                        />
                        <span className="w-6" style={{ color: "var(--text-tertiary)" }}>{t("sp.pg")}</span>
                        {ch.mastery > 0 && (
                          <span style={{ color: masteryColor(ch.mastery) }}>
                            {Math.round(ch.mastery)}%
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </Card>
      ) : (
        <Card>
          <p className="text-sm text-center py-4" style={{ color: "var(--text-tertiary)" }}>{t("sp.noCourses")}</p>
        </Card>
      )}

      {courses.length > 0 && (
        <button
          onClick={generate}
          disabled={generating}
          className="w-full font-medium rounded-xl py-3 disabled:opacity-50 min-h-11"
          style={{ backgroundColor: "var(--accent)", color: "var(--text-inverse)" }}
        >
          {generating ? t("sp.generating") : hasPlan ? t("sp.regenerate") : t("sp.generate")}
        </button>
      )}

      {result && (
        <Card>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
            {t("sp.generated").replace("{n}", String(result.taskCount))}
          </p>
          {result.feasibility !== "ok" && (
            <p
              className="text-sm mt-1"
              style={{ color: result.feasibility === "impossible" ? "var(--danger)" : "var(--warning)" }}
            >
              {result.feasibility === "impossible" ? t("sp.impossible") : t("sp.tight")}
            </p>
          )}
          {result.warnings.map((w, i) => (
            <p key={i} className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>{w}</p>
          ))}
        </Card>
      )}
    </div>
  );
}

function PlanView({ data, onRefresh }: { data: StudyPlanData; onRefresh: () => void }) {
  const { t } = useT();
  const [tasks, setTasks] = useState(data.tasks);
  const [selectedDate, setSelectedDate] = useState(data.today);
  const [rescheduling, setRescheduling] = useState(false);

  const tasksByDate: Record<string, StudyTask[]> = {};
  for (const task of tasks) {
    (tasksByDate[task.date] ??= []).push(task);
  }
  const dates = [...new Set(tasks.map((t) => t.date))].sort();

  const todayIdx = dates.indexOf(data.today);
  const visibleDates = dates.filter((d) => {
    const diff = dates.indexOf(d) - (todayIdx >= 0 ? todayIdx : 0);
    return diff >= -2 && diff <= 14;
  });

  const toggleTask = async (taskId: number) => {
    try {
      const res = await postJSON<{ id: number; done: number }>(`/api/studyplan/tasks/${taskId}/toggle`, {});
      setTasks((prev) => prev.map((t) => (t.id === res.id ? { ...t, done: res.done } : t)));
    } catch {
      // ignore
    }
  };

  const reschedule = async () => {
    setRescheduling(true);
    try {
      await postJSON("/api/studyplan/reschedule", {});
      onRefresh();
    } finally {
      setRescheduling(false);
    }
  };

  const overdueTasks = tasks.filter((t) => !t.done && t.date < data.today);

  return (
    <div className="space-y-4">
      {data.plan && data.plan.feasibility !== "ok" && (
        <div
          className="rounded-xl px-4 py-3 text-sm"
          style={{
            backgroundColor: data.plan.feasibility === "impossible" ? "var(--danger-bg)" : "var(--warning-bg)",
            color: data.plan.feasibility === "impossible" ? "var(--danger)" : "var(--warning)",
          }}
        >
          <p className="font-medium">
            {data.plan.feasibility === "impossible" ? t("sp.impossible") : t("sp.tight")}
          </p>
          {data.plan.warnings.map((w, i) => <p key={i} className="text-xs mt-1">{w}</p>)}
        </div>
      )}

      <div className="space-y-2">
        {data.statuses.map((s) => (
          <CourseStatusCard key={s.course_code} status={s} />
        ))}
      </div>

      {overdueTasks.length > 0 && (
        <div
          className="rounded-xl px-4 py-3 flex items-center justify-between"
          style={{ backgroundColor: "var(--warning-bg)" }}
        >
          <div>
            <p className="text-sm font-medium" style={{ color: "var(--warning)" }}>
              {t("sp.overdue").replace("{n}", String(overdueTasks.length))}
            </p>
          </div>
          <button
            onClick={reschedule}
            disabled={rescheduling}
            className="text-sm px-3 py-1.5 rounded-lg disabled:opacity-50 min-h-11"
            style={{ backgroundColor: "var(--warning)", color: "var(--text-inverse)" }}
          >
            {t("sp.reschedule")}
          </button>
        </div>
      )}

      <div className="flex gap-1 overflow-x-auto pb-1 -mx-4 px-4">
        {visibleDates.map((d) => {
          const dayTasks = tasksByDate[d] || [];
          const allDone = dayTasks.length > 0 && dayTasks.every((t) => t.done);
          const isToday = d === data.today;
          const isPast = d < data.today;

          let bg: string;
          let fg: string;
          if (d === selectedDate) {
            bg = "var(--accent)"; fg = "var(--text-inverse)";
          } else if (allDone) {
            bg = "var(--success-bg)"; fg = "var(--success)";
          } else if (isPast) {
            bg = "var(--danger-bg)"; fg = "var(--danger)";
          } else {
            bg = "var(--bg-surface-hover)"; fg = "var(--text-tertiary)";
          }

          return (
            <button
              key={d}
              onClick={() => setSelectedDate(d)}
              className="shrink-0 px-3 py-2 rounded-lg text-xs font-medium transition-colors min-h-11"
              style={{ backgroundColor: bg, color: fg }}
            >
              <div>{formatShortDate(d)}</div>
              {isToday && <div className="text-xs opacity-70">{t("sp.today")}</div>}
            </button>
          );
        })}
      </div>

      <div className="space-y-2">
        {(tasksByDate[selectedDate] || []).map((task) => (
          <TaskRow key={task.id} task={task} onToggle={toggleTask} />
        ))}
        {!(tasksByDate[selectedDate]?.length) && (
          <Card><p className="text-sm text-center py-3" style={{ color: "var(--text-tertiary)" }}>{t("sp.noTasks")}</p></Card>
        )}
      </div>

      <div className="flex gap-2">
        <a
          href={withBase("/api/studyplan/ics")}
          download="studyos-plan.ics"
          className="flex-1 text-center text-sm border rounded-xl py-2.5"
          style={{ color: "var(--accent-text)", borderColor: "var(--accent-light)" }}
        >
          {t("sp.exportICS")}
        </a>
      </div>
    </div>
  );
}

const TYPE_ICONS: Record<string, string> = { read: "bookOpen", quiz: "penTool", review: "rotateCcw", mock: "clipboard" };

function TaskRow({ task, onToggle }: { task: StudyTask; onToggle: (id: number) => void }) {
  return (
    <Card>
      <div className="flex items-start gap-3">
        <button
          onClick={() => onToggle(task.id)}
          className="tap-area mt-0.5 w-6 h-6 rounded-md border-2 shrink-0 flex items-center justify-center"
          style={task.done
            ? { backgroundColor: "var(--success)", borderColor: "var(--success)", color: "var(--text-inverse)" }
            : { borderColor: "var(--border)" }
          }
        >
          {task.done ? <Icon name="check" size={14} /> : ""}
        </button>
        <div className="flex-1 min-w-0">
          <p
            className={`text-sm ${task.done ? "line-through" : ""}`}
            style={{ color: task.done ? "var(--text-tertiary)" : "var(--text-primary)" }}
          >
            <span className="inline-flex items-center gap-1">{TYPE_ICONS[task.task_type] ? <Icon name={TYPE_ICONS[task.task_type]} size={14} className="inline" /> : null} {task.description}</span>
          </p>
          <p className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>
            {task.course_name} · {task.minutes} min
          </p>
        </div>
      </div>
    </Card>
  );
}

function CourseStatusCard({ status }: { status: CourseStatus }) {
  const { t } = useT();
  const pct = status.total_tasks > 0 ? Math.round((status.done_tasks / status.total_tasks) * 100) : 0;

  const statusStyle: Record<string, { bg: string; text: string; bar: string }> = {
    on_track: { bg: "var(--success-bg)", text: "var(--success)", bar: "var(--success)" },
    behind: { bg: "var(--warning-bg)", text: "var(--warning)", bar: "var(--warning)" },
    critical: { bg: "var(--danger-bg)", text: "var(--danger)", bar: "var(--danger)" },
  };
  const ss = statusStyle[status.status] ?? statusStyle.on_track;
  const statusLabels = { on_track: t("sp.onTrack"), behind: t("sp.behind"), critical: t("sp.critical") };

  return (
    <Card>
      <div className="flex justify-between items-center">
        <div className="min-w-0">
          <p className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
            {status.course_code} {status.name_th}
          </p>
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            {t("sp.daysLeft").replace("{n}", String(status.days_left))} · {status.done_tasks}/{status.total_tasks} {t("sp.tasksDone")}
          </p>
        </div>
        <span
          className="text-xs font-medium px-2 py-1 rounded-lg"
          style={{ backgroundColor: ss.bg, color: ss.text }}
        >
          {statusLabels[status.status]}
        </span>
      </div>
      <div className="rounded-full h-1.5 mt-2" style={{ backgroundColor: "var(--border-light)" }}>
        <div className="rounded-full h-1.5 transition-all" style={{ width: `${pct}%`, backgroundColor: ss.bar }} />
      </div>
      {status.status === "critical" && status.extra_hours_needed > 0 && (
        <p className="text-xs mt-1" style={{ color: "var(--danger)" }}>
          {t("sp.extraNeeded").replace("{n}", String(status.extra_hours_needed))}
        </p>
      )}
    </Card>
  );
}

function masteryColor(score: number): string {
  if (score >= 70) return "var(--success)";
  if (score >= 40) return "var(--warning)";
  return "var(--danger)";
}

function formatShortDate(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  const day = d.getUTCDate();
  const months = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  return `${day} ${months[d.getUTCMonth()]}`;
}
