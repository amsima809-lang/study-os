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
  isAiConfigured,
  AiNotConfiguredError,
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

export function createNotesRouter(db: DB): Router {
  const router = Router();

  // Course list for the dropdown.
  router.get("/courses", (_req, res) => {
    const rows = db
      .prepare("SELECT code, name_th, name_en, category FROM courses ORDER BY code")
      .all();
    res.json({ courses: rows });
  });

  // List saved notes (newest first).
  router.get("/notes", (_req, res) => {
    const rows = db
      .prepare(
        `SELECT n.id, n.course_code, c.name_th AS course_name, c.name_en AS course_name_en,
              n.title, n.created_at
         FROM notes n LEFT JOIN courses c ON c.code = n.course_code
         ORDER BY n.created_at DESC`,
      )
      .all();
    res.json({ notes: rows });
  });

  // Read one note with all AI fields.
  router.get("/notes/:id", (req, res) => {
    const row = db.prepare("SELECT * FROM notes WHERE id = ?").get(req.params.id) as
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
      let aiSkipped = false;
      if (isAiConfigured()) {
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
             (course_code, created_at, title, raw_text, image_paths,
              ai_summary_md, ai_mindmap_md, ai_terms_json, ai_topics_json)
           VALUES (@course_code, @created_at, @title, @raw_text, @image_paths,
                   @ai_summary_md, @ai_mindmap_md, @ai_terms_json, @ai_topics_json)`,
        )
        .run({
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

      // Accumulate suggested topic tags for later mastery tracking (Phase 6).
      if (courseCode) {
        const insTopic = db.prepare(
          "INSERT OR IGNORE INTO topics (course_code, name, mastery) VALUES (?, ?, 0)",
        );
        for (const tag of learning.topics) insTopic.run(courseCode, tag);
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
  if (err instanceof AiNotConfiguredError) {
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
