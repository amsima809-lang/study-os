/**
 * POST /api/notes/:id/summarize — AI summary for a note that is already saved
 * (one saved while AI was off). The model is stubbed: this checks what is sent and stored.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import sharp from "sharp";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

const uploadDir = mkdtempSync(join(tmpdir(), "notes-sum-"));
process.env.UPLOAD_DIR = uploadDir;

const seen: { text?: string; images: number }[] = [];
vi.mock("../src/ai.js", async (importOriginal) => {
  const real = await importOriginal<typeof import("../src/ai.js")>();
  return {
    ...real,
    isAiConfigured: () => true,
    noteModelCall: (_db: unknown, input: { text?: string; images?: unknown[] }) => {
      seen.push({ text: input.text, images: input.images?.length ?? 0 });
      return async () => ({ text: "", usage: { input_tokens: 0, output_tokens: 0 } });
    },
    generateNoteLearning: async () => ({
      summary_md: "สรุปทดสอบ",
      mindmap_md: "- แผนผัง",
      key_terms: [{ term: "will", definition: "ตัดสินใจทันที" }],
      topics: ["Future Forms"],
    }),
  };
});

const express = (await import("express")).default;
const { openDb } = await import("../src/db.js");
const { seedDatabase } = await import("../src/seed.js");
const { findOrCreateUser } = await import("../src/auth.js");
const { createNotesRouter } = await import("../src/notes.js");

let db: ReturnType<typeof openDb>;
let server: Server;
let base = "";
let as = "";
beforeAll(async () => {
  db = openDb(":memory:");
  seedDatabase(db, { reset: false });
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { (req as unknown as { user: { id: string } }).user = { id: as }; next(); });
  app.use("/api", createNotesRouter(db));
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => { server?.close(); db?.close(); rmSync(uploadDir, { recursive: true, force: true }); });

const addNote = (userId: string, raw: string | null, images: string[] = []) =>
  Number(
    db
      .prepare("INSERT INTO notes (user_id, course_code, created_at, title, raw_text, image_paths) VALUES (?, 'RAM1111', ?, 't', ?, ?)")
      .run(userId, new Date().toISOString(), raw, JSON.stringify(images)).lastInsertRowid,
  );
const summarize = (id: number) => fetch(`${base}/api/notes/${id}/summarize`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });

describe("handwritten note originals", () => {
  const create = (body: FormData) => fetch(base + "/api/notes", { method: "POST", body });
  type Saved = { id: number; image_paths: string[] };

  it("saves a drawn page exactly as uploaded beside another photo, deferring recognition until requested", async () => {
    as = findOrCreateUser(db, { email: "ink@example.com", name: "Ink", avatar: "" });
    const ink = await sharp({ create: { width: 5000, height: 30, channels: 3, background: "#854120" } }).png().toBuffer();
    const form = new FormData();
    form.append("images", new Blob([new Uint8Array(ink)]), "other.png");
    form.append("images", new Blob([new Uint8Array(ink)]), "drawn-page.png");
    form.append("handwriting_image_index", "1");
    seen.length = 0;
    const response = await create(form);
    expect(response.status).toBe(201);
    const note = await response.json() as Saved;
    expect(note).toMatchObject({ handwriting_image_index: 1, ai_skipped: true, summary_md: "" });
    expect(seen).toEqual([]);
    expect(note.image_paths).toHaveLength(2);
    expect(note.image_paths[1]).toMatch(/\.png$/);
    expect(readFileSync(join(uploadDir, basename(note.image_paths[1])))).toEqual(ink);
    expect(await (await fetch(base + "/api/notes/" + note.id)).json()).toMatchObject({
      handwriting_image_index: 1, image_paths: note.image_paths, ai_summary_md: null,
    });
    expect(db.prepare("SELECT document_json FROM sketch_pages WHERE note_id=?").get(note.id)).toBeUndefined();
  });

  it("recognizes the final PencilKit image on older requests and retains its stroke bounds", async () => {
    const jpg = await sharp({ create: { width: 4, height: 8, channels: 3, background: "#fff" } }).jpeg().toBuffer();
    const form = new FormData();
    const strokes = "[[0.1,0.2,0.8,0.9]]";
    form.append("images", new Blob([new Uint8Array(jpg)]), "handwriting.jpg");
    form.append("handwriting_strokes", strokes);
    const response = await create(form);
    expect(response.status).toBe(201);
    const note = await response.json() as Saved;
    expect(note).toMatchObject({ handwriting_image_index: 0, ai_skipped: true });
    expect(note.image_paths[0]).toMatch(/\.jpg$/);
    expect(readFileSync(join(uploadDir, basename(note.image_paths[0])))).toEqual(jpg);
    expect(db.prepare("SELECT stroke_bounds FROM sketch_pages WHERE note_id=? AND image_index=0").get(note.id)).toEqual({stroke_bounds:strokes});
  });

  it("rejects a missing or non-raster original and continues to summarize ordinary notes", async () => {
    const form = new FormData();
    form.append("handwriting_image_index", "0");
    expect((await create(form)).status).toBe(400);
    form.append("images", new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="5" height="5"/>'], {type:"image/png"}), "drawing.png");
    expect((await create(form)).status).toBe(400);
    const ordinary = new FormData();
    ordinary.append("raw_text", "typed");
    seen.length = 0;
    expect(await (await create(ordinary)).json()).toMatchObject({handwriting_image_index:null, ai_skipped:false});
    expect(seen).toEqual([{text:"typed",images:0}]);
  });

  it("recovers only known pen pages during migration", () => {
    const path = join(uploadDir, "old-ink.sqlite");
    const old = openDb(path);
    const user = findOrCreateUser(old, { email: "oldink@example.com", name: "Ink", avatar: "" });
    const save = old.prepare("INSERT INTO notes(user_id,created_at,image_paths) VALUES (?,'today','[\"/one.jpg\",\"/two.jpg\"]')");
    const pen = Number(save.run(user).lastInsertRowid);
    const photo = Number(save.run(user).lastInsertRowid);
    old.prepare("INSERT INTO sketch_pages(note_id,image_index,stroke_bounds) VALUES (?,1,'[[0.1,0.2,0.8,0.9]]')").run(pen);
    old.prepare("INSERT INTO sketch_pages(note_id,image_index,document_json) VALUES (?,0,'{}')").run(photo);
    old.exec("ALTER TABLE notes DROP COLUMN handwriting_image_index; DELETE FROM _migrations WHERE name='050_handwriting_original.sql'");
    old.close();
    const upgraded = openDb(path);
    try {
      expect(upgraded.prepare("SELECT handwriting_image_index FROM notes ORDER BY id").all())
        .toEqual([{handwriting_image_index:1},{handwriting_image_index:null}]);
    } finally { upgraded.close(); }
  });
});

describe("summarising a saved note with AI", () => {
  it("fills the note's AI fields from its own text and photos and returns the note", async () => {
    as = findOrCreateUser(db, { email: "a@example.com", name: "A", avatar: "" });
    writeFileSync(join(uploadDir, "note_1.jpg"), await sharp({ create: { width: 4, height: 4, channels: 3, background: "white" } }).jpeg().toBuffer());
    const id = addNote(as, "Future Uses", ["/api/uploads/note_1.jpg"]);
    seen.length = 0;
    const r = await summarize(id);
    expect(r.status).toBe(200);
    const note = (await r.json()) as { ai_summary_md: string; key_terms: unknown[]; topics: string[]; raw_text: string };
    expect(note.ai_summary_md).toBe("สรุปทดสอบ");
    expect(note.key_terms).toHaveLength(1);
    expect(note.topics).toEqual(["Future Forms"]);
    expect(note.raw_text).toBe("Future Uses"); // her own text is untouched
    expect(seen).toEqual([{ text: "Future Uses", images: 1 }]);
    const topic = db.prepare("SELECT 1 FROM topics WHERE user_id = ? AND course_code = 'RAM1111' AND name = 'Future Forms'").get(as);
    expect(topic).toBeTruthy();
  });

  it("never reads a file outside the upload folder, and skips a missing photo", async () => {
    const id = addNote(as, "text", ["/api/uploads/../../etc/passwd", "/api/uploads/gone.jpg"]);
    seen.length = 0;
    expect((await summarize(id)).status).toBe(200);
    expect(seen).toEqual([{ text: "text", images: 0 }]);
  });

  it("refuses another student's note", async () => {
    const other = findOrCreateUser(db, { email: "b@example.com", name: "B", avatar: "" });
    const id = addNote(other, "theirs");
    expect((await summarize(id)).status).toBe(404);
    expect((db.prepare("SELECT ai_summary_md FROM notes WHERE id = ?").get(id) as { ai_summary_md: string | null }).ai_summary_md).toBeNull();
  });

  it("says so when there is nothing to summarise", async () => {
    const id = addNote(as, "  ", ["/api/uploads/gone.jpg"]);
    expect((await summarize(id)).status).toBe(400);
  });
});

describe("editing a saved note's AI summary", () => {
  const edit = (id: number, previous: string, summary: string | null) => fetch(`${base}/api/notes/${id}/summary`, {
    method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify({ previous_md: previous, summary_md: summary }),
  });
  it("uses the personal copy in detail and search, and restores the exact model text", async () => {
    as = findOrCreateUser(db, { email: "editor@example.com", name: "Editor", avatar: "" });
    const id = addNote(as, "my original note");
    db.prepare("UPDATE notes SET ai_summary_md = 'AI **original**' WHERE id=?").run(id);
    expect(await (await edit(id, "AI **original**", "my correction")).json()).toMatchObject({
      ai_summary_md: "my correction", summary_edited: true, raw_text: "my original note",
    });
    expect(await (await fetch(`${base}/api/notes/search?q=correction`)).json()).toMatchObject({ notes: [{id}] });
    expect((await edit(id, "AI **original**", "stale edit")).status).toBe(409);
    expect((await edit(id, "my correction", "  ")).status).toBe(400);
    const me = as;
    as = findOrCreateUser(db, { email: "another-editor@example.com", name: "Other", avatar: "" });
    expect((await edit(id, "my correction", null)).status).toBe(404);
    as = me;
    expect(await (await edit(id, "my correction", null)).json()).toMatchObject({
      ai_summary_md: "AI **original**", summary_edited: false, raw_text: "my original note",
    });
  });
  it("preserves an edit when the model regenerates a photo summary", async () => {
    as = findOrCreateUser(db, { email: "editor@example.com", name: "Editor", avatar: "" });
    const photo = await sharp({ create: { width: 4, height: 4, channels: 3, background: "white" } }).jpeg().toBuffer();
    writeFileSync(join(uploadDir, "edit-photo.jpg"), photo);
    const id = addNote(as, null, ["/api/uploads/edit-photo.jpg"]);
    db.prepare("UPDATE notes SET ai_summary_md = 'first model text' WHERE id=?").run(id);
    expect((await edit(id, "first model text", "photo correction")).status).toBe(200);
    expect(await (await summarize(id)).json()).toMatchObject({ ai_summary_md:"photo correction", summary_edited:true });
    expect(await (await edit(id,"photo correction", null)).json()).toMatchObject({ ai_summary_md:"สรุปทดสอบ", summary_edited:false });
  });
});
