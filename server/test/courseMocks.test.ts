import { createHash } from "node:crypto";
import { type Server } from "node:http";
import { type AddressInfo } from "node:net";
import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openDb, type DB } from "../src/db.js";
import { createCourseMockRouter, expireCourseMocks } from "../src/courseMocks.js";
import { importCourseMocks, type CourseMockQuestion } from "../src/importCourseMocks.js";

const sizes = { ACC1101: 80, MGT3204: 100, RAM1103: 120, RAM1132: 120 };
const formats: Record<string, NonNullable<CourseMockQuestion["stimulus"]>["kind"][]> = {
  ACC1101: ["case","table"], MGT3204: ["case","grid"], RAM1103: ["passage","poster"], RAM1132: ["record","table","passage"],
};
const student = "legacy-user-0001", other = "second-student", signedOut = "anonymous";
let db: DB, server: Server, base: string, now: number;
type PublicItem = Partial<CourseMockQuestion> & { choice: number | null; flagged: boolean };
type Detail = {
  id: number; course_code: string; status: string; score: number | null; revision: number; current_position: number;
  deadline_ms: number; started_ms: number; finished_ms: number | null; expired: boolean; questions: PublicItem[];
};
type Course = { code: string; question_count: number; active_attempt_id: number | null; latest_completed_id: number | null };

function edition(questions: CourseMockQuestion[]) {
  return "A-" + createHash("sha256").update(JSON.stringify(questions)).digest("hex").slice(0, 16);
}
function fixtures() {
  return Object.entries(sizes).map(([course_code, question_count]) => {
    const sources = [1, 2].map((session_no) => {
      const lecture = db.prepare("SELECT id,url FROM course_lectures WHERE course_code=? AND session_no=?")
        .get(course_code, session_no) as { id: number; url: string };
      const cue = { startMs: 100, endMs: 5000, text: "Grounded practice example in lecture " + session_no };
      const cues = JSON.stringify([cue]);
      db.prepare("INSERT INTO shared_lecture_transcripts VALUES(?,?,?,?,?,1,5000,'today')").run(
        lecture.id, course_code, session_no, lecture.url, cues);
      db.prepare("UPDATE course_lectures SET shared_transcript_id=? WHERE url=?").run(lecture.id, lecture.url);
      return { session_no, source_url: lecture.url, source_hash: createHash("sha256").update(cues).digest("hex") };
    });
    const questions: CourseMockQuestion[] = Array.from({ length: question_count }, (_, index) => ({
      position: index+1, ...sources[index%2], stem: course_code + " example " + index, concept: "Interpreting the example",
      options: ["First response", "Second response", "Third response", "Fourth response"], correct_index: index%4,
      explanation: "Review the principle shown in this example.", evidence_ms: 100, evidence_quote: "Grounded practice example",
      stimulus: index < formats[course_code].length*2 ? { id: "source"+Math.floor(index/2),
        kind: formats[course_code][Math.floor(index/2)], title: "Records", text: "A record to interpret",
        columns: ["Item","Count"], rows:[["A","15"]] } : null,
    }));
    return { course_code, form_key: "A", version: edition(questions), model: "deepseek-v4-pro", duration_min: 150,
      question_count, questions, sources, receipts: ["author","blind_review"].map(role => ({ model: "deepseek-v4-pro", response_id: role, role })) };
  });
}
beforeEach(async () => {
  vi.stubEnv("SHARED_LECTURE_USERS", student + "," + other);
  db = openDb(":memory:");
  db.prepare("INSERT INTO users(id,email,name,created_at,last_login_at) VALUES(?,'student@example.test','student','now','now')").run(other);
  for (const user of [student, other]) {
    db.prepare("INSERT OR REPLACE INTO user_profiles(user_id,program_id,university_id) VALUES(?,'bus-mkt','ru')").run(user);
  }
  now = Date.UTC(2026, 10, 16);
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    if (req.get("x-user") !== signedOut) req.user = { id: req.get("x-user") ?? student } as Express.User;
    next();
  });
  app.use(createCourseMockRouter(db, () => now));
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(r => server.once("listening", r));
  base = "http://127.0.0.1:" + (server.address() as AddressInfo).port;
});
afterEach(async () => {
  await new Promise<void>(r => server.close(() => r()));
  db.close();
  vi.unstubAllEnvs();
});
function api(path: string, method = "GET", data?: unknown, user = student) {
  return fetch(base + path, { method, headers: { "content-type": "application/json", "x-user": user }, body: data === undefined ? undefined : JSON.stringify(data) });
}
async function start(course_code = "ACC1103", previous_attempt_id?: number) {
  const r = await api("/start", "POST", { course_code, previous_attempt_id });
  expect(r.status).toBe(200);
  return await r.json() as Detail;
}
async function list(user = student) {
  return (await (await api("/catalog", "GET", undefined, user)).json()) as { courses: Course[]; history: { id: number; score: number; expired: boolean }[] };
}
function progress(id: number, data: unknown) { return api("/attempts/" + id + "/progress", "PUT", data); }
async function get(id: number) { return (await (await api("/attempts/" + id)).json()) as Detail; }

describe("private transcript course mock exams", () => {
  it("checks complete versioned papers and every citation before activating all four together", () => {
    const papers = fixtures();
    const count = () => (db.prepare("SELECT count(*) n FROM course_mock_papers").get() as { n: number }).n;
    expect(importCourseMocks(db, papers, true)).toHaveLength(4);
    expect(count()).toBe(0);
    const broken = structuredClone(papers);
    broken[3].questions[40].evidence_quote = "invented quotation";
    expect(() => importCourseMocks(db, broken)).toThrow(/citation/);
    expect(() => importCourseMocks(db, papers.slice(0, 3))).toThrow(/four courses/);
    broken[3] = structuredClone(papers[3]);
    broken[3].questions.splice(60, 1);
    expect(() => importCourseMocks(db, broken)).toThrow(/expected 120/);
    expect(count()).toBe(0);
    broken[3] = structuredClone(papers[3]);
    broken[3].questions.forEach(q => { q.stimulus=null; });
    expect(() => importCourseMocks(db, broken)).toThrow(/linked question formats/);
    const result = importCourseMocks(db, papers);
    expect(result.map(p => p.question_count)).toEqual([80,100,120,120]);
    expect(importCourseMocks(db, papers).every(p => p.already_active)).toBe(true);
    const conflict = structuredClone(papers);
    conflict[0].questions[0].stem = "Updated example in a separately reviewed edition";
    conflict[0].version = edition(conflict[0].questions);
    conflict[1].questions[0].correct_index = 2;
    expect(() => importCourseMocks(db, conflict)).toThrow(/fingerprint/);
    expect(count()).toBe(4);
    expect(db.prepare("SELECT count(*) n FROM course_mock_papers WHERE active=1").get()).toEqual({ n:4 });
  });
  it("keeps one clock and saved responses across concurrent starts, refresh, deadline and a retake", async () => {
    importCourseMocks(db, fixtures());
    expect((await list()).courses.map(c => [c.code,c.question_count])).toEqual([
      ["ACC1103",80],["MGT3204",100],["RAM1103",120],["RAM1132",120]]);
    const [a,b] = await Promise.all([start(),start()]);
    expect(a.id).toBe(b.id);
    expect(a.questions).toHaveLength(80);
    expect(a.questions[0].stimulus).toEqual(a.questions[1].stimulus);
    for (const q of a.questions) {
      for (const field of ["correct_index","explanation","evidence_quote","concept","source_url","session_no"]) {
        expect(q).not.toHaveProperty(field);
      }
    }
    expect(a.deadline_ms - a.started_ms).toBe(150 * 60000);
    const saved = await progress(a.id,{ revision:0,position:2,changes:[{position:1,choice:0},{position:2,choice:1,flagged:true}] });
    expect(await saved.json()).toMatchObject({ status:"in_progress", revision:1 });
    expect((await progress(a.id,{ revision:0, changes:[{position:1,choice:3}] })).status).toBe(409);
    expect((await api("/attempts/" + a.id + "/finish","POST",{revision:0})).status).toBe(409);
    expect((await progress(a.id,{ revision:1,position:81 })).status).toBe(400);
    now = a.deadline_ms - 1;
    const resumed = await start();
    expect(resumed).toMatchObject({ id:a.id, deadline_ms:a.deadline_ms, revision:1, current_position:2 });
    expect(resumed.questions[1]).toMatchObject({ choice:1, flagged:true });
    expect((await list()).courses[0].active_attempt_id).toBe(a.id);
    now = a.deadline_ms;
    const late = await progress(a.id,{ revision:1, changes:[{position:3,choice:2}] });
    expect(await late.json()).toMatchObject({ status:"completed" });
    now += 60000;
    const done = await get(a.id);
    expect(done).toMatchObject({ status:"completed", expired:true, finished_ms:a.deadline_ms, score:2 });
    expect(done.questions[0]).toMatchObject({ choice:0, correct_index:0, explanation:expect.any(String), evidence_ms:100 });
    expect(done.questions[2].choice).toBeNull();
    expect(await start()).toMatchObject({id:a.id,status:"completed"});
    expect((await list()).history).toMatchObject([{id:a.id,score:2,expired:true}]);
    const [r,s] = await Promise.all([start("ACC1103",a.id),start("ACC1103",a.id)]);
    expect(s.id).toBe(r.id);
    expect(r).toMatchObject({status:"in_progress",started_ms:now,deadline_ms:now+9000000});
    expect(r.questions[0].choice).toBeNull();
    now = r.deadline_ms+50000;
    expect(expireCourseMocks(db,now)).toBe(1);
    expect(expireCourseMocks(db,now)).toBe(0);
    expect((await list()).courses[0]).toMatchObject({active_attempt_id:null,latest_completed_id:r.id});
  });
  it("pins active attempts to their original edition and grades saved answers once on voluntary submission", async () => {
    const papers = fixtures();
    importCourseMocks(db,papers);
    const a = await start();
    await progress(a.id,{ revision:0, changes:[{position:1,choice:0},{position:2,choice:2}] });
    papers[0].questions[0].stem = "A new question in the revised edition";
    papers[0].questions[0].correct_index = 2;
    papers[0].version = edition(papers[0].questions);
    importCourseMocks(db,papers);
    expect((await start()).id).toBe(a.id);
    now += 30000;
    const finish = () => api("/attempts/" + a.id + "/finish","POST",{revision:1}).then(r => r.json()) as Promise<Detail>;
    const done = await finish();
    expect(done).toMatchObject({score:1,expired:false,finished_ms:now,revision:2});
    expect(await finish()).toEqual(done);
    const retake = await start("ACC1103",a.id);
    expect(retake.questions[0].stem).toBe(papers[0].questions[0].stem);
    expect((await get(a.id)).questions[0].stem).toBe("ACC1101 example 0");
  });
  it("requires every source, entitlement, university and attempt ownership for both reading and writing", async () => {
    const papers = fixtures();
    importCourseMocks(db,papers);
    const a = await start();
    expect((await api("/catalog","GET",undefined,signedOut)).status).toBe(401);
    const path = "/attempts/"+a.id;
    for (const [suffix,method,body] of [["","GET",undefined],["/progress","PUT",{revision:0}],["/finish","POST",{}]] as const) {
      expect((await api(path+suffix, method,body,other)).status).toBe(404);
    }
    vi.stubEnv("SHARED_LECTURE_USERS",other);
    expect(await list()).toEqual({courses:[],history:[]});
    expect((await api(path)).status).toBe(404);
    expect((await api("/start","POST",{course_code:"ACC1103"})).status).toBe(404);
    vi.stubEnv("SHARED_LECTURE_USERS",student);
    db.prepare("UPDATE user_profiles SET university_id='another' WHERE user_id=?").run(student);
    expect(await list()).toEqual({courses:[],history:[]});
    db.prepare("UPDATE user_profiles SET university_id='ru' WHERE user_id=?").run(student);
    db.prepare("UPDATE shared_lecture_transcripts SET cues='[]' WHERE course_code='ACC1101' AND session_no=2").run();
    expect((await list()).courses).toHaveLength(3);
    expect((await api(path)).status).toBe(404);
  });
});
