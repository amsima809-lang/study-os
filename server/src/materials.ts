/**
 * Phase 1: Material upload, text extraction, page preview, chapter management.
 * Handles PDF, images (JPG/PNG/HEIC), and plain text uploads per course.
 */
import { Router } from "express";
import multer from "multer";
import sharp from "sharp";
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { join, extname } from "node:path";
import type { DB } from "./db.js";
import { env } from "./env.js";
import {
  extractPdfText,
  renderPdfPage,
  ocrWithClaude,
  isThaiTextGarbled,
  getPdfPageCount,
} from "./pdf.js";
import {
  isAiConfigured,
  AiNotConfiguredError,
  AiError,
} from "./ai.js";
import Anthropic from "@anthropic-ai/sdk";

const MAX_FILE_SIZE = 100 * 1024 * 1024; // 100 MB
const MAX_PAGES = 500;

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, env.uploadDir),
    filename: (_req, file, cb) => {
      const ext = extname(file.originalname).toLowerCase();
      cb(null, `mat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`);
    },
  }),
  limits: { fileSize: MAX_FILE_SIZE, files: 1 },
});

function detectFileType(filename: string): "pdf" | "image" | "text" {
  const ext = extname(filename).toLowerCase();
  if (ext === ".pdf") return "pdf";
  if ([".jpg", ".jpeg", ".png", ".heic", ".heif", ".webp"].includes(ext)) return "image";
  return "text";
}

export function createMaterialsRouter(db: DB): Router {
  const router = Router();

  // --- List materials for a course ---
  router.get("/materials", (req, res) => {
    const courseCode = req.query.course_code as string | undefined;
    let rows;
    if (courseCode) {
      rows = db
        .prepare(
          `SELECT id, course_code, filename, file_type, material_kind, file_size,
                  total_pages, pages_done, upload_status, error_message, created_at
           FROM materials WHERE course_code = ? ORDER BY created_at DESC`,
        )
        .all(courseCode);
    } else {
      rows = db
        .prepare(
          `SELECT m.id, m.course_code, c.name_th AS course_name, m.filename, m.file_type,
                  m.material_kind, m.file_size, m.total_pages, m.pages_done,
                  m.upload_status, m.created_at
           FROM materials m JOIN courses c ON c.code = m.course_code
           ORDER BY m.created_at DESC`,
        )
        .all();
    }
    res.json({ materials: rows });
  });

  // --- Upload a material ---
  router.post("/materials/upload", upload.single("file"), async (req, res) => {
    try {
      await mkdir(env.uploadDir, { recursive: true });
      const courseCode = req.body.course_code as string;
      const materialKind = (req.body.material_kind as string) || "textbook";
      const file = req.file;

      if (!courseCode) return res.status(400).json({ error: "ต้องระบุรหัสวิชา" });
      if (!file) return res.status(400).json({ error: "ต้องแนบไฟล์" });

      const course = db.prepare("SELECT code FROM courses WHERE code = ?").get(courseCode);
      if (!course) return res.status(404).json({ error: "ไม่พบวิชานี้" });

      if (!["textbook", "past_exam", "notes", "other"].includes(materialKind)) {
        return res.status(400).json({ error: "ประเภทเอกสารไม่ถูกต้อง" });
      }

      const fileType = detectFileType(file.originalname);
      let filePath = `/api/uploads/${file.filename}`;

      // Convert HEIC to JPEG
      if ([".heic", ".heif"].includes(extname(file.originalname).toLowerCase())) {
        const jpegBuf = await sharp(file.path).jpeg({ quality: 85 }).toBuffer();
        const jpegName = file.filename.replace(/\.\w+$/, ".jpg");
        await writeFile(join(env.uploadDir, jpegName), jpegBuf);
        filePath = `/api/uploads/${jpegName}`;
      }

      let totalPages: number | null = null;
      if (fileType === "pdf") {
        const buf = await readFile(file.path);
        totalPages = await getPdfPageCount(buf);
        if (totalPages > MAX_PAGES) {
          return res.status(400).json({
            error: `PDF มี ${totalPages} หน้า เกินขีดจำกัด ${MAX_PAGES} หน้า`,
          });
        }
      } else if (fileType === "image") {
        totalPages = 1;
      }

      const info = db
        .prepare(
          `INSERT INTO materials (course_code, filename, file_type, material_kind, file_path, file_size, total_pages, upload_status, created_at)
           VALUES (@course_code, @filename, @file_type, @material_kind, @file_path, @file_size, @total_pages, @upload_status, @created_at)`,
        )
        .run({
          course_code: courseCode,
          filename: file.originalname,
          file_type: fileType,
          material_kind: materialKind,
          file_path: filePath,
          file_size: file.size,
          total_pages: totalPages,
          upload_status: "pending",
          created_at: new Date().toISOString(),
        });

      res.status(201).json({
        id: Number(info.lastInsertRowid),
        filename: file.originalname,
        fileType,
        totalPages,
        status: "pending",
      });
    } catch (err) {
      console.error("[StudyOS] material upload failed:", err);
      res.status(500).json({ error: "อัปโหลดไม่สำเร็จ ลองใหม่อีกครั้ง" });
    }
  });

  // --- Process a material (extract text per page) ---
  router.post("/materials/:id/process", async (req, res) => {
    try {
      const id = Number(req.params.id);
      const mat = db.prepare("SELECT * FROM materials WHERE id = ?").get(id) as any;
      if (!mat) return res.status(404).json({ error: "ไม่พบเอกสารนี้" });
      if (mat.upload_status === "processing") {
        return res.status(409).json({ error: "กำลังดำเนินการอยู่" });
      }

      db.prepare("UPDATE materials SET upload_status = 'processing', pages_done = 0 WHERE id = ?").run(id);

      // Async processing — respond immediately, client polls for status
      processInBackground(db, id, mat).catch((err) => {
        console.error(`[StudyOS] process material ${id} failed:`, err);
        db.prepare("UPDATE materials SET upload_status = 'error', error_message = ? WHERE id = ?").run(
          String(err?.message ?? "unknown error"),
          id,
        );
      });

      res.json({ status: "processing", message: "เริ่มดึงข้อความแล้ว" });
    } catch (err) {
      console.error("[StudyOS] process failed:", err);
      res.status(500).json({ error: "เกิดข้อผิดพลาด" });
    }
  });

  // --- Get processing status ---
  router.get("/materials/:id/status", (req, res) => {
    const id = Number(req.params.id);
    const mat = db
      .prepare("SELECT id, upload_status, total_pages, pages_done, error_message FROM materials WHERE id = ?")
      .get(id) as any;
    if (!mat) return res.status(404).json({ error: "ไม่พบเอกสาร" });
    res.json(mat);
  });

  // --- Get pages of a material (with extracted text) ---
  router.get("/materials/:id/pages", (req, res) => {
    const id = Number(req.params.id);
    const mat = db.prepare("SELECT id, filename, total_pages, upload_status FROM materials WHERE id = ?").get(id) as any;
    if (!mat) return res.status(404).json({ error: "ไม่พบเอกสาร" });

    const pages = db
      .prepare(
        `SELECT page_num, extracted_text, extraction_method, confidence, image_path
         FROM material_pages WHERE material_id = ? ORDER BY page_num`,
      )
      .all(id);
    res.json({ material: mat, pages });
  });

  // --- Update extracted text for a page (manual correction) ---
  router.put("/materials/:materialId/pages/:pageNum", (req, res) => {
    const materialId = Number(req.params.materialId);
    const pageNum = Number(req.params.pageNum);
    const text = String(req.body.text ?? "");

    const existing = db
      .prepare("SELECT id FROM material_pages WHERE material_id = ? AND page_num = ?")
      .get(materialId, pageNum);
    if (!existing) return res.status(404).json({ error: "ไม่พบหน้านี้" });

    db.prepare(
      "UPDATE material_pages SET extracted_text = ?, extraction_method = 'manual' WHERE material_id = ? AND page_num = ?",
    ).run(text, materialId, pageNum);
    res.json({ ok: true });
  });

  // --- Delete a material ---
  router.delete("/materials/:id", (req, res) => {
    const id = Number(req.params.id);
    const mat = db.prepare("SELECT id FROM materials WHERE id = ?").get(id);
    if (!mat) return res.status(404).json({ error: "ไม่พบเอกสาร" });
    db.prepare("DELETE FROM material_pages WHERE material_id = ?").run(id);
    db.prepare("DELETE FROM material_chunks WHERE material_id = ?").run(id);
    db.prepare("DELETE FROM materials WHERE id = ?").run(id);
    res.json({ ok: true });
  });

  // --- Chapters for a course ---
  router.get("/chapters", (req, res) => {
    const courseCode = req.query.course_code as string;
    if (!courseCode) return res.status(400).json({ error: "ต้องระบุรหัสวิชา" });
    const rows = db
      .prepare("SELECT * FROM chapters WHERE course_code = ? ORDER BY sort_order, id")
      .all(courseCode);
    res.json({ chapters: rows });
  });

  // --- AI suggest chapters from TOC ---
  router.post("/chapters/suggest", async (req, res) => {
    try {
      if (!isAiConfigured()) throw new AiNotConfiguredError();
      const materialId = Number(req.body.material_id);
      const mat = db.prepare("SELECT * FROM materials WHERE id = ?").get(materialId) as any;
      if (!mat) return res.status(404).json({ error: "ไม่พบเอกสาร" });

      // Get first few pages (likely TOC) + a sample of content
      const pages = db
        .prepare(
          "SELECT page_num, extracted_text FROM material_pages WHERE material_id = ? ORDER BY page_num LIMIT 10",
        )
        .all(materialId) as Array<{ page_num: number; extracted_text: string | null }>;

      const textSample = pages
        .filter((p) => p.extracted_text)
        .map((p) => `--- หน้า ${p.page_num} ---\n${p.extracted_text}`)
        .join("\n\n");

      if (!textSample.trim()) {
        return res.status(400).json({ error: "ยังไม่มีข้อความในเอกสาร ดึงข้อความก่อน" });
      }

      const client = new Anthropic({
        apiKey: env.anthropicApiKey,
        ...(env.anthropicWorkspaceId && {
          defaultHeaders: { "anthropic-workspace-id": env.anthropicWorkspaceId },
        }),
      });

      const result = await client.messages.create({
        model: env.anthropicModel,
        max_tokens: 2000,
        system: "You extract chapter/topic structure from Thai textbook content. Return JSON only.",
        messages: [
          {
            role: "user",
            content: `จากสารบัญหรือเนื้อหาด้านล่าง ให้แบ่งบท/หัวข้อ พร้อมระบุหน้าเริ่มต้น (ถ้ารู้)
ตอบเป็น JSON: {"chapters": [{"name": "ชื่อบท", "start_page": 1}]}

${textSample}`,
          },
        ],
      });

      db.prepare(
        "INSERT INTO ai_usage (created_at, model, purpose, input_tokens, output_tokens) VALUES (?, ?, ?, ?, ?)",
      ).run(
        new Date().toISOString(),
        env.anthropicModel,
        "chapter_suggest",
        result.usage.input_tokens,
        result.usage.output_tokens,
      );

      const textBlock = result.content.find((b) => b.type === "text");
      const raw = textBlock && textBlock.type === "text" ? textBlock.text : "";
      let chapters: Array<{ name: string; start_page?: number }> = [];
      try {
        const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
        const jsonStr = fence ? fence[1] : raw;
        const parsed = JSON.parse(jsonStr.trim().startsWith("{") ? jsonStr : `{${jsonStr}}`);
        chapters = parsed.chapters ?? [];
      } catch {
        chapters = [{ name: "บทที่ 1" }];
      }

      res.json({ suggested: chapters });
    } catch (err) {
      handleAiError(res, err);
    }
  });

  // --- Create chapters (batch) ---
  router.post("/chapters", (req, res) => {
    const courseCode = req.body.course_code as string;
    const chapters = req.body.chapters as Array<{ name: string; start_page?: number }>;
    if (!courseCode || !Array.isArray(chapters) || chapters.length === 0) {
      return res.status(400).json({ error: "ต้องระบุวิชาและรายชื่อบท" });
    }

    const insert = db.prepare(
      "INSERT INTO chapters (course_code, name, sort_order, ai_suggested, created_at) VALUES (?, ?, ?, ?, ?)",
    );
    const now = new Date().toISOString();
    const ids: number[] = [];
    for (let i = 0; i < chapters.length; i++) {
      const info = insert.run(courseCode, chapters[i].name, i, 1, now);
      ids.push(Number(info.lastInsertRowid));
    }
    res.status(201).json({ ids });
  });

  // --- Update a chapter ---
  router.put("/chapters/:id", (req, res) => {
    const id = Number(req.params.id);
    const name = req.body.name as string;
    if (!name) return res.status(400).json({ error: "ต้องระบุชื่อบท" });
    db.prepare("UPDATE chapters SET name = ?, ai_suggested = 0 WHERE id = ?").run(name, id);
    res.json({ ok: true });
  });

  // --- Delete a chapter ---
  router.delete("/chapters/:id", (req, res) => {
    const id = Number(req.params.id);
    db.prepare("DELETE FROM material_chunks WHERE chapter_id = ?").run(id);
    db.prepare("DELETE FROM chapters WHERE id = ?").run(id);
    res.json({ ok: true });
  });

  // --- Auto-assign pages to chapters ---
  router.post("/chapters/assign-pages", (req, res) => {
    const materialId = Number(req.body.material_id);
    const assignments = req.body.assignments as Array<{
      chapter_id: number;
      start_page: number;
      end_page: number;
    }>;

    if (!materialId || !Array.isArray(assignments)) {
      return res.status(400).json({ error: "ต้องระบุเอกสารและการแบ่งหน้า" });
    }

    // Clear existing chunks for this material
    db.prepare("DELETE FROM material_chunks WHERE material_id = ?").run(materialId);

    const insertChunk = db.prepare(
      `INSERT INTO material_chunks (chapter_id, material_id, start_page, end_page, content_text, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    );
    const now = new Date().toISOString();

    for (const a of assignments) {
      // Gather text from pages in range
      const pages = db
        .prepare(
          "SELECT extracted_text FROM material_pages WHERE material_id = ? AND page_num BETWEEN ? AND ? ORDER BY page_num",
        )
        .all(materialId, a.start_page, a.end_page) as Array<{ extracted_text: string | null }>;
      const text = pages.map((p) => p.extracted_text ?? "").join("\n\n");
      if (text.trim()) {
        insertChunk.run(a.chapter_id, materialId, a.start_page, a.end_page, text, now);
      }
    }

    res.json({ ok: true });
  });

  // --- Parse past exam (extract Q&A) ---
  router.post("/materials/:id/parse-exam", async (req, res) => {
    try {
      if (!isAiConfigured()) throw new AiNotConfiguredError();
      const id = Number(req.params.id);
      const mat = db.prepare("SELECT * FROM materials WHERE id = ?").get(id) as any;
      if (!mat) return res.status(404).json({ error: "ไม่พบเอกสาร" });

      // Gather all extracted text
      const pages = db
        .prepare("SELECT extracted_text FROM material_pages WHERE material_id = ? ORDER BY page_num")
        .all(id) as Array<{ extracted_text: string | null }>;
      const fullText = pages.map((p) => p.extracted_text ?? "").join("\n\n");
      if (!fullText.trim()) {
        return res.status(400).json({ error: "ยังไม่มีข้อความ ดึงข้อความจากเอกสารก่อน" });
      }

      const client = new Anthropic({
        apiKey: env.anthropicApiKey,
        ...(env.anthropicWorkspaceId && {
          defaultHeaders: { "anthropic-workspace-id": env.anthropicWorkspaceId },
        }),
      });

      const result = await client.messages.create({
        model: env.anthropicModel,
        max_tokens: 8000,
        system: "You extract exam questions from Thai university past exam papers. Return JSON only.",
        messages: [
          {
            role: "user",
            content: `จากข้อสอบเก่าด้านล่าง แยกทุกข้อออกมาเป็น JSON:
{"questions": [
  {"question": "คำถาม", "type": "mcq", "choices": ["ก.","ข.","ค.","ง."], "correct_answer": "ก.", "topic": "หัวข้อ"}
]}
- ถ้าเป็นปรนัย ใส่ตัวเลือกทั้งหมดและเฉลย (ถ้ามี) ถ้าไม่มีเฉลยใส่ correct_answer เป็น null
- ถ้าเป็นอัตนัย ใส่ type "short" และ choices เป็น []
- ใส่ topic ที่เหมาะสมจากเนื้อหาคำถาม

ข้อสอบ:
${fullText.slice(0, 15000)}`,
          },
        ],
      });

      db.prepare(
        "INSERT INTO ai_usage (created_at, model, purpose, input_tokens, output_tokens) VALUES (?, ?, ?, ?, ?)",
      ).run(
        new Date().toISOString(),
        env.anthropicModel,
        "parse_exam",
        result.usage.input_tokens,
        result.usage.output_tokens,
      );

      const textBlock = result.content.find((b) => b.type === "text");
      const raw = textBlock && textBlock.type === "text" ? textBlock.text : "";
      let questions: Array<{
        question: string;
        type: string;
        choices: string[];
        correct_answer: string | null;
        topic: string | null;
      }> = [];
      try {
        const fence = raw.match(/```(?:json)?\s*([\s\S]*?)```/);
        const jsonStr = fence ? fence[1].trim() : raw.trim();
        const brace = jsonStr.startsWith("{") ? jsonStr : jsonStr.match(/\{[\s\S]*\}/)?.[0] ?? "{}";
        const parsed = JSON.parse(brace);
        questions = parsed.questions ?? [];
      } catch {
        return res.status(502).json({ error: "AI แยกข้อสอบไม่สำเร็จ ลองใหม่" });
      }

      // Save to questions table
      const insert = db.prepare(
        `INSERT INTO questions (course_code, topic, question, model_answer, type, choices_json, source, difficulty, explanation_th, source_ref)
         VALUES (@course_code, @topic, @question, @model_answer, @type, @choices_json, 'past_exam', 2, NULL, @source_ref)`,
      );

      const saved: Array<{ id: number; question: string; type: string }> = [];
      for (const q of questions) {
        const info = insert.run({
          course_code: mat.course_code,
          topic: q.topic || null,
          question: q.question,
          model_answer: q.correct_answer || "",
          type: q.type === "mcq" ? "mcq" : "short",
          choices_json: q.choices.length ? JSON.stringify(q.choices) : null,
          source_ref: JSON.stringify({ material_id: id, filename: mat.filename }),
        });
        saved.push({ id: Number(info.lastInsertRowid), question: q.question, type: q.type });
      }

      res.json({ parsed: saved.length, questions: saved });
    } catch (err) {
      handleAiError(res, err);
    }
  });

  // --- Get past exam questions for a course ---
  router.get("/past-exams", (req, res) => {
    const courseCode = req.query.course_code as string;
    if (!courseCode) return res.status(400).json({ error: "ต้องระบุรหัสวิชา" });
    const rows = db
      .prepare(
        `SELECT id, topic, question, type, choices_json, source_ref
         FROM questions WHERE course_code = ? AND source = 'past_exam'
         ORDER BY id`,
      )
      .all(courseCode);
    res.json({
      questions: (rows as any[]).map((r) => ({
        id: r.id,
        topic: r.topic,
        question: r.question,
        type: r.type,
        choices: r.choices_json ? JSON.parse(r.choices_json) : [],
        sourceRef: r.source_ref ? JSON.parse(r.source_ref) : null,
      })),
    });
  });

  return router;
}

// --- Background PDF processing ---
async function processInBackground(db: DB, materialId: number, mat: any): Promise<void> {
  const filePath = mat.file_path.replace("/api/uploads/", "");
  const fullPath = join(env.uploadDir, filePath);

  if (mat.file_type === "image") {
    // Single image: OCR it
    const buf = await readFile(fullPath);
    let text = "";
    let method: "pdf_text" | "ai_ocr" = "ai_ocr";
    let confidence = 0.5;

    if (isAiConfigured()) {
      const ocr = await ocrWithClaude(db, buf);
      text = ocr.text;
      confidence = ocr.confidence;
    }

    db.prepare(
      `INSERT INTO material_pages (material_id, page_num, extracted_text, extraction_method, confidence, created_at)
       VALUES (?, 1, ?, ?, ?, ?)`,
    ).run(materialId, text, method, confidence, new Date().toISOString());
    db.prepare("UPDATE materials SET pages_done = 1, upload_status = 'done' WHERE id = ?").run(materialId);
    return;
  }

  if (mat.file_type === "text") {
    const text = await readFile(fullPath, "utf-8");
    db.prepare(
      `INSERT INTO material_pages (material_id, page_num, extracted_text, extraction_method, confidence, created_at)
       VALUES (?, 1, ?, 'pdf_text', 1.0, ?)`,
    ).run(materialId, text, new Date().toISOString());
    db.prepare("UPDATE materials SET pages_done = 1, total_pages = 1, upload_status = 'done' WHERE id = ?").run(
      materialId,
    );
    return;
  }

  // PDF processing
  const buf = await readFile(fullPath);
  const pdfPages = await extractPdfText(buf);

  const insertPage = db.prepare(
    `INSERT OR REPLACE INTO material_pages (material_id, page_num, extracted_text, extraction_method, confidence, image_path, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  );
  const updateProgress = db.prepare("UPDATE materials SET pages_done = ? WHERE id = ?");
  const now = () => new Date().toISOString();

  for (const page of pdfPages) {
    let text = page.text;
    let method: "pdf_text" | "ai_ocr" = "pdf_text";
    let confidence = 1.0;
    let imagePath: string | null = null;

    if (isThaiTextGarbled(text)) {
      // Try OCR with Claude vision
      if (isAiConfigured()) {
        try {
          const imgBuf = await renderPdfPage(buf, page.pageNum);
          const imgName = `mat_${materialId}_p${page.pageNum}.jpg`;
          await writeFile(join(env.uploadDir, imgName), imgBuf);
          imagePath = `/api/uploads/${imgName}`;

          const ocr = await ocrWithClaude(db, imgBuf);
          text = ocr.text;
          method = "ai_ocr";
          confidence = ocr.confidence;
        } catch (err) {
          console.error(`[StudyOS] OCR failed for page ${page.pageNum}:`, err);
          // Keep the garbled text rather than nothing
        }
      }
    }

    insertPage.run(materialId, page.pageNum, text, method, confidence, imagePath, now());
    updateProgress.run(page.pageNum, materialId);
  }

  db.prepare("UPDATE materials SET upload_status = 'done', pages_done = total_pages WHERE id = ?").run(materialId);
}

function handleAiError(res: import("express").Response, err: unknown): void {
  if (err instanceof AiNotConfiguredError) {
    res.status(503).json({ error: (err as Error).message, code: "AI_NOT_CONFIGURED" });
  } else if (err instanceof AiError) {
    res.status(502).json({ error: (err as Error).message, code: "AI_ERROR" });
  } else {
    console.error("[StudyOS] materials error:", err);
    res.status(500).json({ error: "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง" });
  }
}
