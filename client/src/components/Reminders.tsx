/**
 * Shared pieces for reminders, to-dos and events: one row with a tick circle,
 * the add/edit form, and the sheet that shows that form over any screen.
 * Used by the Reminders screen, the Today card and the calendar.
 */
import { useEffect, useState, useRef } from "react";
import { createPortal } from "react-dom";
import { useT } from "../i18n.tsx";
import { getJSON, postJSON, putJSON, deleteJSON, type ApiError, type ReminderRule } from "../api.ts";
import { ConfirmDialog, ErrorBox } from "./ui.tsx";
import { draftOwner } from "../noteDraft.ts";
import { formatDate, formatTime, timeRange } from "../format.ts";
import { CourseChip } from "./CourseTitle.tsx";
import Icon from "./Icon.tsx";

const REPEATS = ["none", "daily", "weekdays", "weekly", "monthly"] as const;

const addDays = (iso: string, n: number) => {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/** "Today", "Tomorrow" or the formatted date. */
export function dayLabel(date: string, today: string, t: (k: string) => string, lang: "th" | "en"): string {
  if (date === today) return t("rem.today");
  if (date === addDays(today, 1)) return t("rem.tomorrow");
  return formatDate(date, lang);
}

/**
 * Reminders show in several places at once (Today card, calendar, the manage
 * screen). After any change this event tells the others to refresh.
 */
export const REMINDERS_CHANGED = "studyos:reminders-changed";
const announce = () => window.dispatchEvent(new Event(REMINDERS_CHANGED));
/** Run `refresh` whenever reminders change anywhere in the app. */
export function useRemindersChanged(refresh: () => void) {
  useEffect(() => {
    window.addEventListener(REMINDERS_CHANGED, refresh);
    return () => window.removeEventListener(REMINDERS_CHANGED, refresh);
  }, [refresh]);
}

/** Tick or untick one occurrence (`on` is "" for a to-do with no date). */
export async function setDone(id: number, on: string, done: boolean) {
  await postJSON(`/api/reminders/${id}/done`, { date: on, done });
  announce();
}

type RowProps = {
  item: ReminderRule;
  /** The day this row stands for ("" = no date; null = nothing to tick). */
  on: string | null;
  done: boolean;
  overdue?: boolean;
  today: string;
  /** Hide the date when the list is already about one day. */
  hideDate?: boolean;
  onToggle?: () => void;
  onOpen?: () => void;
  /** A short label shown at the right, e.g. "Due now". */
  badge?: string;
};

export function ReminderRow({ item, on, done, overdue, today, hideDate, onToggle, onOpen, badge }: RowProps) {
  const { t, lang } = useT();
  const showDate = !hideDate && on;

  // Swipe right to tick it off (or to un-tick it). The row follows the finger
  // and shows what letting go will do; a swipe has to be mostly sideways, so
  // scrolling the list never ticks anything. The tick box does the same job.
  const canSwipe = !!onToggle && on !== null && item.kind !== "event";
  const [dx, setDx] = useState(0);
  const drag = useRef<{ x: number; y: number; dir: "side" | "scroll" | null } | null>(null);
  const SWIPE_AT = 72;
  const swipe = canSwipe
    ? {
        onTouchStart: (e: React.TouchEvent) => {
          drag.current = e.touches.length === 1 ? { x: e.touches[0].clientX, y: e.touches[0].clientY, dir: null } : null;
        },
        onTouchMove: (e: React.TouchEvent) => {
          const d = drag.current;
          if (!d) return;
          const mx = e.touches[0].clientX - d.x;
          const my = e.touches[0].clientY - d.y;
          if (!d.dir && (Math.abs(mx) > 10 || Math.abs(my) > 10)) d.dir = mx > 0 && Math.abs(mx) > 1.5 * Math.abs(my) ? "side" : "scroll";
          if (d.dir === "side") setDx(Math.min(120, Math.max(0, mx)));
        },
        onTouchEnd: () => {
          if (drag.current?.dir === "side" && dx >= SWIPE_AT) onToggle!();
          drag.current = null;
          setDx(0);
        },
        onTouchCancel: () => { drag.current = null; setDx(0); },
      }
    : {};

  return (
    <li {...swipe} className="relative overflow-hidden rounded-xl" style={{ touchAction: "pan-y" }}>
      {dx > 0 && (
        <div
          aria-hidden="true"
          className="absolute inset-y-0 left-0 flex items-center gap-1.5 pl-3 overflow-hidden whitespace-nowrap text-sm font-semibold"
          style={{ width: dx, backgroundColor: dx >= SWIPE_AT ? "#047857" /* white text needs the darker green */ : "var(--bg-surface-hover)", color: dx >= SWIPE_AT ? "#fff" : "var(--text-secondary)" }}
        >
          <Icon name={done ? "refresh" : "check"} size={16} />
          {t(done ? "rem.swipeUndo" : "rem.swipeDone")}
        </div>
      )}
      <div className="flex items-start gap-1" style={{ transform: dx ? `translateX(${dx}px)` : undefined, transition: dx ? "none" : "transform 150ms ease-out" }}>
      {item.kind === "event" ? (
        // An event has nothing to tick: show what it is instead.
        <span className="shrink-0 w-11 h-11 flex items-center justify-center" style={{ color: "var(--accent-2, var(--accent-text))" }}>
          <Icon name="calendar" size={20} />
        </span>
      ) : (
      <button
        onClick={onToggle}
        disabled={!onToggle || on === null}
        role="checkbox"
        aria-checked={done}
        aria-label={`${t(done ? "rem.markUndone" : "rem.markDone")}: ${item.title}`}
        className="shrink-0 w-11 h-11 flex items-center justify-center disabled:opacity-40"
      >
        <span
          className="w-6 h-6 rounded-full flex items-center justify-center transition-colors"
          style={{
            border: `2px solid ${done ? "var(--accent)" : "var(--text-tertiary)"}`,
            backgroundColor: done ? "var(--accent)" : "transparent",
            color: "#fff",
          }}
        >
          {done && <Icon name="check" size={14} />}
        </span>
      </button>
      )}
      <button onClick={onOpen} disabled={!onOpen} className="flex-1 min-w-0 text-left py-2.5 min-h-11">
        <span
          className="block text-sm font-medium"
          style={{ color: done ? "var(--text-tertiary)" : "var(--text-primary)", textDecoration: done ? "line-through" : "none" }}
        >
          {item.title}
        </span>
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 mt-0.5 text-xs" style={{ color: "var(--text-tertiary)" }}>
          {item.kind === "reminder" && <Icon name="bell" size={12} />}
          {showDate && (
            <span style={{ color: overdue ? "var(--danger)" : undefined, fontWeight: overdue ? 600 : undefined }}>
              {overdue ? `${t("rem.overdue")} · ` : ""}
              {dayLabel(on!, today, t, lang)}
            </span>
          )}
          {item.time && <span>{item.end_time ? timeRange(item.time, item.end_time) : formatTime(item.time)}</span>}
          {item.repeat !== "none" && (
            <span className="inline-flex items-center gap-1">
              <Icon name="repeat" size={12} />
              {t(`rem.repeat.${item.repeat}`)}
            </span>
          )}
          {item.course_code && <CourseChip code={item.course_code} />}
        </span>
      </button>
      {badge && (
        <span
          className="shrink-0 self-center text-xs font-semibold px-2 py-0.5 rounded-full"
          style={{ backgroundColor: "var(--accent)", color: "#fff" }}
        >
          {badge}
        </span>
      )}
      </div>
    </li>
  );
}

type Course = { code: string; name_th: string; name_en: string | null };
let coursesCache: Promise<Course[]> | null = null;
/** The student's own courses, for the course picker (fetched once). */
function loadCourses(): Promise<Course[]> {
  coursesCache ??= getJSON<Course[]>("/api/catalog/courses").catch(() => []);
  return coursesCache;
}

type FormProps = {
  /** An existing item to edit, or null to add one. */
  item: ReminderRule | null;
  today: string;
  /** Starting values for a new item. */
  preset?: Partial<Pick<ReminderRule, "kind" | "title" | "date" | "time" | "end_time" | "course_code">>;
  onSaved: () => void;
  onCancel: () => void;
};

/**
 * The new item being written, kept in this browser so a sheet closed by a stray
 * tap, a tab switch or a refresh does not lose it. Only for NEW items (an edit
 * starts from what is saved), one per student, dropped on save or Cancel.
 */
type FormDraft = {
  kind: ReminderRule["kind"]; title: string; date: string; time: string; endTime: string;
  repeat: ReminderRule["repeat"]; until: string; course: string; note: string;
};
const formDraftKey = () => `studyos.reminderDraft:${draftOwner()}`;
function loadFormDraft(): FormDraft | null {
  try {
    const d = JSON.parse(localStorage.getItem(formDraftKey()) ?? "null") as FormDraft | null;
    return d && (d.title?.trim() || d.note?.trim()) ? d : null;
  } catch {
    return null;
  }
}
function clearFormDraft() {
  try { localStorage.removeItem(formDraftKey()); } catch { /* nothing to remove */ }
}

export function ReminderForm({ item, today, preset, onSaved, onCancel }: FormProps) {
  const { t, lang } = useT();
  // What was being written last time. A slot the student has just clicked
  // (a preset with a time) still decides the day and time.
  const [draft] = useState<FormDraft | null>(() => (item || preset?.title ? null : loadFormDraft()));
  const slot = !!preset?.time;
  const [restored, setRestored] = useState(draft !== null);
  const [kind, setKind] = useState<ReminderRule["kind"]>(item?.kind ?? (slot ? preset?.kind : undefined) ?? draft?.kind ?? preset?.kind ?? "todo");
  const [title, setTitle] = useState(item?.title ?? preset?.title ?? draft?.title ?? "");
  const [date, setDate] = useState(item ? item.date ?? "" : slot ? preset!.date ?? today : draft?.date ?? preset?.date ?? today);
  const [time, setTime] = useState(item?.time ?? preset?.time ?? draft?.time ?? "");
  const [endTime, setEndTime] = useState(item?.end_time ?? preset?.end_time ?? (slot ? "" : draft?.endTime) ?? "");
  const [repeat, setRepeat] = useState<ReminderRule["repeat"]>(item?.repeat ?? draft?.repeat ?? "none");
  const [until, setUntil] = useState(item?.repeat_until ?? draft?.until ?? "");
  const [course, setCourse] = useState(item?.course_code ?? preset?.course_code ?? draft?.course ?? "");
  const [note, setNote] = useState(item?.note ?? draft?.note ?? "");

  // Keep the draft as it is typed; nothing typed means nothing to keep.
  const finished = useRef(false);
  useEffect(() => {
    if (item || finished.current) return;
    if (!title.trim() && !note.trim()) return clearFormDraft();
    try {
      localStorage.setItem(formDraftKey(), JSON.stringify({ kind, title, date, time, endTime, repeat, until, course, note } satisfies FormDraft));
    } catch { /* storage full or blocked: the form still works */ }
  }, [item, kind, title, date, time, endTime, repeat, until, course, note]);

  /** Cancel means "I do not want this": the draft goes too. Closing the sheet any other way keeps it. */
  function cancel() {
    if (!item) { finished.current = true; clearFormDraft(); }
    onCancel();
  }
  function startOver() {
    setTitle(""); setNote(""); setKind(preset?.kind ?? "todo"); setDate(preset?.date ?? today);
    setTime(preset?.time ?? ""); setEndTime(preset?.end_time ?? ""); setRepeat("none"); setUntil(""); setCourse(preset?.course_code ?? "");
    setRestored(false);
    clearFormDraft();
  }
  const [courses, setCourses] = useState<Course[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => { loadCourses().then(setCourses); }, []);

  // Only a to-do may have no day; a reminder, an event or anything that repeats needs one.
  const needsDate = kind !== "todo" || repeat !== "none";
  const hasEnd = kind === "event" && endTime !== "";
  const endOk = !hasEnd || (time !== "" && endTime > time);
  const valid = title.trim() !== "" && (!needsDate || date !== "") && (!until || !date || until >= date) && endOk;

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!valid || busy) return;
    setBusy(true);
    setError("");
    const body = {
      kind, title: title.trim(), note: note.trim() || null, course_code: course || null,
      date: date || null, time: time || null, end_time: hasEnd ? endTime : null,
      repeat, repeat_until: repeat === "none" ? null : until || null,
    };
    try {
      if (item) await putJSON(`/api/reminders/${item.id}`, body);
      else {
        await postJSON("/api/reminders", body);
        finished.current = true; // saved: the draft is no longer needed
        clearFormDraft();
      }
      announce();
      onSaved();
    } catch (err) {
      setError((err as ApiError)?.error ?? t("status.error"));
      setBusy(false);
    }
  }

  const field = "w-full rounded-xl border px-3 py-2.5";
  const fieldStyle = { backgroundColor: "var(--bg-base)", borderColor: "var(--border)", color: "var(--text-primary)" };
  const label = "block text-xs mb-1";
  const labelStyle = { color: "var(--text-tertiary)" };

  return (
    <form onSubmit={save} className="space-y-3">
      {restored && (
        <div role="status" className="flex items-center gap-2 rounded-xl px-3 text-sm" style={{ backgroundColor: "var(--accent-light)", color: "var(--text-primary)" }}>
          <span className="flex-1 py-2">{t("rem.draftRestored")}</span>
          <button type="button" onClick={startOver} className="shrink-0 min-h-11 px-2 font-medium" style={{ color: "var(--danger)" }}>
            {t("rem.draftClear")}
          </button>
        </div>
      )}
      <div role="radiogroup" aria-label={t("rem.kind")} className="grid grid-cols-3 gap-1 rounded-xl p-1" style={{ backgroundColor: "var(--bg-base)" }}>
        {(["todo", "reminder", "event"] as const).map((k) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={kind === k}
            onClick={() => setKind(k)}
            className="flex items-center justify-center gap-1.5 rounded-lg min-h-11 px-1 text-sm font-medium leading-tight"
            style={{ backgroundColor: kind === k ? "var(--accent)" : "transparent", color: kind === k ? "#fff" : "var(--text-secondary)" }}
          >
            <Icon name={k === "todo" ? "checkCircle" : k === "reminder" ? "bell" : "calendar"} size={16} />
            {t(`rem.kind.${k}`)}
          </button>
        ))}
      </div>

      <div>
        <label className={label} style={labelStyle} htmlFor="rem-title">{t("rem.title")}</label>
        <input id="rem-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} required autoFocus={!item}
          placeholder={t(kind === "todo" ? "rem.titleTodo" : kind === "reminder" ? "rem.titleReminder" : "rem.titleEvent")} className={field} style={fieldStyle} />
        <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>{t(`rem.kindHint.${kind}`)}</p>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={label} style={labelStyle} htmlFor="rem-date">
            {t(kind === "todo" ? "rem.due" : "rem.date")}{!needsDate && ` (${t("rem.optional")})`}
          </label>
          <input id="rem-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} required={needsDate} className={field} style={fieldStyle} />
        </div>
        <div>
          <label className={label} style={labelStyle} htmlFor="rem-time">{t(kind === "event" ? "rem.start" : "rem.time")} ({t("rem.optional")})</label>
          <input id="rem-time" type="time" value={time} onChange={(e) => setTime(e.target.value)} className={field} style={fieldStyle} />
        </div>
        {kind === "event" && (
          <div className="col-start-2">
            <label className={label} style={labelStyle} htmlFor="rem-end">{t("rem.end")} ({t("rem.optional")})</label>
            <input id="rem-end" type="time" value={endTime} min={time || undefined} onChange={(e) => setEndTime(e.target.value)} className={field} style={fieldStyle} />
            {!endOk && <p className="text-xs mt-1" style={{ color: "var(--danger)" }}>{t("rem.endAfterStart")}</p>}
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className={label} style={labelStyle} htmlFor="rem-repeat">{t("rem.repeat")}</label>
          <select id="rem-repeat" value={repeat} onChange={(e) => setRepeat(e.target.value as ReminderRule["repeat"])} className={field} style={fieldStyle}>
            {REPEATS.map((r) => <option key={r} value={r}>{t(`rem.repeat.${r}`)}</option>)}
          </select>
        </div>
        {repeat !== "none" && (
          <div>
            <label className={label} style={labelStyle} htmlFor="rem-until">{t("rem.until")} ({t("rem.optional")})</label>
            <input id="rem-until" type="date" value={until} min={date || undefined} onChange={(e) => setUntil(e.target.value)} className={field} style={fieldStyle} />
          </div>
        )}
      </div>

      <div>
        <label className={label} style={labelStyle} htmlFor="rem-course">{t("rem.course")} ({t("rem.optional")})</label>
        <select id="rem-course" value={course} onChange={(e) => setCourse(e.target.value)} className={field} style={fieldStyle}>
          <option value="">{t("rem.noCourse")}</option>
          {/* Keep a course that is no longer in the student's list selectable. */}
          {course && !courses.some((c) => c.code === course) && <option value={course}>{course}</option>}
          {courses.map((c) => (
            <option key={c.code} value={c.code}>{c.code} · {lang === "en" && c.name_en ? c.name_en : c.name_th}</option>
          ))}
        </select>
      </div>

      <div>
        <label className={label} style={labelStyle} htmlFor="rem-note">{t("rem.note")} ({t("rem.optional")})</label>
        <textarea id="rem-note" value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={1000} className={field} style={fieldStyle} />
      </div>

      {error && <p role="alert" className="text-sm" style={{ color: "var(--danger)" }}>{error}</p>}

      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={!valid || busy} className="rounded-xl px-5 min-h-11 font-semibold disabled:opacity-40" style={{ backgroundColor: "var(--accent)", color: "#fff" }}>
          {t("rem.save")}
        </button>
        <button type="button" onClick={cancel} className="px-3 min-h-11 text-sm" style={{ color: "var(--text-secondary)" }}>
          {t("nav.cancel")}
        </button>
        {item && (
          <span className="ml-auto flex items-center gap-2">
            <button type="button" onClick={() => setConfirmDelete(true)} className="px-3 min-h-11 text-sm" style={{ color: "var(--danger)" }}>
              {t("rem.delete")}
            </button>
            {confirmDelete && (
              <ConfirmDialog
                title={t("rem.deleteTitle")}
                message={t(item.repeat === "none" ? "confirm.cannotUndo" : "rem.deleteAllMsg")}
                confirmLabel={t(item.repeat === "none" ? "confirm.delete" : "rem.deleteConfirmAll")}
                cancelLabel={t("nav.cancel")}
                onConfirm={async () => {
                  try { await deleteJSON(`/api/reminders/${item.id}`); announce(); onSaved(); }
                  catch (e) { setConfirmDelete(false); setError((e as ApiError)?.error ?? t("status.failed")); }
                }}
                onCancel={() => setConfirmDelete(false)}
              />
            )}
          </span>
        )}
      </div>
    </form>
  );
}

/**
 * The add/edit form in a sheet over the current screen. Pass `id` to edit an
 * existing item (it is loaded here) or `preset` to start a new one, for example
 * with the day and hour that was clicked on the calendar.
 */
export function ReminderSheet({
  id,
  preset,
  today,
  onClose,
}: {
  id?: number;
  preset?: FormProps["preset"];
  today: string;
  onClose: () => void;
}) {
  const { t } = useT();
  const [item, setItem] = useState<ReminderRule | null>(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    if (id == null) return;
    getJSON<ReminderRule>(`/api/reminders/${id}`).then(setItem).catch(() => setMissing(true));
  }, [id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const ready = id == null || item !== null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" style={{ background: "rgba(0,0,0,0.5)" }} onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t(id == null ? "rem.add" : "rem.edit")}
        onClick={(e) => e.stopPropagation()}
        className="w-full md:max-w-md max-h-[92dvh] overflow-y-auto rounded-t-3xl md:rounded-3xl border p-5 animate-slide-up"
        style={{
          backgroundColor: "var(--bg-surface)",
          borderColor: "var(--border-light)",
          paddingBottom: "calc(1.25rem + env(safe-area-inset-bottom))",
        }}
      >
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>{t(id == null ? "rem.add" : "rem.edit")}</h2>
          <button onClick={onClose} aria-label={t("uni.close")} className="w-11 h-11 -mr-2 flex items-center justify-center rounded-full" style={{ color: "var(--text-secondary)" }}>
            <Icon name="x" size={20} />
          </button>
        </div>
        {missing ? (
          <ErrorBox />
        ) : ready ? (
          <ReminderForm item={item} today={today} preset={preset} onSaved={onClose} onCancel={onClose} />
        ) : (
          <p className="text-sm py-6 text-center" style={{ color: "var(--text-tertiary)" }}>{t("status.connecting")}</p>
        )}
      </div>
    </div>,
    document.body,
  );
}
