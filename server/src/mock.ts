/**
 * Phase 8: Mock exam mode.
 * Available from 21 days before a course's exam. Builds a timed exam (default
 * 40 questions / 90 min) from the course's question bank, weighted toward weak
 * topics and low-box flashcards. Grading reuses /api/quiz/answer (so misses
 * still auto-create flashcards); results are computed from the attempts.
 */
import { Router } from "express";
import type { DB } from "./db.js";
import { bangkokToday, daysBetween } from "./api.js";

export const MOCK_TARGET = 40;
export const MOCK_DURATION_MIN = 90;
export const MOCK_WINDOW_DAYS = 21;

/** A mock opens within 21 days before the exam (and not after it). */
export function isMockAvailable(daysToExam: number | null): boolean {
  return daysToExam != null && daysToExam >= 0 && daysToExam <= MOCK_WINDOW_DAYS;
}

type BankQuestion = { id: number; topic: string | null; question: string; type: string; choices_json: string | null };

/**
 * Pick up to `target` questions, weighted toward weak topics and low-box cards.
 * weight = 1 + (low-box flashcard ? 3 : 0) + (weak topic ? 2 : 0).
 */
export function selectMockQuestions(
  pool: BankQuestion[],
  opts: { weakTopics: Set<string>; lowBoxIds: Set<number>; target: number },
): number[] {
  const weighted = pool.map((q, i) => {
    let w = 1;
    if (opts.lowBoxIds.has(q.id)) w += 3;
    if (q.topic && opts.weakTopics.has(q.topic)) w += 2;
    return { id: q.id, w, i };
  });
  weighted.sort((a, b) => (b.w - a.w) || (a.i - b.i));
  return weighted.slice(0, opts.target).map((x) => x.id);
}

function currentTermId(db: DB): string {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'current_term_id'").get() as
    | { value: string }
    | undefined;
  return row?.value ?? "2/69";
}

export function createMockRouter(db: DB): Router {
  const router = Router();

  // Which courses can run a mock right now (exam within 21 days + a question bank).
  router.get("/mock/available", (_req, res) => {
    const term = currentTermId(db);
    const today = bangkokToday();
    const rows = db
      .prepare(
        `SELECT e.course_code, c.name_th, MIN(e.datetime_start) AS d
         FROM exams e JOIN courses c ON c.code = e.course_code
         WHERE e.term_id = ? GROUP BY e.course_code`,
      )
      .all(term) as Array<{ course_code: string; name_th: string; d: string }>;

    const courses = rows.map((r) => {
      const daysToExam = daysBetween(today, r.d.slice(0, 10));
      const bankCount = (
        db.prepare("SELECT COUNT(*) n FROM questions WHERE course_code = ?").get(r.course_code) as {
          n: number;
        }
      ).n;
      return {
        code: r.course_code,
        name_th: r.name_th,
        daysToExam,
        bankCount,
        available: isMockAvailable(daysToExam) && bankCount > 0,
      };
    });
    res.json({ term, windowDays: MOCK_WINDOW_DAYS, courses });
  });

  // Build a mock exam for a course.
  router.post("/mock/generate", (req, res) => {
    const term = currentTermId(db);
    const courseCode = String(req.body.course_code || "");
    const today = bangkokToday();

    const examRow = db
      .prepare("SELECT MIN(datetime_start) AS d FROM exams WHERE course_code = ? AND term_id = ?")
      .get(courseCode, term) as { d: string | null };
    const daysToExam = examRow.d ? daysBetween(today, examRow.d.slice(0, 10)) : null;
    if (!isMockAvailable(daysToExam)) {
      return res
        .status(400)
        .json({ error: `ข้อสอบจำลองเปิดให้ทำ ${MOCK_WINDOW_DAYS} วันก่อนสอบเท่านั้น` });
    }

    const pool = db
      .prepare(
        "SELECT id, topic, question, type, choices_json FROM questions WHERE course_code = ?",
      )
      .all(courseCode) as BankQuestion[];
    if (pool.length === 0) {
      return res.status(400).json({ error: "ยังไม่มีคลังข้อสอบ ลองทำควิซของวิชานี้ก่อน" });
    }

    // Weak topics (mastery < 50 from past attempts) and low-box flashcard questions.
    const weakTopics = new Set(
      (
        db
          .prepare(
            `SELECT q.topic AS topic, AVG(a.ai_score) AS avg
             FROM attempts a JOIN questions q ON q.id = a.question_id
             WHERE q.course_code = ? AND q.topic IS NOT NULL
             GROUP BY q.topic HAVING AVG(a.ai_score) < 1.0`,
          )
          .all(courseCode) as Array<{ topic: string }>
      ).map((r) => r.topic),
    );
    const lowBoxIds = new Set(
      (
        db
          .prepare(
            `SELECT f.question_id AS id FROM flashcards f
             JOIN questions q ON q.id = f.question_id
             WHERE q.course_code = ? AND f.box <= 2`,
          )
          .all(courseCode) as Array<{ id: number }>
      ).map((r) => r.id),
    );

    const ids = selectMockQuestions(pool, { weakTopics, lowBoxIds, target: MOCK_TARGET });
    const byId = new Map(pool.map((q) => [q.id, q]));

    const info = db
      .prepare(
        "INSERT INTO mock_exams (course_code, created_at, question_ids_json, duration_min) VALUES (?, ?, ?, ?)",
      )
      .run(courseCode, new Date().toISOString(), JSON.stringify(ids), MOCK_DURATION_MIN);

    res.status(201).json({
      mockId: Number(info.lastInsertRowid),
      durationMin: MOCK_DURATION_MIN,
      questions: ids.map((id) => {
        const q = byId.get(id)!;
        return {
          id: q.id,
          topic: q.topic,
          question: q.question,
          type: q.type,
          choices: q.choices_json ? (JSON.parse(q.choices_json) as string[]) : [],
        };
      }),
    });
  });

  // Finish a mock: compute score + weak topics from the attempts on its questions.
  router.post("/mock/:id/finish", (req, res) => {
    const id = Number(req.params.id);
    const minutes = Math.max(0, Math.round(Number(req.body.minutes) || 0));
    const mock = db.prepare("SELECT question_ids_json FROM mock_exams WHERE id = ?").get(id) as
      | { question_ids_json: string }
      | undefined;
    if (!mock) return res.status(404).json({ error: "ไม่พบข้อสอบจำลองนี้" });

    const ids = JSON.parse(mock.question_ids_json) as number[];
    const maxScore = ids.length * 2;

    // Latest attempt score per question (0 if unanswered).
    const scoreStmt = db.prepare(
      "SELECT ai_score FROM attempts WHERE question_id = ? ORDER BY created_at DESC, id DESC LIMIT 1",
    );
    const topicStmt = db.prepare("SELECT topic FROM questions WHERE id = ?");
    let score = 0;
    const topicAgg = new Map<string, { sum: number; n: number }>();
    for (const qid of ids) {
      const row = scoreStmt.get(qid) as { ai_score: number | null } | undefined;
      const s = row?.ai_score ?? 0;
      score += s;
      const tRow = topicStmt.get(qid) as { topic: string | null } | undefined;
      if (tRow?.topic) {
        const e = topicAgg.get(tRow.topic) ?? { sum: 0, n: 0 };
        e.sum += s;
        e.n += 1;
        topicAgg.set(tRow.topic, e);
      }
    }

    const weakTopics = [...topicAgg.entries()]
      .map(([name, v]) => ({ name, mastery: Math.round((v.sum / (v.n * 2)) * 100) }))
      .sort((a, b) => a.mastery - b.mastery)
      .slice(0, 3);

    db.prepare("UPDATE mock_exams SET score = ?, duration_min = ? WHERE id = ?").run(
      score,
      minutes || MOCK_DURATION_MIN,
      id,
    );

    res.json({ score, maxScore, questionCount: ids.length, weakTopics });
  });

  return router;
}
