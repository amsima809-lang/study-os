/**
 * Phase 5: Leitner spaced-repetition flashcards.
 * Boxes 1..5 map to review intervals of 1, 3, 7, 14, 30 days.
 * Correct answer -> move up one box (max 5). Wrong -> back to box 1.
 */
import { Router } from "express";
import type { DB } from "./db.js";
import { bangkokToday, addDaysISO } from "./api.js";

export const LEITNER_DAYS: Record<number, number> = { 1: 1, 2: 3, 3: 7, 4: 14, 5: 30 };

/** Given the current box and whether the recall was correct, schedule the next review. */
export function reviewCard(
  box: number,
  correct: boolean,
  today: string,
): { box: number; next_review_date: string } {
  const newBox = correct ? Math.min(box + 1, 5) : 1;
  return { box: newBox, next_review_date: addDaysISO(today, LEITNER_DAYS[newBox]) };
}

type DueCard = {
  id: number;
  box: number;
  next_review_date: string;
  question: string;
  model_answer: string;
  type: string;
  choices_json: string | null;
  topic: string | null;
  course_code: string | null;
  course_name: string | null;
};

export function createFlashcardsRouter(db: DB): Router {
  const router = Router();

  // Cards due for review today (or overdue), easiest boxes first.
  router.get("/flashcards/due", (_req, res) => {
    const today = bangkokToday();
    const rows = db
      .prepare(
        `SELECT f.id, f.box, f.next_review_date,
                q.question, q.model_answer, q.type, q.choices_json, q.topic, q.course_code,
                c.name_th AS course_name
         FROM flashcards f
         JOIN questions q ON q.id = f.question_id
         LEFT JOIN courses c ON c.code = q.course_code
         WHERE f.next_review_date <= ?
         ORDER BY f.box ASC, f.id ASC`,
      )
      .all(today) as DueCard[];

    res.json({
      today,
      cards: rows.map((r) => ({
        id: r.id,
        box: r.box,
        question: r.question,
        model_answer: r.model_answer,
        type: r.type,
        choices: r.choices_json ? (JSON.parse(r.choices_json) as string[]) : [],
        topic: r.topic,
        course_name: r.course_name,
      })),
    });
  });

  // Box counts + due total, for a progress view.
  router.get("/flashcards/stats", (_req, res) => {
    const today = bangkokToday();
    const boxes = db
      .prepare("SELECT box, COUNT(*) AS n FROM flashcards GROUP BY box")
      .all() as Array<{ box: number; n: number }>;
    const total = (db.prepare("SELECT COUNT(*) n FROM flashcards").get() as { n: number }).n;
    const due = (
      db.prepare("SELECT COUNT(*) n FROM flashcards WHERE next_review_date <= ?").get(today) as {
        n: number;
      }
    ).n;
    const byBox: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const b of boxes) byBox[b.box] = b.n;
    res.json({ total, due, byBox });
  });

  // Record a review result and reschedule.
  router.post("/flashcards/:id/review", (req, res) => {
    const id = Number(req.params.id);
    const correct = req.body.correct === true || req.body.correct === "true";

    const card = db.prepare("SELECT id, box FROM flashcards WHERE id = ?").get(id) as
      | { id: number; box: number }
      | undefined;
    if (!card) return res.status(404).json({ error: "ไม่พบการ์ดนี้" });

    const next = reviewCard(card.box, correct, bangkokToday());
    db.prepare("UPDATE flashcards SET box = ?, next_review_date = ? WHERE id = ?").run(
      next.box,
      next.next_review_date,
      id,
    );
    res.json({ id, ...next });
  });

  return router;
}
