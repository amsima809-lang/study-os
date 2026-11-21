/**
 * e-Testing 2/2569 from the e-Testing office's announcement (migration 040) and the reminders
 * the app gives Ramkhamhaeng students from it (server/src/universityReminders.ts).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { openDb, type DB } from "../src/db.js";
import { seedDatabase } from "../src/seed.js";
import { findOrCreateUser } from "../src/auth.js";
import { universityReminders, syncUniversityReminders, readingLanguage } from "../src/universityReminders.js";
import { dueItems, sendDuePushes, generateVapidKeys } from "../src/push.js";
import { createApiRouter } from "../src/api.js";
import { createRemindersRouter } from "../src/reminders.js";

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
  app.use("/api", createRemindersRouter(db));
  app.use("/api", createApiRouter(db));
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server?.close());

const student = (email: string, university = "ru") => {
  const id = findOrCreateUser(db, { email, name: email, avatar: "" });
  db.prepare("UPDATE user_profiles SET university_id = ?, program_id = 'bus-mkt', onboarded = 1 WHERE user_id = ?").run(university, id);
  return id;
};
const at = (bangkok: string) => new Date(`${bangkok}+07:00`);
const mine = (u: string) => db.prepare("SELECT id, title, note, date, time, kind FROM reminders WHERE user_id = ? ORDER BY date, time").all(u) as { id: number; title: string; note: string | null; date: string; time: string; kind: string }[];
const NOV_15 = at("2026-11-15T12:00:00");

describe("e-Testing 2/2569, as the announcement of 26 Oct 2569 prints it", () => {
  it("has the registration, the central and regional exam days, and the source", () => {
    const s = db.prepare("SELECT * FROM etesting_schedule WHERE term_id = '2/69'").get() as Record<string, string>;
    expect([s.registration_start, s.registration_end, s.registration_opens, s.registration_closes, s.payment_deadline]).toEqual(["2026-12-21", "2026-12-25", "10:00", "21:30", "21:30"]);
    expect([s.exam_start, s.exam_end]).toEqual(["2027-01-12", "2027-03-07"]);
    expect(JSON.parse(s.central_closed)).toEqual([["2027-01-21", "2027-01-26"], ["2027-02-20", "2027-02-22"]]);
    const regional = JSON.parse(s.regional_dates) as string[];
    expect(regional).toHaveLength(22); // 8 in January, 11 in February, 3 in March
    expect(regional.filter((d) => d.startsWith("2027-01"))).toEqual(["2027-01-09", "2027-01-10", "2027-01-15", "2027-01-16", "2027-01-17", "2027-01-27", "2027-01-28", "2027-01-29"]);
    expect(regional.filter((d) => d.startsWith("2027-03"))).toEqual(["2027-03-05", "2027-03-06", "2027-03-07"]);
    expect(s.announced).toBe("2026-10-26");
    expect(s.source).toContain("easi.ru.ac.th");
  });

  it("lists the same 134 courses as the announcement, three of them part essay", () => {
    expect((db.prepare("SELECT COUNT(*) n FROM etesting_courses WHERE term_id = '2/69'").get() as { n: number }).n).toBe(134);
    expect((db.prepare("SELECT course_code FROM etesting_courses WHERE term_id = '2/69' AND has_essay = 1 ORDER BY 1").all() as { course_code: string }[]).map((r) => r.course_code)).toEqual(["ANT1013", "ANT2078", "ANT3013"]);
  });
});

describe("the reminders made from it", () => {
  it("are a week before registration, when it opens at 10:00, and on its last day", () => {
    const r = universityReminders(db).filter((x) => x.key.startsWith("etesting:2/69:"));
    expect(r.map((x) => [x.key, x.date, x.time])).toEqual([
      ["etesting:2/69:week", "2026-12-14", "09:00"],
      ["etesting:2/69:open", "2026-12-21", "10:00"],
      ["etesting:2/69:last", "2026-12-25", "09:00"],
    ]);
    expect(r[1].title).toEqual({ th: "เปิดลงทะเบียนสอบ e-Testing ภาค 2/2569 แล้ว", en: "e-Testing registration for term 2/2569 is open" });
    // The note says when, where and how much, in each language, with the closed days.
    expect(r[0].note.th).toContain("ลงทะเบียน 21–25 ธ.ค. 2569 ทาง E-SERVICE (เปิด 10:00 น. ปิดวันสุดท้าย 21:30 น.)");
    expect(r[0].note.th).toContain("ชำระเงินภายใน 21:30 น. ของวันที่ลงทะเบียน");
    expect(r[0].note.th).toContain("เว้น 21–26 ม.ค. และ 20–22 ก.พ.");
    expect(r[0].note.th).toContain("ค่าสอบวิชาละ 200 บาท (ศูนย์ส่วนกลาง) / 300 บาท (ส่วนภูมิภาค)");
    expect(r[0].note.th).toContain("ศูนย์สอบส่วนภูมิภาคเปิดเฉพาะบางวัน");
    expect(r[0].note.en).toContain("fee 200 baht a course (central centre), 300 baht (regional)");
    expect(r[0].note.en).toContain("Register 21–25 Dec 2026 in E-SERVICE (opens 10:00, closes 21:30 on the last day)");
    expect(r[0].note.en).toContain("pay by 21:30 the day you register");
    expect(r[0].note.en).toContain("exams at Hua Mak 12 Jan–7 Mar 2027 (not 21–26 Jan or 20–22 Feb)");
  });

  it("are put in a Ramkhamhaeng student's list once, in her language", () => {
    const u = student("once@test");
    expect(syncUniversityReminders(db, u, "th", NOV_15)).toBe(3);
    expect(syncUniversityReminders(db, u, "th", NOV_15)).toBe(0);
    const list = mine(u);
    expect(list.map((x) => [x.kind, x.date, x.time])).toEqual([["reminder", "2026-12-14", "09:00"], ["reminder", "2026-12-21", "10:00"], ["reminder", "2026-12-25", "09:00"]]);
    expect(list[0].title).toBe("อีก 1 สัปดาห์ เปิดลงทะเบียนสอบ e-Testing ภาค 2/2569");
  });

  it("are not given to a student of another university", () => {
    const u = student("other@test", "cu");
    expect(syncUniversityReminders(db, u, "th", NOV_15)).toBe(0);
    expect(mine(u)).toEqual([]);
  });

  it("never come back once deleted", () => {
    const u = student("deleted@test");
    syncUniversityReminders(db, u, "th", NOV_15);
    const first = mine(u)[0];
    db.prepare("DELETE FROM reminders WHERE id = ?").run(first.id);
    expect(syncUniversityReminders(db, u, "th", NOV_15)).toBe(0);
    expect(syncUniversityReminders(db, u, "en", NOV_15)).toBe(2); // the other two follow the language
    expect(mine(u).map((x) => x.date)).toEqual(["2026-12-21", "2026-12-25"]);
  });

  it("follow her language unless she edited them", () => {
    const u = student("lang@test");
    syncUniversityReminders(db, u, "th", NOV_15);
    const [week] = mine(u);
    db.prepare("UPDATE reminders SET title = 'ลงทะเบียน e-Testing วิชา MKT2101!' WHERE id = ?").run(week.id);
    expect(syncUniversityReminders(db, u, "en", NOV_15)).toBe(2);
    const after = mine(u);
    expect(after[0].title).toBe("ลงทะเบียน e-Testing วิชา MKT2101!"); // hers, untouched
    expect(after[1].title).toBe("e-Testing registration for term 2/2569 is open");
    expect(after[2].note).toContain("Register 21–25 Dec 2026");
    // and back again
    expect(syncUniversityReminders(db, u, "th", NOV_15)).toBe(2);
    expect(mine(u)[1].title).toBe("เปิดลงทะเบียนสอบ e-Testing ภาค 2/2569 แล้ว");
  });

  it("skip days already gone for a student who joins late, but keep today's", () => {
    const u = student("late@test");
    expect(syncUniversityReminders(db, u, "th", at("2026-12-21T11:00:00"))).toBe(2);
    expect(mine(u).map((x) => x.date)).toEqual(["2026-12-21", "2026-12-25"]);
    const v = student("later@test");
    expect(syncUniversityReminders(db, v, "th", at("2026-12-26T00:30:00"))).toBe(0);
  });

  it("are given at the very moment one comes due (the notification round runs then)", () => {
    const u = student("on-the-minute@test");
    expect(syncUniversityReminders(db, u, "th", at("2026-12-14T09:00:30"))).toBe(3);
    expect(dueItems(db, u, at("2026-12-14T09:01:00")).map((o) => o.date)).toEqual(["2026-12-14"]);
  });

  it("come due at their time, for the in-app alert and the phone notification", () => {
    const u = student("due@test");
    syncUniversityReminders(db, u, "th", NOV_15);
    expect(dueItems(db, u, at("2026-12-21T09:59:00")).map((o) => o.date)).toEqual([]);
    expect(dueItems(db, u, at("2026-12-21T10:05:00")).map((o) => [o.date, o.time])).toEqual([["2026-12-21", "10:00"]]);
  });

  it("reach a student with notifications on who has not opened the app since, in her device's language", async () => {
    const u = student("push@test");
    db.prepare("INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, lang) VALUES (?, 'https://fcm.googleapis.com/fcm/send/abc', 'k', 'a', 'en')").run(u);
    const sent: string[] = [];
    const fake = async (url: string) => { sent.push(url); return { status: 201 }; };
    expect(await sendDuePushes(db, generateVapidKeys(), at("2026-12-14T09:02:00"), fake)).toBe(1);
    expect(sent).toEqual(["https://fcm.googleapis.com/fcm/send/abc"]);
    expect(mine(u)[0].title).toBe("e-Testing registration for term 2/2569 opens in a week");
    // once only
    expect(await sendDuePushes(db, generateVapidKeys(), at("2026-12-14T09:03:00"), fake)).toBe(0);
    db.prepare("DELETE FROM push_subscriptions WHERE user_id = ?").run(u);
  });

  it("are asked for by the app through POST /api/reminders/university", async () => {
    as = student("route@test");
    const r = await fetch(`${base}/api/reminders/university`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lang: "en" }) });
    const body = (await r.json()) as { changed: number };
    // Created only for days not yet gone: the test runs on the real clock.
    const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(new Date());
    const ahead = universityReminders(db).filter((x) => x.date >= today).length;
    expect(body.changed).toBe(ahead);
  });
});

describe("keeping them right", () => {
  const sub = (u: string, lang: "th" | "en", endpoint: string) =>
    db.prepare("INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, lang) VALUES (?, ?, 'k', 'a', ?)").run(u, endpoint, lang);
  const fake = async () => ({ status: 201 });

  it("follow the language she reads the app in, not her phone's, in the notification round", async () => {
    const u = student("app-lang@test");
    sub(u, "th", "https://fcm.googleapis.com/fcm/send/app-lang");
    as = u;
    await fetch(`${base}/api/reminders/university`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ lang: "en" }) });
    expect(readingLanguage(db, u)).toBe("en");
    await sendDuePushes(db, generateVapidKeys(), at("2026-11-20T08:00:00"), fake);
    expect(mine(u).every((r) => /^e-Testing|^Last day/.test(r.title))).toBe(true);
    db.prepare("DELETE FROM push_subscriptions WHERE user_id = ?").run(u);
  });

  it("use the newest device's language for a student who has not opened the app since", () => {
    const u = student("devices@test");
    db.prepare("INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, lang, created_at) VALUES (?, 'https://fcm.googleapis.com/x1', 'k', 'a', 'en', '2026-11-01 10:00:00')").run(u);
    db.prepare("INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth, lang, created_at) VALUES (?, 'https://fcm.googleapis.com/x2', 'k', 'a', 'th', '2026-11-10 10:00:00')").run(u);
    expect(readingLanguage(db, u)).toBe("th");
    db.prepare("DELETE FROM push_subscriptions WHERE user_id = ?").run(u);
    expect(readingLanguage(db, u)).toBe(null);
  });

  it("never reword a reminder whose day is gone", () => {
    const u = student("gone@test");
    syncUniversityReminders(db, u, "th", NOV_15);
    expect(syncUniversityReminders(db, u, "en", at("2026-12-22T08:00:00"))).toBe(1); // only the 25th
    expect(mine(u).map((r) => /^e-Testing|^Last/.test(r.title))).toEqual([false, false, true]);
  });

  it("move with the university when it changes a date, unless she edited it (then a new one is added)", () => {
    const u = student("moved@test");
    syncUniversityReminders(db, u, "en", NOV_15);
    const [week, open, last] = mine(u);
    db.prepare("UPDATE reminders SET title = 'My own note about the last day' WHERE id = ?").run(last.id);
    db.prepare("INSERT INTO reminder_pushes (reminder_id, date) VALUES (?, '2026-12-21')").run(open.id);
    const before = db.prepare("SELECT * FROM etesting_schedule WHERE term_id = '2/69'").get() as Record<string, string>;
    try {
      // Suppose the office postponed registration by a day, opening at 13:00, closing on the 26th.
      db.prepare("UPDATE etesting_schedule SET registration_start = '2026-12-22', registration_end = '2026-12-26', registration_opens = '13:00' WHERE term_id = '2/69'").run();
      expect(syncUniversityReminders(db, u, "en", NOV_15)).toBe(3);
      const after = mine(u);
      expect(after.find((r) => r.id === week.id)).toMatchObject({ date: "2026-12-15", time: "09:00" });
      expect(after.find((r) => r.id === open.id)).toMatchObject({ date: "2026-12-22", time: "13:00" });
      expect(after.find((r) => r.id === open.id)!.note).toContain("Register 22–26 Dec 2026 in E-SERVICE (opens 13:00");
      expect(db.prepare("SELECT 1 FROM reminder_pushes WHERE reminder_id = ?").get(open.id)).toBeUndefined(); // announced again at its new time
      // Her edited one stays as she made it; a new one carries the new date.
      expect(after.find((r) => r.id === last.id)).toMatchObject({ title: "My own note about the last day", date: "2026-12-25" });
      expect(after.filter((r) => r.title === "Last day to register for e-Testing, term 2/2569").map((r) => r.date)).toEqual(["2026-12-26"]);
      expect(syncUniversityReminders(db, u, "en", NOV_15)).toBe(0); // and it settles
    } finally {
      db.prepare("UPDATE etesting_schedule SET registration_start = ?, registration_end = ?, registration_opens = ? WHERE term_id = '2/69'").run(before.registration_start, before.registration_end, before.registration_opens);
    }
  });

  it("never stop a student's own reminders being announced, even if the university's data is broken", async () => {
    const u = student("robust@test");
    sub(u, "th", "https://fcm.googleapis.com/fcm/send/robust");
    db.prepare("INSERT INTO reminders (user_id, kind, title, date, time) VALUES (?, 'reminder', 'Call work', '2026-11-20', '08:00')").run(u);
    const good = (db.prepare("SELECT central_closed FROM etesting_schedule WHERE term_id = '2/69'").get() as { central_closed: string }).central_closed;
    db.prepare("UPDATE etesting_schedule SET central_closed = 'not json' WHERE term_id = '2/69'").run();
    try {
      expect(await sendDuePushes(db, generateVapidKeys(), at("2026-11-20T08:02:00"), fake)).toBe(1);
    } finally {
      db.prepare("UPDATE etesting_schedule SET central_closed = ? WHERE term_id = '2/69'").run(good);
      db.prepare("DELETE FROM push_subscriptions WHERE user_id = ?").run(u);
    }
  });
});

describe("the calendar", () => {
  type Ev = { type: string; name_en: string | null; start_time?: string };
  const month = async (m: string) => (await (await fetch(`${base}/api/calendar?month=${m}`)).json()) as { events: Record<string, Ev[]> };
  const etesting = (days: Record<string, Ev[]>, iso: string) => (days[iso] ?? []).filter((e) => e.type === "etesting");

  it("shows the registration days, the first with its opening time", async () => {
    as = student("cal@test");
    const dec = (await month("2026-12")).events;
    for (const d of ["2026-12-21", "2026-12-22", "2026-12-23", "2026-12-24", "2026-12-25"]) {
      expect(etesting(dec, d).map((e) => e.name_en), d).toEqual(["e-Testing registration (E-SERVICE)"]);
    }
    expect(etesting(dec, "2026-12-21")[0].start_time).toBe("10:00");
    expect(etesting(dec, "2026-12-20")).toEqual([]);
    expect(etesting(dec, "2026-12-26")).toEqual([]);
  });

  it("marks the days the central centre tests, and not the days it is closed", async () => {
    as = student("cal2@test");
    const jan = (await month("2027-01")).events, feb = (await month("2027-02")).events, mar = (await month("2027-03")).events;
    expect(etesting(jan, "2027-01-11")).toEqual([]);
    expect(etesting(jan, "2027-01-12").map((e) => e.name_en)).toEqual(["e-Testing exam period"]);
    // Three periods on weekdays (to 17:30), four at weekends (to 20:30).
    expect((etesting(jan, "2027-01-12")[0] as Ev & { description: string }).description).toBe("09:00–17:30"); // a Tuesday
    expect((etesting(jan, "2027-01-16")[0] as Ev & { description: string }).description).toBe("09:00–20:30"); // a Saturday
    for (const d of ["2027-01-21", "2027-01-22", "2027-01-23", "2027-01-24", "2027-01-25", "2027-01-26"]) expect(etesting(jan, d), d).toEqual([]);
    expect(etesting(jan, "2027-01-20")).toHaveLength(1);
    expect(etesting(jan, "2027-01-27")).toHaveLength(1);
    for (const d of ["2027-02-20", "2027-02-21", "2027-02-22"]) expect(etesting(feb, d), d).toEqual([]);
    expect(etesting(feb, "2027-02-19")).toHaveLength(1);
    expect(etesting(feb, "2027-02-23")).toHaveLength(1);
    expect(etesting(mar, "2027-03-07")).toHaveLength(1);
    expect(etesting(mar, "2027-03-08")).toEqual([]);
    // 55 days from 12 Jan to 7 Mar, less 6 + 3 closed
    const all = [jan, feb, mar].flatMap((m) => Object.keys(m).filter((d) => etesting(m, d).length > 0));
    expect(all).toHaveLength(55 - 9);
  });

  it("shows no e-Testing to a student of another university", async () => {
    as = student("cal-other@test", "cu");
    const dec = (await month("2026-12")).events, jan = (await month("2027-01")).events;
    expect(Object.values(dec).flat().filter((e) => e.type === "etesting")).toEqual([]);
    expect(Object.values(jan).flat().filter((e) => e.type === "etesting")).toEqual([]);
  });
});
