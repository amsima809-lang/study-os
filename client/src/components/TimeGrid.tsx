/**
 * Hour-by-hour grid for one day or one week (Monday first).
 *
 * Events with a start time are drawn as blocks at their hour; events without
 * one (to-dos with no time, e-Testing periods) sit in an "all day" row on top.
 * Events that overlap share the column side by side. A week column on a phone
 * only has room for one (three on a wide screen); the rest are counted in a
 * "+N" badge that opens the day view, where everything is shown (scroll
 * sideways if needed).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useT } from "../i18n.tsx";
import type { CalEvent } from "../api.ts";
import Icon from "./Icon.tsx";
import { layoutDay, minutes } from "../calendarLayout.ts";
import { formatTime, timeRange, hourLabel, getClock } from "../format.ts";

const COLORS: Record<CalEvent["type"], string> = {
  class: "var(--accent-text)",
  exam: "#ef4444",
  task: "var(--mark-study)",
  etesting: "#f59e0b",
  etbooked: "#d97706",
  event: "#6366f1",
  reminder: "#0ea5e9",
  todo: "#a855f7",
};

type Props = {
  /** One date (day view) or seven (week view), as YYYY-MM-DD. */
  dates: string[];
  eventsOn: (date: string) => CalEvent[];
  today: string;
  /** Current Bangkok time "HH:MM", for the "now" line. */
  now: string;
  /** Week view: open one day. */
  onPickDay?: (date: string) => void;
  /** Tick a reminder or to-do for a day. */
  onToggle?: (ev: CalEvent, date: string) => void;
  /** An empty spot was clicked: start adding something at that day and time. */
  onAdd?: (date: string, time: string) => void;
  /** Open one of the student's own items for editing. */
  onOpen?: (ev: CalEvent) => void;
};

export default function TimeGrid({ dates, eventsOn, today, now, onPickDay, onToggle, onAdd, onOpen }: Props) {
  const { t, lang } = useT();
  const week = dates.length > 1;
  const hourPx = week ? 44 : 56;
  // How many overlapping events fit side by side in one week column.
  const [wide, setWide] = useState(() => window.innerWidth >= 768);
  useEffect(() => {
    const onResize = () => setWide(window.innerWidth >= 768);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  const weekLanes = wide ? 3 : 1;
  const scroller = useRef<HTMLDivElement>(null);

  const days = useMemo(
    () => dates.map((date) => {
      const events = eventsOn(date);
      return { date, allDay: events.filter((e) => !e.start_time), ...layoutDay(events, week ? weekLanes : Infinity) };
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [dates.join(), eventsOn, week, weekLanes],
  );

  // The hour-label column: "10 AM" needs a little more room than "10:00".
  const gutter = getClock() === "12" ? 46 : 40;

  // Show 07:00 to 20:00 at least, wider when something falls outside.
  const starts = days.flatMap((d) => [...d.placed, ...d.overflow].map((p) => p.start));
  const ends = days.flatMap((d) => [...d.placed, ...d.overflow].map((p) => p.end));
  const firstHour = Math.max(0, Math.min(7, ...starts.map((m) => Math.floor(m / 60))));
  const lastHour = Math.min(24, Math.max(20, ...ends.map((m) => Math.ceil(m / 60))));
  const hours = Array.from({ length: lastHour - firstHour }, (_, i) => firstHour + i);
  const y = (min: number) => ((min - firstHour * 60) / 60) * hourPx;

  // Start scrolled to just above "now" (today) or the first event.
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const focus = dates.includes(today) ? minutes(now) : Math.min(...starts, 9 * 60);
    el.scrollTop = Math.max(0, y(focus) - hourPx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dates.join()]);

  const dayName = (date: string) =>
    new Intl.DateTimeFormat(lang === "th" ? "th-TH" : "en-GB", { weekday: "short", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
  const hasAllDay = days.some((d) => d.allDay.length > 0);
  // Day view: give each side-by-side event at least 96px, and scroll sideways past that.
  const dayMinWidth = week ? undefined : Math.max(...days[0].placed.map((p) => p.lanes), 1) * 96;

  return (
    <div>
      {/* Day headers (week view) */}
      {week && (
        <div className="flex pl-10 pr-1">
          {days.map((d) => (
            <button
              key={d.date}
              onClick={() => onPickDay?.(d.date)}
              className="flex-1 min-w-0 py-1.5 flex flex-col items-center text-xs"
              style={{ color: d.date === today ? "var(--accent-text)" : "var(--text-tertiary)" }}
              aria-label={d.date}
            >
              <span>{dayName(d.date)}</span>
              <span
                className="mt-0.5 w-7 h-7 flex items-center justify-center rounded-full text-sm font-semibold"
                style={{
                  backgroundColor: d.date === today ? "var(--accent)" : "transparent",
                  color: d.date === today ? "#fff" : "var(--text-primary)",
                }}
              >
                {Number(d.date.slice(8))}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* All-day row: things with no time */}
      {hasAllDay && (
        <div className="flex pr-1 py-1" style={{ borderTop: "1px solid var(--border-light)" }}>
          <div className="shrink-0 text-xs text-right pr-1.5 pt-1" style={{ width: gutter, color: "var(--text-tertiary)" }}>
            {t("cal.allDay")}
          </div>
          {days.map((d) => (
            <div key={d.date} className="flex-1 min-w-0 px-0.5 space-y-0.5">
              {(week ? d.allDay.slice(0, 2) : d.allDay).map((ev, i) => (
                <AllDayChip key={i} ev={ev} week={week} onToggle={onToggle && ev.type !== "event" ? () => onToggle(ev, d.date) : undefined} />
              ))}
              {week && d.allDay.length > 2 && (
                <button onClick={() => onPickDay?.(d.date)} className="w-full text-xs font-semibold" style={{ color: "var(--text-tertiary)" }}>
                  +{d.allDay.length - 2}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Hour grid */}
      <div
        ref={scroller}
        className="timegrid-scroll overflow-auto"
        style={{ borderTop: "1px solid var(--border-light)" }}
      >
        <div className="flex pr-1" style={{ height: hours.length * hourPx + 8, minWidth: dayMinWidth ? dayMinWidth + gutter : undefined }}>
          {/* Hour labels */}
          <div className="shrink-0 relative sticky left-0 z-10" style={{ width: gutter, backgroundColor: "var(--bg-surface)" }}>
            {hours.map((h) => (
              <div
                key={h}
                className="absolute right-1.5 text-xs tabular-nums whitespace-nowrap"
                style={{ top: y(h * 60) - 2, color: "var(--text-tertiary)" }}
              >
                {hourLabel(h)}
              </div>
            ))}
          </div>

          {days.map((d) => (
            <div
              key={d.date}
              className="flex-1 min-w-0 relative"
              style={{
                borderLeft: "1px solid var(--border-light)",
                backgroundColor: week && d.date === today ? "var(--accent-light)" : undefined,
                cursor: onAdd ? "copy" : undefined,
              }}
              // Click an empty spot to add something there, snapped to the half hour.
              onClick={(e) => {
                if (!onAdd || e.target !== e.currentTarget) return;
                const offset = e.clientY - e.currentTarget.getBoundingClientRect().top - 4;
                const mins = Math.max(firstHour * 60, Math.min(lastHour * 60 - 30, firstHour * 60 + Math.floor((offset / hourPx) * 2) * 30));
                onAdd(d.date, `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`);
              }}
            >
              {hours.map((h) => (
                <div key={h} className="absolute inset-x-0 pointer-events-none" style={{ top: y(h * 60) + 4, borderTop: "1px solid var(--border-light)" }} />
              ))}

              {d.placed.map((p, i) => {
                const color = COLORS[p.ev.type];
                const height = Math.max(y(p.end) - y(p.start) - 2, 18);
                const tickable = !week && !!p.ev.reminder_id && p.ev.type !== "event" && !!onToggle;
                const editable = !week && !!p.ev.reminder_id && !!onOpen;
                const body = (
                  <>
                    {week && /^[A-Z]{3}\d{4}$/.test(p.ev.course_code) ? (
                      // A week column is too narrow for "RAM1111" on one line.
                      <span className="block font-semibold leading-tight">
                        {p.ev.course_code.slice(0, 3)}
                        <br />
                        {p.ev.course_code.slice(3)}
                      </span>
                    ) : (
                      <span
                        className={`block font-semibold ${week ? "break-words line-clamp-2" : "truncate"}`}
                        style={{ textDecoration: p.ev.done ? "line-through" : undefined }}
                      >
                        {week && p.ev.course_code ? p.ev.name_th : (p.ev.course_code ? `${p.ev.course_code} ` : "") + (lang === "en" && p.ev.name_en ? p.ev.name_en : p.ev.name_th)}
                      </span>
                    )}
                    {!week && height > 34 && (
                      <span className="block truncate opacity-80">
                        {p.ev.end_time ? timeRange(p.ev.start_time!, p.ev.end_time) : formatTime(p.ev.start_time!)}
                        {p.ev.room ? ` · ${p.ev.room}` : ""}
                        {p.ev.reminder_id && p.ev.description ? ` · ${p.ev.description}` : ""}
                      </span>
                    )}
                  </>
                );
                const style: React.CSSProperties = {
                  top: y(p.start) + 5,
                  height,
                  left: `calc(${(p.lane / p.lanes) * 100}% + 1px)`,
                  width: `calc(${100 / p.lanes}% - 2px)`,
                  backgroundColor: `color-mix(in srgb, ${color} 18%, var(--bg-surface))`,
                  borderLeft: `3px solid ${color}`,
                  color: "var(--text-primary)",
                  opacity: p.ev.done ? 0.55 : 1,
                  borderRadius: 6, // the theme's rounded-md (14px) is too round for a narrow block
                };
                const cls = `absolute overflow-hidden text-left leading-tight ${week ? "px-1 py-0.5 text-xs" : "px-2 py-1 text-xs"}`;
                return week || editable ? (
                  <button
                    key={i}
                    className={cls}
                    style={style}
                    onClick={() => (editable ? onOpen!(p.ev) : onPickDay?.(d.date))}
                    aria-label={`${formatTime(p.ev.start_time!)} ${p.ev.course_code} ${p.ev.name_th}`}
                  >
                    {/* A button centres its content; this keeps the label at the top. */}
                    <span className="block h-full">
                      {tickable && (
                        <span
                          role="checkbox"
                          aria-checked={!!p.ev.done}
                          tabIndex={0}
                          className="float-right -mr-1 -mt-1 ml-1 w-8 h-8 flex items-center justify-center"
                          style={{ color }}
                          onClick={(e) => { e.stopPropagation(); onToggle!(p.ev, d.date); }}
                          onKeyDown={(e) => { if (e.key === " " || e.key === "Enter") { e.preventDefault(); e.stopPropagation(); onToggle!(p.ev, d.date); } }}
                        >
                          <Icon name={p.ev.done ? "checkCircle" : "square"} size={16} />
                        </span>
                      )}
                      {body}
                    </span>
                  </button>
                ) : (
                  <div key={i} className={cls} style={style}>{body}</div>
                );
              })}

              {d.overflow.map((o, i) => (
                <button
                  key={`more-${i}`}
                  onClick={() => onPickDay?.(d.date)}
                  className="absolute z-10 right-0.5 rounded-full px-1 text-[11px] font-bold leading-4"
                  // On the second line, so it does not cover the course code.
                  style={{ top: y(o.start) + 22, backgroundColor: "var(--accent)", color: "#fff" }}
                  aria-label={t("cal.more", { n: o.count })}
                >
                  +{o.count}
                </button>
              ))}

              {d.date === today && minutes(now) >= firstHour * 60 && minutes(now) <= lastHour * 60 && (
                <div className="absolute inset-x-0 z-10 pointer-events-none" style={{ top: y(minutes(now)) + 4 }}>
                  <div style={{ borderTop: "2px solid var(--danger)" }} />
                  <div className="absolute -left-1 -top-1 w-2 h-2 rounded-full" style={{ backgroundColor: "var(--danger)" }} />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function AllDayChip({ ev, week, onToggle }: { ev: CalEvent; week: boolean; onToggle?: () => void }) {
  const { lang } = useT();
  const color = COLORS[ev.type];
  const tickable = !week && !!ev.reminder_id && !!onToggle;
  const style: React.CSSProperties = {
    backgroundColor: `color-mix(in srgb, ${color} 18%, var(--bg-surface))`,
    borderLeft: `3px solid ${color}`,
    color: "var(--text-primary)",
    opacity: ev.done ? 0.55 : 1,
    textDecoration: ev.done ? "line-through" : undefined,
  };
  const cls = `block w-full rounded-md truncate text-left ${week ? "px-1 text-xs" : "px-2 py-1.5 text-xs"}`;
  const label = (ev.course_code ? `${ev.course_code} ` : "") + (lang === "en" && ev.name_en ? ev.name_en : ev.name_th);
  return tickable ? (
    <button className={cls} style={style} onClick={onToggle} role="checkbox" aria-checked={!!ev.done}>
      <span className="float-right ml-1" style={{ color }}><Icon name={ev.done ? "checkCircle" : "square"} size={14} /></span>
      {label}
    </button>
  ) : (
    <span className={cls} style={style}>{label}</span>
  );
}
