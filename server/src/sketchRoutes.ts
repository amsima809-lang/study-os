import { Router } from "express";
import { readFile } from "node:fs/promises";
import { basename, join } from "node:path";
import { z } from "zod";
import { hasAiSubscription, isAiConfigured } from "./ai.js";
import type { DB } from "./db.js";
import { env } from "./env.js";
import { sketchModel } from "./sketchModel.js";
import { applySketchAnswers, extractSketch } from "./sketchPage.js";
import type { Bounds, SketchPage, SketchState } from "./sketchSchema.js";

const unit = z.number().min(0).max(1);
const Strokes = z.array(z.tuple([unit, unit, unit, unit])).max(20000);
export function parseSketchStrokes(raw: unknown): Bounds[] | null {
  if (typeof raw !== "string" || raw.length > 3_000_000) return null;
  try {
    const parsed = Strokes.safeParse(JSON.parse(raw));
    return parsed.success && parsed.data.length ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Only the owner's personally checked, verbatim text is eligible for quotation as their wording. */
export function sketchSources(db: DB, userId: string, noteId: number) {
  const rows = db
    .prepare(
      `SELECT p.document_json FROM sketch_pages p JOIN notes n ON n.id=p.note_id
    WHERE n.id=? AND n.user_id=? AND p.verified=1 ORDER BY p.image_index`,
    )
    .all(noteId, userId) as { document_json: string }[];
  const passages: { runs: { text: string; color: string }[] }[] = [];
  for (const row of rows) {
    const page = JSON.parse(row.document_json) as SketchPage;
    for (const block of page.reading.notes.blocks) {
      if (block.type !== "heading" && block.type !== "text") continue;
      let runs: { text: string; color: string }[] = [];
      for (const run of block.runs) {
        if (run.authored) runs.push({ text: run.text, color: run.ink });
        else {
          if (runs.some((r) => r.text.trim())) passages.push({ runs });
          runs = [];
        }
      }
      if (runs.some((r) => r.text.trim())) passages.push({ runs });
    }
  }
  return passages;
}

type Row = { stroke_bounds: string | null; document_json: string | null; revision: number; verified: number };
const Answers = z.object({
  revision: z.number().int().positive(),
  answers: z.array(z.object({ yes: z.boolean(), correction: z.string().trim().max(500).optional() })).max(3),
  correction: z.string().trim().max(2000).default(""),
});

export function createSketchRouter(
  db: DB,
  model = sketchModel(db),
  configured = () => isAiConfigured() && env.aiProvider === "deepseek",
): Router {
  const router = Router();
  const pending = new Set<string>();
  const failed = new Set<string>();
  const base = "/notes/:id/sketch/:page";
  function getRow(noteId: number, index: number): Row | undefined {
    return db
      .prepare(
        "SELECT stroke_bounds,document_json,revision,verified FROM sketch_pages WHERE note_id=? AND image_index=?",
      )
      .get(noteId, index) as Row | undefined;
  }
  function status(noteId: number, index: number, key: string): SketchState {
    const row = getRow(noteId, index);
    return {
      document: row?.document_json ? JSON.parse(row.document_json) : null,
      revision: row?.revision ?? 0,
      verified: !!row?.verified,
      busy: pending.has(key),
      failed: failed.has(key),
    };
  }
  function launch(key: string, work: () => Promise<void>) {
    failed.delete(key);
    pending.add(key);
    void work()
      .catch(() => {
        // Never log image data or model output. The original page and previous reading remain available.
        failed.add(key);
        if (failed.size > 2000) failed.delete(failed.values().next().value!);
      })
      .finally(() => pending.delete(key));
  }
  router.use(base, (req, res, next) => {
    const noteId = Number(req.params.id),
      index = Number(req.params.page);
    const row = db.prepare("SELECT image_paths FROM notes WHERE id=? AND user_id=?").get(noteId, req.user!.id) as
      { image_paths: string | null } | undefined;
    const paths: unknown = JSON.parse(row?.image_paths ?? "[]");
    if (
      !row ||
      !Number.isSafeInteger(index) ||
      index < 0 ||
      !Array.isArray(paths) ||
      typeof paths[index] !== "string"
    )
      return res.sendStatus(404);
    res.locals.sketch = {
      noteId,
      index,
      key: `${noteId}/${index}`,
      file: join(env.uploadDir, basename(paths[index])),
    };
    next();
  });
  router.get(base, (_req, res) => {
    const { noteId, index, key } = res.locals.sketch;
    res.json(status(noteId, index, key));
  });
  router.post(base, (req, res) => {
    const { noteId, index, key, file } = res.locals.sketch;
    const row = getRow(noteId, index);
    if (pending.has(key) || row?.document_json) return res.json(status(noteId, index, key));
    if (!hasAiSubscription(db, req.user!.id)) return res.sendStatus(403);
    if (!configured()) return res.status(503).json({ error: "AI ยังไม่พร้อมใช้งานตอนนี้ ลองใหม่ภายหลัง" });
    launch(key, async () => {
      const page = await extractSketch(
        model,
        await readFile(file),
        JSON.parse(row?.stroke_bounds ?? "[]") as Bounds[],
      );
      db.prepare(
        `INSERT INTO sketch_pages (note_id,image_index,document_json,revision) VALUES (?,?,?,1)
        ON CONFLICT(note_id,image_index) DO UPDATE SET document_json=excluded.document_json,revision=1 WHERE sketch_pages.revision=0`,
      ).run(noteId, index, JSON.stringify(page));
    });
    res.status(202).json(status(noteId, index, key));
  });
  router.post(base + "/answers", (req, res) => {
    const { noteId, index, key } = res.locals.sketch;
    const body = Answers.safeParse(req.body);
    if (!body.success) return res.sendStatus(400);
    const row = getRow(noteId, index);
    if (!row?.document_json || body.data.revision !== row.revision || pending.has(key)) return res.sendStatus(409);
    const page: SketchPage = JSON.parse(row.document_json);
    const { answers, correction } = body.data;
    if (
      (!page.checks.length && !correction) ||
      page.checks.length !== answers.length ||
      answers.some((a) => !a.yes && !a.correction)
    )
      return res.sendStatus(400);
    if (correction || answers.some((a) => !a.yes)) {
      if (!hasAiSubscription(db, req.user!.id)) return res.sendStatus(403);
      if (!configured()) return res.sendStatus(503);
    }
    launch(key, async () => {
      const updated = await applySketchAnswers(model, page, answers, correction);
      db.prepare(
        "UPDATE sketch_pages SET document_json=?,revision=revision+1,verified=0 WHERE note_id=? AND image_index=? AND revision=?",
      ).run(JSON.stringify(updated), noteId, index, row.revision);
    });
    res.status(202).json(status(noteId, index, key));
  });
  router.post(base + "/verify", (req, res) => {
    const { noteId, index, key } = res.locals.sketch;
    const state = status(noteId, index, key);
    if (!state.document || state.busy || state.document.checks.length || state.revision !== req.body?.revision)
      return res.sendStatus(409);
    db.prepare("UPDATE sketch_pages SET verified=1 WHERE note_id=? AND image_index=?").run(noteId, index);
    res.json(status(noteId, index, key));
  });
  return router;
}
