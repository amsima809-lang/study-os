/**
 * Recording e-Testing bookings (migration 041, server/src/etestingBookings.ts): only what the
 * e-Testing office's rules allow, and shown on the calendar apart from the days not booked.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { openDb, type DB } from "../src/db.js";
import { seedDatabase } from "../src/seed.js";
import { findOrCreateUser } from "../src/auth.js";
import { createEtestingRouter, testingDays, periodsOn } from "../src/etestingBookings.js";
import { createApiRouter } from "../src/api.js";

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
  app.use("/api", createEtestingRouter(db));
  app.use("/api", createApiRouter(db));
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server?.close());

const student = (email: string, registered: string[]) => {
  const id = findOrCreateUser(db, { email, name: email, avatar: "" });
  db.prepare("UPDATE user_profiles SET university_id = 'ru', program_id = 'bus-mkt', onboarded = 1 WHERE user_id = ?").run(id);
  for (const c of registered) db.prepare("INSERT INTO plan_items (user_id, term_id, course_code) VALUES (?, '2/69', ?)").run(id, c);
  return id;
};
const book = async (code: string, body: { centre: string; date: string; period: number }) => {
  const r = await fetch(`${base}/api/etesting/bookings/${code}`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
  return { status: r.status, body: (await r.json()) as { code?: string; bookings?: { course_code: string; date: string; period: number }[] } };
};

describe("the days and periods each centre tests (2/2569)", () => {
  const s = () => db.prepare("SELECT exam_start, exam_end, central_closed, regional_dates FROM etesting_schedule WHERE term_id = '2/69'").get() as never;
  it("central: every day 12 Jan - 7 Mar 2570 except 21-26 Jan and 20-22 Feb", () => {
    const days = testingDays(s(), "central");
    expect(days).toHaveLength(55 - 9);
    expect(days[0]).toBe("2027-01-12");
    expect(days.at(-1)).toBe("2027-03-07");
    expect(days).not.toContain("2027-01-21");
    expect(days).not.toContain("2027-02-22");
    expect(days).toContain("2027-01-27");
  });
  it("regional: only its 22 listed days", () => {
    const days = testingDays(s(), "regional");
    expect(days).toHaveLength(22);
    expect(days[0]).toBe("2027-01-09"); // before Hua Mak opens on the 12th
    expect(days).toContain("2027-01-10");
    expect(days).not.toContain("2027-01-12");
  });
  it("three periods on weekdays, four at weekends", () => {
    expect(periodsOn("2027-01-12")).toEqual([1, 2, 3]); // Tuesday
    expect(periodsOn("2027-01-16")).toEqual([1, 2, 3, 4]); // Saturday
  });
});

describe("recording a booking", () => {
  it("is refused for a course she is not registered in, or one not on the e-Testing list", async () => {
    as = student("b1@test", ["ACC1101", "MKT2101"]);
    expect((await book("RAM1131", { centre: "central", date: "2027-01-12", period: 1 })).body.code).toBe("NOT_REGISTERED");
    expect((await book("ACC1101", { centre: "central", date: "2027-01-12", period: 1 })).body.code).toBe("NOT_ON_LIST");
  });

  it("is refused on a day the centre does not test, or in a period that day does not have", async () => {
    as = student("b2@test", ["MKT2101"]);
    expect((await book("MKT2101", { centre: "central", date: "2027-01-22", period: 1 })).body.code).toBe("NOT_A_TESTING_DAY"); // closed
    expect((await book("MKT2101", { centre: "central", date: "2027-03-08", period: 1 })).body.code).toBe("NOT_A_TESTING_DAY"); // after the window
    expect((await book("MKT2101", { centre: "regional", date: "2027-01-12", period: 1 })).body.code).toBe("NOT_A_TESTING_DAY"); // not a regional day
    expect((await book("MKT2101", { centre: "central", date: "2027-01-12", period: 4 })).body.code).toBe("NO_SUCH_PERIOD"); // Tuesday evening
    expect((await book("MKT2101", { centre: "central", date: "2027-01-16", period: 4 })).status).toBe(200); // Saturday evening
    expect((await book("MKT2101", { centre: "regional", date: "2027-01-09", period: 2 })).status).toBe(200); // a regional day: replaces the booking
  });

  it("allows one course per period, and moving her own booking", async () => {
    as = student("b3@test", ["MKT2101", "RAM1131"]);
    expect((await book("MKT2101", { centre: "central", date: "2027-01-13", period: 2 })).status).toBe(200);
    expect((await book("RAM1131", { centre: "central", date: "2027-01-13", period: 2 })).body.code).toBe("PERIOD_TAKEN");
    expect((await book("RAM1131", { centre: "central", date: "2027-01-13", period: 3 })).status).toBe(200);
    const moved = await book("MKT2101", { centre: "central", date: "2027-01-13", period: 2 }); // the same, saved again
    expect(moved.status).toBe(200);
    expect(moved.body.bookings!.map((b) => [b.course_code, b.date, b.period])).toEqual([["MKT2101", "2027-01-13", 2], ["RAM1131", "2027-01-13", 3]]);
  });

  it("shows on the calendar as booked, with its period's hours, apart from the e-Testing days", async () => {
    as = student("b4@test", ["MKT2101"]);
    await book("MKT2101", { centre: "central", date: "2027-01-14", period: 3 });
    const jan = ((await (await fetch(`${base}/api/calendar?month=2027-01`)).json()) as { events: Record<string, { type: string; course_code: string; start_time?: string; end_time?: string }[]> }).events;
    expect(jan["2027-01-14"].filter((e) => e.type === "etbooked")).toEqual([expect.objectContaining({ course_code: "MKT2101", start_time: "15:00", end_time: "17:30" })]);
    expect(jan["2027-01-14"].filter((e) => e.type === "etesting")).toHaveLength(1); // the day itself still marked, quietly
    expect(jan["2027-01-15"].filter((e) => e.type === "etbooked")).toEqual([]);
    // and goes when removed
    await fetch(`${base}/api/etesting/bookings/MKT2101`, { method: "DELETE" });
    const after = ((await (await fetch(`${base}/api/calendar?month=2027-01`)).json()) as { events: Record<string, { type: string }[]> }).events;
    expect(after["2027-01-14"].filter((e) => e.type === "etbooked")).toEqual([]);
  });

  it("accepts Sunday's period 4, and the same period on another day", async () => {
    as = student("b6@test", ["MKT2101", "RAM1131"]);
    expect((await book("MKT2101", { centre: "central", date: "2027-01-17", period: 4 })).status).toBe(200); // a Sunday
    expect((await book("RAM1131", { centre: "central", date: "2027-01-18", period: 4 })).body.code).toBe("NO_SUCH_PERIOD"); // Monday
    expect((await book("RAM1131", { centre: "central", date: "2027-01-16", period: 4 })).status).toBe(200); // Saturday, same period, another day
  });

  it("shows each period's own hours on the calendar", async () => {
    as = student("b7@test", ["MKT2101", "RAM1131", "MKT2205"]);
    await book("MKT2101", { centre: "central", date: "2027-01-16", period: 1 });
    await book("RAM1131", { centre: "central", date: "2027-01-16", period: 2 });
    const jan = ((await (await fetch(`${base}/api/calendar?month=2027-01`)).json()) as { events: Record<string, { type: string; course_code: string; start_time?: string; end_time?: string }[]> }).events;
    const booked = jan["2027-01-16"].filter((e) => e.type === "etbooked").map((e) => [e.course_code, e.start_time, e.end_time]);
    expect(booked).toEqual(expect.arrayContaining([["MKT2101", "09:00", "11:30"], ["RAM1131", "12:00", "14:30"]]));
  });

  it("never shows one student's bookings to another, nor to a student of another university", async () => {
    as = student("b8@test", ["MKT2101"]);
    await book("MKT2101", { centre: "central", date: "2027-01-19", period: 1 });
    as = student("b9@test", ["MKT2101"]);
    const jan = ((await (await fetch(`${base}/api/calendar?month=2027-01`)).json()) as { events: Record<string, { type: string }[]> }).events;
    expect(Object.values(jan).flat().filter((e) => e.type === "etbooked")).toEqual([]);
    const other = findOrCreateUser(db, { email: "b10@test", name: "x", avatar: "" });
    db.prepare("UPDATE user_profiles SET university_id = 'cu' WHERE user_id = ?").run(other);
    as = other;
    const jan2 = ((await (await fetch(`${base}/api/calendar?month=2027-01`)).json()) as { events: Record<string, { type: string }[]> }).events;
    expect(Object.values(jan2).flat().filter((e) => e.type === "etbooked" || e.type === "etesting")).toEqual([]);
  });

  it("drops a booking from the calendar once she unregisters the course (it stays listed so she can remove it)", async () => {
    as = student("b11@test", ["MKT2101"]);
    await book("MKT2101", { centre: "central", date: "2027-01-20", period: 2 });
    db.prepare("DELETE FROM plan_items WHERE user_id = ? AND course_code = 'MKT2101'").run(as);
    const jan = ((await (await fetch(`${base}/api/calendar?month=2027-01`)).json()) as { events: Record<string, { type: string }[]> }).events;
    expect((jan["2027-01-20"] ?? []).filter((e) => e.type === "etbooked")).toEqual([]);
    const list = (await (await fetch(`${base}/api/etesting/bookings`)).json()) as { bookings: { course_code: string }[] };
    expect(list.bookings.map((b) => b.course_code)).toEqual(["MKT2101"]);
  });

  it("lists the days each centre tests and the periods, for the form", async () => {
    as = student("b5@test", []);
    const r = (await (await fetch(`${base}/api/etesting/bookings`)).json()) as { days: { central: string[]; regional: string[] }; periods: Record<string, string[]> };
    expect(r.days.central).toHaveLength(46);
    expect(r.days.regional).toHaveLength(22);
    expect(r.periods["4"]).toEqual(["18:00", "20:30"]);
  });
});
