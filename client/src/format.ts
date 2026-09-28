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

/** "08:30–11:00" from start/end "HH:MM". */
export function timeRange(start: string, end: string): string {
  return `${start}–${end}`;
}
