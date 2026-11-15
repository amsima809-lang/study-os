/**
 * The term preview: will these courses fit her life? Opened from the course picker (live, before
 * saving) and from the trail's "This term" card. Two views:
 *
 * - Week: the courses' classes on a real week of the term, beside her own events and timed
 *   reminders (what she keeps in the app: work shifts, family, …), with every overlap said in
 *   words. Classes are not compulsory, so an overlap is information, never a block.
 * - Exams: the finals fortnight, a strip with periods A and B, two finals in one period marked;
 *   then e-Testing: the window and which of these courses can be taken early (optional).
 *
 * The sums are in termFit.ts. `FitSummary` is the one line shown under the list in both places.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useT } from "../i18n.tsx";
import { deleteJSON, getJSON, putJSON, type ApiError, type CalEvent } from "../api.ts";
import { formatDate, timeRange } from "../format.ts";
import { bangkokTime } from "../reminderAlerts.ts";
import { EXAM_PERIODS, addDays, examFit, finalsInBusyTime, teachingSpanOf, termBoundsOf, weekFit, weekOf, type Commitment, type FitCourse } from "../termFit.ts";
import { blocksByDay, busyBetween, chosenSource, prepareGoogle, reconnectGoogle, CHANGED as BUSY_CHANGED, type BusyResult } from "../busyTimes.ts";
import TimeGrid from "./TimeGrid.tsx";
import { DotMark } from "./Calendar.tsx";
import Icon from "./Icon.tsx";
import { ConfirmDialog, isTopDialog } from "./ui.tsx";
import { RU_LINKS } from "../ruLinks.ts";

/** A link to one of the university's own pages (ruLinks.ts): opens outside the app. */
export function RuLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="tap-area inline-flex items-center gap-1 text-sm font-semibold underline-offset-2 hover:underline" style={{ color: "var(--accent-text)" }}>
      {children} <span aria-hidden="true">↗</span>
    </a>
  );
}

export type ExamWindows = {
  term_start: string | null;
  finals: { from: string; to: string } | null;
  etesting: {
    registration_start: string; registration_end: string; registration_opens: string | null; registration_closes: string | null;
    exam_start: string; exam_end: string; central_closed: [string, string][];
  } | null;
};

const bangkokToday = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());

/** The week to show first: this week, or the first week of classes if they have not started. */
/** The teaching weeks, and the term's first and last calendar item (termFit.ts). */
export const teachingSpan = (windows: ExamWindows) => teachingSpanOf(windows);
export const termBounds = (windows: ExamWindows) => termBoundsOf(windows);
/** The week to show first: this week, kept inside the teaching weeks. */
function firstWeek(windows: ExamWindows): string {
  const today = bangkokToday(), span = teachingSpan(windows);
  if (span.from && today < span.from) return span.from;
  if (span.to && today > span.to) return span.to;
  return today;
}
/** Has this term's e-Testing registration closed? At its closing time on the last day (Bangkok). */
export function etRegistrationOver(et: ExamWindows["etesting"], now = new Date()): boolean {
  if (!et) return true;
  return now.getTime() >= new Date(`${et.registration_end}T${et.registration_closes ?? "23:59"}:00+07:00`).getTime();
}

/** Her own commitments for a week, from the server (events and timed reminders). */
function useCommitments(dates: string[]) {
  const [days, setDays] = useState<Record<string, Commitment[]> | null>(null);
  const from = dates[0], to = dates[dates.length - 1];
  useEffect(() => {
    let stop = false;
    setDays(null);
    getJSON<{ days: Record<string, Commitment[]> }>(`/api/commitments?from=${from}&to=${to}`)
      .then((r) => { if (!stop) setDays(r.days); })
      .catch(() => { if (!stop) setDays({}); });
    return () => { stop = true; };
  }, [from, to]);
  return days;
}

/**
 * Her busy times from her own calendar (busyTimes.ts) for these dates, as commitments the week
 * view understands ("Busy (your calendar)"), plus the raw answer (to offer a refresh, or say why not).
 */
function useBusy(dates: string[]) {
  const { t } = useT();
  const [result, setResult] = useState<BusyResult | undefined>(undefined);
  const [version, setVersion] = useState(0);
  const from = dates[0], to = dates[dates.length - 1];
  useEffect(() => { const on = () => setVersion((v) => v + 1); window.addEventListener(BUSY_CHANGED, on); return () => window.removeEventListener(BUSY_CHANGED, on); }, []);
  // Ready for a refresh tap (Google's window must open straight from the tap).
  useEffect(() => { if (chosenSource() === "google") void prepareGoogle(); }, []);
  useEffect(() => {
    if (!from || !to) { setResult(null); return; }
    let stop = false;
    busyBetween(from, to).then((r) => { if (!stop) setResult(r); });
    return () => { stop = true; };
  }, [from, to, version]);
  const byDay = useMemo(() => (result && "blocks" in result ? blocksByDay(result.blocks, dates) : {}), [result, dates]);
  const asCommitments = (date: string): Commitment[] => (byDay[date] ?? []).map((b, i) => ({ id: -1 - i, kind: "busy", title: t("busy.label"), time: b.time, end_time: b.end_time }));
  const [refreshFailed, setRefreshFailed] = useState(false);
  return {
    result, byDay, asCommitments, refreshFailed,
    refresh: () => { setRefreshFailed(false); reconnectGoogle().then(() => setVersion((v) => v + 1)).catch(() => setRefreshFailed(true)); },
  };
}

/** What the busy times say when they cannot be shown: a hint, a refresh, or that they could not be read. */
function BusyNote({ busy }: { busy: ReturnType<typeof useBusy> }) {
  const { t } = useT();
  const r = busy.result;
  if (r === undefined) return null;
  if (r === null) return <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>{t("busy.hint")}</p>;
  if ("needsTap" in r) return (
    <div>
      <button onClick={busy.refresh} className="tap-area text-sm font-semibold" style={{ color: "var(--accent-text)" }}>{t("busy.refresh")}</button>
      {busy.refreshFailed && <p role="alert" className="text-xs" style={{ color: "var(--danger)" }}>{t("busy.failed")}</p>}
    </div>
  );
  if ("error" in r) return <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>{t("busy.cantRead")}</p>;
  return null;
}

/** "9–22 มี.ค. 2570" / "9–22 Mar 2027" (same month), else "12 ม.ค.–7 มี.ค. 2570". */
function useSpan() {
  const { lang } = useT();
  return (from: string, to: string) => {
    const fmt = (iso: string, year: boolean) => new Intl.DateTimeFormat(lang === "th" ? "th-TH-u-ca-buddhist" : "en-GB", { day: "numeric", month: "short", ...(year ? { year: "numeric" } : {}), timeZone: "UTC" }).format(new Date(`${iso}T00:00:00Z`));
    if (from === to) return fmt(from, true);
    return from.slice(0, 7) === to.slice(0, 7) ? `${Number(from.slice(8))}–${fmt(to, true)}` : `${fmt(from, false)}–${fmt(to, true)}`;
  };
}

/**
 * One line under a list of courses: how the week and the finals look. A button opens the preview.
 */
export function FitSummary({ courses, windows, onPreview }: { courses: FitCourse[]; windows: ExamWindows; onPreview: () => void }) {
  const { t } = useT();
  const dates = useMemo(() => weekOf(firstWeek(windows)), [windows]);
  const commitments = useCommitments(dates);
  const busy = useBusy(dates);
  const week = useMemo(() => weekFit(courses, dates, (d) => [...(commitments?.[d] ?? []), ...busy.asCommitments(d)], teachingSpan(windows)), [courses, dates, commitments, windows, busy.byDay]); // eslint-disable-line react-hooks/exhaustive-deps
  const exams = useMemo(() => examFit(courses, windows.finals), [courses, windows]);
  if (courses.length === 0) return null;
  const etOver = etRegistrationOver(windows.etesting);
  const parts = [
    t("fit.classDays", { n: week.classDays, h: week.hours }),
    week.overlaps.length ? t("fit.overlaps", { n: week.overlaps.length }) : "",
    t("fit.examDays", { n: exams.examDays }),
    exams.clashes.length ? t("fit.clashes", { n: exams.clashes.length }) : "",
    exams.etesting.length && !etOver ? t("fit.etCount", { n: exams.etesting.length }) : "",
  ].filter(Boolean);
  const warn = week.overlaps.length > 0 || exams.clashes.length > 0;
  return (
    <button
      type="button"
      onClick={onPreview}
      className="w-full flex items-center gap-2 rounded-xl border px-3 min-h-11 py-1.5 text-left text-xs"
      style={{ borderColor: warn ? "var(--warning, var(--danger))" : "var(--border)", color: "var(--text-secondary)" }}
    >
      <Icon name="calendarRange" size={16} style={{ flexShrink: 0, color: warn ? "var(--warning, var(--danger))" : "var(--accent-text)" }} />
      <span className="flex-1 min-w-0">{parts.join(" · ")}</span>
      <span className="font-semibold whitespace-nowrap" style={{ color: "var(--accent-text)" }}>{t("fit.preview")} ›</span>
    </button>
  );
}

/** The finals fortnight as a strip: a column a day, a row for each period. */
/**
 * The finals fortnight as a strip. Red: two finals in one period (she can sit one), or a final in
 * her busy time from her own calendar (`busy`: "date|slot"), the clashes she has to solve.
 */
function ExamStrip({ fit, busy = new Set<string>() }: { fit: ReturnType<typeof examFit>; busy?: Set<string> }) {
  const { t, lang } = useT();
  const clash = new Set(fit.clashes.map((c) => `${c.date}|${c.slot}`));
  const dayLetter = (wd: number) => t(`fit.dow${wd}`);
  return (
    <div className="overflow-x-auto -mx-1 px-1">
      <table className="border-separate" style={{ borderSpacing: 2 }} aria-label={t("fit.stripLabel")}>
        <thead>
          <tr>
            <th />
            {fit.days.map((d) => (
              <th key={d.date} scope="col" className="text-xs font-normal leading-tight px-0.5" style={{ color: d.weekday >= 6 ? "var(--text-tertiary)" : "var(--text-secondary)", minWidth: 24 }}>
                {dayLetter(d.weekday)}<br />{Number(d.date.slice(8))}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(["A", "B"] as const).map((slot) => (
            <tr key={slot}>
              <th scope="row" className="text-xs font-semibold pr-1 text-left" style={{ color: "var(--text-tertiary)" }}>{slot}</th>
              {fit.days.map((d) => {
                const codes = d[slot];
                const twoAtOnce = clash.has(`${d.date}|${slot}`);
                const inBusy = codes.length > 0 && busy.has(`${d.date}|${slot}`);
                const bad = twoAtOnce || inBusy;
                const why = [twoAtOnce ? t("fit.clashWord") : "", inBusy ? t("fit.busyWord") : ""].filter(Boolean).join(", ");
                const label = codes.length ? `${formatDate(d.date, lang)} ${slot}: ${codes.join(", ")}${why ? ` (${why})` : ""}` : undefined;
                return (
                  <td
                    key={d.date}
                    title={label}
                    aria-label={label}
                    className="h-6 rounded text-center text-xs font-bold"
                    style={{
                      minWidth: 24,
                      backgroundColor: bad ? "var(--danger)" : codes.length ? "var(--accent)" : d.weekday >= 6 ? "var(--bg-surface-hover)" : "var(--bg-base)",
                      color: "#fff",
                      border: codes.length ? "none" : "1px solid var(--border-light)",
                    }}
                  >
                    {bad ? "!" : codes.length ? "" : ""}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type Booking = { course_code: string; centre: "central" | "regional"; date: string; period: 1 | 2 | 3 | 4 };
type BookingData = { bookings: Booking[]; days: { central: string[]; regional: string[] }; periods: Record<string, [string, string]> };
const weekend = (iso: string) => { const d = new Date(`${iso}T00:00:00Z`).getUTCDay(); return d === 0 || d === 6; };

/**
 * Her e-Testing bookings for this term's courses that are on the list. She books in the
 * university's own system (centre, day, period; no changes once confirmed) and records it here, so
 * it shows on her calendar, marked apart from the days she has not booked. The form offers only
 * the days the chosen centre tests and the periods that day has (server/src/etestingBookings.ts
 * checks the same).
 */
function EtestingBookings({ courses, canBook }: { courses: FitCourse[]; canBook: boolean }) {
  const { t, lang } = useT();
  const [data, setData] = useState<BookingData | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  // A new booking starts with nothing chosen: a careless Save must not record a day she never booked.
  const [form, setForm] = useState<{ centre: "central" | "regional"; date: string; period: number }>({ centre: "central", date: "", period: 0 });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  useEffect(() => { if (canBook) getJSON<BookingData>("/api/etesting/bookings").then(setData).catch(() => setData(null)); }, [canBook]);
  const eligible = courses.filter((c) => c.etesting);
  if (eligible.length === 0) return null;
  // Not registered yet (the picker, or the trail before any tick): one line on where to record later.
  if (!canBook) return <p className="text-xs">{t("et.notYet")}</p>;
  if (!data) return null;
  const nameOf = (c: FitCourse) => (lang === "en" && c.name_en ? c.name_en : c.name_th);
  // "Sat 16 Jan 2027": the weekday matters, since period 4 is weekends only.
  const dayLabel = (iso: string) => `${t(`fit.dow${new Date(`${iso}T00:00:00Z`).getUTCDay() || 7}`)} ${formatDate(iso, lang)}`;
  const days = data.days[form.centre];
  const periods = form.date ? (weekend(form.date) ? [1, 2, 3, 4] : [1, 2, 3]) : [];
  // Bookings for a course she is no longer registered in: listed so she can remove them.
  const orphans = data.bookings.filter((b) => !eligible.some((c) => c.code === b.course_code));
  const start = (code: string) => {
    const b = data.bookings.find((x) => x.course_code === code);
    setForm(b ? { centre: b.centre, date: b.date, period: b.period } : { centre: "central", date: "", period: 0 });
    setError("");
    setEditing(code);
  };
  async function save(code: string) {
    setBusy(true); setError("");
    try {
      const r = await putJSON<{ bookings: Booking[] }>(`/api/etesting/bookings/${code}`, form);
      setData({ ...data!, bookings: r.bookings });
      setEditing(null);
      window.dispatchEvent(new Event("studyos:reminders-changed")); // the calendar reloads
    } catch (e) {
      const why = (e as ApiError)?.code;
      setError(why && t(`et.err.${why}`) !== `et.err.${why}` ? t(`et.err.${why}`) : t("status.error"));
    } finally { setBusy(false); }
  }
  async function remove(code: string) {
    setBusy(true); setError("");
    try {
      const r = await deleteJSON<{ bookings: Booking[] }>(`/api/etesting/bookings/${code}`);
      setData({ ...data!, bookings: r.bookings });
      window.dispatchEvent(new Event("studyos:reminders-changed"));
    } catch { setError(t("status.error")); } finally { setBusy(false); setRemoving(null); }
  }
  const field = { backgroundColor: "var(--bg-base)", borderColor: "var(--border)", color: "var(--text-primary)" };
  const bookedLine = (b: Booking) => {
    const [from, to] = data.periods[String(b.period)];
    return t("et.booked", { date: dayLabel(b.date), p: b.period, time: timeRange(from, to), centre: t(b.centre === "central" ? "et.central" : "et.regional") });
  };
  return (
    <div className="space-y-2 pt-1">
      <p className="text-xs">{t("et.recordHint")}</p>
      {error && !editing && <p role="alert" className="text-xs" style={{ color: "var(--danger)" }}>{error}</p>}
      <ul className="space-y-2">
        {eligible.map((c) => {
          const b = data.bookings.find((x) => x.course_code === c.code);
          return (
            <li key={c.code} className="rounded-lg px-2.5 py-2" style={{ backgroundColor: b ? "rgba(217,119,6,0.12)" : "var(--bg-base)" }}>
              <p style={{ color: "var(--text-primary)" }}><strong>{c.code}</strong> {nameOf(c)}{c.etesting_essay ? ` · ${t("et.essay")}` : ""}</p>
              {b ? <p className="text-xs mt-0.5 font-semibold" style={{ color: "var(--amber-text)" }}>{bookedLine(b)}</p> : <p className="text-xs mt-0.5">{t("et.notBooked")}</p>}
              {b && c.exam_date && <p className="text-xs">{t("et.backup", { date: formatDate(c.exam_date, lang) })}</p>}
              {editing !== c.code && (
                <div className="flex gap-3 mt-1">
                  <button onClick={() => start(c.code)} disabled={busy} className="tap-area text-xs font-semibold" style={{ color: "var(--accent-text)" }}>{t(b ? "et.edit" : "et.iBooked")}</button>
                  {b && <button onClick={() => setRemoving(c.code)} disabled={busy} className="tap-area text-xs" style={{ color: "var(--text-tertiary)" }}>{t("et.remove")}</button>}
                </div>
              )}
              {editing === c.code && (
                <div className="mt-2 grid gap-2 sm:grid-cols-3">
                  <label className="text-xs block">{t("et.centre")}
                    <select className="mt-0.5 w-full rounded-lg border px-2 min-h-11" style={field} value={form.centre}
                      onChange={(e) => setForm({ centre: e.target.value as "central" | "regional", date: "", period: 0 })}>
                      <option value="central">{t("et.central")}</option>
                      <option value="regional">{t("et.regional")}</option>
                    </select>
                  </label>
                  <label className="text-xs block">{t("et.day")}
                    <select className="mt-0.5 w-full rounded-lg border px-2 min-h-11" style={field} value={form.date}
                      onChange={(e) => setForm((f) => ({ ...f, date: e.target.value, period: f.period === 4 && !weekend(e.target.value) ? 0 : f.period }))}>
                      <option value="">{t("et.chooseDay")}</option>
                      {days.map((d) => <option key={d} value={d}>{dayLabel(d)}</option>)}
                    </select>
                  </label>
                  <label className="text-xs block">{t("et.period")}
                    <select className="mt-0.5 w-full rounded-lg border px-2 min-h-11" style={field} value={form.period} disabled={!form.date}
                      onChange={(e) => setForm((f) => ({ ...f, period: Number(e.target.value) }))}>
                      <option value={0}>{t("et.choosePeriod")}</option>
                      {periods.map((p) => <option key={p} value={p}>{p} · {timeRange(data.periods[String(p)][0], data.periods[String(p)][1])}</option>)}
                    </select>
                  </label>
                  {error && <p role="alert" className="text-xs sm:col-span-3" style={{ color: "var(--danger)" }}>{error}</p>}
                  <div className="flex gap-2 sm:col-span-3">
                    <button onClick={() => save(c.code)} disabled={busy || !form.date || !form.period} className="rounded-lg px-4 min-h-11 text-sm font-semibold disabled:opacity-40" style={{ backgroundColor: "var(--accent)", color: "#fff" }}>{t("et.save")}</button>
                    <button onClick={() => setEditing(null)} className="rounded-lg px-3 min-h-11 text-sm" style={{ color: "var(--text-secondary)" }}>{t("et.cancel")}</button>
                  </div>
                </div>
              )}
            </li>
          );
        })}
        {orphans.map((b) => (
          <li key={b.course_code} className="rounded-lg px-2.5 py-2" style={{ backgroundColor: "var(--bg-base)" }}>
            <p style={{ color: "var(--text-primary)" }}><strong>{b.course_code}</strong> · {t("et.noLongerRegistered")}</p>
            <p className="text-xs mt-0.5">{bookedLine(b)}</p>
            <button onClick={() => setRemoving(b.course_code)} disabled={busy} className="tap-area text-xs font-semibold mt-1" style={{ color: "var(--accent-text)" }}>{t("et.remove")}</button>
          </li>
        ))}
      </ul>
      {removing && createPortal(
        <ConfirmDialog
          title={t("et.removeTitle", { code: removing })}
          message={t("et.removeBody")}
          confirmLabel={t("et.remove")}
          cancelLabel={t("et.cancel")}
          busy={busy}
          onConfirm={() => remove(removing)}
          onCancel={() => setRemoving(null)}
        />,
        document.body,
      )}
    </div>
  );
}

/**
 * The term a month at a time: on each day, a mark for classes (inside the teaching weeks), her
 * finals (red when two fall in one period or one falls in her busy time), the e-Testing days, and
 * her busy time (her own events and her calendar's). Overlaps of a class with something of hers
 * ring the day. A tap opens that day in the week view.
 */
function MonthView({ courses, windows, month, onMonth, onPickDay }: {
  courses: FitCourse[]; windows: ExamWindows; month: string; onMonth: (m: string) => void; onPickDay: (date: string) => void;
}) {
  const { t, lang } = useT();
  const first = `${month}-01`;
  const [y, m] = month.split("-").map(Number);
  const daysIn = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const dates = useMemo(() => Array.from({ length: daysIn }, (_, i) => `${month}-${String(i + 1).padStart(2, "0")}`), [month, daysIn]);
  const commitments = useCommitments(dates);
  const busy = useBusy(dates);
  const span = teachingSpan(windows);
  const week = useMemo(() => weekFit(courses, dates, (d) => [...(commitments?.[d] ?? []), ...busy.asCommitments(d)], span), [courses, dates, commitments, busy.byDay]); // eslint-disable-line react-hooks/exhaustive-deps
  const exams = useMemo(() => examFit(courses, windows.finals), [courses, windows]);
  const problems = useMemo(() => {
    const out = new Set(exams.clashes.map((c) => c.date));
    for (const c of finalsInBusyTime(exams, (d) => busy.byDay[d] ?? [])) out.add(c.date);
    return out;
  }, [exams, busy.byDay]);
  const et = windows.etesting;
  const etClosed = (iso: string) => !!et && et.central_closed.some(([a, b]) => iso >= a && iso <= b);
  const overlapDays = new Set(week.overlaps.map((o) => o.date));
  // The months the term runs across: from its first calendar item to its last (termBounds).
  const bounds = termBounds(windows);
  const lastMonth = (bounds.to ?? first).slice(0, 7), firstMonth = (bounds.from ?? first).slice(0, 7);
  const shift = (n: number) => { const d = new Date(Date.UTC(y, m - 1 + n, 1)); return d.toISOString().slice(0, 7); };
  const lead = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7; // Monday first
  const title = new Intl.DateTimeFormat(lang === "th" ? "th-TH-u-ca-buddhist" : "en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${first}T00:00:00Z`));
  const kinds = new Set<string>();
  const cells = dates.map((date) => {
    const day = week.days.find((d) => d.date === date)!;
    const fin = exams.days.find((d) => d.date === date);
    const marks: { type: Parameters<typeof DotMark>[0]["type"]; color: string; key: string }[] = [];
    if (day.classes.length || day.choices.length) marks.push({ type: "class", color: "var(--accent-2, var(--accent-text))", key: "class" });
    if (fin && fin.A.length + fin.B.length > 0) marks.push(problems.has(date) ? { type: "exam", color: "var(--danger)", key: "problem" } : { type: "exam", color: "var(--accent)", key: "final" });
    if (et && date >= et.registration_start && date <= et.registration_end) marks.push({ type: "etesting", color: "#d97706", key: "etreg" });
    else if (et && date >= et.exam_start && date <= et.exam_end && !etClosed(date)) marks.push({ type: "etwindow", color: "#d97706", key: "etdays" });
    if (day.commitments.length) marks.push({ type: "event", color: "var(--text-tertiary)", key: "busy" });
    for (const k of marks) kinds.add(k.key);
    return { date, marks, ring: overlapDays.has(date) };
  });
  const LEGEND: Record<string, { type: Parameters<typeof DotMark>[0]["type"]; color: string; label: string }> = {
    class: { type: "class", color: "var(--accent-2, var(--accent-text))", label: t("fit.mClass") },
    final: { type: "exam", color: "var(--accent)", label: t("fit.legendFinal") },
    problem: { type: "exam", color: "var(--danger)", label: t("fit.legendProblem") },
    etreg: { type: "etesting", color: "#d97706", label: t("cal.kind.etesting") },
    etdays: { type: "etwindow", color: "#d97706", label: t("cal.kind.etwindow") },
    busy: { type: "event", color: "var(--text-tertiary)", label: t("fit.mBusy") },
  };
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <button onClick={() => onMonth(shift(-1))} disabled={month <= firstMonth} aria-label={t("fit.prevMonth")} className="w-11 h-11 rounded-full flex items-center justify-center disabled:opacity-30" style={{ color: "var(--text-secondary)" }}>‹</button>
        <p className="flex-1 text-center text-sm font-medium" style={{ color: "var(--text-primary)" }}>{title}</p>
        <button onClick={() => onMonth(shift(1))} disabled={month >= lastMonth} aria-label={t("fit.nextMonth")} className="w-11 h-11 rounded-full flex items-center justify-center disabled:opacity-30" style={{ color: "var(--text-secondary)" }}>›</button>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center text-xs" style={{ color: "var(--text-tertiary)" }}>
        {[1, 2, 3, 4, 5, 6, 7].map((d) => <div key={d}>{t(`fit.dow${d}`)}</div>)}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {Array.from({ length: lead }, (_, i) => <div key={`x${i}`} />)}
        {cells.map((c) => (
          <button
            key={c.date}
            onClick={() => onPickDay(c.date)}
            aria-label={[formatDate(c.date, lang), ...c.marks.map((k) => LEGEND[k.key].label), c.ring ? t("fit.mOverlap") : ""].filter(Boolean).join(", ")}
            className="rounded-lg min-h-11 py-1 flex flex-col items-center gap-1"
            style={{ backgroundColor: "var(--bg-base)", outline: c.ring ? "2px solid var(--warning, var(--danger))" : "none", outlineOffset: -2 }}
          >
            <span className="text-xs" style={{ color: "var(--text-primary)" }}>{Number(c.date.slice(8))}</span>
            <span className="flex gap-0.5 items-center min-h-2">{c.marks.map((k) => <DotMark key={k.key} type={k.type} color={k.color} />)}</span>
          </button>
        ))}
      </div>
      <p className="text-xs flex flex-wrap gap-x-3 gap-y-1" style={{ color: "var(--text-tertiary)" }}>
        {Object.entries(LEGEND).filter(([k]) => kinds.has(k)).map(([k, v]) => (
          <span key={k} className="inline-flex items-center gap-1"><DotMark type={v.type} color={v.color} />{v.label}</span>
        ))}
        {overlapDays.size > 0 && <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ outline: "2px solid var(--warning, var(--danger))", outlineOffset: -2 }} />{t("fit.mOverlap")}</span>}
      </p>
      <BusyNote busy={busy} />
    </div>
  );
}

export default function TermPreview({ courses, windows, onClose, canBook = false }: { courses: FitCourse[]; windows: ExamWindows; onClose: () => void; /** The courses are registered: e-Testing bookings can be recorded. */ canBook?: boolean }) {
  const { t, lang } = useT();
  const span = useSpan();
  const [tab, setTab] = useState<"week" | "month" | "exams">("week");
  const [anchor, setAnchor] = useState(() => firstWeek(windows));
  const [day, setDay] = useState<string | null>(null);
  const bounds = termBounds(windows);
  // The month shown in the Month tab: the one of the week shown first.
  const [month, setMonth] = useState(() => firstWeek(windows).slice(0, 7));
  const sheet = useRef<HTMLDivElement>(null);
  const dates = useMemo(() => weekOf(anchor), [anchor]);
  const commitments = useCommitments(dates);
  const busy = useBusy(dates);
  const week = useMemo(() => weekFit(courses, dates, (d) => [...(commitments?.[d] ?? []), ...busy.asCommitments(d)], teachingSpan(windows)), [courses, dates, commitments, windows, busy.byDay]); // eslint-disable-line react-hooks/exhaustive-deps
  const exams = useMemo(() => examFit(courses, windows.finals), [courses, windows]);
  // Her busy times across the finals fortnight: a final there cannot move.
  const finalsDates = useMemo(() => exams.days.map((d) => d.date), [exams]);
  const finalsBusy = useBusy(finalsDates); // nothing to fetch when there are no dated finals
  const finalClashes = useMemo(() => (finalsDates.length ? finalsInBusyTime(exams, (d) => finalsBusy.byDay[d] ?? []) : []), [exams, finalsDates, finalsBusy.byDay]);
  const nameOf = (code: string) => { const c = courses.find((x) => x.code === code); return c ? (lang === "en" && c.name_en ? c.name_en : c.name_th) : code; };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape" && isTopDialog(sheet.current)) onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // The grid's events: her classes (as classes) and her own commitments (as her events).
  const eventsOn = (date: string): CalEvent[] => {
    const d = week.days.find((x) => x.date === date);
    if (!d) return [];
    return [
      ...d.classes.map((m): CalEvent => {
        const c = courses.find((x) => x.code === m.code)!;
        return { type: "class", course_code: m.code, name_th: c.name_th, name_en: c.name_en, start_time: m.start, end_time: m.end };
      }),
      // A course taught in sections: each section drawn, named, so she can see which suits her.
      ...d.choices.map((m): CalEvent => {
        const c = courses.find((x) => x.code === m.code)!;
        return { type: "class", course_code: m.code, name_th: `${c.name_th} · ${m.kind}`, name_en: c.name_en ? `${c.name_en} · ${m.kind}` : null, start_time: m.start, end_time: m.end };
      }),
      ...d.commitments.map((c): CalEvent => ({ type: c.kind === "event" || c.kind === "busy" ? "event" : "reminder", course_code: "", name_th: c.title, name_en: null, start_time: c.time ?? undefined, end_time: c.end_time ?? undefined })),
    ];
  };
  const et = windows.etesting;
  const registrationOver = etRegistrationOver(et);

  return createPortal(
    // (stopPropagation: the preview may sit inside the course picker, whose own backdrop would close it too)
    <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center" style={{ background: "rgba(0,0,0,0.5)" }} onClick={(e) => { e.stopPropagation(); onClose(); }}>
      <div
        ref={sheet}
        role="dialog"
        aria-modal="true"
        aria-label={t("fit.title")}
        onClick={(e) => e.stopPropagation()}
        className="w-full md:max-w-3xl flex flex-col rounded-t-3xl md:rounded-3xl border animate-slide-up"
        style={{ height: "min(94dvh, 860px)", backgroundColor: "var(--bg-surface)", borderColor: "var(--border-light)" }}
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5">
          <div>
            <h2 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>{t("fit.title")}</h2>
            <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>{t("fit.subtitle", { n: courses.length })}</p>
          </div>
          <button onClick={onClose} aria-label={t("uni.close")} className="w-11 h-11 -mr-2 -mt-2 shrink-0 flex items-center justify-center rounded-full" style={{ color: "var(--text-secondary)" }}>
            <Icon name="x" size={20} />
          </button>
        </div>

        <div className="px-5 pt-3 flex gap-1.5" role="tablist">
          {(["week", "month", "exams"] as const).map((id) => (
            <button
              key={id}
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className="rounded-full px-4 min-h-11 text-sm font-semibold"
              style={{ backgroundColor: tab === id ? "var(--accent)" : "var(--bg-base)", color: tab === id ? "#fff" : "var(--text-secondary)" }}
            >
              {t(id === "week" ? "fit.tabWeek" : id === "month" ? "fit.tabMonth" : "fit.tabExams")}
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-3 space-y-3">
          {tab === "month" ? (
            <MonthView
              courses={courses}
              windows={windows}
              month={month}
              onMonth={setMonth}
              onPickDay={(d) => { setAnchor(d); setDay(d); setTab("week"); }}
            />
          ) : tab === "week" ? (
            <>
              <div className="flex items-center gap-2">
                <button onClick={() => { setDay(null); setAnchor(addDays(dates[0], -7)); }} disabled={!!bounds.from && dates[0] <= bounds.from} aria-label={t("fit.prevWeek")} className="w-11 h-11 rounded-full flex items-center justify-center disabled:opacity-30" style={{ color: "var(--text-secondary)" }}>‹</button>
                <p className="flex-1 text-center text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                  {day ? formatDate(day, lang) : span(dates[0], dates[6])}
                </p>
                <button onClick={() => { setDay(null); setAnchor(addDays(dates[0], 7)); }} disabled={!!bounds.to && dates[6] >= bounds.to} aria-label={t("fit.nextWeek")} className="w-11 h-11 rounded-full flex items-center justify-center disabled:opacity-30" style={{ color: "var(--text-secondary)" }}>›</button>
              </div>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                {t("fit.classDays", { n: week.classDays, h: week.hours })}
                {commitments && ` · ${t("fit.yourItems", { n: week.days.reduce((n, d) => n + d.commitments.length, 0) })}`}
              </p>
              {/* Every overlap in words: on a phone the week grid shows one item per column. */}
              {week.overlaps.length > 0 ? (
                <ul className="rounded-xl px-3 py-2 text-sm space-y-1" style={{ backgroundColor: "var(--warning-bg, var(--danger-bg))", color: "var(--warning, var(--danger))" }}>
                  {week.overlaps.map((o, i) => (
                    <li key={i}>
                      {t(`fit.dow${new Date(`${o.date}T00:00:00Z`).getUTCDay() || 7}`)} {Number(o.date.slice(8))} · {timeRange(o.from, o.to)} · {o.kind === "classes" ? t("fit.overlapClasses", { a: o.a, b: o.b }) : t("fit.overlapYours", { a: o.a, b: o.b })}
                    </li>
                  ))}
                  <li className="text-xs pt-1" style={{ color: "var(--text-secondary)" }}>{t("fit.overlapHint")}</li>
                </ul>
              ) : (
                courses.length > 0 && commitments && <p className="text-sm" style={{ color: "var(--success)" }}>{t("fit.noOverlaps")}</p>
              )}
              <BusyNote busy={busy} />
              {week.sectioned.map((s) => (
                <p key={s.code} className="text-sm" style={{ color: "var(--text-secondary)" }}>{t("fit.sectioned", { code: s.code, sections: s.sections.join(" / ") })}</p>
              ))}
              <TimeGrid
                dates={day ? [day] : dates}
                eventsOn={eventsOn}
                today={bangkokToday()}
                now={bangkokTime()}
                onPickDay={(d) => setDay(d)}
              />
              {day && (
                <button onClick={() => setDay(null)} className="tap-area text-sm" style={{ color: "var(--accent-text)" }}>‹ {t("fit.backToWeek")}</button>
              )}
              <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>{t("fit.addYours")}</p>
            </>
          ) : (
            <>
              {windows.finals && (
                <h3 className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>{t("fit.finals", { range: span(windows.finals.from, windows.finals.to) })}</h3>
              )}
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
                {t("fit.examDays", { n: exams.examDays })} · {t("fit.weekdays", { n: exams.weekdayExamDays })}
                {exams.twoInADay.length > 0 && ` · ${t("fit.twoInADay", { n: exams.twoInADay.length })}`}
              </p>
              <ExamStrip fit={exams} busy={new Set(finalClashes.map((c) => `${c.date}|${c.slot}`))} />
              <p className="text-xs flex flex-wrap items-center gap-x-3 gap-y-1" style={{ color: "var(--text-tertiary)" }}>
                <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: "var(--accent)" }} />{t("fit.legendFinal")}</span>
                <span className="inline-flex items-center gap-1"><span className="inline-block w-3 h-3 rounded-sm" style={{ backgroundColor: "var(--danger)" }} />{t("fit.legendProblem")}</span>
              </p>
              <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                A {timeRange(EXAM_PERIODS.A[0], EXAM_PERIODS.A[1])} · B {timeRange(EXAM_PERIODS.B[0], EXAM_PERIODS.B[1])}
              </p>
              {/* Rooms and seats are given in her own timetable at the university, about a week before. */}
              <RuLink href={RU_LINKS.EXAM_TIMETABLE}>{t("link.examTimetable")}</RuLink>
              {exams.clashes.length > 0 && (
                <div className="rounded-xl px-3 py-2 text-sm space-y-1" style={{ backgroundColor: "var(--danger-bg)", color: "var(--danger)" }}>
                  {exams.clashes.map((c) => (
                    <p key={`${c.date}${c.slot}`}>{t("fit.clashLine", { codes: c.codes.join(" + "), date: formatDate(c.date, lang), slot: c.slot })}</p>
                  ))}
                  <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{t("fit.clashHint")}</p>
                </div>
              )}
              {finalClashes.length > 0 && (
                <div className="rounded-xl px-3 py-2 text-sm space-y-1" style={{ backgroundColor: "var(--danger-bg)", color: "var(--danger)" }}>
                  <p className="font-semibold">{t("busy.finalTitle")}</p>
                  {finalClashes.map((c) => (
                    <p key={`${c.code}${c.date}`}>{t("busy.finalLine", { code: c.code, date: formatDate(c.date, lang), slot: c.slot, time: timeRange(c.from, c.to), busy: c.busy.time === "00:00" && c.busy.end_time === "23:59" ? t("busy.allDay") : timeRange(c.busy.time, c.busy.end_time) })}</p>
                  ))}
                  <p className="text-xs" style={{ color: "var(--text-secondary)" }}>{t("busy.finalHint")}</p>
                </div>
              )}
              {finalsDates.length > 0 && <BusyNote busy={finalsBusy} />}
              <ul className="text-sm space-y-1">
                {exams.days.filter((d) => d.A.length + d.B.length > 0).flatMap((d) =>
                  (["A", "B"] as const).flatMap((s) => d[s].map((code) => (
                    <li key={`${d.date}${s}${code}`} className="flex gap-2">
                      <span className="whitespace-nowrap" style={{ color: "var(--text-tertiary)" }}>{formatDate(d.date, lang)} · {s}</span>
                      <span style={{ color: "var(--text-primary)" }}><strong>{code}</strong> {nameOf(code)}</span>
                    </li>
                  ))),
                )}
              </ul>
              {exams.facultySet.length > 0 && <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{t("fit.facultySet", { codes: exams.facultySet.join(", ") })}</p>}
              {exams.noFinal.length > 0 && <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{t("fit.noFinal", { codes: exams.noFinal.join(", ") })}</p>}

              {/* e-Testing: optional, shown quietly after the finals. */}
              {et && (
                <div className="rounded-xl border px-3 py-2.5 text-sm space-y-1.5" style={{ borderColor: "rgba(245,158,11,0.45)", color: "var(--text-secondary)" }}>
                  <p className="font-semibold" style={{ color: "var(--amber-text)" }}>{t("fit.etTitle")}</p>
                  <p>
                    {t("fit.etWindow", {
                      reg: span(et.registration_start, et.registration_end),
                      exams: span(et.exam_start, et.exam_end),
                    })}
                    {et.central_closed.length > 0 && ` ${t("fit.etClosed", { days: et.central_closed.map(([a, b]) => span(a, b)).join(", ") })}`}
                  </p>
                  {exams.etesting.length === 0 && <p>{t("fit.etNone")}</p>}
                  <p className="text-xs">{t("fit.etRule")}</p>
                  {registrationOver && <p className="text-xs">{t("fit.etOver")}</p>}
                  <div className="flex flex-wrap gap-x-4">
                    {!registrationOver && <RuLink href={RU_LINKS.E_SERVICE}>{t("link.etBook")}</RuLink>}
                    <RuLink href={RU_LINKS.ETESTING_OFFICE}>{t("link.etInfo")}</RuLink>
                  </div>
                  <EtestingBookings courses={courses} canBook={canBook} />
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
