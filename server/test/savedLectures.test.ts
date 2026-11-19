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
import { createLectureNotesRouter } from "../src/createdLectureNotes.js";
import { createNotesRouter } from "../src/notes.js";
import { createUploadsRouter } from "../src/uploads.js";

const db = openDb(":memory:");
const root = mkdtempSync(join(tmpdir(), "trial-lectures-"));
const oldList = process.env.SHARED_LECTURE_USERS;
const a = "lecture-test-a", b = "lecture-test-b", outside = "lecture-test-c";
let server: Server, base = "";
const files = [
  ["15", "ACC1101", "ACC1103"], ["2", "MGT3204"], ["3", "RAM1103"], ["6", "RAM1132"],
  ["11", "CDM1101"], ["12", "CDM2103", "MCS1151"], ["13", "LAW1001", "LAW1101"], ["5", "LAW1002", "LAW1102"],
  ["7", "POL1101"], ["9", "POL2106"],
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
  app.use(createLecturesRouter(db), createLectureNotesRouter(db), createNotesRouter(db));
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
  it("lists subjects outside the programme once, under the current code, only for shared access", async () => {
    importSavedLectures(db, root);
    const listed = async (user: string) => ((await (await request("/lectures", user)).json()) as { courses: { code: string }[] }).courses.map((c) => c.code);
    const shared = await listed(a);
    for (const code of ["CDM1101", "CDM2103", "LAW1101", "LAW1102", "POL1101", "POL2106"]) expect(shared).toContain(code);
    for (const code of ["MCS1151", "LAW1001", "LAW1002"]) expect(shared).not.toContain(code);
    expect(db.prepare("SELECT course_code FROM shared_lecture_transcripts WHERE source_url = (SELECT url FROM course_lectures WHERE course_code = 'LAW1001' AND session_no = 1)").get())
      .toEqual({ course_code: "LAW1101" });
    expect(await listed(outside)).not.toContain("LAW1101");
  });
  it("puts her term's courses first and names her courses that have no recording", async () => {
    importSavedLectures(db, root);
    const user = "lecture-test-term";
    process.env.SHARED_LECTURE_USERS = [a, b, user].join(",");
    db.prepare("INSERT INTO users (id,email,name,created_at,last_login_at) VALUES (?, ?, ?, datetime('now'),datetime('now'))").run(user, user + "@example.test", user);
    db.prepare("INSERT INTO user_profiles (user_id, university_id, program_id, onboarded) VALUES (?, 'ru', 'bus-adpr', 1)").run(user);
    type Listing = { courses: { code: string; mine: boolean }[]; unrecorded: { code: string; name_th: string }[] };
    const before = (await (await request("/lectures", user)).json()) as Listing;
    expect(before.courses.every((c) => !c.mine)).toBe(true);
    expect(before.unrecorded).toEqual([]);
    for (const code of ["POL1101", "ACC1101", "ECO1121"]) {
      db.prepare("INSERT INTO plan_items (user_id, term_id, course_code) VALUES (?, '2/69', ?)").run(user, code);
    }
    const after = (await (await request("/lectures", user)).json()) as Listing;
    expect(after.courses.slice(0, 2).map((c) => [c.code, c.mine])).toEqual([["ACC1103", true], ["POL1101", true]]);
    expect(after.courses.slice(2).every((c) => !c.mine)).toBe(true);
    expect(after.courses.map((c) => c.code).sort()).toEqual(before.courses.map((c) => c.code).sort());
    expect(after.unrecorded.map((c) => c.code)).toEqual(["ECO1121"]);
    expect(after.unrecorded[0].name_th).toBeTruthy();
    process.env.OWN_COURSES_ONLY_USERS = "someone-else, " + user;
    const own = (await (await request("/lectures", user)).json()) as Listing;
    expect(own.courses.map((c) => c.code)).toEqual(["ACC1103", "POL1101"]);
    expect(own.unrecorded.map((c) => c.code)).toEqual(["ECO1121"]);
    expect(((await (await request("/lectures", a)).json()) as Listing).courses.length).toBe(before.courses.length);
    delete process.env.OWN_COURSES_ONLY_USERS;
    process.env.SHARED_LECTURE_USERS = [a, b].join(",");
  });
  it("imports each recording once, serves both catalogue aliases, and keeps private edits on re-import", async () => {
    expect(importSavedLectures(db, root)).toEqual({recordings:112, catalogueLinks:157});
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
  it("shows all 112 trial recordings, deduplicates accounting by major, and keeps other programmes unchanged", async () => {
    expect(db.prepare("SELECT 1 FROM program_courses WHERE program_id='bus-mkt' AND course_code='MGT3204'").get()).toBeUndefined();
    for (const [program, preferred] of [["bus-mkt", "ACC1103"], ["bus-acc", "ACC1101"]]) {
      db.prepare("UPDATE user_profiles SET program_id=? WHERE user_id=?").run(program, b);
      const { courses } = await (await request("/lectures",b)).json() as { courses: {code:string;lectures:{has_summary:boolean}[]}[] };
      expect(courses.map(c=>c.code)).toEqual([preferred, "CDM1101", "CDM2103", "LAW1101", "LAW1102", "MGT3204", "POL1101", "POL2106", "RAM1103", "RAM1132"]);
      expect(courses.flatMap(c=>c.lectures).filter(l=>l.has_summary)).toHaveLength(112);
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
  it("keeps each lecture's layout across the list, saved generation and reader, independently for each account", async () => {
    async function modes(user: string) {
      const { courses } = await (await request("/lectures", user)).json() as {
        courses: {code: string; lectures: {no: number; note_mode: string}[]}[]
      };
      return courses.find(c => c.code === "MGT3204")!.lectures.slice(0, 2).map(l => l.note_mode);
    }
    const first = "/lectures/MGT3204/1", second = "/lectures/MGT3204/2";
    expect(await modes(a)).toEqual(["separate", "separate"]);
    expect((await request(first+"/note-preference", a, "PUT", {mode: "combined"})).ok).toBe(true);
    expect(await modes(a)).toEqual(["combined", "separate"]);
    expect(await modes(b)).toEqual(["separate", "separate"]);
    expect(await (await request(first+"/created-notes", a)).json()).toMatchObject({mode: "combined", created: null});
    expect(await (await request(first+"/created-notes", a, "POST", {})).json()).toMatchObject({mode: "combined"});
    expect(await (await request(second+"/created-notes", b, "POST", {mode:"combined"})).json()).toMatchObject({mode:"combined"});
    // Old cached clients sent the mode to this unscoped URL before generation.
    expect((await request("/lecture-note-preference", a, "PUT", {mode:"separate"})).ok).toBe(true);
    expect(await modes(a)).toEqual(["combined", "separate"]);
    expect(await modes(b)).toEqual(["separate", "combined"]);
    expect((await request(second+"/note-preference", outside, "PUT", {mode: "combined"})).status).toBe(404);
    expect((await request(first+"/note-preference", a, "PUT", {mode: "invalid"})).status).toBe(400);
    expect((await request(first+"/note-preference", a, "PUT", {mode:"separate"})).ok).toBe(true);
    expect(await (await request(first+"/created-notes", a)).json()).toMatchObject({mode:"separate",created:{mode:"combined"}});
  });
  it("shows just this student's personal text, pictures and pen marks for the requested lecture", async () => {
    const code = "MGT3204";
    const path = "/lectures/MGT3204/1/personal-notes";
    const { id } = db.prepare("SELECT id FROM course_lectures WHERE course_code=? AND session_no=1").get(code) as {id:number};
    const { id: second } = db.prepare("SELECT id FROM course_lectures WHERE course_code=? AND session_no=2").get(code) as {id:number};
    const add = db.prepare("INSERT INTO notes(user_id,lecture_id,raw_text,title,image_paths,created_at) VALUES (?,?,?,?,?,'today')");
    const photos = ["/api/uploads/first.jpg", "/api/uploads/second.jpg"];
    const note = add.run(a, id, "My typed note", "My title", JSON.stringify(photos));
    const sketch = { reading: { notes: { blocks: [{type:"text",runs:[
      {text:"Verified writing", ink:"#872161", authored:true}, {text:"Inferred", ink:"#123456", authored:false},
    ]}] } } };
    const addSketch = db.prepare("INSERT INTO sketch_pages(note_id,image_index,document_json,verified) VALUES(?,?,?,?)");
    addSketch.run(note.lastInsertRowid, 0, JSON.stringify(sketch), 1);
    addSketch.run(note.lastInsertRowid, 1, JSON.stringify(sketch), 0);
    add.run(a, second, "Another lecture", null, null);
    add.run(b, id, "Another student", null, null);
    const pen = db.prepare(`INSERT INTO lecture_annotations(user_id,lecture_id,client_key,quote,prefix,suffix,mark,png,colors,runs,ocr_status,reviewed)
      VALUES(?,?,'fixture',?,'','','circle',x'00','["#872161"]',?,'ready',1)`);
    const runs = [{ text: "My ink", color: "#872161" }];
    const mark = pen.run(a, id, "Marked phrase", JSON.stringify(runs));
    db.prepare("UPDATE notes SET handwriting_image_index=1 WHERE id=?").run(note.lastInsertRowid);
    pen.run(a, second, "Other lecture's quote", "[]");
    pen.run(b, id, "Other student's quote", "[]");
    expect(await (await request(path, a)).json()).toEqual({
      reading_images: false,
      notes: [{ id: Number(note.lastInsertRowid), raw_text: "My typed note", title: "My title", image_paths: photos, handwriting_image_index: 1, created_at: "today",
        sketch_passages: [{runs:[{text:"Verified writing",color:"#872161"}]}] }],
      annotations: [{ id: Number(mark.lastInsertRowid), quote: "Marked phrase", runs, source: "summary", ocr_status: "ready",
        image_url: `/api/lectures/MGT3204/1/annotations/${mark.lastInsertRowid}/image?source=summary&v=1` }],
    });
    expect(await (await request(path, b)).json()).toMatchObject({
      notes: [{ raw_text: "Another student", image_paths: [] }], annotations: [{ quote: "Other student's quote", runs: [] }],
    });
    expect((await request(path, outside)).status).toBe(404);
    expect((await request("/lectures/MGT3204/99/personal-notes", a)).status).toBe(404);
  });
  it("rolls back a partial re-import when the last catalogue bundle has no summary", () => {
    writeFileSync(join(root,"lecture-summary/summaries/ACC1101_L01.md"),"Replacement");
    writeFileSync(join(root,"lecture-summary/summaries/RAM1132_L01.md"),"");
    expect(()=>importSavedLectures(db,root)).toThrow(/Empty summary/);
    const row = db.prepare("SELECT summary_md FROM shared_lecture_summaries LIMIT 1").get();
    expect(row).toEqual({summary_md:"Original [00:02]"});
  });
  it("migrates only known per-lecture choices from saved documents and keeps those documents intact", () => {
    const path = join(root, "old-layouts.sqlite");
    const old = openDb(path);
    seedDatabase(old, { reset: false });
    old.exec("DROP TABLE lecture_note_layouts; DELETE FROM _migrations WHERE name='049_lecture_note_layouts.sql'");
    const lectures = old.prepare("SELECT id FROM course_lectures WHERE course_code='MGT3204' ORDER BY session_no LIMIT 2")
      .all() as {id:number}[];
    for (const user of [a, b]) {
      old.prepare("INSERT INTO users(id,email,name,created_at,last_login_at) VALUES(?,?,?,'today','today')").run(user,user+"@test.invalid",user);
      old.prepare("INSERT INTO lecture_note_preferences VALUES(?,'combined')").run(user);
    }
    old.prepare("INSERT INTO created_lecture_notes VALUES(?,?,'combined','[]',4)").run(a,lectures[0].id);
    old.prepare("INSERT INTO created_lecture_notes VALUES(?,?,'separate','[]',2)").run(a,lectures[1].id);
    old.close();
    const updated = openDb(path);
    try {
      expect(updated.prepare("SELECT user_id,lecture_id,mode FROM lecture_note_layouts ORDER BY lecture_id").all())
        .toEqual([{user_id:a,lecture_id:lectures[0].id,mode:"combined"},{user_id:a,lecture_id:lectures[1].id,mode:"separate"}]);
      expect(updated.prepare("SELECT version FROM created_lecture_notes ORDER BY lecture_id").all()).toEqual([{version:4},{version:2}]);
    } finally { updated.close(); }
  });
});
