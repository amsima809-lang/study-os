/**
 * A student's private calendar feed (iCalendar, RFC 5545), for Google Calendar or the iPhone's
 * Calendar to subscribe to, so her term sits beside her work and family calendars:
 * - her classes this term, weekly, from the first day of classes to the day before the finals
 *   (a course taught in sections: each section, named);
 * - her finals (date and period as the registrar prints them; a faculty-arranged exam has no date);
 * - the e-Testing registration days, and the e-Testing exams she recorded as booked.
 * Only what the university published for her courses and her own bookings: no notes, no
 * reminders. The address carries a random token (a calendar app cannot sign in); she can reset it
 * or turn it off. Written in the language she reads the app in (user_profiles.ui_lang).
 */
import { createHash, randomBytes } from "node:crypto";
import { Router } from "express";
import type { DB } from "./db.js";
import { env } from "./env.js";
import { getSetting, termCourses } from "./api.js";
import { courseExams, termExamWindows } from "./termExams.js";
import { myExams } from "./myExams.js";
import { ETESTING_PERIODS } from "./etestingBookings.js";
import { EXAM_PERIODS } from "./termSchedule.js";
import { APP_NAME, APP_NAME_TH } from "./brand.js";

type Lang = "th" | "en";

/** Text as iCalendar wants it: backslash, semicolon, comma and newline escaped. */
const esc = (s: string) => s.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
/** Lines longer than 75 octets are folded: a CRLF and one space (RFC 5545 3.1), never inside a UTF-8 character. */
export function fold(line: string): string {
  const bytes = Buffer.from(line, "utf8");
  if (bytes.length <= 75) return line;
  const parts: string[] = [];
  let cur = "", size = 0, limit = 75;
  for (const ch of line) {
    const n = Buffer.byteLength(ch, "utf8");
    if (size + n > limit) { parts.push(cur); cur = ""; size = 0; limit = 74; } // later lines start with a space
    cur += ch; size += n;
  }
  parts.push(cur);
  return parts.join("\r\n ");
}
const ymd = (iso: string) => iso.replace(/-/g, "");
const hms = (hhmm: string) => `${hhmm.replace(":", "")}00`;
const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const weekdayOf = (iso: string) => ((new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7) + 1; // 1 = Monday
const RRULE_DAY = ["", "MO", "TU", "WE", "TH", "FR", "SA", "SU"];

/** Where her own exam timetable (rooms and seats) is: the registrar's e-Service (client/src/ruLinks.ts). */
const EXAM_TIMETABLE = "http://e-service.ru.ac.th/search/index.php";
const WORDS = {
  th: { calendar: `${APP_NAME_TH} · ภาคเรียน`, finalNote: `ห้องและที่นั่งสอบ: ตารางสอบไล่ของคุณใน e-Service ${EXAM_TIMETABLE}`, oneOf: "ตอนเรียนหนึ่งใน {n} ตอน", final: "สอบไล่", period: "ช่วง", seat: "ห้องและที่นั่ง", own: "สอบ (วันที่คุณบันทึก)", etBooked: "สอบ e-Testing", etPeriod: "คาบ", etReg: "ลงทะเบียนสอบ e-Testing (E-SERVICE)", opens: "เปิด", closes: "ปิดวันสุดท้าย", huamak: "หัวหมาก", regional: "ศูนย์ส่วนภูมิภาค" },
  en: { calendar: `${APP_NAME} · this term`, finalNote: `Room and seat: your exam timetable in e-Service ${EXAM_TIMETABLE}`, oneOf: "one of {n} sections", final: "Final", period: "period", seat: "Room and seat", own: "Exam (the date you entered)", etBooked: "e-Testing", etPeriod: "period", etReg: "e-Testing registration (E-SERVICE)", opens: "opens", closes: "closes on the last day", huamak: "Hua Mak", regional: "regional centre" },
};

/** The feed for one student, as iCalendar text. `now` stamps it (DTSTAMP). */
export function buildFeed(db: DB, userId: string, now = new Date()): string {
  const term = getSetting(db, "current_term_id", "2/69");
  const lang: Lang = ((db.prepare("SELECT ui_lang FROM user_profiles WHERE user_id = ?").get(userId) as { ui_lang: Lang | null } | undefined)?.ui_lang) ?? "th";
  const w = WORDS[lang];
  const ru = (db.prepare("SELECT university_id FROM user_profiles WHERE user_id = ?").get(userId) as { university_id: string | null } | undefined)?.university_id === "ru";
  const stamp = `${now.toISOString().replace(/[-:]/g, "").slice(0, 15)}Z`;
  const codes = termCourses(db, userId, term);
  const names = new Map((codes.length ? db.prepare(`SELECT code, name_th, name_en FROM courses WHERE code IN (${codes.map(() => "?").join(",")})`).all(...codes) as { code: string; name_th: string; name_en: string | null }[] : [])
    .map((c) => [c.code, lang === "en" && c.name_en ? c.name_en : c.name_th]));
  const title = (code: string) => `${code} ${names.get(code) ?? ""}`.trim();
  const windows = termExamWindows(db, term);
  const termId = term.replace("/", "-");
  const events: string[][] = [];
  // Every event carries the site's address: the iPhone app's busy-time reader leaves out events
  // that do (AppCalendar.swift), so her classes are never read back as her own busy time.
  const site = `${env.appUrl.replace(/\/$/, "")}/`;
  const event = (uid: string, lines: string[]) => events.push(["BEGIN:VEVENT", `UID:${uid}@termtrail`, `DTSTAMP:${stamp}`, ...lines, `URL:${site}`, "END:VEVENT"]);
  const short = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 8);

  // Classes: weekly, inside the teaching weeks.
  const lastClassDay = windows.finals ? addDays(windows.finals.from, -1) : null;
  if (windows.term_start && lastClassDay && codes.length) {
    const sessions = db.prepare(
      `SELECT course_code, weekday, start_time, end_time, room, kind FROM class_sessions
       WHERE term_id = ? AND course_code IN (${codes.map(() => "?").join(",")}) AND weekday IS NOT NULL ORDER BY course_code, weekday, start_time`,
    ).all(term, ...codes) as { course_code: string; weekday: number; start_time: string; end_time: string; room: string | null; kind: string | null }[];
    // A course taught in sections ("SEC. 1", "SEC. 2"): she attends one, so each is shown as free
    // time ("one of 2 sections") rather than blocking every section's hours in her calendar.
    const sectionsOf = (code: string) => new Set(sessions.filter((x) => x.course_code === code && x.kind && /^SEC\b/i.test(x.kind)).map((x) => x.kind));
    for (const s of sessions) {
      // The first day on or after the first day of classes that falls on this weekday.
      let first = windows.term_start;
      while (weekdayOf(first) !== s.weekday) first = addDays(first, 1);
      if (first > lastClassDay) continue;
      const n = sectionsOf(s.course_code).size;
      const section = s.kind && /^SEC\b/i.test(s.kind) ? (n > 1 ? ` (${s.kind}, ${w.oneOf.replace("{n}", String(n))})` : ` (${s.kind})`) : "";
      // Stable, and unique even for two meetings of a course on the same day and time (sections, rooms).
      event(`class-${termId}-${s.course_code}-${s.weekday}-${s.start_time.replace(":", "")}-${short(`${s.kind ?? ""}|${s.room ?? ""}|${s.end_time}`)}`, [
        `DTSTART;TZID=Asia/Bangkok:${ymd(first)}T${hms(s.start_time)}`,
        `DTEND;TZID=Asia/Bangkok:${ymd(first)}T${hms(s.end_time)}`,
        // UNTIL in UTC: the end of the last class day in Bangkok (16:59:59 UTC).
        `RRULE:FREQ=WEEKLY;BYDAY=${RRULE_DAY[s.weekday]};UNTIL=${ymd(lastClassDay)}T165959Z`,
        `SUMMARY:${esc(title(s.course_code) + section)}`,
        ...(s.room ? [`LOCATION:${esc(s.room)}`] : []),
        ...(n > 1 ? ["TRANSP:TRANSPARENT"] : []),
      ]);
    }
  }

  // Finals, as printed; a faculty-arranged exam only once she has entered its date (myExams.ts).
  const exams = courseExams(db, term, codes);
  const mine = new Map(myExams(db, userId, term).map((m) => [m.course_code, m]));
  for (const m of mine.values()) {
    if (!m.own) continue;
    const timed = m.own.start && m.own.end;
    event(`own-${termId}-${m.course_code}`, [
      ...(timed
        ? [`DTSTART;TZID=Asia/Bangkok:${ymd(m.own.date)}T${hms(m.own.start!)}`, `DTEND;TZID=Asia/Bangkok:${ymd(m.own.date)}T${hms(m.own.end!)}`]
        : [`DTSTART;VALUE=DATE:${ymd(m.own.date)}`, `DTEND;VALUE=DATE:${ymd(addDays(m.own.date, 1))}`]),
      `SUMMARY:${esc(`${w.own} ${title(m.course_code)}`)}`,
      ...(m.seat ? [`DESCRIPTION:${esc(`${w.seat}: ${m.seat}`)}`] : []),
    ]);
  }
  for (const code of codes) {
    const e = exams[code];
    if (!e?.exam_date || !e.exam_slot) continue;
    const p = EXAM_PERIODS[e.exam_slot];
    event(`final-${termId}-${code}`, [
      `DTSTART;TZID=Asia/Bangkok:${ymd(e.exam_date)}T${hms(p.start)}`,
      `DTEND;TZID=Asia/Bangkok:${ymd(e.exam_date)}T${hms(p.end)}`,
      `SUMMARY:${esc(`${w.final} ${title(code)} (${w.period} ${e.exam_slot})`)}`,
      `DESCRIPTION:${esc(mine.get(code)?.seat ? `${w.seat}: ${mine.get(code)!.seat}` : w.finalNote)}`,
    ]);
  }

  if (ru) {
    // e-Testing registration, as all-day events over the days it is open.
    const et = windows.etesting;
    if (et) {
      const hours = [et.registration_opens ? `${w.opens} ${et.registration_opens}` : "", et.registration_closes ? `${w.closes} ${et.registration_closes}` : ""].filter(Boolean).join(", ");
      event(`etesting-registration-${termId}`, [
        `DTSTART;VALUE=DATE:${ymd(et.registration_start)}`,
        `DTEND;VALUE=DATE:${ymd(addDays(et.registration_end, 1))}`,
        `SUMMARY:${esc(w.etReg + (hours ? ` · ${hours}` : ""))}`,
        "TRANSP:TRANSPARENT",
      ]);
    }
    // Her own e-Testing bookings, for courses she is still registered in.
    const booked = db.prepare(
      `SELECT b.course_code, b.date, b.period, b.centre FROM etesting_bookings b
       JOIN plan_items pi ON pi.user_id = b.user_id AND pi.term_id = b.term_id AND pi.course_code = b.course_code
       WHERE b.user_id = ? AND b.term_id = ?`,
    ).all(userId, term) as { course_code: string; date: string; period: 1 | 2 | 3 | 4; centre: string }[];
    for (const b of booked) {
      const [from, to] = ETESTING_PERIODS[b.period];
      event(`etesting-${termId}-${b.course_code}`, [
        `DTSTART;TZID=Asia/Bangkok:${ymd(b.date)}T${hms(from)}`,
        `DTEND;TZID=Asia/Bangkok:${ymd(b.date)}T${hms(to)}`,
        `SUMMARY:${esc(`${w.etBooked} ${title(b.course_code)} (${w.etPeriod} ${b.period})`)}`,
        `LOCATION:${esc(b.centre === "central" ? w.huamak : w.regional)}`,
      ]);
    }
  }

  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Termtrail//Term feed//TH", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    `X-WR-CALNAME:${esc(w.calendar)}`, "X-WR-TIMEZONE:Asia/Bangkok",
    // Bangkok keeps +07:00 all year.
    "BEGIN:VTIMEZONE", "TZID:Asia/Bangkok", "BEGIN:STANDARD", "DTSTART:19700101T000000", "TZOFFSETFROM:+0700", "TZOFFSETTO:+0700", "TZNAME:ICT", "END:STANDARD", "END:VTIMEZONE",
    ...events.flat(),
    "END:VCALENDAR",
  ];
  return lines.map(fold).join("\r\n") + "\r\n";
}

const feedUrl = (token: string) => `${env.appUrl.replace(/\/$/, "")}/cal/${token}.ics`;
const hashOf = (token: string) => createHash("sha256").update(token).digest("hex");
/** An empty calendar, for an address she reset or turned off: subscribed apps clear their copy. */
export function emptyFeed(): string {
  return ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Termtrail//Term feed//TH", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", `X-WR-CALNAME:${esc(APP_NAME)}`, "END:VCALENDAR"].join("\r\n") + "\r\n";
}

/** The routes she manages her feed with (signed in). */
export function createCalendarFeedRouter(db: DB): Router {
  const router = Router();
  const current = (userId: string) => (db.prepare("SELECT token FROM calendar_feeds WHERE user_id = ?").get(userId) as { token: string } | undefined)?.token ?? null;
  router.get("/calendar-feed", (req, res) => {
    const t = current(req.user!.id);
    res.json({ url: t ? feedUrl(t) : null });
  });
  const revoke = (userId: string) => {
    const old = current(userId);
    if (old) db.prepare("INSERT OR REPLACE INTO calendar_feeds_revoked (token_hash, revoked_at) VALUES (?, datetime('now'))").run(hashOf(old));
  };
  // Turn it on. If it is on already, the same address: a tap here never breaks a subscription.
  router.post("/calendar-feed", (req, res) => {
    const existing = current(req.user!.id);
    if (existing) return res.json({ url: feedUrl(existing) });
    const token = randomBytes(24).toString("base64url");
    db.prepare("INSERT INTO calendar_feeds (user_id, token) VALUES (?, ?)").run(req.user!.id, token);
    res.json({ url: feedUrl(token) });
  });
  // A new address; the old one answers with an empty calendar from now on.
  router.post("/calendar-feed/reset", (req, res) => {
    const token = randomBytes(24).toString("base64url");
    db.transaction(() => {
      revoke(req.user!.id);
      db.prepare("INSERT INTO calendar_feeds (user_id, token) VALUES (?, ?) ON CONFLICT (user_id) DO UPDATE SET token = excluded.token, created_at = datetime('now')").run(req.user!.id, token);
    })();
    res.json({ url: feedUrl(token) });
  });
  router.delete("/calendar-feed", (req, res) => {
    db.transaction(() => {
      revoke(req.user!.id);
      db.prepare("DELETE FROM calendar_feeds WHERE user_id = ?").run(req.user!.id);
    })();
    res.json({ url: null });
  });
  return router;
}

/** The feed itself, for calendar apps (no sign-in: the token is the key). */
export function serveFeed(db: DB) {
  return (req: import("express").Request, res: import("express").Response) => {
    const token = String(req.params.token ?? "");
    // Calendar apps turn webcal:// into http://. Send them on to https, so later refreshes carry
    // the secret address encrypted (the site's own https address, APP_URL).
    if (env.nodeEnv === "production" && req.protocol === "http" && env.appUrl.startsWith("https://")) {
      return res.redirect(301, `${env.appUrl.replace(/\/$/, "")}/cal/${encodeURIComponent(token)}.ics`);
    }
    const row = /^[A-Za-z0-9_-]{20,64}$/.test(token)
      ? (db.prepare("SELECT user_id FROM calendar_feeds WHERE token = ?").get(token) as { user_id: string } | undefined)
      : undefined;
    if (!row) {
      // An address she reset or turned off (in the last 180 days): empty, so calendars clear it.
      const revoked = /^[A-Za-z0-9_-]{20,64}$/.test(token) && db.prepare("SELECT 1 FROM calendar_feeds_revoked WHERE token_hash = ? AND revoked_at > datetime('now', '-180 days')").get(hashOf(token));
      if (!revoked) return res.status(404).type("text/plain").send("not found");
      res.set("Content-Type", "text/calendar; charset=utf-8");
      return res.send(emptyFeed());
    }
    res.set("Content-Type", "text/calendar; charset=utf-8");
    res.set("Cache-Control", "private, max-age=900");
    res.send(buildFeed(db, row.user_id));
  };
}
