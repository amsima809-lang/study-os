import { afterAll, beforeAll, describe, expect, it } from "vitest";
import express from "express";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createLectureNotesRouter, assembleLectureNotes } from "../src/createdLectureNotes.js";
import { openDb } from "../src/db.js";
import { seedDatabase } from "../src/seed.js";
import { findOrCreateUser } from "../src/auth.js";

describe("personal notes alongside a saved lecture", () => {
  const db = openDb(":memory:");
  let server: Server, base: string, owner: string, other: string, lecture: number;
  let calls = 0;
  const path = "/lectures/ACC1101/1/created-notes";
  beforeAll(async () => {
    seedDatabase(db, { reset: false });
    owner = findOrCreateUser(db, { email: "one@example.test", name: "One", avatar: "" });
    other = findOrCreateUser(db, { email: "two@example.test", name: "Two", avatar: "" });
    lecture = (
      db.prepare("SELECT id FROM course_lectures WHERE course_code='ACC1101' AND session_no=1").get() as {
        id: number;
      }
    ).id;
    db.prepare(
      "INSERT INTO shared_lecture_transcripts VALUES (?,'ACC1101',1,'fixture','[]',1,1000,'today')",
    ).run(lecture);
    db.prepare("UPDATE course_lectures SET shared_transcript_id=? WHERE id=?").run(lecture, lecture);
    db.prepare(
      "INSERT INTO shared_lecture_summaries VALUES (?,'First line'||char(10)||'Next line','fixture','v3','today')",
    ).run(lecture);
    const add = db.prepare(
      "INSERT INTO notes(user_id,lecture_id,raw_text,created_at) VALUES (?,?,?,'today')",
    );
    add.run(owner, lecture, "my first line\nmy second line");
    add.run(other, lecture, "private other note");
    const app = express();
    app.use(express.json(), (req, _res, next) => {
      req.user = { id: req.header("x-reader")! } as Express.User;
      next();
    });
    app.use(
      createLectureNotesRouter(db, async (_db, inputs) => {
        calls++;
        expect(inputs.notes.flatMap((n) => n.runs.map((r) => r.text))).toEqual([
          "my first line",
          "my second line",
        ]);
        return [1, 0];
      }),
    );
    server = app.listen(0, "127.0.0.1");
    await new Promise<void>((resolve) => server.once("listening", resolve));
    base = "http://127.0.0.1:" + (server.address() as AddressInfo).port;
  });
  afterAll(() => {
    server?.close();
    db.close();
  });
  function request(reader: string, method: string, url: string, mode?: string) {
    return fetch(base + url, {
      method,
      headers: { "x-reader": reader, "content-type": "application/json" },
      ...(mode && { body: JSON.stringify({ mode }) }),
    });
  }
  it("saves the account's preference and places every original passage exactly once", async () => {
    expect((await request(owner, "PUT", "/lecture-note-preference", "combined")).ok).toBe(true);
    const res = await request(owner, "POST", path, "combined");
    expect(res.status).toBe(200);
    const { blocks } = (await res.json()) as { blocks: { text?: string; runs?: { text: string }[] }[] };
    expect(
      blocks.map((b: { text?: string; runs?: { text: string }[] }) => b.text ?? b.runs![0].text),
    ).toEqual(["First line", "my second line", "Next line", "my first line"]);
    expect(await (await request(owner, "GET", path)).json()).toMatchObject({
      mode: "combined",
      created: { version: 1 },
    });
    expect(await (await request(other, "GET", path)).json()).toEqual({ mode: "separate", created: null });
    expect((await request(owner, "POST", path, "separate")).ok).toBe(true);
    expect(calls).toBe(1);
  });
  it("rejects invented indices and missing passages and keeps the saved ink shade", () => {
    const input = {
      summary: ["A"],
      notes: [{ id: 1, source: "annotation" as const, runs: [{ text: "คำเดิม", color: "#123abc" }] }],
    };
    expect(() => assembleLectureNotes(input, [2])).toThrow();
    expect(() => assembleLectureNotes(input, [])).toThrow();
    expect(assembleLectureNotes(input, [0])[1]).toMatchObject({ kind: "mine", runs: input.notes[0].runs });
  });
});
