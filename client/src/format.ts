/**
 * Date/time display helpers.
 * Thai shows the Buddhist year (พ.ศ.); English shows the Gregorian year.
 */
import type { Lang } from "./i18n.tsx";

/** Format a "YYYY-MM-DD" date. th -> "9 มี.ค. 2570", en -> "9 Mar 2027". */
export function formatDate(dateISO: string, lang: Lang): string {
  const d = new Date(`${dateISO}T00:00:00Z`);
  const locale = lang === "th" ? "th-TH-u-ca-buddhist" : "en-GB";
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(d);
}

const WEEKDAYS: Record<Lang, string[]> = {
  // index 1..7 = Mon..Sun (index 0 unused)
  th: ["", "จันทร์", "อังคาร", "พุธ", "พฤหัสบดี", "ศุกร์", "เสาร์", "อาทิตย์"],
  en: ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
};

export function weekdayName(weekday: number, lang: Lang): string {
  return WEEKDAYS[lang][weekday] ?? "";
}

/* ── Clock: 24-hour or AM/PM ──
   The student's choice (More → Time format), saved in this browser. Times are
   stored and sent as "HH:MM"; only what is SHOWN changes. Every time on screen
   goes through formatTime / timeRange / hourLabel. (The browser draws its own
   time picker, which follows the device's setting, not this one.) */
export type Clock = "24" | "12";
const CLOCK_KEY = "studyos.clock";
const CLOCK_CHANGED = "studyos:clock";

function readClock(): Clock {
  try { return localStorage.getItem(CLOCK_KEY) === "12" ? "12" : "24"; } catch { return "24"; }
}
let clock: Clock = readClock();

export function getClock(): Clock {
  return clock;
}
export function setClock(next: Clock): void {
  clock = next;
  try { localStorage.setItem(CLOCK_KEY, next); } catch { /* still applies until the page closes */ }
  window.dispatchEvent(new Event(CLOCK_CHANGED));
}
/** For React: subscribe to changes of the clock setting (useSyncExternalStore). */
export function subscribeClock(onChange: () => void): () => void {
  window.addEventListener(CLOCK_CHANGED, onChange);
  return () => window.removeEventListener(CLOCK_CHANGED, onChange);
}

/** Split "HH:MM" for the 12-hour clock: 00:15 -> 12:15 AM, 13:05 -> 1:05 PM. */
function twelve(hhmm: string): { text: string; period: "AM" | "PM" } {
  const [h, m] = hhmm.split(":").map(Number);
  return { text: `${h % 12 === 0 ? 12 : h % 12}:${String(m).padStart(2, "0")}`, period: h < 12 ? "AM" : "PM" };
}

/** One time. "13:30" -> "13:30" or "1:30 PM". Anything that is not HH:MM is returned as it is. */
export function formatTime(hhmm: string, as: Clock = clock): string {
  if (as === "24" || !/^\d{1,2}:\d{2}/.test(hhmm)) return hhmm;
  const t = twelve(hhmm);
  return `${t.text} ${t.period}`;
}

/** A range. "08:30–11:00", or "8:30–11:00 AM" / "11:00 AM–1:00 PM" on the 12-hour clock. */
export function timeRange(start: string, end: string, as: Clock = clock): string {
  if (as === "24" || !/^\d{1,2}:\d{2}/.test(start) || !/^\d{1,2}:\d{2}/.test(end)) return `${start}–${end}`;
  const a = twelve(start);
  const b = twelve(end);
  return a.period === b.period ? `${a.text}–${b.text} ${b.period}` : `${a.text} ${a.period}–${b.text} ${b.period}`;
}

/** The label of an hour row in the hour grid: "09:00" or "9 AM". */
export function hourLabel(hour: number, as: Clock = clock): string {
  if (as === "24") return `${String(hour).padStart(2, "0")}:00`;
  return `${hour % 12 === 0 ? 12 : hour % 12} ${hour % 24 < 12 ? "AM" : "PM"}`;
}
