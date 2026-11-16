/** Deleting one photo of a note keeps the rest, shifts what refers to later photos, and removes the file. */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { existsSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, basename } from "node:path";

const uploads = mkdtempSync(join(tmpdir(), "note-photo-delete-"));
process.env.UPLOAD_DIR = uploads;
delete process.env.DEEPSEEK_API_KEY;
delete process.env.ANTHROPIC_API_KEY;

const express = (await import("express")).default;
const sharp = (await import("sharp")).default;
const { openDb } = await import("../src/db.js");
const { seedDatabase } = await import("../src/seed.js");
const { findOrCreateUser } = await import("../src/auth.js");
const { createNotesRouter } = await import("../src/notes.js");

let server: Server, base = "", db: ReturnType<typeof openDb>, user = "";
beforeAll(async () => {
  db = openDb(":memory:");
  seedDatabase(db, { reset: false });
  user = findOrCreateUser(db, { email: "del@example.com", name: "D", avatar: "" });
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { (req as unknown as { user: { id: string } }).user = { id: user }; next(); });
  app.use("/api", createNotesRouter(db));
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});
afterAll(() => server?.close());

const jpeg = await sharp({ create: { width: 30, height: 20, channels: 3, background: "#ccc" } }).jpeg().toBuffer();
async function create(n: number, text = "") {
  const form = new FormData();
  if (text) form.append("raw_text", text);
  for (let i = 0; i < n; i++) form.append("images", new Blob([new Uint8Array(jpeg)], { type: "image/jpeg" }), `p${i}.jpg`);
  const r = await fetch(`${base}/notes`, { method: "POST", body: form });
  expect(r.status).toBe(201);
  return (await r.json()) as { id: number; image_paths: string[] };
}
const file = (p: string) => join(uploads, basename(p));

describe("deleting one photo of a note", () => {
  it("keeps the other photos, moves later page readings down by one and deletes the file", async () => {
    const note = await create(3, "slides");
    db.prepare("INSERT INTO sketch_pages(note_id,image_index) VALUES (?,0),(?,1),(?,2)").run(note.id, note.id, note.id);
    db.prepare("UPDATE notes SET handwriting_image_index=2 WHERE id=?").run(note.id);
    const r = await fetch(`${base}/notes/${note.id}/images/1`, { method: "DELETE" });
    expect(r.status).toBe(200);
    const after = (await r.json()) as { image_paths: string[] };
    expect(after.image_paths).toEqual([note.image_paths[0], note.image_paths[2]]);
    expect(existsSync(file(note.image_paths[1]))).toBe(false);
    expect(existsSync(file(note.image_paths[0]))).toBe(true);
    const pages = db.prepare("SELECT image_index FROM sketch_pages WHERE note_id=? ORDER BY image_index").all(note.id) as { image_index: number }[];
    expect(pages.map(p => p.image_index)).toEqual([0, 1]);
    expect((db.prepare("SELECT handwriting_image_index AS i FROM notes WHERE id=?").get(note.id) as { i: number }).i).toBe(1);
  });

  it("refuses to delete a photo that is the note's only content, and a bad position", async () => {
    const note = await create(1);
    const r = await fetch(`${base}/notes/${note.id}/images/0`, { method: "DELETE" });
    expect(r.status).toBe(400);
    expect(((await r.json()) as { code: string }).code).toBe("LAST_CONTENT");
    expect((await fetch(`${base}/notes/${note.id}/images/5`, { method: "DELETE" })).status).toBe(404);
  });

  it("deleting a whole note also deletes its photo files", async () => {
    const note = await create(2, "x");
    expect((await fetch(`${base}/notes/${note.id}`, { method: "DELETE" })).status).toBe(200);
    for (const p of note.image_paths) expect(existsSync(file(p))).toBe(false);
  });
});
