import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { openDb } from "../src/db.js";
import { seedDatabase } from "../src/seed.js";
import { importSavedLectures } from "../src/importSavedLectures.js";
import { createLecturesRouter, importBundle } from "../src/lectures.js";
import { createNotesRouter } from "../src/notes.js";
import { createUploadsRouter } from "../src/uploads.js";

const db = openDb(":memory:");
const root = mkdtempSync(join(tmpdir(), "trial-lectures-"));
const oldList = process.env.SHARED_LECTURE_USERS;
const a = "lecture-test-a", b = "lecture-test-b", outside = "lecture-test-c";
let server: Server, base = "";
const files = [
  ["15", "ACC1101", "ACC1103"], ["2", "MGT3204"], ["3", "RAM1103"], ["6", "RAM1132"],
];
const manifest: Record<string, object> = {};
function request(path: string, user = a, method = "GET", body?: object) {
  return fetch(base + path, { method, headers: { "x-test-user": user, "content-type": "application/json" }, body: body && JSON.stringify(body) });
}

beforeAll(async () => {
  seedDatabase(db, { reset: false });
  process.env.SHARED_LECTURE_USERS = [a,b].join(",");
  for (const id of [a,b,outside]) {
    db.prepare("INSERT INTO users (id,email,name,created_at,last_login_at) VALUES (?, ?, ?, datetime('now'),datetime('now'))").run(id, id+"@example.test", id);
    db.prepare("INSERT INTO user_profiles (user_id, university_id, program_id, onboarded) VALUES (?, 'ru', 'bus-mkt', 1)").run(id);
  }
  mkdirSync(join(root,"transcripts/raw"), { recursive: true });
  mkdirSync(join(root,"lecture-summary/summaries"), { recursive: true });
  for (const [subject, ...codes] of files) {
    const rows = db.prepare("SELECT session_no AS no, url FROM course_lectures WHERE course_code = ? ORDER BY session_no").all(codes[0]) as { no: number; url: string }[];
    for (const { no, url } of rows) {
      const file = codes[0] + "_L" + String(no).padStart(2, "0") + ".md";
      manifest[file] = { source_url: url, session_no: no, course_codes: codes, cues: 1, model: "model", prompt: "v3" };
      writeFileSync(join(root, "lecture-summary/summaries", file), "Original [00:02]");
    }
    const bundle = { format: "studyos-lecture-transcripts", version: 1, source: "ru-vod-subtitle", collected_at: "2026-01-01T12:00:00Z",
      course_codes: codes, sessions: rows.map((r) => ({...r, cues: [{startMs:2000,endMs:5000,text:"Shared cue"}]})) };
    writeFileSync(join(root,"transcripts/raw",`subject-${subject}_${codes.join("_")}.json`),JSON.stringify(bundle));
  }
  writeFileSync(join(root, "lecture-summary/summaries/manifest.json"), JSON.stringify(manifest));
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.user = { id: String(req.headers["x-test-user"]) } as Express.User; next(); });
  app.use("/uploads", createUploadsRouter(db, root));
  app.use(createLecturesRouter(db), createNotesRouter(db));
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((done) => server.once("listening", done));
  base = "http://127.0.0.1:" + (server.address() as AddressInfo).port;
});
afterAll(() => {
  if (oldList === undefined) delete process.env.SHARED_LECTURE_USERS;
  else process.env.SHARED_LECTURE_USERS = oldList;
  server.close(); db.close(); rmSync(root, { recursive: true, force: true });
});

describe("saved lectures", () => {
  const summary = "/lectures/summaries/ACC1103/1", transcript = "/lectures/transcripts/ACC1103/1";
  it("imports each recording once, serves both catalogue aliases, and keeps private edits on re-import", async () => {
    expect(importSavedLectures(db, root)).toEqual({recordings:42, catalogueLinks:52});
    expect(await (await request(summary)).json()).toMatchObject({ summary_md: "Original [00:02]" });
    expect(await (await request(summary, a, "PUT", {summary_md:"My edit"})).json()).toMatchObject({ edited: true });
    importSavedLectures(db, root);
    expect(await (await request(summary)).json()).toMatchObject({ summary_md: "My edit" });
    expect(await (await request(summary,b)).json()).toMatchObject({ summary_md: "Original [00:02]" });
    expect((await request(summary,a,"PUT",{summary_md:"stale draft",previous_md:"Original [00:02]"})).status).toBe(409);
    expect(await (await request(summary,a,"DELETE")).json()).toMatchObject({ edited: false });
    const ids = db.prepare("SELECT DISTINCT shared_transcript_id FROM course_lectures WHERE course_code IN ('ACC1101','ACC1103') AND session_no = 1").all();
    expect(ids).toHaveLength(1);
  });
  it("applies the trial gate and programme to all shared reads and edits, preserving private fallback", async () => {
    expect((await request("/lectures/summaries/ACC1101/1",a)).status).toBe(404);
    for (const method of ["GET","PUT","DELETE"]) expect((await request(summary,outside,method)).status).toBe(404);
    expect((await request(transcript,outside)).status).toBe(404);
    const privateBundle = { format: "studyos-lecture-transcripts" as const, version: 1 as const, source:"ru-vod-subtitle",course_codes:["ACC1103"],
      sessions:[{no:1,cues:[{text:"private",startMs:500,endMs:900}]}] };
    importBundle(db, outside, privateBundle); importBundle(db, a, privateBundle);
    expect(await (await request(transcript,outside)).json()).toMatchObject({ cues: [{ text: "private" }] });
    expect(await (await request(transcript)).json()).toMatchObject({ cues: [{ text: "Shared cue" }] });
    for (const user of [a,outside]) {
      const {courses} = await (await request("/lectures",user)).json() as { courses: {code:string; lectures:{has_summary:boolean}[]}[] };
      expect(courses.find((c: {code:string})=>c.code==="ACC1103")!.lectures[0].has_summary).toBe(user===a);
    }
  });
  it("shows all 42 trial recordings, deduplicates accounting by major, and keeps other programmes unchanged", async () => {
    expect(db.prepare("SELECT 1 FROM program_courses WHERE program_id='bus-mkt' AND course_code='MGT3204'").get()).toBeUndefined();
    for (const [program, preferred] of [["bus-mkt", "ACC1103"], ["bus-acc", "ACC1101"]]) {
      db.prepare("UPDATE user_profiles SET program_id=? WHERE user_id=?").run(program, b);
      const { courses } = await (await request("/lectures",b)).json() as { courses: {code:string;lectures:{has_summary:boolean}[]}[] };
      expect(courses.map(c=>c.code)).toEqual([preferred, "MGT3204", "RAM1103", "RAM1132"]);
      expect(courses.flatMap(c=>c.lectures).filter(l=>l.has_summary)).toHaveLength(42);
      expect((await request("/lectures/summaries/MGT3204/1",b)).status).toBe(200);
      expect((await request("/lectures/transcripts/MGT3204/1",b)).status).toBe(200);
    }
    expect((await request("/lectures/summaries/MGT3204/1",outside)).status).toBe(404);
    expect((await request("/lectures/images/MGT3204/1",outside)).status).toBe(404);
    db.prepare("UPDATE user_profiles SET program_id='bus-mkt' WHERE user_id=?").run(b);
  });
  it("links an existing note to its lecture and serves only its owner's gallery and images", async () => {
    const img = "/api/uploads/original-file.jpg";
    writeFileSync(join(root, "original-file.jpg"), "photo");
    const id = Number(db.prepare("INSERT INTO notes(user_id,course_code,created_at,title,image_paths) VALUES (?,'ACC1103',datetime('now'),'My picture',?)").run(a,JSON.stringify([img])).lastInsertRowid);
    expect((await request(`/notes/${id}/lecture`, b,"PUT",{lecture_no:1})).status).toBe(404);
    expect((await request(`/notes/${id}/lecture`, a,"PUT",{lecture_no:99})).status).toBe(400);
    expect((await request(`/notes/${id}/lecture`, a,"PUT",{lecture_no:1})).status).toBe(200);
    const gallery = "/lectures/images/ACC1103/1";
    expect(await (await request(gallery)).json()).toMatchObject({images:[{note_id:id,path:img}]});
    expect(await (await request(gallery,b)).json()).toEqual({images:[]});
    expect((await request("/uploads/original-file.jpg",b)).status).toBe(404);
    expect((await request("/uploads/original-file.jpg")).status).toBe(200);
  });
  it("rolls back a partial re-import when the last catalogue bundle has no summary", () => {
    writeFileSync(join(root,"lecture-summary/summaries/ACC1101_L01.md"),"Replacement");
    writeFileSync(join(root,"lecture-summary/summaries/RAM1132_L01.md"),"");
    expect(()=>importSavedLectures(db,root)).toThrow(/Empty summary/);
    const row = db.prepare("SELECT summary_md FROM shared_lecture_summaries LIMIT 1").get();
    expect(row).toEqual({summary_md:"Original [00:02]"});
  });
});
