/**
 * Will this term's courses fit her life? The sums behind the term preview (components/
 * TermPreview.tsx), the course picker's summary line and the trail's "This term" card.
 *
 * - The week: the chosen courses' classes, as the registrar prints them (weekday and time), put
 *   on a real week beside her own commitments (events and timed reminders she keeps in the app),
 *   and every overlap between them. Classes at Ramkhamhaeng are not compulsory and many lectures
 *   are recorded, so an overlap is information, never a block.
 * - The finals: each course's final (date and period A or B, or "the faculty arranges it"), the
 *   days she sits one, two finals in the same period (she cannot sit both), two on one day,
 *   and which courses she could also take early by e-Testing.
 *
 * Pure functions; tested from server/test/termFit.test.ts.
 */
import { minutes } from "./calendarLayout.ts";

/** Exam periods at the central campus (2569 admission guide, key to abbreviations, p. 32). */
export const EXAM_PERIODS = { A: ["09:30", "12:00"], B: ["14:00", "16:30"] } as const;

export type FitCourse = {
  code: string;
  name_th: string;
  name_en: string | null;
  /** "1 08:30-11:00|LEC.;3 13:00-15:00|SEC. 1" (weekday 1 = Monday … 7 = Sunday; after "|" the kind
   *  the registrar prints, often empty), as the term-courses route sends it. */
  classes: string | null;
  exam_date: string | null;
  exam_slot: "A" | "B" | null;
  exam_note: string | null;
  etesting: boolean;
  etesting_essay?: boolean;
};
export type Commitment = { id: number; kind: string; title: string; time: string | null; end_time: string | null };

export type ClassMeeting = { code: string; weekday: number; start: string; end: string; kind: string };
/** The class meetings of a course: "1 08:30-11:00;3 13:00-15:00|LAB." -> two meetings. Unreadable parts are skipped. */
export function meetings(c: Pick<FitCourse, "code" | "classes">): ClassMeeting[] {
  if (!c.classes) return [];
  return c.classes.split(";").flatMap((part) => {
    const m = /^([1-7]) (\d{2}:\d{2})-(\d{2}:\d{2})(?:\|(.*))?$/.exec(part.trim());
    return m ? [{ code: c.code, weekday: Number(m[1]), start: m[2], end: m[3], kind: (m[4] ?? "").trim() }] : [];
  });
}
/**
 * The registrar prints some courses in several sections ("SEC. 1", "SEC. 2"): a student attends
 * one. Their meetings are alternatives, not all hers.
 */
export const sectionsOf = (ms: ClassMeeting[]) => [...new Set(ms.filter((m) => /^SEC\b/i.test(m.kind)).map((m) => m.kind))];

/** Monday first: 1 = Monday … 7 = Sunday, from an ISO date. */
export const weekdayOf = (iso: string) => ((new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7) + 1;
const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
/** The seven dates, Monday to Sunday, of the week holding `iso`. */
export const weekOf = (iso: string) => { const monday = addDays(iso, 1 - weekdayOf(iso)); return Array.from({ length: 7 }, (_, i) => addDays(monday, i)); };
export { addDays };

export type Overlap = {
  date: string;
  from: string;
  to: string;
  /** Two of her classes, or one class and one of her commitments. */
  kind: "classes" | "commitment";
  a: string; // course code
  b: string; // course code, or the commitment's title
};

export type WeekFit = {
  /** Per date: her classes that day and her commitments, start-sorted. */
  days: { date: string; classes: ClassMeeting[]; commitments: Commitment[]; /** Meetings of sectioned courses (alternatives). */ choices: ClassMeeting[] }[];
  overlaps: Overlap[];
  /** Courses taught in several sections: shown, but left out of the hours and overlaps until she picks one. */
  sectioned: { code: string; sections: string[] }[];
  /** Days with at least one class (of the seven). */
  classDays: number;
  /** Hours of class in the week. */
  hours: number;
};

const overlapOf = (a: [number, number], b: [number, number]) => { const s = Math.max(a[0], b[0]), e = Math.min(a[1], b[1]); return e > s ? [s, e] as const : null; };
const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

/**
 * The week's classes beside her commitments. A commitment with no end time (a reminder) is a
 * moment, not busy time, and never counts as an overlap. Classes are put only on days inside
 * `teachingSpan` (first day of classes to the last before the finals), when given. A course taught in
 * several sections is drawn with each section but counts toward nothing until she chooses.
 */
export function weekFit(courses: FitCourse[], dates: string[], commitmentsOn: (date: string) => Commitment[], teachingSpan?: { from: string | null; to: string | null }): WeekFit {
  const all = courses.flatMap(meetings);
  const sectioned = courses.map((c) => ({ code: c.code, sections: sectionsOf(meetings(c)) })).filter((s) => s.sections.length > 1);
  const isChoice = new Set(sectioned.map((s) => s.code));
  const teaching = (date: string) => (!teachingSpan?.from || date >= teachingSpan.from) && (!teachingSpan?.to || date <= teachingSpan.to);
  const overlaps: Overlap[] = [];
  const days = dates.map((date) => {
    const shown = teaching(date) ? all.filter((m) => m.weekday === weekdayOf(date)).sort((x, y) => x.start.localeCompare(y.start) || x.code.localeCompare(y.code)) : [];
    const classes = shown.filter((m) => !isChoice.has(m.code));
    const commitments = commitmentsOn(date).filter((c) => c.time).slice().sort((x, y) => (x.time ?? "").localeCompare(y.time ?? ""));
    for (let i = 0; i < classes.length; i++) {
      const a = classes[i], ra: [number, number] = [minutes(a.start), minutes(a.end)];
      for (let j = i + 1; j < classes.length; j++) {
        const b = classes[j];
        if (b.code === a.code) continue; // two meetings of one course (e.g. lecture and lab) are hers to sort
        const o = overlapOf(ra, [minutes(b.start), minutes(b.end)]);
        if (o) overlaps.push({ date, from: hhmm(o[0]), to: hhmm(o[1]), kind: "classes", a: a.code, b: b.code });
      }
      for (const c of commitments) {
        if (!c.time || !c.end_time) continue;
        const o = overlapOf(ra, [minutes(c.time), minutes(c.end_time)]);
        if (o) overlaps.push({ date, from: hhmm(o[0]), to: hhmm(o[1]), kind: "commitment", a: a.code, b: c.title });
      }
    }
    return { date, classes, commitments, choices: shown.filter((m) => isChoice.has(m.code)) };
  });
  const minutesOfClass = days.reduce((n, d) => n + d.classes.reduce((k, m) => k + (minutes(m.end) - minutes(m.start)), 0), 0);
  return {
    days: days.map(({ date, classes, commitments, choices }) => ({ date, classes, commitments, choices })),
    overlaps, sectioned,
    classDays: days.filter((d) => d.classes.length > 0).length,
    hours: Math.round((minutesOfClass / 60) * 10) / 10,
  };
}

export type ExamFit = {
  /** Every day of the finals, with the courses in each period. */
  days: { date: string; weekday: number; A: string[]; B: string[] }[];
  /** Two or more finals in one period: she cannot sit them all. */
  clashes: { date: string; slot: "A" | "B"; codes: string[] }[];
  /** Days with a final; of them, Monday to Friday; days with both periods taken. */
  examDays: number;
  weekdayExamDays: number;
  twoInADay: string[];
  /** No date: the faculty arranges it (with the registrar's note), or no final at all. */
  facultySet: string[];
  noFinal: string[];
  /** Courses on this term's e-Testing list. */
  etesting: string[];
};

/** The finals of the chosen courses across the fortnight `finals` (the term's first to last exam day). */
export function examFit(courses: FitCourse[], finals: { from: string; to: string } | null): ExamFit {
  const dated = courses.filter((c) => c.exam_date && c.exam_slot);
  const from = finals?.from ?? dated.map((c) => c.exam_date!).sort()[0];
  const to = finals?.to ?? dated.map((c) => c.exam_date!).sort().at(-1);
  const days: ExamFit["days"] = [];
  if (from && to) for (let d = from; d <= to; d = addDays(d, 1)) days.push({ date: d, weekday: weekdayOf(d), A: [], B: [] });
  for (const c of dated) {
    const day = days.find((d) => d.date === c.exam_date);
    if (day) day[c.exam_slot!].push(c.code);
  }
  for (const d of days) { d.A.sort(); d.B.sort(); }
  const clashes = days.flatMap((d) => (["A", "B"] as const).filter((s) => d[s].length > 1).map((slot) => ({ date: d.date, slot, codes: d[slot] })));
  const taken = days.filter((d) => d.A.length + d.B.length > 0);
  return {
    days,
    clashes,
    examDays: taken.length,
    weekdayExamDays: taken.filter((d) => d.weekday <= 5).length,
    twoInADay: taken.filter((d) => d.A.length > 0 && d.B.length > 0).map((d) => d.date),
    facultySet: courses.filter((c) => !c.exam_date && c.exam_note).map((c) => c.code).sort(),
    noFinal: courses.filter((c) => !c.exam_date && !c.exam_note).map((c) => c.code).sort(),
    etesting: courses.filter((c) => c.etesting).map((c) => c.code).sort(),
  };
}

export type FinalClash = { code: string; date: string; slot: "A" | "B"; from: string; to: string; busy: { time: string; end_time: string } };
/**
 * Finals that fall in her busy time (from her own calendar: busyTimes.ts), period by period.
 * Unlike a class, a final cannot be skipped or watched later: these are the clashes she has to
 * solve (time off; or e-Testing, if the course has it).
 */
export function finalsInBusyTime(fit: ExamFit, busyOn: (date: string) => { time: string; end_time: string }[]): FinalClash[] {
  const out: FinalClash[] = [];
  for (const d of fit.days) {
    for (const slot of ["A", "B"] as const) {
      const [from, to] = EXAM_PERIODS[slot];
      for (const code of d[slot]) {
        const hit = busyOn(d.date).find((b) => minutes(b.time) < minutes(to) && minutes(b.end_time) > minutes(from));
        if (hit) out.push({ code, date: d.date, slot, from, to, busy: hit });
      }
    }
  }
  return out;
}

/**
 * Busy blocks cut into Bangkok days: { "2026-11-17": [{ time: "08:00", end_time: "17:00" }] }.
 * A block over midnight is split; one covering the whole day becomes 00:00–23:59.
 */
export function blocksByDay(blocks: { start: string; end: string }[], dates: string[]): Record<string, { time: string; end_time: string }[]> {
  const out: Record<string, { time: string; end_time: string }[]> = {};
  const clock = (d: Date) => new Intl.DateTimeFormat("en-GB", { timeZone: "Asia/Bangkok", hour: "2-digit", minute: "2-digit", hour12: false }).format(d).replace(/^24/, "00");
  for (const date of dates) {
    const dayStart = new Date(`${date}T00:00:00+07:00`).getTime(), dayEnd = dayStart + 24 * 3600 * 1000;
    for (const b of blocks) {
      const s = Math.max(Date.parse(b.start), dayStart), e = Math.min(Date.parse(b.end), dayEnd);
      if (e <= s) continue;
      (out[date] ??= []).push({ time: clock(new Date(s)), end_time: e >= dayEnd ? "23:59" : clock(new Date(e)) });
    }
    // One meeting in two calendars, or two that overlap: one busy stretch.
    if (out[date]) {
      const merged: { time: string; end_time: string }[] = [];
      for (const b of out[date].sort((x, y) => x.time.localeCompare(y.time))) {
        const last = merged[merged.length - 1];
        if (last && b.time <= last.end_time) { if (b.end_time > last.end_time) last.end_time = b.end_time; } else merged.push({ ...b });
      }
      out[date] = merged;
    }
  }
  return out;
}
