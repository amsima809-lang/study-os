/**
 * Phase 3 routes: create a note (photo/text) -> AI learning material, and
 * list/read saved notes. Also exposes the course list for the add-note form.
 */
import { Router } from "express";
import { randomUUID } from "node:crypto";
import multer from "multer";
import sharp from "sharp";
import { z } from "zod";
import { writeFile, mkdir, readFile, unlink } from "node:fs/promises";
import { join, basename } from "node:path";
import type { DB } from "./db.js";
import type { LectureChanged } from "./createdLectureNotes.js";
import { parseSketchStrokes, sketchPagePassages } from "./sketchRoutes.js";
import { getLecture } from "./savedLectures.js";
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
  limits: { fileSize: 12 * 1024 * 1024, fieldSize: 3_000_000, files: 5 },
});

// Anthropic recommends the long edge be <= 1568px.
const MAX_EDGE = 1568;

const noteField = z.string().max(3_000_000).nullable();
const editNoteContent = z.object({
  title: noteField, raw_text: noteField, previous_title: noteField, previous_raw_text: noteField,
  previous_text: z.string().optional(), replace_text: z.boolean().optional(),
});

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

export function createNotesRouter(db: DB, onLectureChanged?: LectureChanged, startLecturePages?: (user: string, id: number) => void): Router {
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
              n.title, n.created_at, cl.session_no AS lecture_no
         FROM notes n LEFT JOIN courses c ON c.code = n.course_code
         LEFT JOIN course_lectures cl ON cl.id = n.lecture_id
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
  type NoteRow = { id: number; course_code: string | null; lecture_id: number | null; title: string | null; raw_text: string | null; ai_summary_md: string | null; ai_summary_original_md: string | null } & Record<string, unknown>;
  function noteDetail(id: unknown, userId: string) {
    const row = db.prepare(`SELECT n.*, cl.session_no AS lecture_no FROM notes n LEFT JOIN course_lectures cl ON cl.id = n.lecture_id
      WHERE n.id = ? AND n.user_id = ?`).get(id, userId) as NoteRow | undefined;
    if (!row) return undefined;
    const { ai_summary_original_md, ...fields } = row;
    return {
      ...fields,
      summary_edited: ai_summary_original_md !== null,
      key_terms: safeParse(row.ai_terms_json as string | null, []),
      topics: safeParse(row.ai_topics_json as string | null, []),
      image_paths: safeParse(row.image_paths as string | null, []) as string[],
    };
  }

  router.get("/notes/:id", (req, res) => {
    const note = noteDetail(req.params.id, req.user!.id);
    if (!note) return res.status(404).json({ error: "ไม่พบโน้ตนี้" });
    res.json(note);
  });

  router.put("/notes/:id/content", (req, res) => {
    const user = req.user!.id;
    const current = noteDetail(req.params.id, user);
    if (!current) return res.status(404).json({ error: "ไม่พบโน้ตนี้" });
    const parsed = editNoteContent.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "ข้อมูลโน้ตไม่ถูกต้อง" });
    const title = parsed.data.title || null, raw = parsed.data.raw_text || null;
    if (!raw?.trim() && !current.image_paths.length) {
      return res.status(400).json({ error: "กรุณาพิมพ์ข้อความหรือแนบรูปโน้ตอย่างน้อย 1 อย่าง" });
    }
    const passages = sketchPagePassages(db, user, current.id);
    const visible = [current.raw_text, ...passages.map(p => p.runs.map(r => r.text).join(""))].filter(Boolean).join("\n");
    const rewrite = parsed.data.replace_text ?? (raw !== parsed.data.previous_raw_text);
    if (title === current.title && raw === current.raw_text && (!rewrite || !passages.length)) return res.json(current);
    if (current.title !== parsed.data.previous_title || current.raw_text !== parsed.data.previous_raw_text ||
      (rewrite && parsed.data.previous_text !== undefined && visible !== parsed.data.previous_text)) {
      return res.status(409).json({ code: "NOTE_CHANGED", error: "โน้ตมีการเปลี่ยนแปลงแล้ว", note: { ...current, sketch_passages: passages } });
    }
    db.transaction(() => {
      db.prepare("UPDATE notes SET title=?, raw_text=? WHERE id=? AND user_id=?").run(title, raw, current.id, user);
      if (rewrite && passages.length) {
        const replace = db.prepare("UPDATE sketch_pages SET text_replaced=1 WHERE note_id=? AND image_index=?");
        for (const index of new Set(passages.map(p => p.image_index))) replace.run(current.id, index);
      }
    })();
    onLectureChanged?.(user, current.lecture_id);
    res.json(noteDetail(current.id, user));
  });

  router.put("/notes/:id/summary", (req, res) => {
    const id = Number(req.params.id), user = req.user!.id;
    const current = noteDetail(id, user);
    if (!current) return res.status(404).json({ error: "ไม่พบโน้ตนี้" });
    const { summary_md: next, previous_md: previous } = req.body ?? {};
    if (!current.ai_summary_md || typeof previous !== "string" ||
        (next !== null && (typeof next !== "string" || !next.trim() || next.length > 120000))) {
      return res.status(400).json({ error: "ข้อมูลสรุปไม่ถูกต้อง" });
    }
    // A retry after a lost response may already have saved the requested result.
    if (current.ai_summary_md === next || (next === null && !current.summary_edited)) return res.json(current);
    // Null restores the model version; an edit that exactly matches it also clears the edited label.
    const updated = db.prepare(`UPDATE notes SET
      ai_summary_md = COALESCE(@next, ai_summary_original_md, ai_summary_md),
      ai_summary_original_md = CASE WHEN @next IS NULL OR @next = COALESCE(ai_summary_original_md, ai_summary_md)
        THEN NULL ELSE COALESCE(ai_summary_original_md, ai_summary_md) END
      WHERE id = @id AND user_id = @user AND ai_summary_md = @previous`).run({ next, id, user, previous });
    if (!updated.changes) {
      return res.status(409).json({ code: "SUMMARY_CHANGED", error: "สรุปมีการเปลี่ยนแปลงแล้ว", note: noteDetail(id,user) });
    }
    res.json(noteDetail(id, user));
  });

  router.put("/notes/:id/lecture", (req, res) => {
    const userId = req.user!.id;
    const note = noteDetail(req.params.id, userId);
    if (!note) return res.status(404).json({ error: "ไม่พบโน้ตนี้" });
    let lectureId: number | null = null;
    if (req.body?.lecture_no !== null) {
      const lecture = note.course_code && getLecture(db, userId, note.course_code, Number(req.body?.lecture_no));
      if (!lecture) return res.status(400).json({ error: "ไม่พบบทเรียนของวิชานี้" });
      lectureId = lecture.id;
    }
    db.prepare("UPDATE notes SET lecture_id = ? WHERE id = ? AND user_id = ?").run(lectureId, note.id, userId);
    onLectureChanged?.(userId, note.lecture_id as number | null);
    if (lectureId !== note.lecture_id) onLectureChanged?.(userId, lectureId);
    res.json(noteDetail(note.id, userId));
  });

  // Summarise a saved note with AI (a note saved while AI was off, or one she wants redone).
  // Same model call and fields as when a note is created; the note's own text and photos are untouched.
  router.post("/notes/:id/summarize", async (req, res) => {
    try {
      const userId = req.user!.id;
      const note = noteDetail(req.params.id, userId);
      if (!note) return res.status(404).json({ error: "ไม่พบโน้ตนี้" });
      checkAiSubscription(db, userId);
      if (!isAiConfigured()) throw new AiNotConfiguredError();

      const rawText = note.raw_text ?? "";
      const images: ImageInput[] = [];
      for (const p of note.image_paths) {
        const name = basename(String(p)); // stored as /api/uploads/<file>; never leave the upload folder
        try {
          images.push({ media_type: "image/jpeg", data_base64: (await resizeToJpeg(await readFile(join(env.uploadDir, name)))).toString("base64") });
        } catch {
          // a missing photo is skipped; the rest of the note is still summarised
        }
      }
      if (!rawText.trim() && images.length === 0) {
        return res.status(400).json({ error: "โน้ตนี้ไม่มีข้อความหรือรูปให้ AI สรุป" });
      }

      const learning = await generateNoteLearning(noteModelCall(db, { text: rawText, images }));
      db.prepare(
        `UPDATE notes SET
          ai_summary_md = CASE WHEN ai_summary_original_md IS NULL THEN ? ELSE ai_summary_md END,
          ai_summary_original_md = CASE WHEN ai_summary_original_md IS NULL THEN NULL ELSE ? END,
          ai_mindmap_md = ?, ai_terms_json = ?, ai_topics_json = ?
          WHERE id = ? AND user_id = ?`,
      ).run(
        learning.summary_md,
        learning.summary_md,
        learning.mindmap_md || null,
        JSON.stringify(learning.key_terms),
        JSON.stringify(learning.topics),
        note.id,
        userId,
      );
      const courseCode = note.course_code;
      if (courseCode) {
        const insTopic = db.prepare(
          "INSERT OR IGNORE INTO topics (course_code, name, mastery, user_id) VALUES (?, ?, 0, ?)",
        );
        for (const tag of learning.topics) insTopic.run(courseCode, tag, userId);
      }
      res.json(noteDetail(note.id, userId));
    } catch (err) {
      handleAiError(res, err);
    }
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
    const row = db.prepare("SELECT lecture_id FROM notes WHERE id = ? AND user_id = ?").get(req.params.id, userId) as
      { lecture_id: number | null } | undefined;
    if (!row) return res.status(404).json({ error: "ไม่พบโน้ตนี้" });
    db.prepare("DELETE FROM notes WHERE id = ? AND user_id = ?").run(req.params.id, userId);
    onLectureChanged?.(userId, row.lecture_id);
    res.json({ ok: true });
  });

  // Create a note: text and/or images -> optionally AI summary.
  // A drawn page stays in its original format. Its owner can request the sketch reading after saving.
  router.post("/notes", upload.array("images", 5), async (req, res) => {
    const unattached: string[] = [];
    try {
      const courseCode = (req.body.course_code as string) || null;
      const title = (req.body.title as string) || null;
      const rawText = (req.body.raw_text as string) || "";
      const files = (req.files as Express.Multer.File[] | undefined) ?? [];
      const strokes = parseSketchStrokes(req.body.handwriting_strokes);
      const field = req.body.handwriting_image_index;
      if (field !== undefined && (typeof field !== "string" || !/^\d+$/.test(field) || Number(field) >= files.length)) {
        return res.status(400).json({ error: "ไม่พบหน้าลายมือที่ระบุ" });
      }
      // Older iOS builds append the PencilKit page last and send its stroke bounds.
      const handwritingIndex = field !== undefined ? Number(field) : strokes && files.length ? files.length - 1 : null;
      let lectureId: number | null = null;
      if (req.body.lecture_no !== undefined) {
        const lecture = courseCode && getLecture(db, req.user!.id, courseCode, Number(req.body.lecture_no));
        if (!lecture) return res.status(400).json({ error: "ไม่พบบทเรียนของวิชานี้" });
        lectureId = lecture.id;
      }

      if (!rawText.trim() && files.length === 0) {
        return res.status(400).json({ error: "กรุณาพิมพ์ข้อความหรือแนบรูปโน้ตอย่างน้อย 1 อย่าง" });
      }

      let inkExtension: "png" | "jpg" | null = null;
      if (handwritingIndex !== null) {
        try {
          const ink = sharp(files[handwritingIndex].buffer);
          const metadata = await ink.metadata();
          if ((metadata.format !== "jpeg" && metadata.format !== "png") || (metadata.pages ?? 1) !== 1) {
            return res.status(400).json({ error: "หน้าลายมือจะต้องเป็นรูป PNG หรือ JPEG" });
          }
          // Decode a thumbnail to reject broken image data before retaining the original bytes.
          await ink.resize(1, 1).raw().toBuffer();
          inkExtension = metadata.format === "png" ? "png" : "jpg";
        } catch {
          return res.status(400).json({ error: "ไม่สามารถอ่านรูปหน้าลายมือนี้ได้" });
        }
      }

      const userId = req.user!.id;
      // The lecture tray uses the combined reader's background job. An independent
      // note created from the general Notes screen retains its own learning material.
      const lectureTray = lectureId !== null && req.body.lecture_tray === "1";
      const summarizeOnSave = !lectureTray && handwritingIndex === null && isAiConfigured() && hasAiSubscription(db, userId);
      await mkdir(env.uploadDir, { recursive: true });
      const imagePaths: string[] = [];
      const aiImages: ImageInput[] = [];
      for (const [index, file] of files.entries()) {
        const penPage = index === handwritingIndex;
        const page = penPage ? file.buffer : await sharp(file.buffer).rotate().flatten({ background: "#fff" })
          .resize({ width: 4800, height: 4800, fit: "inside", withoutEnlargement: true }).jpeg({ quality: 91 }).toBuffer();
        const filename = `note_${randomUUID()}.${penPage ? inkExtension : "jpg"}`;
        const path = join(env.uploadDir, filename);
        unattached.push(path);
        await writeFile(path, page);
        imagePaths.push(`/api/uploads/${filename}`);
        if (summarizeOnSave) aiImages.push({ media_type: "image/jpeg", data_base64: (await resizeToJpeg(page)).toString("base64") });
      }

      // Try AI summary — gracefully skip if the API key is not set.
      let learning = {
        summary_md: "",
        mindmap_md: "",
        key_terms: [] as { term: string; definition: string }[],
        topics: [] as string[],
      };
      let aiSkipped = false;
      if (summarizeOnSave) {
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

      const id = db.transaction(() => {
        const info = db
          .prepare(
            `INSERT INTO notes
               (user_id, course_code, lecture_id, created_at, title, raw_text, image_paths, handwriting_image_index,
                ai_summary_md, ai_mindmap_md, ai_terms_json, ai_topics_json)
             VALUES (@user_id, @course_code, @lecture_id, @created_at, @title, @raw_text, @image_paths, @handwriting_image_index,
                     @ai_summary_md, @ai_mindmap_md, @ai_terms_json, @ai_topics_json)`,
          )
          .run({
            user_id: userId,
            course_code: courseCode,
            lecture_id: lectureId,
            created_at: new Date().toISOString(),
            title,
            raw_text: rawText || null,
            image_paths: JSON.stringify(imagePaths),
            handwriting_image_index: handwritingIndex,
            ai_summary_md: learning.summary_md || null,
            ai_mindmap_md: learning.mindmap_md || null,
            ai_terms_json: JSON.stringify(learning.key_terms),
            ai_topics_json: JSON.stringify(learning.topics),
          });

        const noteId = Number(info.lastInsertRowid);
        if (lectureId !== null && files.length) {
          const page = db.prepare("INSERT INTO sketch_pages(note_id,image_index,stroke_bounds,auto_read) VALUES(?,?,?,1)");
          for (const index of files.keys()) page.run(noteId, index, index === handwritingIndex && strokes ? JSON.stringify(strokes) : null);
        } else if (handwritingIndex !== null && strokes) {
          db.prepare("INSERT INTO sketch_pages(note_id,image_index,stroke_bounds) VALUES (?,?,?)")
            .run(noteId, handwritingIndex, JSON.stringify(strokes));
        }
        if (courseCode) {
          const insTopic = db.prepare("INSERT OR IGNORE INTO topics (course_code, name, mastery, user_id) VALUES (?, ?, 0, ?)");
          for (const tag of learning.topics) insTopic.run(courseCode, tag, userId);
        }
        return noteId;
      })();
      unattached.length = 0;
      if (lectureId !== null && files.length) startLecturePages?.(userId, id);
      onLectureChanged?.(userId, lectureId);

      res.status(201).json({
        id,
        ...learning,
        image_paths: imagePaths,
        handwriting_image_index: handwritingIndex,
        ai_skipped: aiSkipped,
      });
    } catch (err) {
      await Promise.allSettled(unattached.map(path => unlink(path)));
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
