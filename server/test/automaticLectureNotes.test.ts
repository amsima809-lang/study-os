import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { beforeAll, afterAll, expect, it, vi } from "vitest";
import { openDb } from "../src/db.js";
import { seedDatabase } from "../src/seed.js";
import { findOrCreateUser } from "../src/auth.js";
import { createAutomaticLectureNotes, createLectureNotesRouter } from "../src/createdLectureNotes.js";
import { createNotesRouter } from "../src/notes.js";

const db = openDb(":memory:");
let server: Server, base: string, user: string, other: string, lecture: number;
let hold: Promise<void> | undefined, fail = false;
const placed: string[][] = [];
const place: NonNullable<Parameters<typeof createAutomaticLectureNotes>[1]> = async (_db, inputs) => {
  placed.push(inputs.notes.map(p => p.runs.map(r => r.text).join("")));
  await hold;
  if (fail) throw new Error("transient failure");
  return inputs.notes.map(() => 0);
};
const auto = createAutomaticLectureNotes(db, place);
const status = "/lectures/ACC1101/1/combined-notes";
beforeAll(async () => {
  seedDatabase(db, { reset: false });
  user = findOrCreateUser(db, { email: "author@example.test", name: "Author", avatar: "" });
  other = findOrCreateUser(db, { email: "other@example.test", name: "Other", avatar: "" });
  lecture = (db.prepare("SELECT id FROM course_lectures WHERE course_code='ACC1101' AND session_no=1").get() as { id: number }).id;
  db.prepare("INSERT INTO shared_lecture_transcripts VALUES (?,'ACC1101',1,'fixture','[]',1,1000,'today')").run(lecture);
  db.prepare("UPDATE course_lectures SET shared_transcript_id=? WHERE id=?").run(lecture,lecture);
  db.prepare("INSERT INTO shared_lecture_summaries VALUES (?,'First line'||char(10)||'Second line','fixture','v3','today')").run(lecture);
  const app = express();
  app.use(express.json(), (req, _res, next) => { req.user={id:req.header("x-user") ?? user} as Express.User; next(); });
  app.use(createNotesRouter(db, auto.changed));
  app.use(createLectureNotesRouter(db, place, auto));
  server = app.listen(0, "127.0.0.1");
  await new Promise<void>(r => server.once("listening", r));
  base = "http://127.0.0.1:" + (server.address() as AddressInfo).port;
});
afterAll(() => {server.close(); db.close();});

const read = async (who = user) => (await fetch(base + status, {headers: {"x-user":who}})).json() as Promise<{
  status: string; created: { blocks: { kind: string; runs?: { text: string }[] }[]; version: number } | null
}>;
async function note(text: string) {
  const body = new FormData();
  body.append("lecture_tray","1"); body.append("course_code", "ACC1101"); body.append("lecture_no", "1"); body.append("raw_text", text);
  const r = await fetch(base + "/notes", {method:"POST", body}); expect(r.status).toBe(201);
  return ((await r.json()) as {id:number}).id;
}

it("automatically combines saved notes, coalesces changes during placement and never serves another reader's copy", async () => {
  let resume!: () => void;
  hold = new Promise(r => {resume = r;});
  const first = await note("First private note");
  expect(placed).toEqual([["First private note"]]);
  const second = await note("Second private note");
  expect(await read()).toEqual({status:"pending",created:null});
  expect(await read(other)).toEqual({status:"ready",created:null});
  expect(placed).toHaveLength(1);
  expect((await fetch(base + "/notes/" + first, {method:"DELETE"})).ok).toBe(true);
  hold = undefined; resume();
  await vi.waitFor(async () => expect((await read()).status).toBe("ready"));
  const current = await read();
  expect(current.created?.blocks.filter(b => b.kind==="mine").map(b => b.runs![0].text)).toEqual(["Second private note"]);
  expect(placed).toEqual([["First private note"], ["Second private note"]]);
  expect(await read()).toEqual(current);
  const afterRestart = createAutomaticLectureNotes(db,place);
  expect(afterRestart.state(user,"ACC1101",1)).toEqual(current);
  expect(placed).toHaveLength(2);

  fail = true;
  const edit = await fetch(base + "/notes/" + second + "/content", {method:"PUT", headers:{"content-type":"application/json"},
    body:JSON.stringify({title:"",raw_text:"Revised private note",previous_raw_text:"Second private note",previous_title:null})});
  expect(edit.status).toBe(200);
  expect(await read()).toEqual({status:"failed",created:null});
  expect((await read()).status).toBe("failed");
  expect(placed).toHaveLength(3);
  fail = false;
  expect((await fetch(base + status + "/retry",{method:"POST"})).ok).toBe(true);
  await vi.waitFor(async () => expect((await read()).status).toBe("ready"));
  expect((await read()).created?.version).toBe(2);
  await fetch(base+"/notes/"+second,{method:"DELETE"});
  expect(await read()).toEqual({status:"ready",created:null});
  expect(db.prepare("SELECT 1 FROM automatic_lecture_notes").get()).toBeUndefined();
});
