/**
 * The private calendar feed (server/src/calendarFeed.ts): what it holds, that it follows the
 * iCalendar rules calendar apps rely on, and that only its secret address opens it.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { openDb, type DB } from "../src/db.js";
import { seedDatabase } from "../src/seed.js";
import { findOrCreateUser } from "../src/auth.js";
import { createCalendarFeedRouter, serveFeed, buildFeed, fold } from "../src/calendarFeed.js";

let db: DB;
let server: Server;
let base = "";
let as = "";
beforeAll(async () => {
  db = openDb(":memory:");
  seedDatabase(db, { reset: false });
  const app = express();
  app.use(express.json());
  app.get("/cal/:token.ics", serveFeed(db));
  app.use((req, _res, next) => { (req as unknown as { user: { id: string } }).user = { id: as }; next(); });
  app.use("/api", createCalendarFeedRouter(db));
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server?.close());

const student = (email: string, registered: string[], lang: "th" | "en" = "en") => {
  const id = findOrCreateUser(db, { email, name: email, avatar: "" });
  db.prepare("UPDATE user_profiles SET university_id = 'ru', program_id = 'bus-mkt', onboarded = 1, ui_lang = ? WHERE user_id = ?").run(lang, id);
  for (const c of registered) db.prepare("INSERT INTO plan_items (user_id, term_id, course_code) VALUES (?, '2/69', ?)").run(id, c);
  return id;
};
const pathOf = (url: string) => new URL(url).pathname;

describe("folding long lines", () => {
  it("keeps every line within 75 octets and never splits a Thai character", () => {
    const line = "SUMMARY:" + "ภาษาอังกฤษในชีวิตประจำวัน ".repeat(6);
    const folded = fold(line).split("\r\n");
    for (const l of folded) expect(Buffer.byteLength(l, "utf8")).toBeLessThanOrEqual(75);
    expect(folded.map((l, i) => (i ? l.slice(1) : l)).join("")).toBe(line);
  });
});

describe("what the feed holds (term 2/2569)", () => {
  const ics = () => {
    const u = student("feed@test", ["ACC1101", "MKT2101"]);
    db.prepare("INSERT INTO etesting_bookings (user_id, term_id, course_code, centre, date, period) VALUES (?, '2/69', 'MKT2101', 'central', '2027-01-14', 3)").run(u);
    return buildFeed(db, u, new Date("2026-11-15T12:00:00Z"));
  };
  let text = "", unfolded = "";
  beforeAll(() => { text = ics(); unfolded = text.replace(/\r\n /g, ""); });
  it("is a calendar with Bangkok's time zone, CRLF lines of at most 75 octets", () => {
    expect(text.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n")).toBe(true);
    expect(text).toContain("BEGIN:VTIMEZONE\r\nTZID:Asia/Bangkok");
    expect(text.endsWith("END:VCALENDAR\r\n")).toBe(true);
    for (const l of text.split("\r\n")) expect(Buffer.byteLength(l, "utf8")).toBeLessThanOrEqual(75);
  });
  it("has each class weekly, from the first class day to the day before the finals", () => {
    // ACC1101 on page 1 of the ม.ร.30: Thursday 08:30-11:00, KTB 201. Classes start Monday 16 Nov 2569.
    expect(unfolded).toContain("DTSTART;TZID=Asia/Bangkok:20261119T083000\r\nDTEND;TZID=Asia/Bangkok:20261119T110000\r\nRRULE:FREQ=WEEKLY;BYDAY=TH;UNTIL=20270308T165959Z");
    expect(unfolded).toContain("SUMMARY:ACC1101 Principles of Accounting 1");
    expect(unfolded).toContain("LOCATION:KTB 201");
  });
  it("has each final at its period's time", () => {
    expect(unfolded).toContain("DTSTART;TZID=Asia/Bangkok:20270315T093000\r\nDTEND;TZID=Asia/Bangkok:20270315T120000\r\nSUMMARY:Final ACC1101 Principles of Accounting 1 (period A)");
  });
  it("has the e-Testing registration days and her booking", () => {
    expect(unfolded).toContain("DTSTART;VALUE=DATE:20261221\r\nDTEND;VALUE=DATE:20261226\r\nSUMMARY:e-Testing registration (E-SERVICE) · opens 10:00\\, closes on the last day 21:30");
    expect(unfolded).toContain("DTSTART;TZID=Asia/Bangkok:20270114T150000\r\nDTEND;TZID=Asia/Bangkok:20270114T173000\r\nSUMMARY:e-Testing MKT2101");
  });
  it("marks every event with the site's address (so the phone does not read them back as busy)", () => {
    const events = unfolded.split("BEGIN:VEVENT").length - 1;
    expect((unfolded.match(/^URL:/gm) ?? []).length).toBe(events);
  });
  it("says where the exam room and seat are given", () => {
    expect(unfolded).toMatch(/SUMMARY:Final ACC1101[^\r]*\r\nDESCRIPTION:Room and seat: your exam timetable in e-Service http:\/\/e-service\.ru\.ac\.th\/search\/index\.php/);
  });
  it("shows a course's sections as free time, each named as one of them", () => {
    const u = student("sections@test", ["LAW2116"]);
    const law = buildFeed(db, u).replace(/\r\n /g, "");
    expect(law).toContain("(SEC. 1\\, one of 2 sections)");
    expect((law.match(/TRANSP:TRANSPARENT/g) ?? []).length).toBe(3); // two sections + the e-Testing registration days
  });
  it("gives every event a stable UID, the same on every fetch", () => {
    const uids = (s: string) => [...s.matchAll(/^UID:(.+)$/gm)].map((m) => m[1]);
    const u2 = student("feed2@test", ["ACC1101"]);
    expect(uids(buildFeed(db, u2, new Date("2026-11-15T00:00:00Z")))).toEqual(uids(buildFeed(db, u2, new Date("2026-12-01T00:00:00Z"))));
    expect(new Set(uids(unfolded)).size).toBe(uids(unfolded).length);
  });
  it("is written in Thai for a student who reads the app in Thai", () => {
    const u = student("feed-th@test", ["ACC1101"], "th");
    expect(buildFeed(db, u).replace(/\r\n /g, "")).toContain("SUMMARY:สอบไล่ ACC1101");
  });
});

describe("the secret address", () => {
  it("opens only with its token; turning it on again keeps it; a reset or turning it off empties the old one", async () => {
    as = student("addr@test", ["ACC1101"]);
    const on = (await (await fetch(`${base}/api/calendar-feed`, { method: "POST" })).json()) as { url: string };
    expect(on.url).toMatch(/\/cal\/[A-Za-z0-9_-]{32}\.ics$/);
    const first = await fetch(base + pathOf(on.url));
    expect(first.status).toBe(200);
    expect(first.headers.get("content-type")).toContain("text/calendar");
    expect(await first.text()).toContain("ACC1101");
    expect((await fetch(`${base}/cal/notarealtokennotarealtoken.ics`)).status).toBe(404);
    // "Turn on" again (say, after a failed check) never replaces a working address.
    const again = (await (await fetch(`${base}/api/calendar-feed`, { method: "POST" })).json()) as { url: string };
    expect(again.url).toBe(on.url);
    // Reset: a new address; the old one now answers an EMPTY calendar, so subscribed apps clear it.
    const reset = (await (await fetch(`${base}/api/calendar-feed/reset`, { method: "POST" })).json()) as { url: string };
    expect(reset.url).not.toBe(on.url);
    const old = await fetch(base + pathOf(on.url));
    expect(old.status).toBe(200);
    const oldBody = await old.text();
    expect(oldBody).toContain("BEGIN:VCALENDAR");
    expect(oldBody).not.toContain("BEGIN:VEVENT");
    expect(await (await fetch(base + pathOf(reset.url))).text()).toContain("ACC1101");
    await fetch(`${base}/api/calendar-feed`, { method: "DELETE" });
    expect(await (await fetch(base + pathOf(reset.url))).text()).not.toContain("BEGIN:VEVENT");
    expect(((await (await fetch(`${base}/api/calendar-feed`)).json()) as { url: string | null }).url).toBeNull();
    // The revoked addresses are kept only as hashes.
    const kept = db.prepare("SELECT token_hash FROM calendar_feeds_revoked").all() as { token_hash: string }[];
    expect(kept.some((k) => k.token_hash.includes(pathOf(on.url).slice(5, 15)))).toBe(false);
  });
  it("shows each student only her own courses", async () => {
    as = student("mine@test", ["MKT2101"]);
    const url = ((await (await fetch(`${base}/api/calendar-feed`, { method: "POST" })).json()) as { url: string }).url;
    const body = await (await fetch(base + pathOf(url))).text();
    expect(body).toContain("MKT2101");
    expect(body).not.toContain("ACC1101");
  });
});
