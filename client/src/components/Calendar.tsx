import { useEffect, useState } from "react";
import { useT } from "../i18n.tsx";
import { getJSON, postJSON, deleteJSON, type CalendarData, type CalEvent } from "../api.ts";
import { CourseTitle } from "./CourseTitle.tsx";
import { timeRange } from "../format.ts";
import Icon from "./Icon.tsx";

const DAY_KEYS = ["cal.mon", "cal.tue", "cal.wed", "cal.thu", "cal.fri", "cal.sat", "cal.sun"] as const;

function monthLabel(month: string, lang: "th" | "en"): string {
  const d = new Date(`${month}-15T00:00:00Z`);
  const locale = lang === "th" ? "th-TH-u-ca-buddhist" : "en-GB";
  return new Intl.DateTimeFormat(locale, { month: "long", year: "numeric", timeZone: "UTC" }).format(d);
}

function shiftMonth(month: string, delta: number): string {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7)) + delta;
  const d = new Date(Date.UTC(y, m - 1, 1));
  return d.toISOString().slice(0, 7);
}

type DotType = "class" | "exam" | "task" | "etesting" | "custom";
const DOT_COLORS: Record<DotType, string> = {
  class: "var(--accent-2, var(--accent-text))",
  exam: "#ef4444",
  task: "#22c55e",
  etesting: "#f59e0b",
  custom: "#6366f1",
};

type AddEventForm = {
  title: string;
  date: string;
  start_time: string;
  end_time: string;
  note: string;
};

export default function Calendar() {
  const { t, lang } = useT();
  const [month, setMonth] = useState(() => new Date().toISOString().slice(0, 7));
  const [data, setData] = useState<CalendarData | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<AddEventForm>({ title: "", date: "", start_time: "", end_time: "", note: "" });
  const [saving, setSaving] = useState(false);

  const reload = (m: string) => {
    setLoading(true);
    getJSON<CalendarData>(`/api/calendar?month=${m}`)
      .then((d) => {
        setData(d);
        if (d.today.startsWith(m)) setSelected(d.today);
        else setSelected(null);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { reload(month); }, [month]);

  const year = Number(month.slice(0, 4));
  const mon = Number(month.slice(5, 7));
  const daysInMonth = new Date(Date.UTC(year, mon, 0)).getUTCDate();
  const firstWeekday = new Date(Date.UTC(year, mon - 1, 1)).getUTCDay();
  const startOffset = firstWeekday === 0 ? 6 : firstWeekday - 1;

  const days: Array<{ date: string; day: number } | null> = [];
  for (let i = 0; i < startOffset; i++) days.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    days.push({ date: `${month}-${String(d).padStart(2, "0")}`, day: d });
  }

  const selectedEvents = selected && data?.events[selected] ? data.events[selected] : [];

  const handleAdd = async () => {
    if (!form.title || !form.date) return;
    setSaving(true);
    try {
      await postJSON("/api/custom-events", {
        title: form.title,
        date: form.date,
        start_time: form.start_time || undefined,
        end_time: form.end_time || undefined,
        note: form.note || undefined,
      });
      setForm({ title: "", date: "", start_time: "", end_time: "", note: "" });
      setShowAdd(false);
      reload(month);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (eventId: number) => {
    await deleteJSON(`/api/custom-events/${eventId}`);
    reload(month);
  };

  return (
    <div
      className="rounded-2xl border overflow-hidden"
      style={{
        background: "var(--bg-surface)",
        borderColor: "var(--border-light)",
      }}
    >
      {/* Header — month nav + add button */}
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{ borderBottom: "1px solid var(--border-light)" }}
      >
        <button
          onClick={() => setMonth((m) => shiftMonth(m, -1))}
          className="p-1.5 rounded-lg transition-colors"
          style={{ color: "var(--text-secondary)" }}
        >
          <Icon name="chevronLeft" size={18} />
        </button>
        <h2 className="text-sm font-semibold capitalize" style={{ color: "var(--text-primary)" }}>
          {monthLabel(month, lang)}
        </h2>
        <div className="flex items-center gap-1">
          <button
            onClick={() => {
              setShowAdd(!showAdd);
              if (!showAdd && selected) setForm((f) => ({ ...f, date: selected }));
            }}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: "var(--accent-text)" }}
            title={t("cal.addEvent")}
          >
            <Icon name="plus" size={18} />
          </button>
          <button
            onClick={() => setMonth((m) => shiftMonth(m, 1))}
            className="p-1.5 rounded-lg transition-colors"
            style={{ color: "var(--text-secondary)" }}
          >
            <Icon name="chevronRight" size={18} />
          </button>
        </div>
      </div>

      {/* Add event form */}
      {showAdd && (
        <div
          className="px-4 py-3 space-y-2"
          style={{ borderBottom: "1px solid var(--border-light)", background: "var(--bg-surface-hover)" }}
        >
          <p className="text-xs font-semibold" style={{ color: "var(--accent-text)" }}>
            {t("cal.addEvent")}
          </p>
          <input
            type="text"
            placeholder={t("cal.eventTitle")}
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: "var(--border-light)", background: "var(--bg-surface)", color: "var(--text-primary)" }}
          />
          <input
            type="date"
            value={form.date}
            onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: "var(--border-light)", background: "var(--bg-surface)", color: "var(--text-primary)" }}
          />
          <div className="flex gap-2">
            <input
              type="time"
              value={form.start_time}
              onChange={(e) => setForm((f) => ({ ...f, start_time: e.target.value }))}
              className="flex-1 rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: "var(--border-light)", background: "var(--bg-surface)", color: "var(--text-primary)" }}
              placeholder={t("cal.startTime")}
            />
            <input
              type="time"
              value={form.end_time}
              onChange={(e) => setForm((f) => ({ ...f, end_time: e.target.value }))}
              className="flex-1 rounded-lg border px-3 py-2 text-sm"
              style={{ borderColor: "var(--border-light)", background: "var(--bg-surface)", color: "var(--text-primary)" }}
              placeholder={t("cal.endTime")}
            />
          </div>
          <textarea
            placeholder={t("cal.note")}
            value={form.note}
            onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
            rows={2}
            className="w-full rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: "var(--border-light)", background: "var(--bg-surface)", color: "var(--text-primary)" }}
          />
          <div className="flex gap-2">
            <button
              onClick={handleAdd}
              disabled={saving || !form.title || !form.date}
              className="flex-1 rounded-lg py-2 text-sm font-medium transition-colors disabled:opacity-50"
              style={{ background: "var(--accent)", color: "#fff" }}
            >
              {saving ? "..." : t("cal.save")}
            </button>
            <button
              onClick={() => setShowAdd(false)}
              className="px-4 rounded-lg py-2 text-sm font-medium transition-colors"
              style={{ color: "var(--text-secondary)" }}
            >
              {t("cal.cancel")}
            </button>
          </div>
        </div>
      )}

      {/* Weekday headers */}
      <div className="grid grid-cols-7 px-2 pt-2">
        {DAY_KEYS.map((k) => (
          <div key={k} className="text-center text-xs font-medium py-1" style={{ color: "var(--text-tertiary)" }}>
            {t(k)}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 px-2 pb-2 gap-y-0.5">
        {days.map((cell, i) => {
          if (!cell) return <div key={`e${i}`} />;
          const { date, day } = cell;
          const events = data?.events[date];
          const isToday = date === data?.today;
          const isSel = date === selected;
          const types = new Set<DotType>();
          if (events) for (const e of events) types.add(e.type);

          return (
            <button
              key={date}
              onClick={() => setSelected(isSel ? null : date)}
              className="flex flex-col items-center py-1 rounded-xl transition-all relative"
              style={{
                // White text needs the button shade (--accent), not the text shade.
                background: isSel
                  ? "var(--accent)"
                  : isToday
                    ? "var(--bg-surface-hover)"
                    : "transparent",
                color: isSel
                  ? "#fff"
                  : isToday
                    ? "var(--accent-text)"
                    : "var(--text-primary)",
              }}
            >
              <span className={`text-sm leading-6 ${isToday && !isSel ? "font-bold" : ""}`}>{day}</span>
              {/* Event dots */}
              <div className="flex gap-0.5 h-1.5 mt-0.5">
                {(["class", "exam", "task", "etesting", "custom"] as DotType[]).map(
                  (typ) =>
                    types.has(typ) && (
                      <span
                        key={typ}
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: isSel ? "rgba(255,255,255,0.7)" : DOT_COLORS[typ] }}
                      />
                    ),
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Selected day detail */}
      {selected && (
        <div
          className="px-4 py-3 space-y-2"
          style={{
            borderTop: "1px solid var(--border-light)",
            background: "var(--bg-surface-hover)",
          }}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold" style={{ color: "var(--text-secondary)" }}>
              {new Intl.DateTimeFormat(lang === "th" ? "th-TH-u-ca-buddhist" : "en-GB", {
                weekday: "long",
                day: "numeric",
                month: "short",
                timeZone: "UTC",
              }).format(new Date(`${selected}T00:00:00Z`))}
            </span>
            <div className="flex items-center gap-2">
              {selected === data?.today && (
                <span
                  className="text-xs font-medium px-2 py-0.5 rounded-full"
                  style={{ background: "var(--accent)", color: "#fff" }}
                >
                  {t("cal.today")}
                </span>
              )}
              <button
                onClick={() => {
                  setForm((f) => ({ ...f, date: selected }));
                  setShowAdd(true);
                }}
                className="p-1 rounded-lg"
                style={{ color: "var(--accent-text)" }}
                title={t("cal.addEvent")}
              >
                <Icon name="plus" size={16} />
              </button>
            </div>
          </div>

          {selectedEvents.length === 0 && !loading ? (
            <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
              {t("cal.noEvents")}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {selectedEvents.map((ev, i) => (
                <EventRow key={i} ev={ev} t={t} onDelete={ev.type === "custom" && ev.event_id ? () => handleDelete(ev.event_id!) : undefined} />
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function EventRow({
  ev,
  t,
  onDelete,
}: {
  ev: CalEvent;
  t: (k: string, v?: Record<string, string | number>) => string;
  onDelete?: () => void;
}) {
  const tagColors: Record<string, { bg: string; text: string }> = {
    class: { bg: "var(--accent-light)", text: "var(--accent-text)" },
    exam: { bg: "rgba(239,68,68,0.15)", text: "#ef4444" },
    task: { bg: "rgba(34,197,94,0.15)", text: "#22c55e" },
    etesting: { bg: "rgba(245,158,11,0.15)", text: "#f59e0b" },
    custom: { bg: "rgba(99,102,241,0.15)", text: "#6366f1" },
  };
  const tag = tagColors[ev.type] ?? tagColors.class;
  const labelMap: Record<string, string> = {
    class: t("cal.class"),
    exam: t("cal.exam"),
    task: t("cal.task"),
    etesting: t("cal.etesting"),
    custom: t("cal.custom"),
  };
  const label = labelMap[ev.type] ?? ev.type;

  return (
    <li
      className="flex items-start gap-2 rounded-xl px-3 py-2"
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border-light)" }}
    >
      {/* Type badge */}
      <span
        className="text-xs font-semibold px-2 py-0.5 rounded-full mt-0.5 shrink-0"
        style={{ background: tag.bg, color: tag.text }}
      >
        {label}
      </span>

      <div className="flex-1 min-w-0">
        {ev.course_code ? (
          <CourseTitle code={ev.course_code} name_th={ev.name_th} name_en={ev.name_en} className="text-sm font-medium" />
        ) : (
          <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            {ev.name_th}
          </span>
        )}

        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
          {ev.start_time && ev.end_time && (
            <span className="text-xs flex items-center gap-1" style={{ color: "var(--text-tertiary)" }}>
              <Icon name="clock" size={12} />
              {timeRange(ev.start_time, ev.end_time)}
            </span>
          )}
          {ev.room && (
            <span className="text-xs flex items-center gap-1" style={{ color: "var(--text-tertiary)" }}>
              <Icon name="mapPin" size={12} />
              {ev.room}
            </span>
          )}
          {ev.location && (
            <span className="text-xs flex items-center gap-1" style={{ color: "var(--text-tertiary)" }}>
              <Icon name="mapPin" size={12} />
              {ev.location}
            </span>
          )}
          {ev.slot && (
            <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
              {t("cal.slot", { slot: ev.slot })}
            </span>
          )}
          {ev.description && (
            <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
              {ev.description}
            </span>
          )}
          {ev.note && (
            <span className="text-xs flex items-center gap-1" style={{ color: "var(--text-tertiary)" }}>
              <Icon name="notebook" size={12} />
              {ev.note}
            </span>
          )}
          {ev.done && (
            <span className="text-xs flex items-center gap-0.5" style={{ color: "#22c55e" }}>
              <Icon name="checkCircle" size={12} />
              {t("cal.done")}
            </span>
          )}
        </div>
      </div>

      {onDelete && (
        <button onClick={onDelete} className="p-1 shrink-0 mt-0.5 rounded" style={{ color: "var(--text-tertiary)" }}>
          <Icon name="x" size={14} />
        </button>
      )}
    </li>
  );
}
