import { describe, it, expect, beforeAll } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { openDb, type DB } from "../src/db.js";
import { seedDatabase } from "../src/seed.js";
import { Bundle, importBundle } from "../src/lectures.js";

// ── The collector script, run against fake pages shaped like the RU site ────
type Collector = {
  collectCourse: (url: string, opts: object) => Promise<any>;
  extractCues: (html: string) => { startMs: number; endMs: number; text: string }[] | null;
  extractSessions: (html: string, base: string) => { no: number; url: string }[];
  courseCodes: (label: string) => string[];
};

function loadCollector(): Collector {
  const file = fileURLToPath(new URL("../../client/public/collector/ru-vod.js", import.meta.url));
  const sandbox: Record<string, unknown> = { URL, setTimeout, console };
  sandbox.globalThis = sandbox;
  vm.runInNewContext(readFileSync(file, "utf8"), sandbox);
  return sandbox.StudyOSCollector as Collector;
}

const BASE = "https://sub-demo.ru.ac.th/student/";
const cue = (startMs: number, text: string) => ({ startMs, endMs: startMs + 5000, text });
const watchPage = (cues: unknown[]) =>
  `<html><head><title>X ครั้งที่ 1</title></head><body><video></video><script>var CUES = ${JSON.stringify(cues)}; var player = videojs('p');</script></body></html>`;

const PAGES: Record<string, string> = {
  "subject.php?subject_id=15": `<html><head><title>ACC1101_ACC1103 — วิดีโอคำบรรยาย</title></head><body><ul class="session-list">
      <li> <a href="watch.php?session_id=162"> ครั้งที่ 1 </a> </li>
      <li class="session-cancelled"> ครั้งที่ 2 — <span>งดบรรยาย</span> </li>
      <li> <a href="watch.php?session_id=202"> ครั้งที่ 3 </a> </li>
      <li> <a href="watch.php?session_id=203"> ครั้งที่ 4 </a> </li></ul></body></html>`,
  "watch.php?session_id=162": watchPage([cue(0, "สวัสดีนักศึกษา"), cue(6000, 'ข้อความที่มี ] และ "อัญประกาศ" [อยู่ข้างใน]')]),
  "watch.php?session_id=202": watchPage([cue(1000, "ครั้งที่สาม")]),
  "watch.php?session_id=203": "<html><body><video></video></body></html>", // no subtitles yet
};

function fakeFetch(signedIn = true) {
  const calls: string[] = [];
  const fetch = async (url: string) => {
    calls.push(url);
    if (!signedIn) return { ok: true, url: BASE + "login.php?next=x", text: async () => "<form></form>" };
    const page = PAGES[url.replace(BASE, "")];
    return { ok: page !== undefined, status: page ? 200 : 404, url, text: async () => page ?? "" };
  };
  return { fetch, calls };
}

describe("Phase 31 — lecture collector script", () => {
  const collector = loadCollector();

  it("reads course codes from a subject label, dropping section suffixes", () => {
    expect([...collector.courseCodes("ACC1101_ACC1103")]).toEqual(["ACC1101", "ACC1103"]);
    expect([...collector.courseCodes("LAW1001_LAW1101_S1")]).toEqual(["LAW1001", "LAW1101"]);
  });

  it("extracts subtitles even when the text contains brackets and quotes", () => {
    const cues = collector.extractCues(PAGES["watch.php?session_id=162"])!;
    expect(cues).toHaveLength(2);
    expect(cues[1].text).toBe('ข้อความที่มี ] และ "อัญประกาศ" [อยู่ข้างใน]');
    expect(collector.extractCues("<html>no cues here</html>")).toBeNull();
  });

  it("collects a whole course, skipping cancelled lectures and reporting ones without subtitles", async () => {
    const { fetch, calls } = fakeFetch();
    const progress: number[] = [];
    const bundle = await collector.collectCourse(BASE + "subject.php?subject_id=15", {
      fetch, delayMs: 0, onProgress: (n: number) => progress.push(n),
    });
    expect([...bundle.course_codes]).toEqual(["ACC1101", "ACC1103"]);
    expect(bundle.sessions.map((s: any) => s.no)).toEqual([1, 3]);
    expect([...bundle.skipped]).toEqual([4]);
    expect(calls).toHaveLength(4); // the course page + three lecture pages, nothing else
    expect(progress.at(-1)).toBe(3);
    expect(Bundle.safeParse(JSON.parse(JSON.stringify(bundle))).success).toBe(true);
  });

  it("stops with a clear error when the student is not signed in", async () => {
    const { fetch } = fakeFetch(false);
    await expect(collector.collectCourse(BASE + "subject.php?subject_id=15", { fetch, delayMs: 0 }))
      .rejects.toThrow("NOT_SIGNED_IN");
  });
});

// ── Saving a bundle ─────────────────────────────────────────────────────────
describe("Phase 31 — importing lecture transcripts", () => {
  let db: DB;
  const A = "legacy-user-0001";
  const B = "user-b";
  const bundle: Bundle = {
    format: "studyos-lecture-transcripts", version: 1, source: "ru-vod-subtitle",
    course_codes: ["ACC1101", "ACC1103"],
    sessions: [
      { no: 1, url: BASE + "watch.php?session_id=162", cues: [cue(0, "หนึ่ง"), cue(6000, "สอง")] },
      { no: 3, cues: [cue(0, "สาม"), cue(1000, "   ")] },
    ],
  };
  const mineOf = (user: string) =>
    (db.prepare("SELECT course_code, session_no, cue_count FROM lecture_transcripts WHERE user_id = ? ORDER BY 1, 2").all(user) as
      { course_code: string; session_no: number; cue_count: number }[]).map((r) => `${r.course_code}#${r.session_no}:${r.cue_count}`);

  beforeAll(() => {
    db = openDb(":memory:");
    seedDatabase(db, { reset: false });
    db.prepare("INSERT INTO users (id, email, name, created_at, last_login_at) VALUES (?, 'b@x.test', 'B', datetime('now'), datetime('now'))").run(B);
    db.prepare("INSERT INTO user_profiles (user_id, university_id, program_id, onboarded) VALUES (?, 'ru', 'bus-acc', 1)").run(B);
    db.prepare("UPDATE user_profiles SET university_id = 'ru', program_id = 'bus-mkt' WHERE user_id = ?").run(A);
  });

  it("saves a shared recording under the student's own course only", () => {
    // Marketing takes ACC1103; Accounting takes ACC1101.
    expect(importBundle(db, A, bundle)).toEqual({ courses: ["ACC1103"], saved: 2 });
    expect(mineOf(A)).toEqual(["ACC1103#1:2", "ACC1103#3:1"]); // the blank cue is dropped
  });

  it("keeps each student's transcripts to themselves", () => {
    expect(mineOf(B)).toEqual([]);
    expect(importBundle(db, B, bundle).courses).toEqual(["ACC1101"]);
    expect(mineOf(B)).toEqual(["ACC1101#1:2", "ACC1101#3:1"]);
    expect(mineOf(A)).toEqual(["ACC1103#1:2", "ACC1103#3:1"]);
  });

  it("replaces an earlier copy instead of duplicating it", () => {
    importBundle(db, A, { ...bundle, sessions: [{ no: 1, cues: [cue(0, "ใหม่")] }] });
    expect(mineOf(A)).toEqual(["ACC1103#1:1", "ACC1103#3:1"]);
  });

  it("saves nothing for a course outside the student's program", () => {
    expect(importBundle(db, A, { ...bundle, course_codes: ["MGT3204"] })).toEqual({ courses: [], saved: 0 });
  });

  it("rejects files that are not a transcript bundle", () => {
    expect(Bundle.safeParse({ format: "something-else", sessions: [] }).success).toBe(false);
    expect(Bundle.safeParse({ ...bundle, course_codes: ["'; DROP TABLE users;--"] }).success).toBe(false);
  });
});
