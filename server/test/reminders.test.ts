import { describe, it, expect, beforeAll } from "vitest";
import { openDb, type DB } from "../src/db.js";
import { seedDatabase } from "../src/seed.js";
import { occursOn, occurrencesBetween, itemsForToday, occurrencesInRange } from "../src/reminders.js";

const rule = (date: string | null, repeat: any = "none", repeat_until: string | null = null) => ({ date, repeat, repeat_until });

describe("Phase 32 — when a reminder falls", () => {
  it("a one-off falls on its day only", () => {
    expect(occursOn(rule("2026-11-16"), "2026-11-16")).toBe(true);
    expect(occursOn(rule("2026-11-16"), "2026-11-17")).toBe(false);
    expect(occursOn(rule(null), "2026-11-16")).toBe(false);
  });

  it("daily starts on its first day and stops after 'until'", () => {
    const r = rule("2026-11-16", "daily", "2026-11-18");
    expect(occurrencesBetween(r, "2026-11-14", "2026-11-30")).toEqual(["2026-11-16", "2026-11-17", "2026-11-18"]);
  });

  it("weekdays skips Saturday and Sunday", () => {
    // 2026-11-13 is a Friday.
    expect(occurrencesBetween(rule("2026-11-13", "weekdays"), "2026-11-13", "2026-11-17"))
      .toEqual(["2026-11-13", "2026-11-16", "2026-11-17"]);
  });

  it("weekly keeps the weekday of its first day", () => {
    expect(occurrencesBetween(rule("2026-11-16", "weekly"), "2026-11-01", "2026-12-07"))
      .toEqual(["2026-11-16", "2026-11-23", "2026-11-30", "2026-12-07"]);
  });

  it("monthly on the 31st uses the last day of shorter months", () => {
    expect(occurrencesBetween(rule("2027-01-31", "monthly"), "2027-01-01", "2027-04-30"))
      .toEqual(["2027-01-31", "2027-02-28", "2027-03-31", "2027-04-30"]);
  });
});

describe("Phase 32 — the Today list and the calendar", () => {
  let db: DB;
  const A = "legacy-user-0001";
  const B = "user-b";
  const TODAY = "2026-11-16"; // Monday
  const add = (user: string, kind: string, title: string, date: string | null, time: string | null = null, repeat = "none", course: string | null = null) =>
    Number(db.prepare("INSERT INTO reminders (user_id, kind, title, date, time, repeat, course_code) VALUES (?,?,?,?,?,?,?)")
      .run(user, kind, title, date, time, repeat, course).lastInsertRowid);
  const tick = (id: number, date: string) => db.prepare("INSERT INTO reminder_done (reminder_id, date) VALUES (?, ?)").run(id, date);
  const titles = (user = A) => itemsForToday(db, user, TODAY).map((o) => `${o.title}${o.overdue ? " (overdue)" : ""}${o.done ? " (done)" : ""}`);

  beforeAll(() => {
    db = openDb(":memory:");
    seedDatabase(db, { reset: false });
    db.prepare("INSERT INTO users (id, email, name, created_at, last_login_at) VALUES (?, 'b@x.test', 'B', datetime('now'), datetime('now'))").run(B);
  });

  it("shows today's items in time order, with overdue to-dos first and done ones last", () => {
    add(A, "reminder", "evening review", TODAY, "19:00", "daily");
    add(A, "todo", "buy textbook", null);
    add(A, "todo", "hand in form", "2026-11-10");          // one-off, past, not ticked
    add(A, "reminder", "old reminder", "2026-11-10");       // a past reminder is not carried forward
    add(A, "todo", "next week", "2026-11-23");
    const morning = add(A, "todo", "morning reading", TODAY, "07:30", "weekdays", "ACC1103");
    expect(titles()).toEqual(["hand in form (overdue)", "morning reading", "evening review", "buy textbook"]);
    tick(morning, TODAY);
    expect(titles()).toEqual(["hand in form (overdue)", "evening review", "buy textbook", "morning reading (done)"]);
  });

  it("ticking one day of a repeating item leaves the other days open", () => {
    const days = occurrencesInRange(db, A, "2026-11-16", "2026-11-17");
    const reading = (d: string) => days[d].find((o) => o.title === "morning reading")!;
    expect(reading("2026-11-16").done).toBe(true);
    expect(reading("2026-11-17").done).toBe(false);
  });

  it("carries the course on an item tied to one", () => {
    const item = itemsForToday(db, A, TODAY).find((o) => o.title === "morning reading")!;
    expect(item.course_code).toBe("ACC1103");
    expect(item.course_name_th).toBeTruthy();
  });

  it("never shows one student's items to another", () => {
    expect(titles(B)).toEqual([]);
    expect(occurrencesInRange(db, B, "2026-11-01", "2026-11-30")).toEqual({});
  });

  it("lists items soonest first, overdue ones leading and undated ones last", async () => {
    const { createRemindersRouter } = await import("../src/reminders.js");
    const layer = (createRemindersRouter(db) as any).stack.find((l: any) => l.route?.path === "/reminders" && l.route.methods.get);
    let body: any;
    layer.route.stack[0].handle({ user: { id: A } }, { json: (b: any) => { body = b; } });
    const order = body.items.filter((i: any) => !i.finished).map((i: any) => i.title);
    // Real "today" differs from the test's fixed day, so check only the invariants.
    const overdue = body.items.filter((i: any) => i.overdue).map((i: any) => i.title);
    expect(order.slice(0, overdue.length)).toEqual(overdue);
    expect(order.at(-1)).toBe("buy textbook"); // no date
    const dated = body.items.filter((i: any) => !i.finished && !i.overdue && i.next).map((i: any) => i.next);
    expect(dated).toEqual([...dated].sort());
  });

  it("shows an event on its day with nothing to tick, and never as overdue", () => {
    const addEvent = (title: string, date: string, time: string, end: string) =>
      db.prepare("INSERT INTO reminders (user_id, kind, title, date, time, end_time) VALUES (?, 'event', ?, ?, ?, ?)").run(A, title, date, time, end);
    addEvent("group study", TODAY, "13:00", "15:00");
    addEvent("last week's seminar", "2026-11-09", "09:00", "10:00");
    const today = itemsForToday(db, A, TODAY);
    const study = today.find((o) => o.title === "group study")!;
    expect(study.end_time).toBe("15:00");
    expect(study.done).toBe(false);
    expect(today.some((o) => o.title === "last week's seminar")).toBe(false); // past events are not carried forward
    const onDay = occurrencesInRange(db, A, TODAY, TODAY)[TODAY].find((o) => o.title === "group study")!;
    expect(onDay.kind).toBe("event");
  });
});
