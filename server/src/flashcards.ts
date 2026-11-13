/**
 * Phase 2 (upgraded): SM-2 spaced repetition with confidence rating.
 * Replaces old Leitner boxes with SM-2 algorithm while keeping box field
 * for backwards-compatible display (mapped from interval).
 *
 * Confidence levels: 1=ลืมหมด, 2=ยากมาก, 3=ยาก, 4=จำได้
 * SM-2 maps: 1→q=0, 2→q=2, 3→q=3, 4→q=5
 */
import { Router } from "express";
import type { DB } from "./db.js";
import { bangkokToday, addDaysISO, getSetting, setSetting } from "./api.js";

// Keep for legacy callers (quiz auto-flashcard)
export const LEITNER_DAYS: Record<number, number> = { 1: 1, 2: 3, 3: 7, 4: 14, 5: 30 };

const SM2_QUALITY: Record<number, number> = { 1: 0, 2: 2, 3: 3, 4: 5 };

export type SM2Result = {
  easiness: number;
  interval: number;
  repetitions: number;
  box: number;
  next_review_date: string;
};

/** Map interval_days → display box 1-5 */
export function intervalToBox(days: number): number {
  if (days <= 1) return 1;
  if (days <= 3) return 2;
  if (days <= 7) return 3;
  if (days <= 14) return 4;
  return 5;
}

/** SM-2 algorithm: compute next easiness, interval and repetitions. */
export function sm2(
  easiness: number,
  interval: number,
  repetitions: number,
  confidence: number,
  today: string,
): SM2Result {
  const q = SM2_QUALITY[confidence] ?? 0;

  // Update easiness factor (min 1.3)
  let newEasiness = easiness + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
  if (newEasiness < 1.3) newEasiness = 1.3;

  let newInterval: number;
  let newReps: number;

  if (q < 3) {
    // Failed: reset
    newInterval = 1;
    newReps = 0;
  } else {
    // Passed
    if (repetitions === 0) {
      newInterval = 1;
    } else if (repetitions === 1) {
      newInterval = 6;
    } else {
      newInterval = Math.round(interval * newEasiness);
    }
    newReps = repetitions + 1;
  }

  const box = intervalToBox(newInterval);
  return {
    easiness: Math.round(newEasiness * 100) / 100,
    interval: newInterval,
    repetitions: newReps,
    box,
    next_review_date: addDaysISO(today, newInterval),
  };
}

/** Legacy: box-based review (for quiz auto-flashcard creation) */
export function reviewCard(
  box: number,
  correct: boolean,
  today: string,
): { box: number; next_review_date: string } {
  const newBox = correct ? Math.min(box + 1, 5) : 1;
  return { box: newBox, next_review_date: addDaysISO(today, LEITNER_DAYS[newBox]) };
}

type DueCardRow = {
  id: number;
  box: number;
  easiness: number;
  interval_days: number;
  repetitions: number;
  total_reviews: number;
  correct_reviews: number;
  next_review_date: string;
  question: string;
  model_answer: string;
  type: string;
  choices_json: string | null;
  topic: string | null;
  course_code: string | null;
  course_name: string | null;
  course_name_en: string | null;
  chapter_name: string | null;
};

export function createFlashcardsRouter(db: DB): Router {
  const router = Router();

  // Cards due for review today (or overdue), respecting daily limit.
  router.get("/flashcards/due", (req, res) => {
    const userId = req.user!.id;
    const today = bangkokToday();
    const limit = Number(getSetting(db, "daily_review_limit", "30", userId));

    const rows = db
      .prepare(
        `SELECT f.id, f.box, f.easiness, f.interval_days, f.repetitions,
                f.total_reviews, f.correct_reviews, f.next_review_date,
                q.question, q.model_answer, q.type, q.choices_json, q.topic, q.course_code,
                c.name_th AS course_name, c.name_en AS course_name_en,
                ch.name AS chapter_name
         FROM flashcards f
         JOIN questions q ON q.id = f.question_id
         LEFT JOIN courses c ON c.code = q.course_code
         LEFT JOIN chapters ch ON ch.id = q.chapter_id
         WHERE f.next_review_date <= ? AND f.user_id = ?
         ORDER BY f.box ASC, f.easiness ASC, f.id ASC
         LIMIT ?`,
      )
      .all(today, userId, limit) as DueCardRow[];

    const totalDue = (
      db.prepare("SELECT COUNT(*) n FROM flashcards WHERE next_review_date <= ? AND user_id = ?").get(today, userId) as { n: number }
    ).n;

    res.json({
      today,
      limit,
      totalDue,
      cards: rows.map((r) => ({
        id: r.id,
        box: r.box,
        easiness: r.easiness,
        interval: r.interval_days,
        totalReviews: r.total_reviews,
        correctReviews: r.correct_reviews,
        question: r.question,
        model_answer: r.model_answer,
        type: r.type,
        choices: r.choices_json ? (JSON.parse(r.choices_json) as string[]) : [],
        topic: r.topic,
        course_code: r.course_code,
        course_name: r.course_name,
        course_name_en: r.course_name_en,
        chapter_name: r.chapter_name,
      })),
    });
  });

  // Stats: box distribution + due + mastery overview
  router.get("/flashcards/stats", (req, res) => {
    const userId = req.user!.id;
    const today = bangkokToday();
    const boxes = db
      .prepare("SELECT box, COUNT(*) AS n FROM flashcards WHERE user_id = ? GROUP BY box")
      .all(userId) as Array<{ box: number; n: number }>;
    const total = (db.prepare("SELECT COUNT(*) n FROM flashcards WHERE user_id = ?").get(userId) as { n: number }).n;
    const due = (
      db.prepare("SELECT COUNT(*) n FROM flashcards WHERE next_review_date <= ? AND user_id = ?").get(today, userId) as { n: number }
    ).n;
    const byBox: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    for (const b of boxes) byBox[b.box] = b.n;

    const avgEasiness = (
      db.prepare("SELECT AVG(easiness) AS avg FROM flashcards WHERE user_id = ?").get(userId) as { avg: number | null }
    ).avg ?? 2.5;

    const limit = Number(getSetting(db, "daily_review_limit", "30", userId));
    res.json({ total, due, byBox, avgEasiness: Math.round(avgEasiness * 100) / 100, limit });
  });

  // Review with confidence (1-4) — SM-2 algorithm
  router.post("/flashcards/:id/review", (req, res) => {
    const userId = req.user!.id;
    const id = Number(req.params.id);
    const confidence = Number(req.body.confidence ?? 0);

    let conf = confidence;
    if (!conf && req.body.correct !== undefined) {
      conf = req.body.correct === true || req.body.correct === "true" ? 4 : 1;
    }
    if (conf < 1 || conf > 4) return res.status(400).json({ error: "confidence ต้องอยู่ระหว่าง 1-4" });

    const card = db.prepare("SELECT id, box, easiness, interval_days, repetitions FROM flashcards WHERE id = ? AND user_id = ?").get(id, userId) as
      | { id: number; box: number; easiness: number; interval_days: number; repetitions: number }
      | undefined;
    if (!card) return res.status(404).json({ error: "ไม่พบการ์ดนี้" });

    const today = bangkokToday();
    const result = sm2(card.easiness, card.interval_days, card.repetitions, conf, today);

    const applyReview = db.transaction(() => {
      db.prepare(
        `INSERT INTO review_history (flashcard_id, confidence, old_easiness, new_easiness, old_interval, new_interval, reviewed_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      ).run(id, conf, card.easiness, result.easiness, card.interval_days, result.interval, new Date().toISOString());

      const isCorrect = conf >= 3 ? 1 : 0;
      db.prepare(
        `UPDATE flashcards SET box = ?, easiness = ?, interval_days = ?, repetitions = ?,
         next_review_date = ?, last_confidence = ?, last_reviewed_at = ?,
         total_reviews = total_reviews + 1, correct_reviews = correct_reviews + ?
         WHERE id = ?`,
      ).run(result.box, result.easiness, result.interval, result.repetitions, result.next_review_date, conf, today, isCorrect, id);

      updateMastery(db, id, userId);
    });
    applyReview();

    res.json({ id, ...result, confidence: conf });
  });

  // Update daily limit
  router.put("/flashcards/settings", (req, res) => {
    const userId = req.user!.id;
    const limit = Number(req.body.daily_review_limit);
    if (!limit || limit < 1 || limit > 200) return res.status(400).json({ error: "จำกัดต้องอยู่ระหว่าง 1-200" });
    setSetting(db, "daily_review_limit", String(limit), userId);
    res.json({ ok: true, daily_review_limit: limit });
  });

  // Review history (for graphs)
  router.get("/flashcards/history", (req, res) => {
    const userId = req.user!.id;
    const days = Number(req.query.days) || 30;
    const since = addDaysISO(bangkokToday(), -days);
    const rows = db
      .prepare(
        `SELECT DATE(rh.reviewed_at) AS date,
                COUNT(*) AS reviews,
                AVG(rh.confidence) AS avg_confidence,
                SUM(CASE WHEN rh.confidence >= 3 THEN 1 ELSE 0 END) AS correct
         FROM review_history rh
         JOIN flashcards f ON f.id = rh.flashcard_id
         WHERE rh.reviewed_at >= ? AND f.user_id = ?
         GROUP BY DATE(rh.reviewed_at)
         ORDER BY date`,
      )
      .all(since, userId);
    res.json({ history: rows });
  });

  // Chapter mastery scores
  router.get("/mastery", (req, res) => {
    const userId = req.user!.id;
    const courseCode = req.query.course_code as string | undefined;
    let rows;
    if (courseCode) {
      rows = db
        .prepare(
          `SELECT cm.*, ch.name AS chapter_name
           FROM chapter_mastery cm
           LEFT JOIN chapters ch ON ch.id = cm.chapter_id
           WHERE cm.course_code = ? AND cm.user_id = ?
           ORDER BY cm.mastery_score ASC`,
        )
        .all(courseCode, userId);
    } else {
      rows = db
        .prepare(
          `SELECT cm.course_code, c.name_th AS course_name, c.name_en AS course_name_en,
                  AVG(cm.mastery_score) AS avg_mastery,
                  SUM(cm.total_attempts) AS total_attempts,
                  COUNT(*) AS topic_count
           FROM chapter_mastery cm
           JOIN courses c ON c.code = cm.course_code
           WHERE cm.user_id = ?
           GROUP BY cm.course_code
           ORDER BY avg_mastery ASC`,
        )
        .all(userId);
    }
    res.json({ mastery: rows });
  });

  // Weakness summary — weakest areas across all courses
  router.get("/weakness", (req, res) => {
    const userId = req.user!.id;
    const courses = db
      .prepare(
        `SELECT cm.course_code, c.name_th, c.name_en,
                AVG(cm.mastery_score) AS avg_mastery,
                MIN(cm.mastery_score) AS min_mastery,
                COUNT(*) AS topics
         FROM chapter_mastery cm
         JOIN courses c ON c.code = cm.course_code
         WHERE cm.user_id = ?
         GROUP BY cm.course_code
         ORDER BY avg_mastery ASC`,
      )
      .all(userId);

    const weakTopics = db
      .prepare(
        `SELECT cm.course_code, cm.topic, cm.mastery_score, cm.total_attempts, cm.correct_attempts,
                ch.name AS chapter_name, c.name_th AS course_name
         FROM chapter_mastery cm
         LEFT JOIN chapters ch ON ch.id = cm.chapter_id
         JOIN courses c ON c.code = cm.course_code
         WHERE cm.mastery_score < 70 AND cm.user_id = ?
         ORDER BY cm.mastery_score ASC
         LIMIT 20`,
      )
      .all(userId);

    const today = bangkokToday();
    const reviewStats = db
      .prepare(
        `SELECT COUNT(*) AS total_cards,
                SUM(CASE WHEN next_review_date <= ? THEN 1 ELSE 0 END) AS due,
                AVG(easiness) AS avg_easiness,
                AVG(CAST(correct_reviews AS REAL) / NULLIF(total_reviews, 0)) AS avg_retention
         FROM flashcards WHERE user_id = ?`,
      )
      .get(today, userId);

    res.json({ courses, weakTopics, reviewStats });
  });

  return router;
}

/** Update chapter_mastery based on flashcard review performance */
function updateMastery(db: DB, flashcardId: number, userId: string): void {
  const card = db
    .prepare(
      `SELECT f.total_reviews, f.correct_reviews, f.easiness,
              q.course_code, q.chapter_id, q.topic
       FROM flashcards f
       JOIN questions q ON q.id = f.question_id
       WHERE f.id = ? AND f.user_id = ?`,
    )
    .get(flashcardId, userId) as {
      total_reviews: number; correct_reviews: number; easiness: number;
      course_code: string | null; chapter_id: number | null; topic: string | null;
    } | undefined;

  if (!card || !card.course_code) return;

  const topic = card.topic || "(ทั่วไป)";

  const retention = card.total_reviews > 0 ? card.correct_reviews / card.total_reviews : 0;
  const easinessScore = Math.min((card.easiness - 1.3) / (2.5 - 1.3), 1);
  const mastery = Math.round((retention * 60 + easinessScore * 40) * 100) / 100;

  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO chapter_mastery (user_id, course_code, chapter_id, topic, mastery_score, total_attempts, correct_attempts, last_activity_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT(course_code, chapter_id, topic)
     DO UPDATE SET
       mastery_score = excluded.mastery_score,
       total_attempts = excluded.total_attempts,
       correct_attempts = excluded.correct_attempts,
       last_activity_at = excluded.last_activity_at,
       updated_at = excluded.updated_at`,
  ).run(userId, card.course_code, card.chapter_id, topic, mastery, card.total_reviews, card.correct_reviews, now, now);
}
