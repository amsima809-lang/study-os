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
  quizModelCall,
  gradeAnswer,
  gradeModelCall,
} from "./ai.js";

const QUESTION_COUNT = 10;

/** Deterministic MCQ grading: exact match on the chosen option. */
export function gradeMcq(modelAnswer: string, myAnswer: string): { score: 0 | 2; feedback: string } {
  const correct = myAnswer.trim() === modelAnswer.trim();
  return correct
    ? { score: 2, feedback: "ถูกต้อง 🎉" }
    : { score: 0, feedback: `ยังไม่ถูก เฉลยคือ: ${modelAnswer}` };
}

/** Create a box-1 flashcard for a question, or reset an existing one to box 1. */
export function upsertFlashcardToBox1(db: DB, questionId: number, today: string): void {
  const existing = db
    .prepare("SELECT id FROM flashcards WHERE question_id = ?")
    .get(questionId) as { id: number } | undefined;
  const nextReview = addDaysISO(today, 1);
  if (existing) {
    db.prepare("UPDATE flashcards SET box = 1, next_review_date = ? WHERE id = ?").run(
      nextReview,
      existing.id,
    );
  } else {
    db.prepare(
      "INSERT INTO flashcards (question_id, box, next_review_date) VALUES (?, 1, ?)",
    ).run(questionId, nextReview);
  }
}

/** Assemble study text for a note (raw text + AI summary). */
function noteSourceText(db: DB, noteId: number): string | null {
  const n = db.prepare("SELECT raw_text, ai_summary_md FROM notes WHERE id = ?").get(noteId) as
    | { raw_text: string | null; ai_summary_md: string | null }
    | undefined;
  if (!n) return null;
  const text = [n.raw_text, n.ai_summary_md].filter(Boolean).join("\n\n");
  return text.trim() || null;
}

/** Assemble study text for a whole course (all its notes). */
function courseSourceText(db: DB, courseCode: string): { text: string | null; noteId: number | null } {
  const rows = db
    .prepare(
      "SELECT id, raw_text, ai_summary_md FROM notes WHERE course_code = ? ORDER BY created_at DESC",
    )
    .all(courseCode) as Array<{ id: number; raw_text: string | null; ai_summary_md: string | null }>;
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

      const source = req.body.source as "note" | "course";
      let sourceText: string | null = null;
      let noteId: number | null = null;
      let courseCode: string | null = null;

      if (source === "note") {
        noteId = Number(req.body.note_id);
        sourceText = noteSourceText(db, noteId);
        const row = db.prepare("SELECT course_code FROM notes WHERE id = ?").get(noteId) as
          | { course_code: string | null }
          | undefined;
        courseCode = row?.course_code ?? null;
      } else if (source === "course") {
        courseCode = String(req.body.course_code);
        const cs = courseSourceText(db, courseCode);
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
        `INSERT INTO questions (note_id, course_code, topic, question, model_answer, type, choices_json)
         VALUES (@note_id, @course_code, @topic, @question, @model_answer, @type, @choices_json)`,
      );
      const saved = generated.questions.map((q) => {
        const info = insert.run({
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

  // Grade one answer. Reveals the model answer only after submitting.
  router.post("/quiz/answer", async (req, res) => {
    try {
      const questionId = Number(req.body.question_id);
      const myAnswer = String(req.body.my_answer ?? "");

      const q = db
        .prepare("SELECT id, question, model_answer, type, topic FROM questions WHERE id = ?")
        .get(questionId) as
        | { id: number; question: string; model_answer: string; type: string; topic: string | null }
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
        `INSERT INTO attempts (question_id, my_answer, ai_score, ai_feedback, created_at)
         VALUES (?, ?, ?, ?, ?)`,
      ).run(questionId, myAnswer, score, feedback, new Date().toISOString());

      // Wrong or partial -> flashcard for spaced repetition.
      const flashcardCreated = score <= 1;
      if (flashcardCreated) upsertFlashcardToBox1(db, questionId, bangkokToday());

      res.json({ score, feedback, modelAnswer: q.model_answer, flashcardCreated });
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
