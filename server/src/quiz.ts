/**
 * Phase 4 routes: generate a quiz (from a note or a whole course), then grade
 * answers one at a time. Model answers are stored server-side and NEVER sent to
 * the client until the student has submitted an answer (no peeking).
 * A score of 0 or 1 auto-creates/resets a Leitner flashcard (box 1).
 */
import { Router } from "express";
import type { DB } from "./db.js";
import { bangkokToday, addDaysISO } from "./api.js";

// Re-exported so existing tests importing it from here keep working.
export { addDaysISO };
import {
  isAiConfigured,
  AiNotConfiguredError,
  AiError,
  generateQuestions,
  generateValidated,
  quizModelCall,
  gradeAnswer,
  gradeModelCall,
  logUsage,
  SYSTEM_PROMPT,
} from "./ai.js";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { env } from "./env.js";

const QUESTION_COUNT = 10;

/** Deterministic MCQ grading: exact match on the chosen option. */
export function gradeMcq(modelAnswer: string, myAnswer: string): { score: 0 | 2; feedback: string } {
  const correct = myAnswer.trim() === modelAnswer.trim();
  return correct
    ? { score: 2, feedback: "ถูกต้อง 🎉" }
    : { score: 0, feedback: `ยังไม่ถูก เฉลยคือ: ${modelAnswer}` };
}

/** Create a box-1 flashcard for a question, or reset an existing one to box 1. */
export function upsertFlashcardToBox1(db: DB, questionId: number, today: string, userId: string): void {
  const existing = db
    .prepare("SELECT id FROM flashcards WHERE question_id = ? AND user_id = ?")
    .get(questionId, userId) as { id: number } | undefined;
  const nextReview = addDaysISO(today, 1);
  if (existing) {
    db.prepare("UPDATE flashcards SET box = 1, next_review_date = ? WHERE id = ?").run(
      nextReview,
      existing.id,
    );
  } else {
    db.prepare(
      "INSERT INTO flashcards (question_id, box, next_review_date, user_id) VALUES (?, 1, ?, ?)",
    ).run(questionId, nextReview, userId);
  }
}

/** Assemble study text for a note (raw text + AI summary). */
function noteSourceText(db: DB, noteId: number, userId: string): string | null {
  const n = db.prepare("SELECT raw_text, ai_summary_md FROM notes WHERE id = ? AND user_id = ?").get(noteId, userId) as
    | { raw_text: string | null; ai_summary_md: string | null }
    | undefined;
  if (!n) return null;
  const text = [n.raw_text, n.ai_summary_md].filter(Boolean).join("\n\n");
  return text.trim() || null;
}

/** Assemble study text for a whole course (all its notes). */
function courseSourceText(db: DB, courseCode: string, userId: string): { text: string | null; noteId: number | null } {
  const rows = db
    .prepare(
      "SELECT id, raw_text, ai_summary_md FROM notes WHERE course_code = ? AND user_id = ? ORDER BY created_at DESC",
    )
    .all(courseCode, userId) as Array<{ id: number; raw_text: string | null; ai_summary_md: string | null }>;
  if (rows.length === 0) return { text: null, noteId: null };
  const text = rows
    .map((r) => [r.raw_text, r.ai_summary_md].filter(Boolean).join("\n"))
    .filter(Boolean)
    .join("\n\n");
  return { text: text.trim() || null, noteId: rows[0].id };
}

export function createQuizRouter(db: DB): Router {
  const router = Router();

  // Generate a quiz from a note or a whole course. Saves the questions and
  // returns them WITHOUT the model answers.
  router.post("/quiz/generate", async (req, res) => {
    try {
      if (!isAiConfigured()) throw new AiNotConfiguredError();
      const userId = req.user!.id;

      const source = req.body.source as "note" | "course";
      let sourceText: string | null = null;
      let noteId: number | null = null;
      let courseCode: string | null = null;

      if (source === "note") {
        noteId = Number(req.body.note_id);
        sourceText = noteSourceText(db, noteId, userId);
        const row = db.prepare("SELECT course_code FROM notes WHERE id = ? AND user_id = ?").get(noteId, userId) as
          | { course_code: string | null }
          | undefined;
        courseCode = row?.course_code ?? null;
      } else if (source === "course") {
        courseCode = String(req.body.course_code);
        const cs = courseSourceText(db, courseCode, userId);
        sourceText = cs.text;
        noteId = cs.noteId;
      } else {
        return res.status(400).json({ error: "ต้องระบุแหล่งข้อสอบ (โน้ตหรือวิชา)" });
      }

      if (!sourceText) {
        return res
          .status(400)
          .json({ error: "ยังไม่มีเนื้อหาให้ออกข้อสอบ กรุณาเพิ่มโน้ตของวิชานี้ก่อน" });
      }

      const generated = await generateQuestions(
        quizModelCall(db, { sourceText, count: QUESTION_COUNT }),
      );

      const insert = db.prepare(
        `INSERT INTO questions (user_id, note_id, course_code, topic, question, model_answer, type, choices_json)
         VALUES (@user_id, @note_id, @course_code, @topic, @question, @model_answer, @type, @choices_json)`,
      );
      const saved = generated.questions.map((q) => {
        const info = insert.run({
          user_id: userId,
          note_id: noteId,
          course_code: courseCode,
          topic: q.topic || null,
          question: q.question,
          model_answer: q.model_answer,
          type: q.type,
          choices_json: q.choices.length ? JSON.stringify(q.choices) : null,
        });
        return {
          id: Number(info.lastInsertRowid),
          topic: q.topic,
          question: q.question,
          type: q.type,
          choices: q.choices,
        };
      });

      res.status(201).json({ questions: saved });
    } catch (err) {
      handleAiError(res, err);
    }
  });

  // Enhanced quiz from materials/chapters (Phase 1)
  router.post("/quiz/generate-from-material", async (req, res) => {
    try {
      if (!isAiConfigured()) throw new AiNotConfiguredError();
      const userId = req.user!.id;

      const courseCode = req.body.course_code as string;
      const chapterId = req.body.chapter_id ? Number(req.body.chapter_id) : null;
      const difficulty = req.body.difficulty ? Number(req.body.difficulty) : null; // 1-3
      const questionType = (req.body.type as string) || "mixed"; // mcq, short, mixed
      const count = Math.min(Number(req.body.count) || 10, 30);

      if (!courseCode) return res.status(400).json({ error: "ต้องระบุรหัสวิชา" });

      // Gather source text from material_chunks (chapter-based) or material_pages
      let sourceText = "";
      let sourceRef: { chapter_id?: number; chapter_name?: string; material_ids: number[] } = { material_ids: [] };

      if (chapterId) {
        const chapter = db.prepare("SELECT id, name FROM chapters WHERE id = ? AND course_code = ? AND user_id = ?").get(chapterId, courseCode, userId) as any;
        if (!chapter) return res.status(404).json({ error: "ไม่พบบทนี้" });
        const chunks = db.prepare(
          "SELECT mc.content_text, mc.material_id, mc.start_page, mc.end_page FROM material_chunks mc WHERE mc.chapter_id = ? ORDER BY mc.material_id, mc.start_page"
        ).all(chapterId) as Array<{ content_text: string; material_id: number; start_page: number; end_page: number }>;
        sourceText = chunks.map(c => c.content_text).join("\n\n");
        sourceRef = { chapter_id: chapterId, chapter_name: chapter.name, material_ids: [...new Set(chunks.map(c => c.material_id))] };
      } else {
        // All material pages for this course
        const pages = db.prepare(
          `SELECT mp.extracted_text, mp.page_num, m.id AS material_id, m.filename
           FROM material_pages mp JOIN materials m ON m.id = mp.material_id
           WHERE m.course_code = ? AND m.user_id = ? AND mp.extracted_text IS NOT NULL
           ORDER BY m.id, mp.page_num`
        ).all(courseCode, userId) as Array<{ extracted_text: string; page_num: number; material_id: number; filename: string }>;
        sourceText = pages.map(p => p.extracted_text).join("\n\n");
        sourceRef = { material_ids: [...new Set(pages.map(p => p.material_id))] };
      }

      // Fallback to notes if no material content
      if (!sourceText.trim()) {
        const cs = courseSourceText(db, courseCode, userId);
        if (!cs.text) {
          return res.status(400).json({ error: "ยังไม่มีเนื้อหาให้ออกข้อสอบ อัปโหลดเอกสารหรือเพิ่มโน้ตก่อน" });
        }
        sourceText = cs.text;
      }

      const typeInstruction = questionType === "mcq"
        ? "ทุกข้อเป็นปรนัย 4 ตัวเลือก (type \"mcq\")"
        : questionType === "short"
        ? "ทุกข้อเป็นอัตนัยสั้น (type \"short\")"
        : "ผสมแบบอัตนัยสั้น (type \"short\") และปรนัย 4 ตัวเลือก (type \"mcq\")";

      const diffInstruction = difficulty
        ? `ระดับความยาก: ${difficulty === 1 ? "ง่าย (จำ/เข้าใจ)" : difficulty === 2 ? "ปานกลาง (ประยุกต์)" : "ยาก (วิเคราะห์/สังเคราะห์)"}`
        : "";

      const instruction = `สร้างชุดคำถามทบทวน ${count} ข้อ จากเนื้อหาด้านล่าง
${typeInstruction}
${diffInstruction}
ทุกข้อต้องมี source_page ระบุหน้าที่เนื้อหาอ้างอิงอยู่ (ถ้ารู้) และ explanation ที่อธิบายว่าทำไมคำตอบถึงถูก
ตอบกลับเป็น JSON เท่านั้น:
{ "questions": [
  {"topic":"หัวข้อ","question":"คำถาม","type":"short","choices":[],"model_answer":"คำตอบ","difficulty":${difficulty || 2},"explanation":"คำอธิบาย","source_page":null}
]}
ใช้เฉพาะเนื้อหาที่ให้ ถ้าออกนอกเนื้อหาให้ใส่ [นอกโน้ต — ตรวจกับตำราก่อน]`;

      const EnhancedQuestionsSchema = z.object({
        questions: z.array(z.object({
          topic: z.string().default(""),
          question: z.string().min(1),
          type: z.enum(["short", "mcq"]),
          choices: z.array(z.string()).default([]),
          model_answer: z.string().min(1),
          difficulty: z.number().int().min(1).max(3).default(2),
          explanation: z.string().default(""),
          source_page: z.number().nullable().default(null),
        })).min(1),
      });

      const call: import("./ai.js").ModelCall = async (extra?: string) => {
        const client = new Anthropic({
          apiKey: env.anthropicApiKey,
          ...(env.anthropicWorkspaceId && {
            defaultHeaders: { "anthropic-workspace-id": env.anthropicWorkspaceId },
          }),
        });
        const result = await client.messages.create({
          model: env.anthropicModel,
          max_tokens: 6000,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: `${instruction}\n\nเนื้อหา:\n${sourceText.slice(0, 30000)}${extra ? `\n\n${extra}` : ""}` }],
        });
        const usage = { input_tokens: result.usage.input_tokens, output_tokens: result.usage.output_tokens };
        logUsage(db, "quiz_gen_material", usage);
        const tb = result.content.find(b => b.type === "text");
        return { text: tb && tb.type === "text" ? tb.text : "", usage };
      };

      const generated = await generateValidated(call, EnhancedQuestionsSchema);

      const insert = db.prepare(
        `INSERT INTO questions (user_id, course_code, topic, question, model_answer, type, choices_json, source, difficulty, explanation_th, chapter_id, source_ref)
         VALUES (@user_id, @course_code, @topic, @question, @model_answer, @type, @choices_json, 'ai_generated', @difficulty, @explanation_th, @chapter_id, @source_ref)`,
      );

      const saved = generated.questions.map(q => {
        const ref = { ...sourceRef, source_page: q.source_page };
        const info = insert.run({
          user_id: userId,
          course_code: courseCode,
          topic: q.topic || null,
          question: q.question,
          model_answer: q.model_answer,
          type: q.type,
          choices_json: q.choices.length ? JSON.stringify(q.choices) : null,
          difficulty: q.difficulty,
          explanation_th: q.explanation || null,
          chapter_id: chapterId,
          source_ref: JSON.stringify(ref),
        });
        return {
          id: Number(info.lastInsertRowid),
          topic: q.topic,
          question: q.question,
          type: q.type,
          choices: q.choices,
          difficulty: q.difficulty,
        };
      });

      res.status(201).json({ questions: saved });
    } catch (err) {
      handleAiError(res, err);
    }
  });

  // Grade one answer. Reveals the model answer only after submitting.
  router.post("/quiz/answer", async (req, res) => {
    try {
      const userId = req.user!.id;
      const questionId = Number(req.body.question_id);
      const myAnswer = String(req.body.my_answer ?? "");

      const q = db
        .prepare("SELECT id, question, model_answer, type, topic, explanation_th, source_ref FROM questions WHERE id = ? AND user_id = ?")
        .get(questionId, userId) as
        | { id: number; question: string; model_answer: string; type: string; topic: string | null; explanation_th: string | null; source_ref: string | null }
        | undefined;
      if (!q) return res.status(404).json({ error: "ไม่พบคำถามนี้" });

      let score: number;
      let feedback: string;

      if (q.type === "mcq") {
        const g = gradeMcq(q.model_answer, myAnswer);
        score = g.score;
        feedback = g.feedback;
      } else {
        if (!isAiConfigured()) throw new AiNotConfiguredError();
        const g = await gradeAnswer(
          gradeModelCall(db, {
            question: q.question,
            modelAnswer: q.model_answer,
            myAnswer,
            topic: q.topic ?? undefined,
          }),
        );
        score = g.score;
        feedback = g.feedback;
      }

      db.prepare(
        `INSERT INTO attempts (user_id, question_id, my_answer, ai_score, ai_feedback, created_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(userId, questionId, myAnswer, score, feedback, new Date().toISOString());

      const flashcardCreated = score <= 1;
      if (flashcardCreated) upsertFlashcardToBox1(db, questionId, bangkokToday(), userId);

      res.json({
        score,
        feedback,
        modelAnswer: q.model_answer,
        flashcardCreated,
        explanation: q.explanation_th ?? null,
        sourceRef: q.source_ref ? JSON.parse(q.source_ref) : null,
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
    console.error("[StudyOS] quiz failed:", err);
    res.status(500).json({ error: "เกิดข้อผิดพลาดในระบบ ลองใหม่อีกครั้ง" });
  }
}
