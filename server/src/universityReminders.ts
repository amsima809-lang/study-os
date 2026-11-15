/**
 * Reminders the app puts in a Ramkhamhaeng student's own list from the university's dates, so
 * a key date is never missed: e-Testing registration (etesting_schedule, migration 040),
 * announced a week before, when it opens, and on its last day; and, from her own courses this
 * term (examReminders, owner 2026-11-15), the evening before each of her exams, a week before the
 * finals to look up her room and seat, and four weeks before them to ask for time off work.
 *
 * They are ordinary reminders (Today, the Reminders screen, the calendar, the in-app banner
 * and phone notifications all show them), each made once per student: `reminder_sources`
 * remembers it, so one she deletes is never put back. They are written in her language; when
 * she switches language, the ones she has not edited follow.
 */
import type { DB } from "./db.js";
import { myExams } from "./myExams.js";
import { APP_NAME } from "./brand.js";

type Lang = "th" | "en";
type Text = Record<Lang, string>;
export type UniversityReminder = { key: string; date: string; time: string; title: Text; note: Text };

type Schedule = {
  term_id: string; registration_start: string; registration_end: string; registration_opens: string | null; registration_closes: string | null;
  payment_deadline: string | null; exam_start: string; exam_end: string; central_closed: string | null; regional_dates: string | null;
};

/** Today's date in Bangkok. */
const bangkokDate = (now: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok" }).format(now);
/** "2026-12-21" in the student's language: "21 ธ.ค. 2569" / "21 Dec 2026" (the screens' own rule, client/src/format.ts). */
function day(iso: string, lang: Lang, year = true): string {
  return new Intl.DateTimeFormat(lang === "th" ? "th-TH-u-ca-buddhist" : "en-GB", {
    day: "numeric", month: "short", ...(year ? { year: "numeric" } : {}), timeZone: "UTC",
  }).format(new Date(`${iso}T00:00:00Z`));
}
/** "21–25 ธ.ค. 2569" within a month, "12 ม.ค.–7 มี.ค. 2570" across months. */
const span = (from: string, to: string, lang: Lang, year = true) =>
  from === to ? day(from, lang, year)
    : from.slice(0, 7) === to.slice(0, 7) ? `${Number(from.slice(8))}–${day(to, lang, year)}`
      : `${day(from, lang, false)}–${day(to, lang, year)}`;
const addDays = (iso: string, n: number) => { const d = new Date(`${iso}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
/** "2/69" -> "2/2569" */
const termName = (id: string) => { const [k, yy] = id.split("/"); return `${k}/25${yy}`; };

/** The university's reminders for every term with an e-Testing schedule. */
export function universityReminders(db: DB): UniversityReminder[] {
  const rows = db.prepare(
    `SELECT term_id, registration_start, registration_end, registration_opens, registration_closes, payment_deadline,
            exam_start, exam_end, central_closed, regional_dates FROM etesting_schedule ORDER BY registration_start`,
  ).all() as Schedule[];
  const out: UniversityReminder[] = [];
  for (const s of rows) {
    const term = termName(s.term_id);
    const opens = s.registration_opens ?? "09:00";
    const fees = db.prepare("SELECT MIN(fee_central) AS central, MIN(fee_regional) AS regional FROM etesting_courses WHERE term_id = ?").get(s.term_id) as { central: number | null; regional: number | null };
    const closed = (s.central_closed ? JSON.parse(s.central_closed) : []) as [string, string][];
    const regional = s.regional_dates ? (JSON.parse(s.regional_dates) as string[]).length > 0 : false;
    const hours: Text = { th: "", en: "" };
    if (s.registration_opens) { hours.th = `เปิด ${opens} น.`; hours.en = `opens ${opens}`; }
    if (s.registration_closes) {
      hours.th = [hours.th, `ปิดวันสุดท้าย ${s.registration_closes} น.`].filter(Boolean).join(" ");
      hours.en = [hours.en, `closes ${s.registration_closes} on the last day`].filter(Boolean).join(", ");
    }
    const note: Text = {
      th: [
        `ลงทะเบียน ${span(s.registration_start, s.registration_end, "th")} ทาง E-SERVICE${hours.th ? ` (${hours.th})` : ""}`,
        s.payment_deadline ? `ชำระเงินภายใน ${s.payment_deadline} น. ของวันที่ลงทะเบียน` : "",
        `สอบที่หัวหมาก ${span(s.exam_start, s.exam_end, "th")}${closed.length ? ` (เว้น ${closed.map(([a, b]) => span(a, b, "th", false)).join(" และ ")})` : ""}`,
        regional ? "ศูนย์สอบส่วนภูมิภาคเปิดเฉพาะบางวัน" : "",
        fees.central ? `ค่าสอบวิชาละ ${fees.central} บาท (ศูนย์ส่วนกลาง)${fees.regional ? ` / ${fees.regional} บาท (ส่วนภูมิภาค)` : ""}` : "",
        "ดูรายวิชาและรายละเอียดได้ที่ easi.ru.ac.th",
      ].filter(Boolean).join(" · "),
      en: [
        `Register ${span(s.registration_start, s.registration_end, "en")} in E-SERVICE${hours.en ? ` (${hours.en})` : ""}`,
        s.payment_deadline ? `pay by ${s.payment_deadline} the day you register` : "",
        `exams at Hua Mak ${span(s.exam_start, s.exam_end, "en")}${closed.length ? ` (not ${closed.map(([a, b]) => span(a, b, "en", false)).join(" or ")})` : ""}`,
        regional ? "regional centres test on set days only" : "",
        fees.central ? `fee ${fees.central} baht a course (central centre)${fees.regional ? `, ${fees.regional} baht (regional)` : ""}` : "",
        "courses and details: easi.ru.ac.th",
      ].filter(Boolean).join(" · "),
    };
    out.push(
      {
        key: `etesting:${s.term_id}:week`, date: addDays(s.registration_start, -7), time: "09:00", note,
        title: { th: `อีก 1 สัปดาห์ เปิดลงทะเบียนสอบ e-Testing ภาค ${term}`, en: `e-Testing registration for term ${term} opens in a week` },
      },
      {
        key: `etesting:${s.term_id}:open`, date: s.registration_start, time: opens, note,
        title: { th: `เปิดลงทะเบียนสอบ e-Testing ภาค ${term} แล้ว`, en: `e-Testing registration for term ${term} is open` },
      },
      {
        key: `etesting:${s.term_id}:last`, date: s.registration_end, time: "09:00", note,
        title: { th: `วันสุดท้ายลงทะเบียนสอบ e-Testing ภาค ${term}`, en: `Last day to register for e-Testing, term ${term}` },
      },
    );
  }
  return out;
}

/** Her own: these follow her courses, so one she no longer needs (a dropped course) is taken away. */
const PERSONAL = /^(final|etbooked|own|seat|leave):/;
/** The evening before an exam: time to pack and sleep. */
const EVE = "19:00";
const ETEST_PERIOD_TH: Record<number, string> = { 1: "รอบ 1", 2: "รอบ 2", 3: "รอบ 3", 4: "รอบ 4" };

/**
 * Reminders from her own exams this term (myExams.ts): the evening before each final, each booked
 * e-Test and each faculty-arranged exam she dated; a week before her first final, to look up her
 * room and seat in e-Service (it is there about a week before: the registrar's 2569 handbook);
 * four weeks before it, to ask for time off for every exam day (the primary user works).
 */
export function examReminders(db: DB, userId: string, today: string): UniversityReminder[] {
  const term = (db.prepare("SELECT value FROM settings WHERE key = 'current_term_id'").get() as { value: string } | undefined)?.value ?? "2/69";
  const exams = myExams(db, userId, term, today);
  const out: UniversityReminder[] = [];
  const where: Text = { th: "ดูห้องและที่นั่งในตารางสอบของคุณที่ e-service.ru.ac.th", en: "your room and seat: your exam timetable at e-service.ru.ac.th" };
  for (const e of exams) {
    const seat: Text = e.seat ? { th: `ห้องและที่นั่ง: ${e.seat}`, en: `room and seat: ${e.seat}` } : where;
    if (e.final) {
      out.push({
        key: `final:${term}:${e.course_code}`, date: addDays(e.final.date, -1), time: EVE,
        title: { th: `พรุ่งนี้สอบไล่ ${e.course_code}`, en: `Final tomorrow: ${e.course_code}` },
        note: {
          th: `${day(e.final.date, "th")}${e.final.slot ? ` ช่วง ${e.final.slot}` : ""} ${e.final.start}–${e.final.end} น. · ${seat.th}${e.booking ? " · ถ้าสอบ e-Testing วิชานี้ผ่านแล้ว ไม่ต้องสอบไล่" : ""}`,
          en: `${day(e.final.date, "en")}${e.final.slot ? `, period ${e.final.slot}` : ""}, ${e.final.start}–${e.final.end} · ${seat.en}${e.booking ? " · if you passed this course's e-Testing, there is no final" : ""}`,
        },
      });
    }
    if (e.booking) {
      out.push({
        key: `etbooked:${term}:${e.course_code}`, date: addDays(e.booking.date, -1), time: EVE,
        title: { th: `พรุ่งนี้สอบ e-Testing ${e.course_code}`, en: `e-Testing tomorrow: ${e.course_code}` },
        note: {
          th: `${day(e.booking.date, "th")} ${ETEST_PERIOD_TH[e.booking.period]} ${e.booking.start}–${e.booking.end} น. · ${e.booking.centre === "central" ? "ศูนย์สอบส่วนกลาง" : "ศูนย์สอบส่วนภูมิภาค"}`,
          en: `${day(e.booking.date, "en")}, period ${e.booking.period}, ${e.booking.start}–${e.booking.end} · ${e.booking.centre === "central" ? "central centre" : "regional centre"}`,
        },
      });
    }
    if (e.own) {
      const time = e.own.start && e.own.end ? ` ${e.own.start}–${e.own.end}` : "";
      out.push({
        key: `own:${term}:${e.course_code}`, date: addDays(e.own.date, -1), time: EVE,
        title: { th: `พรุ่งนี้สอบ ${e.course_code}`, en: `Exam tomorrow: ${e.course_code}` },
        note: { th: `${day(e.own.date, "th")}${time}${time ? " น." : ""} (วันที่คุณบันทึก) · ${seat.th}`, en: `${day(e.own.date, "en")}${time} (the date you entered) · ${seat.en}` },
      });
    }
  }
  const finals = exams.filter((e) => e.final).sort((a, b) => a.final!.date.localeCompare(b.final!.date) || a.final!.start.localeCompare(b.final!.start));
  if (finals.length > 0) {
    const first = finals[0].final!.date;
    out.push({
      key: `seat:${term}`, date: addDays(first, -7), time: "09:00",
      title: { th: "ดูห้องสอบและที่นั่งของคุณ", en: "Look up your exam rooms and seats" },
      note: {
        th: `ตารางสอบไล่รายบุคคลจะขึ้นใน e-Service ประมาณหนึ่งสัปดาห์ก่อนสอบ: e-service.ru.ac.th · บันทึกไว้ในหน้าสอบของ {app} ได้`,
        en: `Your own exam timetable is in e-Service about a week before the finals: e-service.ru.ac.th · you can keep it on the Exams page`,
      },
    });
    // Every exam day of hers (finals, booked e-Tests, dates she entered), to send to her manager.
    const days = [
      ...finals.map((e) => ({ date: e.final!.date, start: e.final!.start, end: e.final!.end, code: e.course_code })),
      ...exams.filter((e) => e.booking).map((e) => ({ date: e.booking!.date, start: e.booking!.start, end: e.booking!.end, code: e.course_code })),
      ...exams.filter((e) => e.own).map((e) => ({ date: e.own!.date, start: e.own!.start, end: e.own!.end, code: e.course_code })),
    ].sort((a, b) => a.date.localeCompare(b.date) || (a.start ?? "").localeCompare(b.start ?? ""));
    const line = (lang: Lang) => days.map((d) => `${day(d.date, lang)}${d.start && d.end ? ` ${d.start}–${d.end}` : ""} (${d.code})`).join(lang === "th" ? " · " : "; ");
    out.push({
      key: `leave:${term}`, date: addDays(first, -28), time: "09:00",
      title: { th: "ถ้าทำงานอยู่ ขอลาวันสอบไว้ล่วงหน้า", en: "If you work, ask for time off for your exams" },
      note: { th: `วันสอบของคุณ: ${line("th")}`, en: `Your exam days: ${line("en")}` },
    });
  }
  return out.map((r) => ({ ...r, note: { th: r.note.th.replace("{app}", APP_NAME), en: r.note.en.replace("{app}", APP_NAME) } }));
}

type Given = { reminder_id: number | null; lang: Lang; title: string; note: string | null; date: string; time: string };

/**
 * Put the university's reminders into a student's list, in her language, once each. Only for
 * Ramkhamhaeng students. A reminder she has not touched is kept in step with the university
 * (a changed date or time moves it) and with her language; one she edited is left as she made
 * it, and a new one is added beside it if the university's date then changes. A day already
 * gone is skipped. `list` lets a caller compute the university's reminders once for many students.
 * Returns how many reminders were added or changed.
 */
export function syncUniversityReminders(db: DB, userId: string, lang: Lang, now = new Date(), university = universityReminders(db)): number {
  const uni = (db.prepare("SELECT university_id FROM user_profiles WHERE user_id = ?").get(userId) as { university_id: string | null } | undefined)?.university_id;
  if (uni !== "ru") return 0;
  const today = bangkokDate(now);
  const list = [...university, ...examReminders(db, userId, today)];
  const seen = db.prepare("SELECT reminder_id, lang, title, note, date, time FROM reminder_sources WHERE user_id = ? AND source_key = ?");
  const reminderOf = db.prepare("SELECT id, title, note, date, time FROM reminders WHERE id = ? AND user_id = ?");
  const add = db.prepare("INSERT INTO reminders (user_id, kind, title, note, date, time) VALUES (?, 'reminder', ?, ?, ?, ?)");
  const record = db.prepare(
    `INSERT INTO reminder_sources (user_id, source_key, reminder_id, lang, title, note, date, time) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id, source_key) DO UPDATE SET reminder_id = excluded.reminder_id, lang = excluded.lang,
       title = excluded.title, note = excluded.note, date = excluded.date, time = excluded.time`,
  );
  const rewrite = db.prepare("UPDATE reminders SET title = ?, note = ?, date = ?, time = ? WHERE id = ?");
  // A moved reminder may be announced again at its new time.
  const forgetPushes = db.prepare("DELETE FROM reminder_pushes WHERE reminder_id = ?");
  let changed = 0;
  db.transaction(() => {
    for (const r of list) {
      const want = { title: r.title[lang], note: r.note[lang], date: r.date, time: r.time };
      const was = seen.get(userId, r.key) as Given | undefined;
      if (!was) {
        if (r.date < today) continue; // a day already gone is not worth a reminder (today's still is)
        const id = Number(add.run(userId, want.title, want.note, want.date, want.time).lastInsertRowid);
        record.run(userId, r.key, id, lang, want.title, want.note, want.date, want.time);
        changed++;
        continue;
      }
      const moved = was.date !== r.date || was.time !== r.time;
      // Nothing to do: the same day, time and words in her language (or the day is gone). Words
      // change when her exams do (a seat recorded, a course added to the leave list).
      if (!moved && (was.date < today || (was.lang === lang && was.title === want.title && was.note === want.note))) continue;
      if (moved && r.date < today) continue;
      const cur = was.reminder_id === null ? undefined : (reminderOf.get(was.reminder_id, userId) as { id: number; title: string; note: string | null; date: string; time: string } | undefined);
      if (!cur) continue; // she deleted it: never put back
      const untouched = cur.title === was.title && cur.note === was.note && cur.date === was.date && cur.time === was.time;
      if (untouched) {
        if (cur.title === want.title && cur.note === want.note && cur.date === want.date && cur.time === want.time) continue;
        rewrite.run(want.title, want.note, want.date, want.time, cur.id);
        if (moved) forgetPushes.run(cur.id);
        record.run(userId, r.key, cur.id, lang, want.title, want.note, want.date, want.time);
        changed++;
      } else if (moved) {
        // Hers now, but the university's date changed: tell her with a new reminder beside it.
        const id = Number(add.run(userId, want.title, want.note, want.date, want.time).lastInsertRowid);
        record.run(userId, r.key, id, lang, want.title, want.note, want.date, want.time);
        changed++;
      }
    }
    // Her own exam reminders that no longer apply (a course she dropped, a booking she removed):
    // taken away if still ahead and untouched by her. One she edited stays hers.
    const wanted = new Set(list.map((r) => r.key));
    for (const g of db.prepare("SELECT source_key, reminder_id, title, note, date, time FROM reminder_sources WHERE user_id = ?").all(userId) as (Given & { source_key: string })[]) {
      if (!PERSONAL.test(g.source_key) || wanted.has(g.source_key) || g.date < today) continue;
      const cur = g.reminder_id === null ? undefined : (reminderOf.get(g.reminder_id, userId) as { id: number; title: string; note: string | null; date: string; time: string } | undefined);
      if (cur && !(cur.title === g.title && cur.note === g.note && cur.date === g.date && cur.time === g.time)) continue;
      if (cur) db.prepare("DELETE FROM reminders WHERE id = ? AND user_id = ?").run(cur.id, userId);
      db.prepare("DELETE FROM reminder_sources WHERE user_id = ? AND source_key = ?").run(userId, g.source_key);
      changed++;
    }
  })();
  return changed;
}

/**
 * For the notification round: the language to write a student's reminders in. The one she last
 * used the app in; failing that, her newest device's.
 */
export function readingLanguage(db: DB, userId: string): Lang | null {
  const chosen = (db.prepare("SELECT ui_lang FROM user_profiles WHERE user_id = ?").get(userId) as { ui_lang: Lang | null } | undefined)?.ui_lang;
  if (chosen) return chosen;
  const device = db.prepare("SELECT lang FROM push_subscriptions WHERE user_id = ? ORDER BY created_at DESC, id DESC LIMIT 1").get(userId) as { lang: Lang } | undefined;
  return device?.lang ?? null;
}
