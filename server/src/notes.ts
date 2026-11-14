/**
 * Phase 3 routes: create a note (photo/text) -> AI learning material, and
 * list/read saved notes. Also exposes the course list for the add-note form.
 */
import { Router } from "express";
import multer from "multer";
import sharp from "sharp";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { DB } from "./db.js";
import { env } from "./env.js";
import {
  generateNoteLearning,
  noteModelCall,
  generateCourseSummary,
  courseSummaryModelCall,
  isAiConfigured,
  AiNotConfiguredError,
  AiSubscriptionRequired,
  checkAiSubscription,
  hasAiSubscription,
  AiError,
  type ImageInput,
} from "./ai.js";

// Keep uploads in memory so we can resize before writing to disk.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 12 * 1024 * 1024, files: 5 },
});

// Anthropic recommends the long edge be <= 1568px.
const MAX_EDGE = 1568;

async function resizeToJpeg(buffer: Buffer): Promise<Buffer> {
  return sharp(buffer)
    .rotate() // respect EXIF orientation from phone cameras
    .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 82 })
    .toBuffer();
}

export type NoteHit = {
  id: number;
  course_code: string | null;
  title: string | null;
  created_at: string;
  /** A short piece of the note around the first match, or its opening words. */
  snippet: string;
};

/**
 * Search one student's notes: every word of the query must appear somewhere in
 * the title, the typed text or the AI summary (any order, case-insensitive).
 * Newest first, at most 50.
 */
export function searchNotes(db: DB, userId: string, query: string): NoteHit[] {
  const words = query.trim().toLowerCase().split(/\s+/).filter(Boolean).slice(0, 6);
  if (words.length === 0) return [];
  // % and _ are wildcards in LIKE; search for them literally.
  const like = (w: string) => `%${w.replace(/[\\%_]/g, "\\$&")}%`;
  const haystack = "lower(coalesce(title,'') || ' ' || coalesce(raw_text,'') || ' ' || coalesce(ai_summary_md,''))";
  const rows = db
    .prepare(
      `SELECT id, course_code, title, created_at, raw_text, ai_summary_md
         FROM notes
        WHERE user_id = ? AND ${words.map(() => `${haystack} LIKE ? ESCAPE '\\'`).join(" AND ")}
        ORDER BY created_at DESC LIMIT 50`,
    )
    .all(userId, ...words.map(like)) as Array<Omit<NoteHit, "snippet"> & { raw_text: string | null; ai_summary_md: string | null }>;

  return rows.map(({ raw_text, ai_summary_md, ...note }) => {
    const body = [raw_text, ai_summary_md].find((t) => t && words.some((w) => t.toLowerCase().includes(w))) ?? raw_text ?? ai_summary_md ?? "";
    const flat = body.replace(/\s+/g, " ").trim();
    const at = Math.max(0, ...words.map((w) => flat.toLowerCase().indexOf(w)).filter((i) => i >= 0).slice(0, 1));
    const start = Math.max(0, at - 40);
    const snippet = (start > 0 ? "…" : "") + flat.slice(start, start + 140) + (flat.length > start + 140 ? "…" : "");
    return { ...note, snippet };
  });
}

export function createNotesRouter(db: DB): Router {
  const router = Router();

  // Course list for the dropdown — filtered by user's program if set.
  router.get("/courses", (req, res) => {
    const userId = req.user!.id;
    const profile = db.prepare("SELECT program_id FROM user_profiles WHERE user_id = ?").get(userId) as
      { program_id: string | null } | undefined;
    const programId = profile?.program_id;

    const rows = programId
      ? db.prepare(
          `SELECT c.code, c.name_th, c.name_en, pc.category
           FROM program_courses pc JOIN courses c ON c.code = pc.course_code
           WHERE pc.program_id = ? ORDER BY c.code`,
        ).all(programId)
      : db.prepare("SELECT code, name_th, name_en, category FROM courses ORDER BY code").all();

    res.json({ courses: rows });
  });

  // List saved notes (newest first).
  router.get("/notes", (req, res) => {
    const userId = req.user!.id;
    const rows = db
      .prepare(
        `SELECT n.id, n.course_code, c.name_th AS course_name, c.name_en AS course_name_en,
              n.title, n.created_at
         FROM notes n LEFT JOIN courses c ON c.code = n.course_code
         WHERE n.user_id = ?
         ORDER BY n.created_at DESC`,
      )
      .all(userId);
    res.json({ notes: rows });
  });

  // Search the student's own notes. (Before /notes/:id, or "search" would be read as an id.)
  router.get("/notes/search", (req, res) => {
    res.json({ notes: searchNotes(db, req.user!.id, String(req.query.q ?? "")) });
  });

  // Read one note with all AI fields.
  router.get("/notes/:id", (req, res) => {
    const userId = req.user!.id;
    const row = db.prepare("SELECT * FROM notes WHERE id = ? AND user_id = ?").get(req.params.id, userId) as
      | Record<string, unknown>
      | undefined;
    if (!row) return res.status(404).json({ error: "ไม่พบโน้ตนี้" });
    res.json({
      ...row,
      key_terms: safeParse(row.ai_terms_json as string | null, []),
      topics: safeParse(row.ai_topics_json as string | null, []),
      image_paths: safeParse(row.image_paths as string | null, []),
    });
  });

  // Summarize all notes for a course with AI.
  router.post("/notes/summarize-course", async (req, res) => {
    try {
      const courseCode = req.body.course_code as string | undefined;
      if (!courseCode) return res.status(400).json({ error: "ต้องระบุรหัสวิชา" });

      const userId = req.user!.id;
      checkAiSubscription(db, userId);
      if (!isAiConfigured()) {
        return res.status(503).json({ error: "AI ยังไม่ได้ตั้งค่า", code: "AI_NOT_CONFIGURED" });
      }
      const rows = db
        .prepare(
          `SELECT raw_text, ai_summary_md, title FROM notes
           WHERE course_code = ? AND user_id = ? ORDER BY created_at ASC`,
        )
        .all(courseCode, userId) as Array<{ raw_text: string | null; ai_summary_md: string | null; title: string | null }>;

      if (rows.length === 0) return res.status(404).json({ error: "ไม่พบโน้ตในวิชานี้" });

      const parts: string[] = [];
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const label = r.title || `โน้ต #${i + 1}`;
        const text = r.raw_text || r.ai_summary_md || "(ไม่มีข้อความ)";
        parts.push(`=== ${label} ===\n${text}`);
      }
      const combined = parts.join("\n\n");

      const result = await generateCourseSummary(courseSummaryModelCall(db, combined));
      res.json(result);
    } catch (err) {
      handleAiError(res, err);
    }
  });

  // Delete a note.
  router.delete("/notes/:id", (req, res) => {
    const userId = req.user!.id;
    const row = db.prepare("SELECT id FROM notes WHERE id = ? AND user_id = ?").get(req.params.id, userId);
    if (!row) return res.status(404).json({ error: "ไม่พบโน้ตนี้" });
    db.prepare("DELETE FROM notes WHERE id = ? AND user_id = ?").run(req.params.id, userId);
    res.json({ ok: true });
  });

  // Create a note: text and/or images -> optionally AI summary.
  // Notes always save to the database. AI summary runs only when the key is set.
  router.post("/notes", upload.array("images", 5), async (req, res) => {
    try {
      const courseCode = (req.body.course_code as string) || null;
      const title = (req.body.title as string) || null;
      const rawText = (req.body.raw_text as string) || "";
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];

      if (!rawText.trim() && files.length === 0) {
        return res.status(400).json({ error: "กรุณาพิมพ์ข้อความหรือแนบรูปโน้ตอย่างน้อย 1 อย่าง" });
      }

      // Resize images, save to disk, and prepare base64 for the AI.
      await mkdir(env.uploadDir, { recursive: true });
      const imagePaths: string[] = [];
      const aiImages: ImageInput[] = [];
      for (const f of files) {
        const jpeg = await resizeToJpeg(f.buffer);
        const filename = `note_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
        await writeFile(join(env.uploadDir, filename), jpeg);
        imagePaths.push(`/api/uploads/${filename}`);
        aiImages.push({ media_type: "image/jpeg", data_base64: jpeg.toString("base64") });
      }

      // Try AI summary — gracefully skip if the API key is not set.
      let learning = {
        summary_md: "",
        mindmap_md: "",
        key_terms: [] as { term: string; definition: string }[],
        topics: [] as string[],
      };
      const userId = req.user!.id;
      let aiSkipped = false;
      if (isAiConfigured() && hasAiSubscription(db, userId)) {
        try {
          learning = await generateNoteLearning(
            noteModelCall(db, { text: rawText, images: aiImages }),
          );
        } catch (err) {
          // AI failed but note still saves — log and continue.
          console.error("[StudyOS] AI summary failed, saving note without it:", err);
          aiSkipped = true;
        }
      } else {
        aiSkipped = true;
      }

      const info = db
        .prepare(
          `INSERT INTO notes
             (user_id, course_code, created_at, title, raw_text, image_paths,
              ai_summary_md, ai_mindmap_md, ai_terms_json, ai_topics_json)
           VALUES (@user_id, @course_code, @created_at, @title, @raw_text, @image_paths,
                   @ai_summary_md, @ai_mindmap_md, @ai_terms_json, @ai_topics_json)`,
        )
        .run({
          user_id: userId,
          course_code: courseCode,
          created_at: new Date().toISOString(),
          title,
          raw_text: rawText || null,
          image_paths: JSON.stringify(imagePaths),
          ai_summary_md: learning.summary_md || null,
          ai_mindmap_md: learning.mindmap_md || null,
          ai_terms_json: JSON.stringify(learning.key_terms),
          ai_topics_json: JSON.stringify(learning.topics),
        });

      if (courseCode) {
        const insTopic = db.prepare(
          "INSERT OR IGNORE INTO topics (course_code, name, mastery, user_id) VALUES (?, ?, 0, ?)",
        );
        for (const tag of learning.topics) insTopic.run(courseCode, tag, userId);
      }

      res.status(201).json({
        id: info.lastInsertRowid,
        ...learning,
        image_paths: imagePaths,
        ai_skipped: aiSkipped,
      });
    } catch (err) {
      handleAiError(res, err);
    }
  });

  return router;
}

function handleAiError(res: import("express").Response, err: unknown): void {
  if (err instanceof AiSubscriptionRequired) {
    res.status(403).json({ error: err.message, code: "SUBSCRIPTION_REQUIRED" });
  } else if (err instanceof AiNotConfiguredError) {
    res.status(503).json({ error: err.message, code: "AI_NOT_CONFIGURED" });
  } else if (err instanceof AiError) {
    res.status(502).json({ error: err.message, code: "AI_ERROR" });
  } else {
    console.error("[StudyOS] note create failed:", err);
    res.status(500).json({ error: "เกิดข้อผิดพลาดในระบบ ลองใหม่อีกครั้ง" });
  }
}

function safeParse<T>(json: string | null, fallback: T): T {
  if (!json) return fallback;
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}
