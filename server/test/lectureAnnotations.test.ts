import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import sharp from "sharp";
import { openDb, type DB } from "../src/db.js";
import { annotationSources, createAnnotationReader, createLectureAnnotationsRouter } from "../src/lectureAnnotations.js";
import { createLecturesRouter, importBundle } from "../src/lectures.js";

const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=";
const anchor = { quote: "Cited text", prefix: "A ", suffix: " example", mark: "circle" };
const student = "legacy-user-0001";
let db: DB, server: Server, base: string;
const recognition = vi.fn(async () => [{ text: "my words", color: "#006688" }]);
const transcriptText = "A lecture cue.";

beforeAll(async () => {
  vi.stubEnv("SHARED_LECTURE_USERS", `${student},another`);
  db = openDb(":memory:");
  db.prepare(
    "INSERT INTO users(id, email, name, created_at, last_login_at) VALUES('another','b@local','B',datetime('now'),datetime('now'))",
  ).run();
  for (const id of [student, "another"]) {
    db.prepare(
      "INSERT OR REPLACE INTO user_profiles(user_id,university_id,program_id,onboarded) VALUES(?,'ru','bus-mkt',1)",
    ).run(id);
  }
  const lecture = db
    .prepare("SELECT id,url FROM course_lectures WHERE course_code='ACC1103' AND session_no=1")
    .get() as { id: number; url: string };
  db.prepare("INSERT INTO shared_lecture_transcripts VALUES(?,'ACC1103',1,?,?,1,60000,datetime('now'))").run(
    lecture.id, lecture.url, JSON.stringify([
      {startMs:0,endMs:1900,text:transcriptText},{startMs:2000,endMs:4000,text:"Next sentence."},
    ]));
  db.prepare("UPDATE course_lectures SET shared_transcript_id=? WHERE id=?").run(lecture.id, lecture.id);
  db.prepare("INSERT INTO shared_lecture_summaries VALUES(?, 'A Cited text example','test','v3',datetime('now'))").run(
    lecture.id,
  );
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => {
    req.user = { id: req.header("x-user") ?? student } as Express.User;
    next();
  });
  const scheduler = createAnnotationReader(db, recognition);
  app.use(createLectureAnnotationsRouter(db, recognition, scheduler), createLecturesRouter(db, scheduler));
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/lectures/ACC1103/1/annotations`;
});
afterAll(() => {
  vi.unstubAllEnvs();
  server?.close();
  db?.close();
});

function request(path: string, method = "GET", body?: unknown, user = student) {
  return fetch(base + path, {
    method,
    headers: { "Content-Type": "application/json", "x-user": user },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

describe("private annotations on lecture passages", () => {
  it("persists the quote and editable drawing exactly, and handles a repeated save once", async () => {
    const data = { key: randomUUID(), anchor, png, drawing: "YWJj", colors: ["#006688"] };
    const r = await request("", "POST", data);
    expect(r.status).toBe(200);
    const note = (await r.json()) as { id: number };
    expect(note).toMatchObject({ ...anchor, native: true, revision: 1 });
    expect(await (await request("", "POST", data)).json()).toMatchObject({ id: note.id });
    expect(await (await request(`/${note.id}/drawing`)).json()).toEqual({ drawing: "YWJj" });
    expect(Buffer.from(await (await request(`/${note.id}/image`)).arrayBuffer()).toString("base64")).toBe(png);
    for (const suffix of ["drawing", "image"])
      expect((await request(`/${note.id}/${suffix}`, "GET", undefined, "another")).status).toBe(404);
    expect((await request(`/${note.id}/read`, "POST", {}, "another")).status).toBe(404);
    expect((await request(`/${note.id}?revision=1`, "DELETE", undefined, "another")).status).toBe(404);
    expect(await (await request("", "GET", undefined, "another")).json()).toEqual({ annotations: [] });
  });
  it("displays recognised text automatically, uses reviewed words for generated copies and invalidates them on ink changes", async () => {
    const data = { key: randomUUID(), anchor, png, colors: ["#006688"] };
    const a = (await (await request("", "POST", data)).json()) as { id: number };
    const list = await (await request("")).json() as { annotations: {id:number;reviewed:boolean;ocr_status:string;runs:unknown[]}[] };
    expect(list.annotations.find(n=>n.id===a.id)).toMatchObject({ocr_status:"ready",reviewed:false,runs:[{text:"my words",color:"#006688"}]});
    const read = (await (await request(`/${a.id}/read`, "POST", {})).json()) as {
      revision: number;
      runs: { text: string; color: string }[];
    };
    expect(read.runs).toEqual([{ text: "my words", color: "#006688" }]);
    expect(annotationSources(db, student, "ACC1103", 1)).toEqual([]);
    const revised = { revision: read.revision, runs: [{ text: "my corrected words", color: "#006688" }] };
    expect(
      (await request(`/${a.id}/text`, "PUT", { ...revised, runs: [{ text: "x", color: "#000000" }] })).status,
    ).toBe(400);
    expect((await request(`/${a.id}/text`, "PUT", revised)).status).toBe(200);
    expect(annotationSources(db, student, "ACC1103", 1)).toEqual([
      { id: a.id, text: "my corrected words", colors: data.colors, runs: revised.runs },
    ]);
    expect(annotationSources(db, "another", "ACC1103", 1)).toEqual([]);
    const search = new URL("/lectures/annotation-search?q=corrected", base);
    expect(await (await fetch(search)).json()).toMatchObject({
      hits: [
        {
          id: a.id,
          course_code: "ACC1103",
          session_no: 1,
          quote: anchor.quote,
          transcription: "my corrected words",
          source: "summary",
        },
      ],
    });
    expect(await (await fetch(search, { headers: { "x-user": "another" } })).json()).toMatchObject({ hits: [] });
    expect((await request(`/${a.id}/ink`, "PUT", { ...data, revision: 2 })).status).toBe(200);
    expect((await request(`/${a.id}/text`, "PUT", revised)).status).toBe(409);
    expect(annotationSources(db, student, "ACC1103", 1)).toEqual([]);
    expect((await request(`/${a.id}?revision=3`, "DELETE")).status).toBe(200);
    expect((await request(`/${a.id}/image`)).status).toBe(404);
  });
});

const dataFor = (quote = anchor.quote) => ({
  key: randomUUID(), anchor: { ...anchor, quote, block_key: "1:0" }, png, colors: ["#006688"],
});
type Listed = { id: number; source: string; ocr_status: string; runs: {text:string;color:string}[]; revision:number };
async function list(source = "summary") {
  const result = await (await request("?source="+source)).json() as {annotations:Listed[]};
  return result.annotations;
}

it("keeps transcript anchors in their own source, recording and account after replacement or access changes", async () => {
  const data = dataFor(transcriptText);
  const saved = await request("?source=transcript", "POST", data);
  expect(saved.status).toBe(200);
  const {id} = await saved.json() as Listed;
  expect(await list("transcript")).toContainEqual(expect.objectContaining({id,block_key:"1:0",source:"transcript"}));
  expect(await list()).not.toContainEqual(expect.objectContaining({id}));
  expect((await request("/"+id+"/image")).status).toBe(404);
  expect((await request("/"+id+"/image?source=transcript", "GET", undefined, "another")).status).toBe(404);
  expect((await request("?source=summary", "POST", data)).status).toBe(409);
  expect((await request("?source=transcript", "POST", dataFor("missing cue"))).status).toBe(409);
  expect((await request("?source=transcript", "POST", dataFor("cue. Next sentence."))).status).toBe(200);
  expect((await request("?source=unknown")).status).toBe(400);
  const search = new URL("/lectures/annotation-search?q=lecture%20cue",base);
  expect((await(await fetch(search)).json())).toMatchObject({hits:[{id,source:"transcript"}]});
  const personal = new URL("/lectures/ACC1103/1/personal-notes",base);
  expect(await(await fetch(personal)).json()).toMatchObject({annotations:expect.arrayContaining([expect.objectContaining({id,source:"transcript"})])});
  vi.stubEnv("SHARED_LECTURE_USERS","another");
  try {
    const importPrivate = (text:string) => importBundle(db,student,{
      format:"studyos-lecture-transcripts",version:1,source:"test",course_codes:["ACC1103"],
      sessions:[{no:1,cues:[{startMs:0,endMs:1000,text}]}],
    });
    expect(importPrivate("Private import").saved).toBe(1);
    expect(await list("transcript")).toEqual([]);
    expect((await request("/"+id+"/image?source=transcript")).status).toBe(404);
    expect(await(await fetch(search)).json()).toMatchObject({hits:[]});
    const own = await (await request("?source=transcript","POST",dataFor("Private import"))).json() as Listed;
    expect((await request("/"+own.id+"/image?source=transcript")).status).toBe(200);
    expect(await(await fetch(personal)).json()).toMatchObject({annotations:[{id:own.id,quote:"Private import"}]});
    importPrivate("Private import");
    expect((await request("/"+own.id+"/image?source=transcript")).status).toBe(200);
    importPrivate("Replaced private recording");
    expect((await request("/"+own.id+"/image?source=transcript")).status).toBe(404);
    expect(await list("transcript")).toEqual([]);
  } finally {
    vi.stubEnv("SHARED_LECTURE_USERS",student+",another");
  }
  expect((await request("/"+id+"/image?source=transcript")).status).toBe(200);
});

it("retains original ink on recognition failure and retries once without overwriting a newer manual correction", async () => {
  recognition.mockRejectedValueOnce(new Error("Model unavailable"));
  const a = await (await request("", "POST", dataFor())).json() as Listed;
  await vi.waitFor(async()=>expect((await list()).find(n=>n.id===a.id)?.ocr_status).toBe("failed"));
  expect(Buffer.from(await(await request("/"+a.id+"/image")).arrayBuffer()).toString("base64")).toBe(png);
  let release!: (runs:{text:string;color:string}[])=>void;
  const initialCalls = recognition.mock.calls.length;
  recognition.mockImplementationOnce(()=>new Promise(r=>{release=r;}));
  const retry=()=>request("/"+a.id+"/retry","POST",{revision:a.revision});
  expect((await retry()).ok).toBe(true);
  await list();
  await retry();
  expect(recognition.mock.calls.length).toBe(initialCalls+1);
  const manual=[{text:"My own correction",color:"#006688"}];
  expect((await request("/"+a.id+"/text","PUT",{revision:a.revision,runs:manual})).status).toBe(200);
  release([{text:"Stale model response",color:"#006688"}]);
  expect((await list()).find(n=>n.id===a.id)).toMatchObject({ocr_status:"ready",reviewed:true,runs:manual});
  expect((await request("/"+a.id+"/retry","POST",{revision:a.revision})).status).toBe(409);
});

it("resumes previously persisted pending ink on opening the source and leaves reviewed text intact",async()=>{
  const rows = db.prepare("SELECT id,lecture_id FROM lecture_annotations WHERE user_id=? LIMIT 1").get(student) as {id:number;lecture_id:number};
  const insert=db.prepare(`INSERT INTO lecture_annotations(user_id,lecture_id,client_key,quote,prefix,suffix,mark,png,colors,runs,ocr_status,reviewed)
    VALUES(?,?,?,'Cited text','','','circle',?,'["#006688"]',?,?,?)`);
  const id=Number(insert.run(student,rows.lecture_id,randomUUID(),Buffer.from(png,"base64"),"[]","pending",0).lastInsertRowid);
  const kept=[{text:"Previously reviewed",color:"#006688"}];
  const other=Number(insert.run(student,rows.lecture_id,randomUUID(),Buffer.from(png,"base64"),JSON.stringify(kept),"ready",1).lastInsertRowid);
  const before=recognition.mock.calls.length;
  await fetch(new URL("/lectures/ACC1103/1/personal-notes",base));
  await vi.waitFor(()=>expect(db.prepare("SELECT ocr_status FROM lecture_annotations WHERE id=?").get(id)).toEqual({ocr_status:"ready"}));
  await vi.waitFor(async()=>{
    const notes=await list();
    expect(notes.find(n=>n.id===id)).toMatchObject({ocr_status:"ready",runs:[{text:"my words",color:"#006688"}]});
    expect(notes.find(n=>n.id===other)).toMatchObject({reviewed:true,runs:kept});
  });
  expect(recognition.mock.calls.length).toBe(before+1);
});

it("migrates stored summary ink while preserving the reader's earlier transcriptions", () => {
  const sql = readFileSync(new URL("../migrations/051_inline_lecture_annotations.sql", import.meta.url), "utf8");
  const old = openDb(":memory:");
  try {
    old.exec(`DROP TABLE lecture_annotations; DROP TABLE lecture_transcripts;
      CREATE TABLE lecture_annotations(id INTEGER PRIMARY KEY,runs TEXT,png BLOB);
      CREATE TABLE lecture_transcripts(id INTEGER PRIMARY KEY);
      INSERT INTO lecture_annotations VALUES(1,'[]',x'1234'),(2,'[{"text":"my words","color":"#008800"}]',x'7654')`);
    old.exec(sql);
    expect(old.prepare("SELECT id,source,ocr_status,reviewed,hex(png) AS png FROM lecture_annotations ORDER BY id").all())
      .toEqual([{id:1,source:"summary",ocr_status:"pending",reviewed:0,png:"1234"},
        {id:2,source:"summary",ocr_status:"ready",reviewed:1,png:"7654"}]);
  } finally { old.close(); }
});

it("offers retry when no handwriting could be read and rejects an empty replacement", async()=>{
  recognition.mockResolvedValueOnce([{text:"  ",color:"#006688"}]);
  const a=await (await request("","POST",dataFor())).json() as Listed;
  await vi.waitFor(async()=>expect((await list()).find(n=>n.id===a.id)?.ocr_status).toBe("failed"));
  expect((await request("/"+a.id+"/text","PUT",{revision:a.revision,runs:[]})).status).toBe(400);
  expect((await request("/"+a.id+"/retry","POST",{revision:a.revision})).ok).toBe(true);
  await vi.waitFor(async()=>expect((await list()).find(n=>n.id===a.id)?.ocr_status).toBe("ready"));
});

it("retains native vectors for recovery after a raster edit and reopens the current ink",async()=>{
  const data={...dataFor(),drawing:"YWJj"};
  const a=await (await request("","POST",data)).json() as Listed;
  const amended=(await sharp({create:{width:4,height:4,channels:3,background:"#006688"}}).png().toBuffer()).toString("base64");
  const changed=await(await request("/"+a.id+"/ink","PUT",{png:amended,colors:data.colors,revision:a.revision})).json() as Listed;
  expect(changed).toMatchObject({native:false,revision:a.revision+1});
  expect(await(await request("/"+a.id+"/drawing")).json()).toEqual({drawing:null});
  expect(await(await request("/"+a.id+"/drawing?original=1")).json()).toEqual({drawing:data.drawing});
  expect(Buffer.from(await(await request("/"+a.id+"/image")).arrayBuffer()).toString("base64")).toBe(amended);
  expect(await(await request("/"+a.id+"/ink","PUT",{png,colors:data.colors,drawing:"ZGVm",revision:changed.revision})).json())
    .toMatchObject({native:true,revision:changed.revision+1});
  expect(await(await request("/"+a.id+"/drawing")).json()).toEqual({drawing:"ZGVm"});
});

describe("moving a note whose words were edited away", () => {
  it("re-attaches it to new words, keeps its ink, and refuses stale or foreign moves", async () => {
    const created = await request("", "POST", { key: randomUUID(), anchor, png, colors: ["#006688"] });
    const note = (await created.json()) as { id: number; revision: number };
    const next = { quote: "example", prefix: "Cited text ", suffix: "", mark: "underline" };
    const moved = await request(`/${note.id}/anchor`, "PUT", { anchor: next, revision: note.revision });
    expect(moved.status).toBe(200);
    expect(await moved.json()).toMatchObject({ id: note.id, ...next, revision: note.revision + 1 });
    expect(Buffer.from(await (await request(`/${note.id}/image`)).arrayBuffer()).toString("base64")).toBe(png);
    expect((await request(`/${note.id}/anchor`, "PUT", { anchor, revision: note.revision })).status).toBe(409);
    expect((await request(`/${note.id}/anchor`, "PUT", { anchor, revision: note.revision + 1 }, "another")).status).toBe(404);
  });
});
