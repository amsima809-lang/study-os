import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import express from "express";
import { openDb, type DB } from "../src/db.js";
import { annotationSources, createLectureAnnotationsRouter } from "../src/lectureAnnotations.js";

const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zl1sAAAAASUVORK5CYII=";
const anchor = { quote: "Cited text", prefix: "A ", suffix: " example", mark: "circle" };
const student = "legacy-user-0001";
let db: DB, server: Server, base: string;

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
  db.prepare("INSERT INTO shared_lecture_transcripts VALUES(?,'ACC1103',1,?,'[]',1,60000,datetime('now'))").run(
    lecture.id,
    lecture.url,
  );
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
  app.use(createLectureAnnotationsRouter(db, async () => [{ text: "my words", color: "#006688" }]));
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

describe("private annotations on lecture summaries", () => {
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
  it("keeps recognised text as a draft until saved and invalidates it when the ink changes", async () => {
    const data = { key: randomUUID(), anchor, png, colors: ["#006688"] };
    const a = (await (await request("", "POST", data)).json()) as { id: number };
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
