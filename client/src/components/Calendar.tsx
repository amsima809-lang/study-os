import { useCallback, useEffect, useState } from "react";
import { useT } from "../i18n.tsx";
import { getJSON, type CalendarData, type CalEvent } from "../api.ts";
import { CourseTitle, CourseChip } from "./CourseTitle.tsx";
import { timeRange, formatTime } from "../format.ts";
import Icon from "./Icon.tsx";
import { setDone, useRemindersChanged, ReminderSheet } from "./Reminders.tsx";
import { AddButton } from "./ui.tsx";
import TimeGrid from "./TimeGrid.tsx";
import { bangkokTime } from "../reminderAlerts.ts";

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

type DotType = "class" | "exam" | "task" | "etesting" | "reminder" | "todo" | "event";
const DOT_COLORS: Record<DotType, string> = {
  class: "var(--accent-2, var(--accent-text))",
  exam: "#ef4444",
  task: "#22c55e",
  etesting: "#f59e0b",
  event: "#6366f1",
  reminder: "#0ea5e9",
  todo: "#a855f7",
};

type View = "month" | "week" | "day";
const VIEWS: View[] = ["month", "week", "day"];

const bangkokDate = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
function shiftDay(date: string, delta: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}
/** The seven dates, Monday first, of the week that holds `date`. */
function weekOf(date: string): string[] {
  const wd = new Date(`${date}T00:00:00Z`).getUTCDay(); // 0 = Sunday
  const monday = shiftDay(date, wd === 0 ? -6 : 1 - wd);
  return Array.from({ length: 7 }, (_, i) => shiftDay(monday, i));
}
function rangeLabel(dates: string[], lang: "th" | "en"): string {
  const locale = lang === "th" ? "th-TH-u-ca-buddhist" : "en-GB";
  const fmt = (d: string, o: Intl.DateTimeFormatOptions) =>
    new Intl.DateTimeFormat(locale, { timeZone: "UTC", ...o }).format(new Date(`${d}T00:00:00Z`));
  if (dates.length === 1) return fmt(dates[0], { weekday: "short", day: "numeric", month: "short", year: "numeric" });
  const [a, b] = [dates[0], dates[6]];
  const sameMonth = a.slice(0, 7) === b.slice(0, 7);
  return `${fmt(a, sameMonth ? { day: "numeric" } : { day: "numeric", month: "short" })} – ${fmt(b, { day: "numeric", month: "short", year: "numeric" })}`;
}

/** What the add/edit sheet is showing: a new item with starting values, or an existing one. */
type Sheet = { id?: number; date?: string; time?: string; end_time?: string } | null;

export default function Calendar() {
  const { t, lang } = useT();
  const [month, setMonth] = useState(() => bangkokDate().slice(0, 7));
  const [data, setData] = useState<CalendarData | null>(null);
  // Month grid, or an hour-by-hour week or day around `anchor`.
  const [view, setView] = useState<View>(() => {
    try {
      const v = localStorage.getItem("studyos.calendarView") as View;
      return VIEWS.includes(v) ? v : "month";
    } catch { return "month"; }
  });
  const [anchor, setAnchor] = useState(bangkokDate);
  const [now, setNow] = useState(bangkokTime());
  // Every month fetched so far, so a week that crosses two months has both.
  const [cache, setCache] = useState<Record<string, CalendarData>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sheet, setSheet] = useState<Sheet>(null);
  // `keep`: stay on the day the student is looking at (after ticking something there).
  const reload = (m: string, keep?: string | null) => {
    setLoading(true);
    getJSON<CalendarData>(`/api/calendar?month=${m}`)
      .then((d) => {
        setData(d);
        setCache((c) => ({ ...c, [m]: d }));
        if (keep) setSelected(keep);
        else if (d.today.startsWith(m)) setSelected(d.today);
        else setSelected(null);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { reload(month); }, [month]);
  // A reminder was added, edited or ticked somewhere: refresh, staying on the same day.
  const refresh = useCallback(() => { setCache({}); reload(month, selected); }, [month, selected]);
  useRemindersChanged(refresh);

  const shown = view === "week" ? weekOf(anchor) : view === "day" ? [anchor] : [];
  const shownMonths = [...new Set(shown.map((d) => d.slice(0, 7)))].join(",");
  // The hour views follow `anchor`: keep `month` on it and fetch a second month if the week needs one.
  useEffect(() => {
    if (view === "month") return;
    if (anchor.slice(0, 7) !== month) setMonth(anchor.slice(0, 7));
    for (const m of shownMonths.split(",")) {
      if (m && m !== anchor.slice(0, 7) && !cache[m]) {
        getJSON<CalendarData>(`/api/calendar?month=${m}`).then((d) => setCache((c) => ({ ...c, [m]: d })));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, anchor, shownMonths, cache]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(bangkokTime()), 60_000);
    return () => window.clearInterval(timer);
  }, []);

  const eventsOn = useCallback((date: string) => cache[date.slice(0, 7)]?.events[date] ?? [], [cache]);

  function chooseView(v: View) {
    setView(v);
    // Carry the day the student was looking at into the new view.
    if (v !== "month" && selected) setAnchor(selected);
    if (v === "month") setSelected(anchor);
    try { localStorage.setItem("studyos.calendarView", v); } catch { /* ok */ }
  }
  function step(delta: number) {
    if (view === "month") setMonth((m) => shiftMonth(m, delta));
    else setAnchor((a) => shiftDay(a, delta * (view === "week" ? 7 : 1)));
  }
  const today = data?.today ?? bangkokDate();
  function goToday() {
    setAnchor(today);
    setMonth(today.slice(0, 7));
    setSelected(today);
  }
  const onToday = view === "month" ? month === today.slice(0, 7) : shown.includes(today);

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
        className="flex items-center justify-between px-1 py-1"
        style={{ borderBottom: "1px solid var(--border-light)" }}
      >
        <button
          onClick={() => step(-1)}
          aria-label={t("cal.prev")}
          className="w-11 h-11 flex items-center justify-center rounded-lg transition-colors"
          style={{ color: "var(--text-secondary)" }}
        >
          <Icon name="chevronLeft" size={18} />
        </button>
        <h2 className="text-sm font-semibold capitalize" style={{ color: "var(--text-primary)" }}>
          {view === "month" ? monthLabel(month, lang) : rangeLabel(shown, lang)}
        </h2>
        <div className="flex items-center gap-1">
          <button
            onClick={() => step(1)}
            aria-label={t("cal.next")}
            className="w-11 h-11 flex items-center justify-center rounded-lg transition-colors"
            style={{ color: "var(--text-secondary)" }}
          >
            <Icon name="chevronRight" size={18} />
          </button>
        </div>
      </div>

      {/* View switcher + jump to today */}
      <div className="flex items-center gap-2 px-3 py-2" style={{ borderBottom: "1px solid var(--border-light)" }}>
        <div role="tablist" aria-label={t("cal.view")} className="flex-1 grid grid-cols-3 gap-1 rounded-xl p-1" style={{ backgroundColor: "var(--bg-base)" }}>
          {VIEWS.map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={view === v}
              onClick={() => chooseView(v)}
              className="rounded-lg min-h-11 text-sm font-medium"
              style={{ backgroundColor: view === v ? "var(--accent)" : "transparent", color: view === v ? "#fff" : "var(--text-secondary)" }}
            >
              {t(`cal.view.${v}`)}
            </button>
          ))}
        </div>
        <button
          onClick={goToday}
          disabled={onToday}
          className="rounded-lg px-3 min-h-11 text-sm font-medium border disabled:opacity-40"
          style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
        >
          {t("cal.today")}
        </button>
      </div>

      {/* The one way to add to the calendar. Clicking a day or an hour also opens it. */}
      <div className="flex items-center justify-between gap-3 px-3 py-2" style={{ borderBottom: "1px solid var(--border-light)" }}>
        <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>{t(view === "month" ? "cal.hintMonth" : "cal.hintGrid")}</p>
        <AddButton label={t("cal.add")} onClick={() => setSheet({ date: view === "month" ? selected ?? today : anchor })} />
      </div>

      {/* Hour-by-hour week or day */}
      {view !== "month" && (
        <TimeGrid
          dates={shown}
          eventsOn={eventsOn}
          today={today}
          now={now}
          onPickDay={(date) => { setAnchor(date); setSelected(date); setView("day"); }}
          onToggle={(ev, date) => ev.reminder_id && setDone(ev.reminder_id, date, !ev.done)}
          // A clicked slot starts as a one-hour event, which the student can change.
          onAdd={(date, time) => {
            const end = Math.min(Number(time.slice(0, 2)) * 60 + Number(time.slice(3)) + 60, 23 * 60 + 59);
            setSheet({ date, time, end_time: `${String(Math.floor(end / 60)).padStart(2, "0")}:${String(end % 60).padStart(2, "0")}` });
          }}
          onOpen={(ev) => ev.reminder_id && setSheet({ id: ev.reminder_id })}
        />
      )}

      {/* Weekday headers */}
      {view === "month" && (<>
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
              onClick={() => { setSelected(isSel ? null : date); setAnchor(date); }}
              // Double-click a day to add something on it straight away.
              onDoubleClick={() => { setSelected(date); setAnchor(date); setSheet({ date }); }}
              className="flex flex-col items-center py-1 rounded-xl transition-all relative min-h-11"
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
                {(["class", "exam", "task", "etesting", "event", "reminder", "todo"] as DotType[]).map(
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

      </>)}

      {/* Selected day detail */}
      {view === "month" && selected && (
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
            </div>
          </div>

          {selectedEvents.length === 0 && !loading ? (
            <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
              {t("cal.noEvents")}
            </p>
          ) : (
            <ul className="space-y-1.5">
              {selectedEvents.map((ev, i) => (
                <EventRow
                  key={i}
                  ev={ev}
                  t={t}
                  // Reminders and to-dos can be ticked for this day right here; anything the
                  // student added opens for editing when tapped.
                  onToggle={ev.reminder_id && ev.type !== "event" ? () => setDone(ev.reminder_id!, selected, !ev.done) : undefined}
                  onOpen={ev.reminder_id ? () => setSheet({ id: ev.reminder_id }) : undefined}
                />
              ))}
            </ul>
          )}
          <button
            onClick={() => setSheet({ date: selected })}
            className="w-full flex items-center justify-center gap-1.5 rounded-xl border border-dashed min-h-11 text-sm font-medium"
            style={{ borderColor: "var(--border)", color: "var(--accent-text)" }}
          >
            <Icon name="plus" size={16} />
            {t("cal.addOnDay")}
          </button>
        </div>
      )}

      {sheet && (
        <ReminderSheet
          key={sheet.id ?? `new-${sheet.date}-${sheet.time}`}
          id={sheet.id}
          today={today}
          preset={{ kind: "event", date: sheet.date, time: sheet.time, end_time: sheet.end_time }}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  );
}

function EventRow({
  ev,
  t,
  onToggle,
  onOpen,
}: {
  ev: CalEvent;
  t: (k: string, v?: Record<string, string | number>) => string;
  onToggle?: () => void;
  onOpen?: () => void;
}) {
  const tagColors: Record<string, { bg: string; text: string }> = {
    class: { bg: "var(--accent-light)", text: "var(--accent-text)" },
    exam: { bg: "rgba(239,68,68,0.15)", text: "#ef4444" },
    task: { bg: "rgba(34,197,94,0.15)", text: "#22c55e" },
    etesting: { bg: "rgba(245,158,11,0.15)", text: "#f59e0b" },
    event: { bg: "rgba(99,102,241,0.15)", text: "#6366f1" },
    reminder: { bg: "rgba(14,165,233,0.15)", text: "#0ea5e9" },
    todo: { bg: "rgba(168,85,247,0.15)", text: "#a855f7" },
  };
  const tag = tagColors[ev.type] ?? tagColors.class;
  const labelMap: Record<string, string> = {
    class: t("cal.class"),
    exam: t("cal.exam"),
    task: t("cal.task"),
    etesting: t("cal.etesting"),
    event: t("rem.kind.event"),
    reminder: t("rem.kind.reminder"),
    todo: t("rem.kind.todo"),
  };
  const label = labelMap[ev.type] ?? ev.type;

  return (
    <li
      className="flex items-start gap-2 rounded-xl px-3 py-2"
      style={{ background: "var(--bg-surface)", border: "1px solid var(--border-light)" }}
    >
      {onToggle && (
        <button
          onClick={onToggle}
          role="checkbox"
          aria-checked={!!ev.done}
          aria-label={`${t(ev.done ? "rem.markUndone" : "rem.markDone")}: ${ev.name_th}`}
          className="shrink-0 -ml-2 -my-1.5 w-11 h-11 flex items-center justify-center"
        >
          <span
            className="w-5 h-5 rounded-full flex items-center justify-center"
            style={{
              border: `2px solid ${ev.done ? "var(--accent)" : "var(--text-tertiary)"}`,
              backgroundColor: ev.done ? "var(--accent)" : "transparent",
              color: "#fff",
            }}
          >
            {ev.done && <Icon name="check" size={12} />}
          </span>
        </button>
      )}
      {/* Type badge */}
      <span
        className="text-xs font-semibold px-2 py-0.5 rounded-full mt-0.5 shrink-0"
        style={{ background: tag.bg, color: tag.text }}
      >
        {label}
      </span>

      <div
        className={`flex-1 min-w-0 ${onOpen ? "cursor-pointer" : ""}`}
        onClick={onOpen}
        role={onOpen ? "button" : undefined}
        tabIndex={onOpen ? 0 : undefined}
        onKeyDown={onOpen ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onOpen(); } } : undefined}
      >
        {ev.course_code ? (
          <CourseTitle code={ev.course_code} name_th={ev.name_th} name_en={ev.name_en} className="text-sm font-medium" />
        ) : (
          <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>
            {ev.name_th}
          </span>
        )}

        <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-0.5">
          {ev.start_time && !ev.end_time && (
            <span className="text-xs flex items-center gap-1" style={{ color: "var(--text-tertiary)" }}>
              <Icon name="clock" size={12} />
              {formatTime(ev.start_time)}
            </span>
          )}
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
          {ev.description && !ev.reminder_id && (
            <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
              {ev.description}
            </span>
          )}
          {ev.description && ev.reminder_id && <CourseChip code={ev.description} className="text-xs" />}
          {ev.note && (
            <span className="text-xs flex items-center gap-1" style={{ color: "var(--text-tertiary)" }}>
              <Icon name="notebook" size={12} />
              {ev.note}
            </span>
          )}
          {ev.done && !onToggle && (
            <span className="text-xs flex items-center gap-0.5" style={{ color: "#22c55e" }}>
              <Icon name="checkCircle" size={12} />
              {t("cal.done")}
            </span>
          )}
        </div>
      </div>

    </li>
  );
}
