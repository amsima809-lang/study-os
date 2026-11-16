/**
 * POST /api/notes/:id/summarize — AI summary for a note that is already saved
 * (one saved while AI was off). The model is stubbed: this checks what is sent and stored.
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

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
afterAll(() => server?.close());

const addNote = (userId: string, raw: string | null, images: string[] = []) =>
  Number(
    db
      .prepare("INSERT INTO notes (user_id, course_code, created_at, title, raw_text, image_paths) VALUES (?, 'RAM1111', ?, 't', ?, ?)")
      .run(userId, new Date().toISOString(), raw, JSON.stringify(images)).lastInsertRowid,
  );
const summarize = (id: number) => fetch(`${base}/api/notes/${id}/summarize`, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });

describe("summarising a saved note with AI", () => {
  it("fills the note's AI fields from its own text and photos and returns the note", async () => {
    as = findOrCreateUser(db, { email: "a@example.com", name: "A", avatar: "" });
    writeFileSync(join(uploadDir, "note_1.jpg"), Buffer.from([0xff, 0xd8, 0xff]));
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
