/** POST /api/notes takes up to MAX_NOTE_PHOTOS photos and says so clearly when there are more. */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

process.env.UPLOAD_DIR = mkdtempSync(join(tmpdir(), "note-photos-"));
delete process.env.DEEPSEEK_API_KEY;
delete process.env.ANTHROPIC_API_KEY;

const express = (await import("express")).default;
const sharp = (await import("sharp")).default;
const { openDb } = await import("../src/db.js");
const { seedDatabase } = await import("../src/seed.js");
const { findOrCreateUser } = await import("../src/auth.js");
const { createNotesRouter, MAX_NOTE_PHOTOS } = await import("../src/notes.js");

let server: Server;
let base = "";
beforeAll(async () => {
  const db = openDb(":memory:");
  seedDatabase(db, { reset: false });
  const id = findOrCreateUser(db, { email: "photos@example.com", name: "P", avatar: "" });
  const app = express();
  app.use((req, _res, next) => { (req as unknown as { user: { id: string } }).user = { id }; next(); });
  app.use("/api", createNotesRouter(db));
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server?.close());

const jpeg = await sharp({ create: { width: 40, height: 30, channels: 3, background: "#ddd" } }).jpeg().toBuffer();
const post = (n: number) => {
  const form = new FormData();
  form.append("raw_text", "slides");
  for (let i = 0; i < n; i++) form.append("images", new Blob([new Uint8Array(jpeg)], { type: "image/jpeg" }), `S__${i}.jpg`);
  return fetch(`${base}/api/notes`, { method: "POST", body: form });
};

describe("photos on one note", () => {
  it("takes six photos (a run of slides), more than the old limit of five", async () => {
    expect(MAX_NOTE_PHOTOS).toBeGreaterThanOrEqual(6);
    const r = await post(6);
    expect(r.status).toBe(201);
  });
  it("answers too many photos with a clear message, not a server error", async () => {
    const r = await post(MAX_NOTE_PHOTOS + 2);
    expect(r.status).toBe(400);
    expect(((await r.json()) as { code: string }).code).toBe("TOO_MANY_PHOTOS");
  });
});
