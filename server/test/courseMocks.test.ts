import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { type AddressInfo } from "node:net";
import express from "express";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openDb, type DB } from "../src/db.js";
import { createCourseMockRouter, expireCourseMocks } from "../src/courseMocks.js";
import { importCourseMocks, type CourseMockQuestion } from "../src/importCourseMocks.js";

const sizes: Record<string, number> = { ACC1101: 80, MGT3204: 100, RAM1103: 120, RAM1132: 120 };
const communication: Record<string, number> = { CDM1101: 100, CDM2103: 100 };
const politics: Record<string, number> = { POL1101: 100 };
const philosophy: Record<string, number> = { POL2106: 100 };
const choiceCounts: Record<string, number> = { POL1101: 5, POL2106: 5 };
const minutes: Record<string, number> = { POL2106: 120 };
const formats: Record<string, NonNullable<CourseMockQuestion["stimulus"]>["kind"][]> = {
  ACC1101: ["case","table"], MGT3204: ["case","grid"], RAM1103: ["passage","poster"], RAM1132: ["record","table","passage"],
  CDM1101: ["case"], CDM2103: ["case"], POL1101: [], POL2106: [],
};
const student = "legacy-user-0001", other = "second-student", signedOut = "anonymous";
let db: DB, server: Server, base: string, now: number;
type PublicItem = Partial<CourseMockQuestion> & { choice: number | null; flagged: boolean };
type Detail = {
  id: number; course_code: string; form_key: string; status: string; score: number | null; revision: number; current_position: number;
  deadline_ms: number; started_ms: number; finished_ms: number | null; expired: boolean; questions: PublicItem[];
};
type Course = { code: string; form_key: string; question_count: number; active_attempt_id: number | null; latest_completed_id: number | null };

function edition(questions: CourseMockQuestion[], form = "A") {
  return form + "-" + createHash("sha256").update(JSON.stringify(questions)).digest("hex").slice(0, 16);
}
function fixtures(set = sizes) {
  return Object.entries(set).map(([course_code, question_count]) => {
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
      options: ["First response", "Second response", "Third response", "Fourth response", "Fifth response"].slice(0, choiceCounts[course_code] ?? 4),
      correct_index: index % (choiceCounts[course_code] ?? 4),
      explanation: "Review the principle shown in this example.", evidence_ms: 100, evidence_quote: "Grounded practice example",
      stimulus: index < formats[course_code].length*2 ? { id: "source"+Math.floor(index/2),
        kind: formats[course_code][Math.floor(index/2)], title: "Records", text: "A record to interpret",
        columns: ["Item","Count"], rows:[["A","15"]] } : null,
    }));
    return { course_code, form_key: "A", version: edition(questions), model: "deepseek-v4-pro", duration_min: minutes[course_code] ?? 150,
      question_count, questions, sources, receipts: ["author","blind_review"].map(role => ({ model: "deepseek-v4-pro", response_id: role, role })) };
  });
}
function secondForms(originals: ReturnType<typeof fixtures>) {
  return originals.map(paper => {
    const questions = paper.questions.map(q => ({
      ...q, stem: "Fresh scenario " + q.position, correct_index: (q.correct_index + 1) % 4,
      stimulus: q.stimulus && { ...q.stimulus, text: "Independent example for paper B" },
    }));
    return { ...paper, form_key: "B", version: edition(questions, "B"), model: "openai-codex", questions,
      receipts: [
        { role: "author", model: "openai-codex", artifact_sha256: createHash("sha256").update(JSON.stringify(questions)).digest("hex") },
        { role: "blind_review", model: "deepseek-v4-pro", response_id: "fixture-review" },
      ] };
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
async function start(course_code = "ACC1103", previous_attempt_id?: number, form_key?: string) {
  const r = await api("/start", "POST", { course_code, previous_attempt_id, form_key });
  expect(r.status).toBe(200);
  return await r.json() as Detail;
}
async function list(user = student, allForms = false) {
  return (await (await api(allForms ? "/catalog?forms=all" : "/catalog", "GET", undefined, user)).json()) as { courses: Course[]; history: { id: number; form_key: string; score: number; expired: boolean }[] };
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
    expect(() => importCourseMocks(db, papers.slice(0, 3))).toThrow(/release set/);
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
  it("releases the communication courses as their own set, only to shared lecture accounts", async () => {
    const four = fixtures();
    importCourseMocks(db, four);
    const pair = fixtures(communication);
    expect(() => importCourseMocks(db, pair.slice(0, 1))).toThrow(/release set/);
    expect(() => importCourseMocks(db, [...four, ...pair])).toThrow(/release set/);
    expect(() => importCourseMocks(db, [four[0], pair[0]])).toThrow(/release set/);
    expect(importCourseMocks(db, pair).map(p => [p.course_code, p.question_count])).toEqual([["CDM1101",100],["CDM2103",100]]);
    expect(db.prepare("SELECT count(*) n FROM course_mock_papers WHERE active=1").get()).toEqual({ n: 6 });
    // Outside the student's programme (bus-mkt), yet listed: shared lecture access ignores the programme.
    const codes = (await list()).courses.map(c => c.code);
    expect(codes).toEqual(expect.arrayContaining(["CDM1101", "CDM2103", "ACC1103", "MGT3204"]));
    expect((await start("CDM2103")).questions).toHaveLength(100);
    vi.stubEnv("SHARED_LECTURE_USERS", other);
    expect((await list()).courses).toEqual([]);
  });

  it("takes five choices only where the course has them, and saves and marks the fifth", async () => {
    const four = fixtures();
    const pol = fixtures(politics);
    const fourChoices = structuredClone(pol);
    fourChoices[0].questions.forEach(q => { q.options = q.options.slice(0, 4); q.correct_index %= 4; });
    fourChoices[0].version = edition(fourChoices[0].questions);
    expect(() => importCourseMocks(db, fourChoices)).toThrow(/expected 5 choices/);
    const fiveInAccounting = structuredClone(four);
    fiveInAccounting[0].questions[0].options.push("Fifth response");
    fiveInAccounting[0].version = edition(fiveInAccounting[0].questions);
    expect(() => importCourseMocks(db, fiveInAccounting)).toThrow(/expected 4 choices/);
    importCourseMocks(db, four);
    expect(importCourseMocks(db, pol).map(p => [p.course_code, p.question_count])).toEqual([["POL1101", 100]]);
    const a = await start("POL1101");
    expect(a.questions[4].options).toHaveLength(5);
    // Question 5 is keyed on the fifth choice; question 1 on the first.
    expect((await progress(a.id, { revision: 0, changes: [{ position: 5, choice: 4 }, { position: 1, choice: 4 }] })).status).toBe(200);
    expect((await (await api("/attempts/" + a.id + "/finish", "POST", { revision: 1 })).json() as Detail).score).toBe(1);
    const done = await get(a.id);
    expect(done.questions[4]).toMatchObject({ choice: 4, correct_index: 4 });
    expect(done.questions[0]).toMatchObject({ choice: 4, correct_index: 0 });
    // A four-choice paper still refuses a fifth answer.
    const acc = await start("ACC1103");
    expect(acc.questions[0].options).toHaveLength(4);
    expect((await progress(acc.id, { revision: 0, changes: [{ position: 1, choice: 4 }] })).status).toBe(400);
    expect((await progress(acc.id, { revision: 0, changes: [{ position: 1, choice: 5 }] })).status).toBe(400);
    expect((await get(acc.id)).questions[0].choice).toBeNull();
  });

  it("keeps each paper's own exam length: two hours for POL2106, 150 minutes for the rest", async () => {
    const four = fixtures();
    const pol = fixtures(philosophy);
    const long = structuredClone(pol);
    long[0].duration_min = 150;
    expect(() => importCourseMocks(db, long)).toThrow(/expected 120 minutes/);
    const short = structuredClone(four);
    short[0].duration_min = 120;
    expect(() => importCourseMocks(db, short)).toThrow(/expected 150 minutes/);
    importCourseMocks(db, four);
    importCourseMocks(db, pol);
    const lengths = Object.fromEntries((await (await api("/catalog?forms=all")).json() as { courses: { code: string; duration_min: number }[] })
      .courses.map(c => [c.code, c.duration_min]));
    expect(lengths).toMatchObject({ POL2106: 120, ACC1103: 150, MGT3204: 150, RAM1103: 150, RAM1132: 150 });
    const a = await start("POL2106");
    expect(a.questions[0].options).toHaveLength(5);
    expect(a.deadline_ms - a.started_ms).toBe(120 * 60000);
    const acc = await start("ACC1103");
    expect(acc.deadline_ms - acc.started_ms).toBe(150 * 60000);
    // The two-hour paper expires at two hours; the 150-minute one is still running.
    expect((await progress(a.id, { revision: 0, changes: [{ position: 1, choice: 4 }] })).status).toBe(200);
    now = a.deadline_ms;
    expect(expireCourseMocks(db, now)).toBe(1);
    expect(await get(a.id)).toMatchObject({ status: "completed", expired: true, finished_ms: a.deadline_ms });
    expect(await get(acc.id)).toMatchObject({ status: "in_progress" });
    expect((await progress(a.id, { revision: 1, changes: [{ position: 2, choice: 0 }] })).status).toBe(200);
    expect((await get(a.id)).questions[1].choice).toBeNull();
    // The database itself refuses a deadline that does not match the paper's length.
    const paper = (db.prepare("SELECT paper_id FROM course_mock_attempts WHERE id=?").get(a.id) as { paper_id: number }).paper_id;
    expect(() => db.prepare("INSERT INTO course_mock_attempts(user_id,paper_id,started_ms,deadline_ms) VALUES(?,?,?,?)")
      .run(other, paper, now, now + 150 * 60000)).toThrow(/paper length/);
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
  it("accepts A and B in either order, verifies authorship, and rejects reused stems and shared data", () => {
    const a = fixtures();
    const b = secondForms(a);
    importCourseMocks(db, b);
    const duplicate = structuredClone(a);
    duplicate[3].questions[119].stem = "  " + b[3].questions[0].stem.toUpperCase();
    expect(() => importCourseMocks(db, duplicate)).toThrow(/duplicated question/);
    duplicate[3] = structuredClone(a[3]);
    duplicate[3].questions[0].stimulus = { ...b[3].questions[0].stimulus!, id: "changed id", title: "New heading" };
    expect(() => importCourseMocks(db, duplicate)).toThrow(/stimulus reused/);
    const wrongAuthor = b.map(p => ({...p, model: "deepseek-v4-pro"}));
    expect(() => importCourseMocks(db, wrongAuthor)).toThrow(/paper author/);
    const wrongReceipt = structuredClone(b);
    wrongReceipt[0].receipts = a[0].receipts;
    expect(() => importCourseMocks(db, wrongReceipt)).toThrow(/author receipts/);
    const noReview = b.map(p => ({...p, receipts: [p.receipts[0], p.receipts[0]]}));
    expect(() => importCourseMocks(db, noReview)).toThrow(/separate generation/);
    expect(() => importCourseMocks(db, [a[0], a[1], b[2], b[3]])).toThrow(/same form/);
    expect(db.prepare("SELECT count(*) n FROM course_mock_papers").get()).toEqual({ n: 4 });
    importCourseMocks(db, a);
    for (const batch of [b, a]) expect(importCourseMocks(db, batch).every(r => r.already_active)).toBe(true);
    expect(db.prepare("SELECT model,count(*) n FROM course_mock_papers WHERE active=1 GROUP BY model ORDER BY model").all()).toEqual([
      { model: "deepseek-v4-pro", n: 4 }, { model: "openai-codex", n: 4 },
    ]);
  });

  it("keeps timers, answers, keys, resume, retakes and history independent for both papers", async () => {
    const a = fixtures();
    importCourseMocks(db, a);
    const first = await start();
    await progress(first.id, {revision: 0, changes: [{position: 1, choice: 0}]});
    now += 60000;
    importCourseMocks(db, secondForms(a));
    const courses = (await list(student, true)).courses;
    expect(courses.map(c => [c.code, c.form_key, c.question_count])).toEqual(
      (await list()).courses.flatMap(c => [[c.code, "A", c.question_count], [c.code, "B", c.question_count]]));
    expect((await api("/start","POST",{course_code:"ACC1103",form_key:"B",previous_attempt_id:first.id})).status).toBe(404);
    const second = await start("ACC1103", undefined, "B");
    expect(second.id).not.toBe(first.id);
    expect(second).toMatchObject({form_key:"B", started_ms:now, deadline_ms: first.deadline_ms+60000});
    expect(second.questions[0]).toMatchObject({stem:"Fresh scenario 1", choice:null});
    expect(second.questions[0]).not.toHaveProperty("correct_index");
    await progress(second.id, {revision:0, changes:[{position:1, choice:1, flagged:true}]});
    expect((await start()).id).toBe(first.id);
    expect((await start("ACC1103", undefined, "B")).id).toBe(second.id);
    const [ca, cb] = (await list(student,true)).courses;
    expect(ca.active_attempt_id).toBe(first.id);
    expect(cb.active_attempt_id).toBe(second.id);
    await api("/attempts/"+second.id+"/finish","POST",{revision:1});
    expect((await list()).history).toEqual([]);
    expect((await list(student,true)).history).toMatchObject([{id:second.id,form_key:"B",score:1}]);
    expect(await get(first.id)).toMatchObject({status:"in_progress",score:null});
    const retake = await start("ACC1103",second.id,"B");
    expect(retake.id).not.toBe(second.id);
    expect(retake.questions[0]).toMatchObject({choice:null, flagged:false});
    now=first.deadline_ms;
    expect(await get(first.id)).toMatchObject({status:"completed",score:1,expired:true});
    expect(await get(retake.id)).toMatchObject({status:"in_progress",score:null});
    expect((await list(other,true)).history).toEqual([]);
    db.prepare("UPDATE shared_lecture_transcripts SET cues='[]' WHERE course_code='ACC1101' AND session_no=1").run();
    expect((await list(student,true)).courses).toHaveLength(6);
    expect((await api("/attempts/"+second.id)).status).toBe(404);
  });

  it("upgrades an installed 056 database with graded and in-progress A attempts intact", async () => {
    db.exec(`DROP TRIGGER course_mock_source_changed; DROP TRIGGER course_mock_source_removed;
      DROP TABLE course_mock_attempts; DROP TABLE course_mock_sources; DROP TABLE course_mock_papers;`);
    db.exec(readFileSync(new URL("../migrations/056_course_mock_exams.sql", import.meta.url), "utf8"));
    db.prepare("DELETE FROM _migrations WHERE name='057_course_mock_forms.sql'").run();
    const papers = fixtures();
    importCourseMocks(db, papers);
    const first = await start();
    await progress(first.id,{revision:0, changes:[{position:1, choice:0}]});
    await api("/attempts/"+first.id+"/finish","POST",{revision:1});
    const open = await start("ACC1103",first.id);
    await progress(open.id,{revision:0,position:4,changes:[{position:3,choice:1,flagged:true}]});
    const tables = ["course_mock_papers", "course_mock_sources", "course_mock_attempts"];
    const snapshot = (database: DB) => tables.map(t => database.prepare("SELECT * FROM "+t+" ORDER BY rowid").all());
    const before = snapshot(db);
    const temp = mkdtempSync(join(tmpdir(),"course-mock-migration-"));
    try {
      const path = join(temp,"before.sqlite");
      await db.backup(path);
      const upgraded = openDb(path);
      try {
        for (const table of tables) expect(upgraded.pragma("foreign_key_check("+table+")")).toEqual([]);
        expect(snapshot(upgraded)).toEqual(before);
        importCourseMocks(upgraded,secondForms(papers));
        expect(upgraded.prepare("SELECT count(*) n FROM course_mock_papers WHERE active=1").get()).toEqual({n:8});
        upgraded.prepare("DELETE FROM shared_lecture_transcripts WHERE course_code='ACC1101' AND session_no=1").run();
        expect(upgraded.prepare("SELECT active,valid FROM course_mock_papers WHERE course_code='ACC1101' ORDER BY form_key").all()).toEqual([
          {active:0,valid:0},{active:0,valid:0},
        ]);
        for (const table of tables) expect(upgraded.pragma("foreign_key_check("+table+")")).toEqual([]);
      } finally { upgraded.close(); }
    } finally { rmSync(temp, {recursive: true, force: true}); }
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
