/**
 * Reminders, to-dos and events: everything a student puts on their calendar.
 * - reminder: be told at a date and time
 * - todo: tick it off, with an optional due date
 * - event: happens at a time (optional end time); nothing to tick
 *
 * A row in `reminders` describes a rule ("every weekday at 19:00 from 3 Nov");
 * the days it actually falls on are worked out here, never stored. Completion
 * is stored per occurrence in `reminder_done`.
 */
import { Router } from "express";
import { z } from "zod";
import type { DB } from "./db.js";
import { bangkokToday } from "./api.js";
import { syncUniversityReminders } from "./universityReminders.js";

export type Repeat = "none" | "daily" | "weekdays" | "weekly" | "monthly";
export type Reminder = {
  id: number;
  kind: "reminder" | "todo" | "event";
  title: string;
  note: string | null;
  /** Optional course this item belongs to, with its names for display. */
  course_code: string | null;
  course_name_th: string | null;
  course_name_en: string | null;
  date: string | null;
  time: string | null;
  /** Events only: when it ends. */
  end_time: string | null;
  repeat: Repeat;
  repeat_until: string | null;
};
/** One reminder on one day. `date` is "" for a to-do that has no date. */
export type Occurrence = Reminder & { on: string; done: boolean; overdue: boolean };

const utc = (iso: string) => new Date(`${iso}T00:00:00Z`);
const lastDayOfMonth = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m = 1..12

/** Does this rule fall on `date` (YYYY-MM-DD)? */
export function occursOn(r: Pick<Reminder, "date" | "repeat" | "repeat_until">, date: string): boolean {
  if (!r.date || date < r.date) return false;
  if (r.repeat === "none") return date === r.date;
  if (r.repeat_until && date > r.repeat_until) return false;
  const d = utc(date);
  switch (r.repeat) {
    case "daily":
      return true;
    case "weekdays":
      return d.getUTCDay() >= 1 && d.getUTCDay() <= 5;
    case "weekly":
      return d.getUTCDay() === utc(r.date).getUTCDay();
    case "monthly": {
      // "The 31st" falls on the last day of shorter months instead of skipping them.
      const want = utc(r.date).getUTCDate();
      const last = lastDayOfMonth(d.getUTCFullYear(), d.getUTCMonth() + 1);
      return d.getUTCDate() === Math.min(want, last);
    }
  }
}

/** Every date in [from, to] the rule falls on. */
export function occurrencesBetween(r: Pick<Reminder, "date" | "repeat" | "repeat_until">, from: string, to: string): string[] {
  const out: string[] = [];
  if (!r.date) return out;
  const d = utc(from > r.date ? from : r.date);
  for (; d.toISOString().slice(0, 10) <= to; d.setUTCDate(d.getUTCDate() + 1)) {
    const iso = d.toISOString().slice(0, 10);
    if (occursOn(r, iso)) out.push(iso);
    if (r.repeat === "none" && iso >= r.date) break;
  }
  return out;
}

function allFor(db: DB, userId: string): Reminder[] {
  return db
    .prepare(
      `SELECT r.id, r.kind, r.title, r.note, r.course_code, c.name_th AS course_name_th, c.name_en AS course_name_en,
              r.date, r.time, r.end_time, r.repeat, r.repeat_until
       FROM reminders r LEFT JOIN courses c ON c.code = r.course_code
       WHERE r.user_id = ? ORDER BY COALESCE(r.time, '99:99'), r.id`,
    )
    .all(userId) as Reminder[];
}

function doneSet(db: DB, userId: string): Set<string> {
  const rows = db
    .prepare("SELECT rd.reminder_id, rd.date FROM reminder_done rd JOIN reminders r ON r.id = rd.reminder_id WHERE r.user_id = ?")
    .all(userId) as { reminder_id: number; date: string }[];
  return new Set(rows.map((r) => `${r.reminder_id}|${r.date}`));
}

/** Occurrences per day for a date range (the calendar). */
export function occurrencesInRange(db: DB, userId: string, from: string, to: string): Record<string, Occurrence[]> {
  const done = doneSet(db, userId);
  const days: Record<string, Occurrence[]> = {};
  for (const r of allFor(db, userId)) {
    for (const on of occurrencesBetween(r, from, to)) {
      (days[on] ??= []).push({ ...r, on, done: done.has(`${r.id}|${on}`), overdue: false });
    }
  }
  return days;
}

/**
 * What belongs on the Today list: today's occurrences, to-dos with no date
 * that are still open, and one-off to-dos whose date has passed without being
 * ticked (overdue). Open items first, then by time.
 */
export function itemsForToday(db: DB, userId: string, today: string): Occurrence[] {
  const done = doneSet(db, userId);
  const out: Occurrence[] = [];
  for (const r of allFor(db, userId)) {
    if (!r.date) {
      if (r.kind === "todo" && !done.has(`${r.id}|`)) out.push({ ...r, on: "", done: false, overdue: false });
    } else if (occursOn(r, today)) {
      // An event has nothing to tick, so it is never "done".
      out.push({ ...r, on: today, done: r.kind !== "event" && done.has(`${r.id}|${today}`), overdue: false });
    } else if (r.kind === "todo" && r.repeat === "none" && r.date < today && !done.has(`${r.id}|${r.date}`)) {
      out.push({ ...r, on: r.date, done: false, overdue: true });
    }
  }
  const rank = (o: Occurrence) => (o.done ? 2 : o.overdue ? 0 : 1);
  return out.sort((a, b) => rank(a) - rank(b) || (a.time ?? "99:99").localeCompare(b.time ?? "99:99") || a.id - b.id);
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const clock = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/);
const Body = z
  .object({
    kind: z.enum(["reminder", "todo", "event"]),
    title: z.string().trim().min(1).max(200),
    note: z.string().trim().max(1000).nullish(),
    course_code: z.string().regex(/^[A-Z]{3}\d{4}$/).nullish(),
    date: isoDate.nullish(),
    time: clock.nullish(),
    end_time: clock.nullish(),
    repeat: z.enum(["none", "daily", "weekdays", "weekly", "monthly"]).default("none"),
    repeat_until: isoDate.nullish(),
  })
  // Only a to-do may have no day; a reminder, an event or anything that repeats needs one.
  .refine((b) => b.date || (b.kind === "todo" && b.repeat === "none"), { message: "date required" })
  // An end time belongs to an event that has a start, and comes after it.
  .refine((b) => !b.end_time || (b.kind === "event" && !!b.time && b.end_time > b.time), { message: "bad end time" })
  .refine((b) => !b.repeat_until || !b.date || b.repeat_until >= b.date, { message: "repeat_until before date" });

export function createRemindersRouter(db: DB): Router {
  const router = Router();
  // Her own commitments in a week or two (events and timed reminders, as she entered them,
  // repeats expanded): what a course's class times are checked against in the term preview.
  router.get("/commitments", (req, res) => {
    const from = String(req.query.from ?? ""), to = String(req.query.to ?? "");
    const ok = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);
    const span = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
    if (!ok(from) || !ok(to) || !(span >= 0 && span <= 31)) return res.status(400).json({ error: "bad range", code: "BAD_RANGE" });
    const days: Record<string, { id: number; kind: string; title: string; time: string | null; end_time: string | null }[]> = {};
    for (const [date, list] of Object.entries(occurrencesInRange(db, req.user!.id, from, to))) {
      const timed = list.filter((o) => o.time && o.kind !== "todo");
      if (timed.length) days[date] = timed.map((o) => ({ id: o.id, kind: o.kind, title: o.title, time: o.time, end_time: o.end_time ?? null }));
    }
    res.json({ days });
  });

  // The university's dates as reminders in her own list (universityReminders.ts), in the language
  // the app is shown in. The app asks on start and when the language changes.
  router.post("/reminders/university", (req, res) => {
    const lang = req.body?.lang === "en" ? "en" : "th";
    // Remembered, so the notification round writes in the same language (readingLanguage).
    db.prepare("UPDATE user_profiles SET ui_lang = ? WHERE user_id = ?").run(lang, req.user!.id);
    res.json({ changed: syncUniversityReminders(db, req.user!.id, lang) });
  });
  const courseExists = (code: string | null | undefined) =>
    !code || !!db.prepare("SELECT 1 FROM courses WHERE code = ?").get(code);
  const owned = (id: number, userId: string) =>
    db.prepare("SELECT id, date FROM reminders WHERE id = ? AND user_id = ?").get(id, userId) as { id: number; date: string | null } | undefined;

  // Everything the student has set up, with the next day each one falls on.
  router.get("/reminders", (req, res) => {
    const userId = req.user!.id;
    const today = bangkokToday();
    const horizon = new Date(utc(today).getTime() + 400 * 86400000).toISOString().slice(0, 10);
    const done = doneSet(db, userId);
    const items = allFor(db, userId).map((r) => {
      // For a repeating item, the next day that is not ticked yet.
      const upcoming = r.date ? occurrencesBetween(r, today, horizon) : [];
      const next = (r.repeat === "none" ? upcoming[0] : upcoming.find((d) => !done.has(`${r.id}|${d}`))) ?? null;
      // Finished: a one-off that is ticked (an event: whose day has passed), or a
      // repeating item past its last day.
      const finished = r.repeat !== "none" ? next === null
        : r.kind === "event" ? !!r.date && r.date < today
        : done.has(`${r.id}|${r.date ?? ""}`);
      // Overdue: a one-off to-do or reminder whose day has passed without being ticked.
      const overdue = !finished && r.kind !== "event" && r.repeat === "none" && !!r.date && r.date < today;
      return { ...r, next, finished, overdue };
    });
    // Soonest first. Overdue items sort by their own (past) date, so they lead;
    // to-dos with no date follow the dated ones.
    const key = (i: (typeof items)[number]) => (i.overdue ? i.date! : i.next ?? "9999");
    items.sort((a, b) => key(a).localeCompare(key(b)) || (a.time ?? "99:99").localeCompare(b.time ?? "99:99") || a.id - b.id);
    res.json({ today, items, todayItems: itemsForToday(db, userId, today) });
  });

  // One rule, for the edit sheet.
  router.get("/reminders/:id", (req, res) => {
    const item = allFor(db, req.user!.id).find((r) => r.id === Number(req.params.id));
    if (!item) return res.status(404).json({ error: "ไม่พบรายการ" });
    res.json(item);
  });

  router.post("/reminders", (req, res) => {
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "ข้อมูลไม่ครบหรือไม่ถูกต้อง", code: "BAD_REMINDER" });
    const b = parsed.data;
    if (!courseExists(b.course_code)) return res.status(400).json({ error: "ไม่พบวิชานี้", code: "BAD_COURSE" });
    const info = db
      .prepare("INSERT INTO reminders (user_id, kind, title, note, course_code, date, time, end_time, repeat, repeat_until) VALUES (?,?,?,?,?,?,?,?,?,?)")
      .run(req.user!.id, b.kind, b.title, b.note || null, b.course_code ?? null, b.date ?? null, b.time ?? null, b.end_time ?? null, b.repeat, b.repeat === "none" ? null : b.repeat_until ?? null);
    res.json({ id: info.lastInsertRowid });
  });

  router.put("/reminders/:id", (req, res) => {
    const id = Number(req.params.id);
    if (!owned(id, req.user!.id)) return res.status(404).json({ error: "ไม่พบรายการ" });
    const parsed = Body.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "ข้อมูลไม่ครบหรือไม่ถูกต้อง", code: "BAD_REMINDER" });
    const b = parsed.data;
    if (!courseExists(b.course_code)) return res.status(400).json({ error: "ไม่พบวิชานี้", code: "BAD_COURSE" });
    db.prepare("UPDATE reminders SET kind = ?, title = ?, note = ?, course_code = ?, date = ?, time = ?, end_time = ?, repeat = ?, repeat_until = ? WHERE id = ?").run(
      b.kind, b.title, b.note || null, b.course_code ?? null, b.date ?? null, b.time ?? null, b.end_time ?? null, b.repeat, b.repeat === "none" ? null : b.repeat_until ?? null, id,
    );
    res.json({ ok: true });
  });

  router.delete("/reminders/:id", (req, res) => {
    db.prepare("DELETE FROM reminders WHERE id = ? AND user_id = ?").run(Number(req.params.id), req.user!.id);
    res.json({ ok: true });
  });

  // Tick or untick one occurrence. `date` is "" for a to-do with no date.
  router.post("/reminders/:id/done", (req, res) => {
    const id = Number(req.params.id);
    const row = owned(id, req.user!.id);
    if (!row) return res.status(404).json({ error: "ไม่พบรายการ" });
    const body = z.object({ date: z.union([isoDate, z.literal("")]), done: z.boolean() }).safeParse(req.body);
    if (!body.success) return res.status(400).json({ error: "ข้อมูลไม่ถูกต้อง" });
    if (body.data.done) db.prepare("INSERT OR IGNORE INTO reminder_done (reminder_id, date) VALUES (?, ?)").run(id, body.data.date);
    else db.prepare("DELETE FROM reminder_done WHERE reminder_id = ? AND date = ?").run(id, body.data.date);
    res.json({ ok: true });
  });

  return router;
}
