import { describe, it, expect } from "vitest";
import { openDb } from "../src/db.js";
import { seedDatabase } from "../src/seed.js";
import { courseExams, termExamWindows, etestingBefore } from "../src/termExams.js";
import { findOrCreateUser } from "../src/auth.js";
import { thisTermCourses } from "../src/trailRoutes.js";

// The fit maths lives in the client (client/src/termFit.ts); loaded by path at run time so the
// server's TypeScript project does not include client files.
type Course = { code: string; name_th: string; name_en: string | null; classes: string | null; exam_date: string | null; exam_slot: "A" | "B" | null; exam_note: string | null; etesting: boolean };
type Commitment = { id: number; kind: string; title: string; time: string | null; end_time: string | null };
const clientFile = new URL("../../client/src/termFit.ts", import.meta.url).href;
const fit = (await import(clientFile)) as {
  meetings: (c: Pick<Course, "code" | "classes">) => { code: string; weekday: number; start: string; end: string; kind: string }[];
  weekOf: (iso: string) => string[];
  weekdayOf: (iso: string) => number;
  weekFit: (courses: Course[], dates: string[], on: (d: string) => Commitment[], span?: { from: string | null; to: string | null }) => {
    days: { date: string; classes: unknown[]; commitments: unknown[]; choices: unknown[] }[];
    sectioned: { code: string; sections: string[] }[];
    overlaps: { date: string; from: string; to: string; kind: string; a: string; b: string }[];
    classDays: number; hours: number;
  };
  examFit: (courses: Course[], finals: { from: string; to: string } | null) => {
    days: { date: string; weekday: number; A: string[]; B: string[] }[];
    clashes: { date: string; slot: string; codes: string[] }[];
    examDays: number; weekdayExamDays: number; twoInADay: string[]; facultySet: string[]; noFinal: string[]; etesting: string[];
  };
};

const course = (code: string, classes: string | null, exam: [string, "A" | "B"] | null | "faculty", etesting = false): Course => ({
  code, name_th: code, name_en: null, classes,
  exam_date: exam && exam !== "faculty" ? exam[0] : null, exam_slot: exam && exam !== "faculty" ? exam[1] : null,
  exam_note: exam === "faculty" ? "คณะจัดสอบเอง" : null, etesting,
});

describe("dates", () => {
  it("weeks run Monday to Sunday", () => {
    expect(fit.weekOf("2026-11-18")).toEqual(["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20", "2026-11-21", "2026-11-22"]);
    expect(fit.weekdayOf("2026-11-16")).toBe(1); // a Monday
    expect(fit.weekdayOf("2026-11-22")).toBe(7);
  });
  it("reads class times as the term-courses route sends them", () => {
    expect(fit.meetings({ code: "X", classes: "1 08:30-11:00|;3 13:00-15:00|SEC. 2" })).toEqual([
      { code: "X", weekday: 1, start: "08:30", end: "11:00", kind: "" }, { code: "X", weekday: 3, start: "13:00", end: "15:00", kind: "SEC. 2" },
    ]);
    expect(fit.meetings({ code: "X", classes: "1 08:30-11:00" })[0].kind).toBe(""); // the older form still reads
    expect(fit.meetings({ code: "X", classes: null })).toEqual([]);
  });
});

describe("the week", () => {
  const week = fit.weekOf("2026-11-16");
  it("puts classes on their days and counts days and hours", () => {
    const w = fit.weekFit([course("A", "1 08:30-11:00", null), course("B", "1 13:00-15:00;4 09:30-12:00", null)], week, () => []);
    expect(w.days[0].classes).toHaveLength(2);
    expect(w.days[3].classes).toHaveLength(1);
    expect(w.classDays).toBe(2);
    expect(w.hours).toBe(7);
    expect(w.overlaps).toEqual([]);
  });
  it("finds two classes at the same time", () => {
    const w = fit.weekFit([course("A", "2 09:30-12:00", null), course("B", "2 11:00-13:30", null)], week, () => []);
    expect(w.overlaps).toEqual([{ date: "2026-11-17", from: "11:00", to: "12:00", kind: "classes", a: "A", b: "B" }]);
  });
  it("finds a class during her own commitment, but not touching ends or a reminder with no end", () => {
    const shift: Commitment = { id: 1, kind: "event", title: "Work shift", time: "08:00", end_time: "17:00" };
    const after: Commitment = { id: 2, kind: "event", title: "Gym", time: "11:00", end_time: "12:00" };
    const ping: Commitment = { id: 3, kind: "reminder", title: "Call mum", time: "09:00", end_time: null };
    const w = fit.weekFit([course("A", "3 08:30-11:00", null)], week, (d) => (d === "2026-11-18" ? [shift, after, ping] : []));
    expect(w.overlaps).toEqual([{ date: "2026-11-18", from: "08:30", to: "11:00", kind: "commitment", a: "A", b: "Work shift" }]);
  });
});

describe("sections and the teaching weeks", () => {
  const week = fit.weekOf("2026-11-16");
  const shift: Commitment = { id: 1, kind: "event", title: "Work shift", time: "13:00", end_time: "17:00" };
  it("treats a course's sections as alternatives: drawn, but no hours and no overlaps until she picks one", () => {
    // LAW2116 in 2/69: SEC. 1 Tuesday 11:30-13:20, SEC. 2 Monday 13:30-15:20.
    const law = course("LAW2116", "2 11:30-13:20|SEC. 1;1 13:30-15:20|SEC. 2", null);
    const w = fit.weekFit([law], week, (d) => (d === "2026-11-16" ? [shift] : []));
    expect(w.sectioned).toEqual([{ code: "LAW2116", sections: ["SEC. 1", "SEC. 2"] }]);
    expect(w.overlaps).toEqual([]);
    expect(w.hours).toBe(0);
    expect(w.classDays).toBe(0);
    expect(w.days[0].choices).toHaveLength(1); // still shown on Monday, as a choice
  });
  it("never reports two meetings of the same course as an overlap", () => {
    const w = fit.weekFit([course("BIO1105", "1 09:30-11:20|LEC.;1 10:30-12:30|LAB.", null)], week, () => []);
    expect(w.overlaps).toEqual([]);
  });
  it("puts classes only inside the teaching weeks", () => {
    const a = course("A", "1 08:30-11:00", null);
    const span = { from: "2026-11-16", to: "2027-03-08" };
    expect(fit.weekFit([a], fit.weekOf("2026-11-09"), () => [], span).classDays).toBe(0); // before classes start
    expect(fit.weekFit([a], fit.weekOf("2027-03-15"), () => [], span).classDays).toBe(0); // the finals fortnight
    expect(fit.weekFit([a], fit.weekOf("2027-03-01"), () => [], span).classDays).toBe(1);
  });
});

describe("the finals", () => {
  const finals = { from: "2027-03-09", to: "2027-03-22" };
  it("lays out the fortnight and finds clashes, days, weekdays and two-in-a-day", () => {
    const f = fit.examFit([
      course("A", null, ["2027-03-10", "B"]),
      course("B", null, ["2027-03-10", "B"], true),
      course("C", null, ["2027-03-11", "A"]),
      course("D", null, ["2027-03-11", "B"]),
      course("E", null, ["2027-03-13", "A"]), // a Saturday
      course("F", null, "faculty", true),
      course("G", null, null),
    ], finals);
    expect(f.days).toHaveLength(14);
    expect(f.days[0]).toMatchObject({ date: "2027-03-09", weekday: 2 });
    expect(f.clashes).toEqual([{ date: "2027-03-10", slot: "B", codes: ["A", "B"] }]);
    expect(f.examDays).toBe(3);
    expect(f.weekdayExamDays).toBe(2);
    expect(f.twoInADay).toEqual(["2027-03-11"]);
    expect(f.facultySet).toEqual(["F"]);
    expect(f.noFinal).toEqual(["G"]);
    expect(f.etesting).toEqual(["B", "F"]);
  });
});

describe("term 2/2569 from the registrar's own record", () => {
  const db = openDb(":memory:");
  seedDatabase(db, { reset: false });
  it("has its finals fortnight and e-Testing window", () => {
    const w = termExamWindows(db, "2/69");
    expect(w.finals).toEqual({ from: "2027-03-09", to: "2027-03-22" });
    expect(w.etesting).toMatchObject({ registration_start: "2026-12-21", registration_end: "2026-12-25", registration_opens: "10:00", exam_start: "2027-01-12", exam_end: "2027-03-07" });
    expect(w.etesting!.central_closed).toEqual([["2027-01-21", "2027-01-26"], ["2027-02-20", "2027-02-22"]]);
  });
  it("starts classes on 16 Nov 2569, and marks a faculty-set exam as such", () => {
    expect(termExamWindows(db, "2/69").term_start).toBe("2026-11-16");
    const faculty = (db.prepare("SELECT course_code FROM term_offerings WHERE term_id = '2/69' AND exam_date IS NULL AND exam_note = 'คณะจัดสอบเอง' AND course_code IN (SELECT code FROM courses) LIMIT 1").get() as { course_code: string }).course_code;
    expect(courseExams(db, "2/69", [faculty])[faculty]).toMatchObject({ exam_date: null, exam_slot: null, exam_note: "คณะจัดสอบเอง" });
  });
  it("gives each course its final as printed and its e-Testing place", () => {
    const e = courseExams(db, "2/69", ["ACC1101", "RAM1131", "MKT2101", "ANT1013"]);
    expect(e.ACC1101).toMatchObject({ exam_date: "2027-03-15", exam_slot: "A", etesting: false }); // page 1 of the ม.ร.30
    expect(e.RAM1131.etesting).toBe(true);
    expect(e.MKT2101.etesting).toBe(true);
    expect(e.ANT1013).toMatchObject({ etesting: true, etesting_essay: true });
  });
  it("gives the trail's This term courses their class times (page 1: ACC1101, Thursday 08:30-11:00)", () => {
    const u = findOrCreateUser(db, { email: "classes@test", name: "c", avatar: "" });
    db.prepare("UPDATE user_profiles SET university_id = 'ru', program_id = 'bus-acc', onboarded = 1 WHERE user_id = ?").run(u);
    db.prepare("INSERT INTO plan_items (user_id, term_id, course_code) VALUES (?, '2/69', 'ACC1101')").run(u);
    const acc = thisTermCourses(db, u).courses.find((c) => c.code === "ACC1101")!;
    expect(acc.classes).toBe("4 08:30-11:00|");
    expect(acc).toMatchObject({ exam_date: "2027-03-15", exam_slot: "A" });
  });
  it("says which planned courses were on an earlier e-Testing list, never a future one", () => {
    expect(etestingBefore(db, ["MKT2101", "ACC1101"], "2/69")).toEqual({ MKT2101: "2/69" });
    expect(etestingBefore(db, ["MKT2101"], "1/69")).toEqual({});
  });
});

describe("busy times from her own calendar", () => {
  const more = fit as unknown as {
    blocksByDay: (b: { start: string; end: string }[], dates: string[]) => Record<string, { time: string; end_time: string }[]>;
    finalsInBusyTime: (fit: unknown, busyOn: (d: string) => { time: string; end_time: string }[]) => { code: string; date: string; slot: string }[];
  };
  it("cuts busy blocks into Bangkok days, splitting one over midnight", () => {
    const blocks = [
      { start: "2026-11-17T01:00:00Z", end: "2026-11-17T10:00:00Z" }, // 08:00-17:00 in Bangkok
      { start: "2026-11-18T15:00:00Z", end: "2026-11-19T03:00:00Z" }, // 22:00 on the 18th to 10:00 on the 19th
    ];
    expect(more.blocksByDay(blocks, ["2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20"])).toEqual({
      "2026-11-17": [{ time: "08:00", end_time: "17:00" }],
      "2026-11-18": [{ time: "22:00", end_time: "23:59" }],
      "2026-11-19": [{ time: "00:00", end_time: "10:00" }],
    });
  });
  it("merges overlapping busy blocks (one meeting in two calendars) into one stretch", () => {
    const blocks = [
      { start: "2026-11-17T01:00:00Z", end: "2026-11-17T03:00:00Z" }, // 08:00-10:00
      { start: "2026-11-17T02:00:00Z", end: "2026-11-17T05:00:00Z" }, // 09:00-12:00
      { start: "2026-11-17T01:00:00Z", end: "2026-11-17T03:00:00Z" }, // the same as the first, from another account
      { start: "2026-11-17T07:00:00Z", end: "2026-11-17T08:00:00Z" }, // 14:00-15:00, apart
    ];
    expect(more.blocksByDay(blocks, ["2026-11-17"])).toEqual({ "2026-11-17": [{ time: "08:00", end_time: "12:00" }, { time: "14:00", end_time: "15:00" }] });
  });
  it("makes a class overlap with a busy block, like any commitment", () => {
    const busy = more.blocksByDay([{ start: "2026-11-17T01:00:00Z", end: "2026-11-17T10:00:00Z" }], ["2026-11-17"]);
    const w = fit.weekFit([course("A", "2 11:00-13:00", null)], fit.weekOf("2026-11-16"), (d) => (busy[d] ?? []).map((b, i) => ({ id: -1 - i, kind: "busy", title: "Busy", time: b.time, end_time: b.end_time })));
    expect(w.overlaps).toEqual([{ date: "2026-11-17", from: "11:00", to: "13:00", kind: "commitment", a: "A", b: "Busy" }]);
  });
  it("finds the finals that fall in her busy time, period by period", () => {
    const f = fit.examFit([course("A", null, ["2027-03-10", "A"]), course("B", null, ["2027-03-10", "B"]), course("C", null, ["2027-03-11", "A"])], { from: "2027-03-09", to: "2027-03-22" });
    // Busy 13:00-18:00 on the 10th: period B (14:00-16:30) is hit, A (09:30-12:00) is not.
    const hits = more.finalsInBusyTime(f, (d) => (d === "2027-03-10" ? [{ time: "13:00", end_time: "18:00" }] : []));
    expect(hits.map((h) => [h.code, h.date, h.slot])).toEqual([["B", "2027-03-10", "B"]]);
    // Touching ends do not count.
    expect(more.finalsInBusyTime(f, (d) => (d === "2027-03-11" ? [{ time: "12:00", end_time: "13:00" }] : []))).toEqual([]);
  });
});
