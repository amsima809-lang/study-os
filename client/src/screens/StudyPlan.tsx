import { useEffect, useState } from "react";
import { useT } from "../i18n.tsx";
import {
  getJSON, postJSON, putJSON,
  type PlanSettings, type PlanCourse, type StudyPlanData, type StudyTask, type CourseStatus,
} from "../api.ts";
import { Card, Loading } from "../components/ui.tsx";

type View = "setup" | "plan";

export default function StudyPlan() {
  const { t } = useT();
  const [view, setView] = useState<View>("plan");
  const [plan, setPlan] = useState<StudyPlanData | null>(null);
  const [loading, setLoading] = useState(true);

  const loadPlan = () => {
    setLoading(true);
    getJSON<StudyPlanData>("/api/studyplan")
      .then((d) => {
        setPlan(d);
        if (!d.plan) setView("setup");
        else setView("plan");
      })
      .catch(() => setPlan(null))
      .finally(() => setLoading(false));
  };

  useEffect(loadPlan, []);

  if (loading) return <Loading>{t("status.connecting")}</Loading>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-slate-800">{t("sp.title")}</h1>
        {plan?.plan && (
          <button
            onClick={() => setView(view === "setup" ? "plan" : "setup")}
            className="text-sm text-indigo-600"
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
        <Card><p className="text-center text-slate-400 py-4">{t("sp.noPlan")}</p></Card>
      )}
    </div>
  );
}

// ---- Settings + Generate ----

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

  return (
    <div className="space-y-4">
      {/* Availability settings */}
      <Card>
        <h3 className="font-medium text-slate-700 mb-3">{t("sp.availability")}</h3>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-sm text-slate-500">
            {t("sp.weekdayHours")}
            <input
              type="number" step="0.5" min="0.5" max="12"
              value={settings.weekday_hours}
              onChange={(e) => saveField("weekday_hours", Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm text-slate-500">
            {t("sp.weekendHours")}
            <input
              type="number" step="0.5" min="0.5" max="16"
              value={settings.weekend_hours}
              onChange={(e) => saveField("weekend_hours", Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm text-slate-500 col-span-2">
            {t("sp.readingSpeed")}
            <input
              type="number" step="1" min="1" max="100"
              value={settings.reading_speed}
              onChange={(e) => saveField("reading_speed", Number(e.target.value))}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            />
          </label>
        </div>
      </Card>

      {/* Courses with chapters */}
      {courses.length > 0 ? (
        <Card>
          <h3 className="font-medium text-slate-700 mb-3">{t("sp.coursesChapters")}</h3>
          <div className="space-y-3">
            {courses.map((c) => (
              <div key={c.course_code} className="border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-slate-700">{c.course_code} {c.name_th}</span>
                  <span className="text-xs text-slate-400">{t("sp.examDate")}: {c.exam_date}</span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  {c.chapters.length} {t("sp.chapters")} · {c.total_pages} {t("sp.pages")}
                </p>
                {c.chapters.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {c.chapters.map((ch) => (
                      <li key={ch.id} className="flex items-center gap-2 text-xs">
                        <span className="text-slate-500 truncate flex-1">{ch.name}</span>
                        <input
                          type="number" min="1" value={ch.page_count}
                          onChange={(e) => updateChapterPages(ch.id, Number(e.target.value) || 1)}
                          className="w-16 rounded border border-slate-200 px-2 py-1 text-right text-xs"
                        />
                        <span className="text-slate-300 w-6">{t("sp.pg")}</span>
                        {ch.mastery > 0 && (
                          <span className={`text-xs ${ch.mastery >= 70 ? "text-green-500" : ch.mastery >= 40 ? "text-amber-500" : "text-red-500"}`}>
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
          <p className="text-sm text-slate-400 text-center py-4">{t("sp.noCourses")}</p>
        </Card>
      )}

      {/* Generate button */}
      {courses.length > 0 && (
        <button
          onClick={generate}
          disabled={generating}
          className="w-full bg-indigo-600 text-white font-medium rounded-xl py-3 disabled:opacity-50"
        >
          {generating ? t("sp.generating") : hasPlan ? t("sp.regenerate") : t("sp.generate")}
        </button>
      )}

      {/* Result */}
      {result && (
        <Card>
          <p className="text-sm text-slate-600">
            {t("sp.generated").replace("{n}", String(result.taskCount))}
          </p>
          {result.feasibility !== "ok" && (
            <p className={`text-sm mt-1 ${result.feasibility === "impossible" ? "text-red-600" : "text-amber-600"}`}>
              {result.feasibility === "impossible" ? t("sp.impossible") : t("sp.tight")}
            </p>
          )}
          {result.warnings.map((w, i) => (
            <p key={i} className="text-xs text-slate-400 mt-1">{w}</p>
          ))}
        </Card>
      )}
    </div>
  );
}

// ---- Plan View ----

function PlanView({ data, onRefresh }: { data: StudyPlanData; onRefresh: () => void }) {
  const { t } = useT();
  const [tasks, setTasks] = useState(data.tasks);
  const [selectedDate, setSelectedDate] = useState(data.today);
  const [rescheduling, setRescheduling] = useState(false);

  // Group tasks by date
  const tasksByDate: Record<string, StudyTask[]> = {};
  for (const task of tasks) {
    (tasksByDate[task.date] ??= []).push(task);
  }
  const dates = [...new Set(tasks.map((t) => t.date))].sort();

  // Find dates around today
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
      {/* Feasibility warning */}
      {data.plan && data.plan.feasibility !== "ok" && (
        <div className={`rounded-xl px-4 py-3 text-sm ${
          data.plan.feasibility === "impossible" ? "bg-red-50 text-red-700" : "bg-amber-50 text-amber-700"
        }`}>
          <p className="font-medium">
            {data.plan.feasibility === "impossible" ? t("sp.impossible") : t("sp.tight")}
          </p>
          {data.plan.warnings.map((w, i) => <p key={i} className="text-xs mt-1">{w}</p>)}
        </div>
      )}

      {/* Course statuses */}
      <div className="space-y-2">
        {data.statuses.map((s) => (
          <CourseStatusCard key={s.course_code} status={s} />
        ))}
      </div>

      {/* Overdue warning + reschedule */}
      {overdueTasks.length > 0 && (
        <div className="rounded-xl bg-orange-50 px-4 py-3 flex items-center justify-between">
          <div>
            <p className="text-sm text-orange-700 font-medium">
              {t("sp.overdue").replace("{n}", String(overdueTasks.length))}
            </p>
          </div>
          <button
            onClick={reschedule}
            disabled={rescheduling}
            className="text-sm bg-orange-600 text-white px-3 py-1.5 rounded-lg disabled:opacity-50"
          >
            {t("sp.reschedule")}
          </button>
        </div>
      )}

      {/* Date tabs */}
      <div className="flex gap-1 overflow-x-auto pb-1 -mx-4 px-4">
        {visibleDates.map((d) => {
          const dayTasks = tasksByDate[d] || [];
          const allDone = dayTasks.length > 0 && dayTasks.every((t) => t.done);
          const isToday = d === data.today;
          const isPast = d < data.today;
          return (
            <button
              key={d}
              onClick={() => setSelectedDate(d)}
              className={`shrink-0 px-3 py-2 rounded-lg text-xs font-medium transition-colors ${
                d === selectedDate
                  ? "bg-indigo-600 text-white"
                  : allDone
                    ? "bg-green-50 text-green-600"
                    : isPast
                      ? "bg-red-50 text-red-500"
                      : "bg-slate-100 text-slate-500"
              }`}
            >
              <div>{formatShortDate(d)}</div>
              {isToday && <div className="text-[10px] opacity-70">{t("sp.today")}</div>}
            </button>
          );
        })}
      </div>

      {/* Tasks for selected date */}
      <div className="space-y-2">
        {(tasksByDate[selectedDate] || []).map((task) => (
          <TaskRow key={task.id} task={task} onToggle={toggleTask} />
        ))}
        {!(tasksByDate[selectedDate]?.length) && (
          <Card><p className="text-sm text-slate-400 text-center py-3">{t("sp.noTasks")}</p></Card>
        )}
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <a
          href="/api/studyplan/ics"
          download="studyos-plan.ics"
          className="flex-1 text-center text-sm text-indigo-600 border border-indigo-200 rounded-xl py-2.5"
        >
          {t("sp.exportICS")}
        </a>
      </div>
    </div>
  );
}

// ---- Task Row ----

const TYPE_ICONS: Record<string, string> = { read: "📖", quiz: "📝", review: "🔄", mock: "📋" };

function TaskRow({ task, onToggle }: { task: StudyTask; onToggle: (id: number) => void }) {
  return (
    <Card>
      <div className="flex items-start gap-3">
        <button
          onClick={() => onToggle(task.id)}
          className={`mt-0.5 w-5 h-5 rounded-md border-2 shrink-0 flex items-center justify-center ${
            task.done ? "bg-green-500 border-green-500 text-white" : "border-slate-300"
          }`}
        >
          {task.done ? "✓" : ""}
        </button>
        <div className="flex-1 min-w-0">
          <p className={`text-sm ${task.done ? "line-through text-slate-400" : "text-slate-700"}`}>
            {TYPE_ICONS[task.task_type] || ""} {task.description}
          </p>
          <p className="text-xs text-slate-400 mt-0.5">
            {task.course_name} · {task.minutes} {task.minutes === 1 ? "min" : "min"}
          </p>
        </div>
      </div>
    </Card>
  );
}

// ---- Course Status Card ----

function CourseStatusCard({ status }: { status: CourseStatus }) {
  const { t } = useT();
  const pct = status.total_tasks > 0 ? Math.round((status.done_tasks / status.total_tasks) * 100) : 0;
  const statusColors = {
    on_track: "text-green-600 bg-green-50",
    behind: "text-amber-600 bg-amber-50",
    critical: "text-red-600 bg-red-50",
  };
  const barColors = { on_track: "bg-green-400", behind: "bg-amber-400", critical: "bg-red-400" };
  const statusLabels = { on_track: t("sp.onTrack"), behind: t("sp.behind"), critical: t("sp.critical") };

  return (
    <Card>
      <div className="flex justify-between items-center">
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-700 truncate">{status.course_code} {status.name_th}</p>
          <p className="text-xs text-slate-400">
            {t("sp.daysLeft").replace("{n}", String(status.days_left))} · {status.done_tasks}/{status.total_tasks} {t("sp.tasksDone")}
          </p>
        </div>
        <span className={`text-xs font-medium px-2 py-1 rounded-lg ${statusColors[status.status]}`}>
          {statusLabels[status.status]}
        </span>
      </div>
      <div className="bg-slate-100 rounded-full h-1.5 mt-2">
        <div className={`rounded-full h-1.5 transition-all ${barColors[status.status]}`} style={{ width: `${pct}%` }} />
      </div>
      {status.status === "critical" && status.extra_hours_needed > 0 && (
        <p className="text-xs text-red-500 mt-1">
          {t("sp.extraNeeded").replace("{n}", String(status.extra_hours_needed))}
        </p>
      )}
    </Card>
  );
}

// ---- helpers ----

function formatShortDate(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00Z`);
  const day = d.getUTCDate();
  const months = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];
  return `${day} ${months[d.getUTCMonth()]}`;
}
