/**
 * The study plan fits her week and stays honest (owner 2026-11-15, north-star review):
 * one budget per day for every task (two courses never stack beyond it); long days (her own
 * events of 6 hours or more, such as a work shift) get her "long day" hours; days off get none;
 * ticked tasks survive an update and are not planned again; the plan says when it is out of date;
 * a booked e-Test is the date to prepare for; rescheduling never moves work past the exam.
 * Also her own exam records (myExams.ts): a faculty-arranged exam's date and her seat.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { openDb, type DB } from "../src/db.js";
import { seedDatabase } from "../src/seed.js";
import { findOrCreateUser } from "../src/auth.js";
import { createStudyPlanRouter, dayCapacity, LONG_DAY_HOURS } from "../src/studyplan.js";
import { createMyExamsRouter, myExams } from "../src/myExams.js";
import { addDaysISO, bangkokToday } from "../src/api.js";

let db: DB;
let server: Server;
let base = "";
let as = "";

beforeAll(async () => {
  db = openDb(":memory:");
  seedDatabase(db, { reset: false });
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { (req as unknown as { user: { id: string } }).user = { id: as }; next(); });
  app.use("/api", createStudyPlanRouter(db));
  app.use("/api", createMyExamsRouter(db));
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server?.close());

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function call(user: string, method: string, path: string, body?: unknown): Promise<{ status: number; body: any }> {
  as = user;
  const r = await fetch(`${base}/api${path}`, { method, headers: { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  return { status: r.status, body: await r.json() };
}

const TERM = "2/69";
function student(email: string, program: string, codes: string[]): string {
  const id = findOrCreateUser(db, { email, name: email, avatar: "" });
  db.prepare("UPDATE user_profiles SET program_id = ?, university_id = 'ru', entry_year = '69', onboarded = 1 WHERE user_id = ?").run(program, id);
  for (const c of codes) db.prepare("INSERT INTO plan_items (user_id, term_id, course_code) VALUES (?, ?, ?)").run(id, TERM, c);
  return id;
}
function chapters(user: string, code: string, n: number, pages = 20) {
  for (let i = 0; i < n; i++) db.prepare("INSERT INTO chapters (user_id, course_code, name, sort_order, ai_suggested, created_at, page_count) VALUES (?, ?, ?, ?, 0, datetime('now'), ?)").run(user, code, `Ch ${i + 1}`, i, pages);
}
const settingsOf = async (user: string) => (await call(user, "GET", "/studyplan/settings")).body;
const tasksOf = async (user: string) => (await call(user, "GET", "/studyplan")).body;

describe("one budget per day", () => {
  it("never plans more on a day than she has, with long days and days off honoured", async () => {
    // Two finals a day apart (13 and 14 Mar 2027): their review weeks overlap.
    const u = student("week@example.com", "bus-mkt", ["MKT2101", "RAM1111"]);
    chapters(u, "MKT2101", 6); chapters(u, "RAM1111", 6);
    const today = bangkokToday();
    // A weekly 9-hour shift from tomorrow on: every such day is a long day.
    db.prepare("INSERT INTO reminders (user_id, kind, title, date, time, end_time, repeat) VALUES (?, 'event', 'Shift', ?, '13:00', '22:00', 'weekly')").run(u, addDaysISO(today, 1));
    const dayOff = addDaysISO(today, 3);
    await call(u, "PUT", "/studyplan/settings", { weekday_hours: 2, weekend_hours: 5, workday_hours: 1, blocked_dates: [dayOff, "nonsense"] });
    expect((await settingsOf(u)).blocked_dates).toEqual([dayOff]);
    expect((await call(u, "POST", "/studyplan/generate")).status).toBe(200);
    const plan = await tasksOf(u);
    const byDay: Record<string, number> = {};
    for (const t of plan.tasks) byDay[t.date] = (byDay[t.date] ?? 0) + t.minutes;
    const cap = dayCapacity(db, u, await settingsOf(u), addDaysISO(today, 1), "2027-03-13");
    for (const [d, m] of Object.entries(byDay)) expect(m, d).toBeLessThanOrEqual(cap[d]);
    // The shift days are long days: 1 hour less the 20% buffer.
    const shiftDay = addDaysISO(today, 1);
    expect(cap[shiftDay]).toBe(Math.floor(1 * 60 * 0.8));
    expect(cap[addDaysISO(shiftDay, 7)]).toBe(Math.floor(1 * 60 * 0.8));
    expect(cap[dayOff]).toBe(0);
    expect(byDay[dayOff] ?? 0).toBe(0);
    // Both mocks still happen, each on the days before its own exam.
    expect(plan.tasks.some((t: { task_type: string; course_code: string }) => t.task_type === "mock" && t.course_code === "MKT2101")).toBe(true);
    expect(plan.tasks.every((t: { date: string; course_code: string }) => t.date < (t.course_code === "MKT2101" ? "2027-03-13" : "2027-03-14"))).toBe(true);
    expect(LONG_DAY_HOURS).toBe(6);
  });
});

describe("kept ticks and an honest 'out of date'", () => {
  it("keeps what she ticked, does not plan it again, and says when the plan no longer fits", async () => {
    const u = student("stale@example.com", "bus-mkt", ["MKT2101"]);
    chapters(u, "MKT2101", 3);
    await call(u, "POST", "/studyplan/generate");
    let plan = await tasksOf(u);
    expect(plan.plan.stale).toBe(false);
    const first = plan.tasks.find((t: { task_type: string }) => t.task_type === "read");
    await call(u, "POST", `/studyplan/tasks/${first.id}/toggle`);
    // Her hours change: the plan is out of date.
    await call(u, "PUT", "/studyplan/settings", { weekday_hours: 3 });
    expect((await tasksOf(u)).plan.stale).toBe(true);
    await call(u, "POST", "/studyplan/generate");
    plan = await tasksOf(u);
    expect(plan.plan.stale).toBe(false);
    const same = plan.tasks.filter((t: { task_type: string; chapter_id: number; page_start: number }) => t.task_type === "read" && t.chapter_id === first.chapter_id && t.page_start === first.page_start);
    expect(same).toHaveLength(1);
    expect(same[0].done).toBe(1);
    // A new shift makes it out of date too.
    db.prepare("INSERT INTO reminders (user_id, kind, title, date, time, end_time) VALUES (?, 'event', 'Shift', ?, '08:00', '17:00')").run(u, addDaysISO(bangkokToday(), 2));
    expect((await tasksOf(u)).plan.stale).toBe(true);
  });
});

describe("a booked e-Test is the date to prepare for", () => {
  it("plans for the booking, before the final, and rescheduling never passes it", async () => {
    const u = student("etest@example.com", "bus-mkt", ["RAM1131"]);
    chapters(u, "RAM1131", 4);
    const etest = addDaysISO(bangkokToday(), 20);
    db.prepare("INSERT INTO etesting_bookings (user_id, term_id, course_code, centre, date, period) VALUES (?, ?, 'RAM1131', 'central', ?, 2)").run(u, TERM, etest);
    const courses = (await call(u, "GET", "/studyplan/courses")).body.courses;
    expect(courses[0]).toMatchObject({ course_code: "RAM1131", exam_kind: "etesting", exam_date: etest });
    const mine = myExams(db, u)[0];
    expect(mine.next).toMatchObject({ kind: "etesting", date: etest, start: "12:00", end: "14:30" });
    expect(mine.final?.date).toBe("2027-03-09");
    await call(u, "POST", "/studyplan/generate");
    let plan = await tasksOf(u);
    expect(plan.tasks.length).toBeGreaterThan(0);
    expect(plan.tasks.every((t: { date: string }) => t.date < etest)).toBe(true);
    // Two overdue tasks: a short one moves to a day before the e-Test; one too long for any day stays put.
    const [a, b] = plan.tasks.filter((t: { done: number }) => !t.done);
    const yesterday = addDaysISO(bangkokToday(), -1);
    db.prepare("UPDATE study_tasks SET date = ?, minutes = 15 WHERE id = ?").run(yesterday, a.id);
    db.prepare("UPDATE study_tasks SET date = ?, minutes = 900 WHERE id = ?").run(yesterday, b.id);
    const r = await call(u, "POST", "/studyplan/reschedule");
    expect(r.body).toMatchObject({ rescheduled: 1, noTime: ["RAM1131"] });
    plan = await tasksOf(u);
    const moved = plan.tasks.find((t: { id: number }) => t.id === a.id), stuck = plan.tasks.find((t: { id: number }) => t.id === b.id);
    expect(moved.date >= bangkokToday() && moved.date < etest).toBe(true);
    expect(stuck.date).toBe(yesterday);
  });
});

describe("her own exam records (myExams)", () => {
  it("takes a date only for a faculty-arranged exam, and a seat for any of her courses", async () => {
    const u = student("own@example.com", "bus-acc", ["ACC3250", "ACC1101"]);
    const facultySet = myExams(db, u).find((e) => e.course_code === "ACC3250")!;
    expect(facultySet).toMatchObject({ facultySet: true, final: null, next: null });
    const day = addDaysISO(bangkokToday(), 30);
    let r = await call(u, "PUT", "/my-exams/ACC3250", { exam_date: day, start_time: "09:00", end_time: "12:00" });
    expect(r.status).toBe(200);
    expect(r.body.exams.find((e: { course_code: string }) => e.course_code === "ACC3250").next).toEqual({ date: day, kind: "own", start: "09:00", end: "12:00" });
    // The registrar dates ACC1101: no date of hers, but a seat is fine.
    expect((await call(u, "PUT", "/my-exams/ACC1101", { exam_date: day })).body.code).toBe("HAS_DATE");
    r = await call(u, "PUT", "/my-exams/ACC1101", { seat: "SB 305, seat 41" });
    expect(r.body.exams.find((e: { course_code: string }) => e.course_code === "ACC1101").seat).toBe("SB 305, seat 41");
    expect((await call(u, "PUT", "/my-exams/ACC1101", { seat: "" })).body.exams.find((e: { course_code: string }) => e.course_code === "ACC1101").seat).toBeNull();
    // Not her course; bad times.
    expect((await call(u, "PUT", "/my-exams/MKT2101", { seat: "x" })).status).toBe(404);
    expect((await call(u, "PUT", "/my-exams/ACC3250", { exam_date: day, start_time: "12:00", end_time: "09:00" })).body.code).toBe("BAD_TIME");
    // Clearing the date clears its times.
    r = await call(u, "PUT", "/my-exams/ACC3250", { exam_date: null });
    expect(r.body.exams.find((e: { course_code: string }) => e.course_code === "ACC3250")).toMatchObject({ own: null, next: null });
    // Another student never sees it.
    const other = student("own2@example.com", "bus-acc", ["ACC3250"]);
    await call(u, "PUT", "/my-exams/ACC3250", { exam_date: day });
    expect(myExams(db, other)[0].own).toBeNull();
  });
});

describe("review fixes (Phase 73)", () => {
  it("never plans pages she already read, even after her reading speed changes the chunks", async () => {
    const u = student("speed@example.com", "bus-mkt", ["RAM1111"]);
    chapters(u, "RAM1111", 1, 20);
    await call(u, "PUT", "/studyplan/settings", { reading_speed: 10 });
    await call(u, "POST", "/studyplan/generate");
    let plan = await tasksOf(u);
    const reads = plan.tasks.filter((t: { task_type: string }) => t.task_type === "read");
    expect(reads.map((t: { page_start: number; page_end: number }) => `${t.page_start}-${t.page_end}`)).toEqual(["1-8", "9-16", "17-20"]);
    for (const t of reads.slice(0, 2)) await call(u, "POST", `/studyplan/tasks/${t.id}/toggle`);
    await call(u, "PUT", "/studyplan/settings", { reading_speed: 20 });
    await call(u, "POST", "/studyplan/generate");
    plan = await tasksOf(u);
    const open = plan.tasks.filter((t: { task_type: string; done: number }) => t.task_type === "read" && !t.done);
    expect(open.map((t: { page_start: number; page_end: number }) => `${t.page_start}-${t.page_end}`)).toEqual(["17-20"]);
  });

  it("keeps a mock done ahead of time without planning a second one that day", async () => {
    const u = student("mock@example.com", "bus-mkt", ["RAM1111"]);
    chapters(u, "RAM1111", 1, 10);
    await call(u, "POST", "/studyplan/generate");
    const mock = (await tasksOf(u)).tasks.find((t: { task_type: string }) => t.task_type === "mock");
    await call(u, "POST", `/studyplan/tasks/${mock.id}/toggle`);
    await call(u, "POST", "/studyplan/generate");
    const same = (await tasksOf(u)).tasks.filter((t: { task_type: string; date: string }) => t.task_type === "mock" && t.date === mock.date);
    expect(same).toHaveLength(1);
    expect(same[0].done).toBe(1);
  });

  it("keeps today's unfinished tasks when the plan is updated", async () => {
    const u = student("today-keep@example.com", "bus-mkt", ["RAM1111"]);
    chapters(u, "RAM1111", 2, 10);
    await call(u, "POST", "/studyplan/generate");
    const t = (await tasksOf(u)).tasks[0];
    db.prepare("UPDATE study_tasks SET date = ? WHERE id = ?").run(bangkokToday(), t.id);
    await call(u, "POST", "/studyplan/generate");
    const kept = (await tasksOf(u)).tasks.filter((x: { date: string; done: number }) => x.date === bangkokToday() && !x.done);
    expect(kept.length).toBe(1);
  });

  it("counts overlapping events once when deciding a long day", async () => {
    const u = student("overlap@example.com", "bus-mkt", []);
    const d = addDaysISO(bangkokToday(), 5);
    db.prepare("INSERT INTO reminders (user_id, kind, title, date, time, end_time) VALUES (?, 'event', 'Work', ?, '09:00', '14:00'), (?, 'event', 'Lunch', ?, '12:00', '13:00')").run(u, d, u, d);
    const s = await settingsOf(u);
    expect(dayCapacity(db, u, s, d, d)[d]).toBe(Math.floor((new Date(`${d}T12:00:00Z`).getUTCDay() % 6 === 0 ? s.weekend_hours : s.weekday_hours) * 60 * 0.8));
    db.prepare("INSERT INTO reminders (user_id, kind, title, date, time, end_time) VALUES (?, 'event', 'More', ?, '14:00', '15:00')").run(u, d);
    expect(dayCapacity(db, u, s, d, d)[d]).toBe(Math.floor(Math.min(s.workday_hours, new Date(`${d}T12:00:00Z`).getUTCDay() % 6 === 0 ? s.weekend_hours : s.weekday_hours) * 60 * 0.8));
  });

  it("does not call a dropped course's tasks overdue, and says so when rescheduling", async () => {
    const u = student("dropped@example.com", "bus-mkt", ["RAM1111", "MKT2101"]);
    chapters(u, "RAM1111", 1, 10);
    await call(u, "POST", "/studyplan/generate");
    const t = (await tasksOf(u)).tasks.find((x: { course_code: string }) => x.course_code === "RAM1111");
    db.prepare("UPDATE study_tasks SET date = ? WHERE id = ?").run(addDaysISO(bangkokToday(), -1), t.id);
    db.prepare("DELETE FROM plan_items WHERE user_id = ? AND course_code = 'RAM1111'").run(u);
    expect((await tasksOf(u)).expired).toContain("RAM1111");
    expect((await call(u, "POST", "/studyplan/reschedule")).body).toMatchObject({ rescheduled: 0, expired: ["RAM1111"] });
  });

  it("refuses an exam date that does not exist, and an end before a saved start", async () => {
    const u = student("baddate@example.com", "bus-acc", ["ACC3250"]);
    expect((await call(u, "PUT", "/my-exams/ACC3250", { exam_date: "2027-13-05" })).status).toBe(400);
    expect((await call(u, "PUT", "/my-exams/ACC3250", { exam_date: "2027-02-30" })).status).toBe(400);
    expect((await call(u, "PUT", "/my-exams/ACC3250", { exam_date: "2027-02-10", start_time: "13:00" })).status).toBe(200);
    expect((await call(u, "PUT", "/my-exams/ACC3250", { end_time: "12:00" })).body.code).toBe("BAD_TIME");
  });
});
