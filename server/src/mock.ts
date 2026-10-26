/**
 * Phase 4 (upgraded): Mock exam mode.
 * Full-screen exam with question grid, flagging, auto-save, per-question
 * timing, custom grade cutoffs, chapter-wise scores, and history with trends.
 */
import { Router } from "express";
import type { DB } from "./db.js";
import { bangkokToday, daysBetween } from "./api.js";

export const MOCK_DEFAULT_COUNT = 40;
export const MOCK_DEFAULT_DURATION_MIN = 90;
export const MOCK_WINDOW_DAYS = 21;

export function isMockAvailable(daysToExam: number | null): boolean {
  return daysToExam != null && daysToExam >= 0 && daysToExam <= MOCK_WINDOW_DAYS;
}

export type BankQuestion = {
  id: number;
  topic: string | null;
  chapter_id: number | null;
  question: string;
  type: string;
  choices_json: string | null;
};

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

type GradeCutoff = { label: string; min_pct: number };

function getGradeCutoffs(db: DB): GradeCutoff[] {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'grade_cutoffs'").get() as
    | { value: string }
    | undefined;
  if (!row) return [];
  try {
    return JSON.parse(row.value) as GradeCutoff[];
  } catch {
    return [];
  }
}

function estimateGrade(cutoffs: GradeCutoff[], pct: number): string {
  const sorted = [...cutoffs].sort((a, b) => b.min_pct - a.min_pct);
  for (const c of sorted) {
    if (pct >= c.min_pct) return c.label;
  }
  return "F";
}

function currentTermId(db: DB): string {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'current_term_id'").get() as
    | { value: string }
    | undefined;
  return row?.value ?? "2/69";
}

export function createMockRouter(db: DB): Router {
  const router = Router();

  // Which courses can run a mock right now
  router.get("/mock/available", (_req, res) => {
    const term = currentTermId(db);
    const today = bangkokToday();
    const rows = db
      .prepare(
        `SELECT e.course_code, c.name_th, c.name_en, MIN(e.datetime_start) AS d
         FROM exams e JOIN courses c ON c.code = e.course_code
         WHERE e.term_id = ? GROUP BY e.course_code`,
      )
      .all(term) as Array<{ course_code: string; name_th: string; name_en: string | null; d: string }>;

    const courses = rows.map((r) => {
      const daysToExam = daysBetween(today, r.d.slice(0, 10));
      const bankCount = (
        db.prepare("SELECT COUNT(*) n FROM questions WHERE course_code = ?").get(r.course_code) as { n: number }
      ).n;
      const chapters = db
        .prepare("SELECT id, name FROM chapters WHERE course_code = ? ORDER BY sort_order")
        .all(r.course_code) as Array<{ id: number; name: string }>;
      return {
        code: r.course_code,
        name_th: r.name_th,
        name_en: r.name_en,
        daysToExam,
        bankCount,
        available: isMockAvailable(daysToExam) && bankCount > 0,
        chapters,
      };
    });
    res.json({ term, windowDays: MOCK_WINDOW_DAYS, courses });
  });

  // Generate a new mock exam with configurable settings
  router.post("/mock/generate", (req, res) => {
    const term = currentTermId(db);
    const courseCode = String(req.body.course_code || "");
    const questionCount = Math.min(Math.max(Number(req.body.question_count) || MOCK_DEFAULT_COUNT, 5), 200);
    const durationMin = Math.min(Math.max(Number(req.body.duration_min) || MOCK_DEFAULT_DURATION_MIN, 5), 300);
    const chapterIds: number[] | undefined = req.body.chapter_ids;
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

    let pool: BankQuestion[];
    if (chapterIds && chapterIds.length > 0) {
      const placeholders = chapterIds.map(() => "?").join(",");
      pool = db
        .prepare(
          `SELECT id, topic, chapter_id, question, type, choices_json FROM questions
           WHERE course_code = ? AND chapter_id IN (${placeholders})`,
        )
        .all(courseCode, ...chapterIds) as BankQuestion[];
    } else {
      pool = db
        .prepare("SELECT id, topic, chapter_id, question, type, choices_json FROM questions WHERE course_code = ?")
        .all(courseCode) as BankQuestion[];
    }

    if (pool.length === 0) {
      return res.status(400).json({ error: "ยังไม่มีคลังข้อสอบ ลองทำควิซของวิชานี้ก่อน" });
    }

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

    const ids = selectMockQuestions(pool, { weakTopics, lowBoxIds, target: questionCount });
    const byId = new Map(pool.map((q) => [q.id, q]));

    const info = db
      .prepare(
        `INSERT INTO mock_exams (course_code, created_at, question_ids_json, duration_min, question_count)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(courseCode, new Date().toISOString(), JSON.stringify(ids), durationMin, ids.length);

    const mockId = Number(info.lastInsertRowid);

    // Create auto-save session
    db.prepare(
      `INSERT INTO mock_sessions (mock_id, seconds_left, updated_at) VALUES (?, ?, ?)`,
    ).run(mockId, durationMin * 60, new Date().toISOString());

    res.status(201).json({
      mockId,
      durationMin,
      questions: ids.map((id) => {
        const q = byId.get(id)!;
        return {
          id: q.id,
          topic: q.topic,
          chapter_id: q.chapter_id,
          question: q.question,
          type: q.type,
          choices: q.choices_json ? (JSON.parse(q.choices_json) as string[]) : [],
        };
      }),
    });
  });

  // Auto-save session state
  router.post("/mock/:id/save", (req, res) => {
    const id = Number(req.params.id);
    const { answers, flags, current_idx, seconds_left, time_per_q } = req.body;
    const exists = db.prepare("SELECT 1 FROM mock_sessions WHERE mock_id = ?").get(id);
    if (!exists) return res.status(404).json({ error: "ไม่พบ session" });

    db.prepare(
      `UPDATE mock_sessions SET answers_json = ?, flags_json = ?, current_idx = ?,
       seconds_left = ?, time_per_q_json = ?, updated_at = ? WHERE mock_id = ?`,
    ).run(
      JSON.stringify(answers ?? {}),
      JSON.stringify(flags ?? []),
      current_idx ?? 0,
      seconds_left ?? 0,
      JSON.stringify(time_per_q ?? {}),
      new Date().toISOString(),
      id,
    );
    res.json({ ok: true });
  });

  // Restore session (for auto-resume after browser close)
  router.get("/mock/:id/session", (req, res) => {
    const id = Number(req.params.id);
    const session = db.prepare("SELECT * FROM mock_sessions WHERE mock_id = ?").get(id) as
      | { mock_id: number; answers_json: string; flags_json: string; current_idx: number; seconds_left: number; time_per_q_json: string }
      | undefined;
    if (!session) return res.status(404).json({ error: "ไม่พบ session" });

    const mock = db.prepare("SELECT course_code, question_ids_json, duration_min FROM mock_exams WHERE id = ?").get(id) as
      | { course_code: string; question_ids_json: string; duration_min: number }
      | undefined;
    if (!mock) return res.status(404).json({ error: "ไม่พบข้อสอบจำลอง" });

    const ids = JSON.parse(mock.question_ids_json) as number[];
    const questions = ids.map((qid) => {
      const q = db.prepare("SELECT id, topic, chapter_id, question, type, choices_json FROM questions WHERE id = ?").get(qid) as BankQuestion | undefined;
      if (!q) return null;
      return {
        id: q.id,
        topic: q.topic,
        chapter_id: q.chapter_id,
        question: q.question,
        type: q.type,
        choices: q.choices_json ? (JSON.parse(q.choices_json) as string[]) : [],
      };
    }).filter(Boolean);

    res.json({
      mockId: id,
      courseCode: mock.course_code,
      durationMin: mock.duration_min,
      questions,
      answers: JSON.parse(session.answers_json),
      flags: JSON.parse(session.flags_json),
      currentIdx: session.current_idx,
      secondsLeft: session.seconds_left,
      timePerQ: JSON.parse(session.time_per_q_json),
    });
  });

  // Check for in-progress (unfinished) mock exams
  router.get("/mock/in-progress", (_req, res) => {
    const rows = db
      .prepare(
        `SELECT me.id, me.course_code, c.name_th, c.name_en, me.created_at, me.duration_min,
                ms.seconds_left, ms.current_idx, me.question_count
         FROM mock_exams me
         JOIN mock_sessions ms ON ms.mock_id = me.id
         JOIN courses c ON c.code = me.course_code
         WHERE me.finished_at IS NULL AND me.score IS NULL
         ORDER BY me.created_at DESC`,
      )
      .all() as Array<{
        id: number; course_code: string; name_th: string; name_en: string | null;
        created_at: string; duration_min: number; seconds_left: number;
        current_idx: number; question_count: number | null;
      }>;
    res.json({ exams: rows });
  });

  // Finish a mock: compute score + chapter breakdown + grade estimation
  router.post("/mock/:id/finish", (req, res) => {
    const id = Number(req.params.id);
    const timePerQ: Record<string, number> = req.body.time_per_q ?? {};

    const mock = db.prepare("SELECT question_ids_json, course_code FROM mock_exams WHERE id = ?").get(id) as
      | { question_ids_json: string; course_code: string }
      | undefined;
    if (!mock) return res.status(404).json({ error: "ไม่พบข้อสอบจำลองนี้" });

    const ids = JSON.parse(mock.question_ids_json) as number[];
    const maxScore = ids.length * 2;

    const scoreStmt = db.prepare(
      "SELECT ai_score FROM attempts WHERE question_id = ? ORDER BY created_at DESC, id DESC LIMIT 1",
    );
    const qStmt = db.prepare("SELECT topic, chapter_id FROM questions WHERE id = ?");
    const chapterStmt = db.prepare("SELECT name FROM chapters WHERE id = ?");

    let score = 0;
    const topicAgg = new Map<string, { sum: number; n: number }>();
    const chapterAgg = new Map<number, { name: string; sum: number; n: number; max: number }>();

    for (const qid of ids) {
      const row = scoreStmt.get(qid) as { ai_score: number | null } | undefined;
      const s = row?.ai_score ?? 0;
      score += s;
      const qInfo = qStmt.get(qid) as { topic: string | null; chapter_id: number | null } | undefined;
      if (qInfo?.topic) {
        const e = topicAgg.get(qInfo.topic) ?? { sum: 0, n: 0 };
        e.sum += s;
        e.n += 1;
        topicAgg.set(qInfo.topic, e);
      }
      if (qInfo?.chapter_id) {
        const existing = chapterAgg.get(qInfo.chapter_id);
        if (existing) {
          existing.sum += s;
          existing.n += 1;
          existing.max += 2;
        } else {
          const ch = chapterStmt.get(qInfo.chapter_id) as { name: string } | undefined;
          chapterAgg.set(qInfo.chapter_id, {
            name: ch?.name ?? `บท ${qInfo.chapter_id}`,
            sum: s,
            n: 1,
            max: 2,
          });
        }
      }
    }

    const weakTopics = [...topicAgg.entries()]
      .map(([name, v]) => ({ name, mastery: Math.round((v.sum / (v.n * 2)) * 100) }))
      .sort((a, b) => a.mastery - b.mastery)
      .slice(0, 5);

    const chapterScores = [...chapterAgg.entries()]
      .map(([chapterId, v]) => ({
        chapter_id: chapterId,
        name: v.name,
        score: v.sum,
        max: v.max,
        pct: Math.round((v.sum / v.max) * 100),
        count: v.n,
      }))
      .sort((a, b) => a.pct - b.pct);

    const pct = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
    const cutoffs = getGradeCutoffs(db);
    const grade = estimateGrade(cutoffs, pct);

    const totalSeconds = Object.values(timePerQ).reduce((a, b) => a + b, 0);

    db.prepare(
      `UPDATE mock_exams SET score = ?, duration_min = ?, finished_at = ?,
       time_per_q_json = ?, chapter_scores_json = ?, total_seconds = ? WHERE id = ?`,
    ).run(
      score,
      Math.round(totalSeconds / 60) || mock.course_code ? Math.round(totalSeconds / 60) : 0,
      new Date().toISOString(),
      JSON.stringify(timePerQ),
      JSON.stringify(chapterScores),
      Math.round(totalSeconds),
      id,
    );

    // Clean up session
    db.prepare("DELETE FROM mock_sessions WHERE mock_id = ?").run(id);

    res.json({
      score,
      maxScore,
      pct,
      grade,
      cutoffs,
      questionCount: ids.length,
      weakTopics,
      chapterScores,
      totalSeconds: Math.round(totalSeconds),
      timePerQ,
    });
  });

  // Grade cutoffs CRUD
  router.get("/mock/cutoffs", (_req, res) => {
    res.json({ cutoffs: getGradeCutoffs(db) });
  });

  router.put("/mock/cutoffs", (req, res) => {
    const cutoffs = req.body.cutoffs as GradeCutoff[];
    if (!Array.isArray(cutoffs)) return res.status(400).json({ error: "cutoffs must be an array" });
    db.prepare("UPDATE settings SET value = ? WHERE key = 'grade_cutoffs'").run(JSON.stringify(cutoffs));
    res.json({ ok: true, cutoffs });
  });

  // Exam history with trend data
  router.get("/mock/history", (req, res) => {
    const courseCode = req.query.course_code as string | undefined;
    const limit = Math.min(Number(req.query.limit) || 20, 100);

    let rows;
    if (courseCode) {
      rows = db
        .prepare(
          `SELECT me.id, me.course_code, c.name_th, c.name_en, me.created_at, me.finished_at,
                  me.score, me.duration_min, me.question_count, me.total_seconds,
                  me.chapter_scores_json, me.time_per_q_json,
                  (SELECT json_group_array(q.id) FROM json_each(me.question_ids_json) je
                   JOIN questions q ON q.id = je.value) AS q_count_check
           FROM mock_exams me JOIN courses c ON c.code = me.course_code
           WHERE me.finished_at IS NOT NULL AND me.course_code = ?
           ORDER BY me.finished_at DESC LIMIT ?`,
        )
        .all(courseCode, limit);
    } else {
      rows = db
        .prepare(
          `SELECT me.id, me.course_code, c.name_th, c.name_en, me.created_at, me.finished_at,
                  me.score, me.duration_min, me.question_count, me.total_seconds,
                  me.chapter_scores_json
           FROM mock_exams me JOIN courses c ON c.code = me.course_code
           WHERE me.finished_at IS NOT NULL
           ORDER BY me.finished_at DESC LIMIT ?`,
        )
        .all(limit);
    }

    const cutoffs = getGradeCutoffs(db);
    const history = (rows as Array<Record<string, unknown>>).map((r) => {
      const qCount = (r.question_count as number) || 0;
      const maxScore = qCount * 2;
      const score = (r.score as number) || 0;
      const pct = maxScore > 0 ? Math.round((score / maxScore) * 100) : 0;
      return {
        id: r.id,
        course_code: r.course_code,
        name_th: r.name_th,
        name_en: r.name_en,
        created_at: r.created_at,
        finished_at: r.finished_at,
        score,
        maxScore,
        pct,
        grade: estimateGrade(cutoffs, pct),
        questionCount: qCount,
        totalSeconds: r.total_seconds ?? 0,
        chapterScores: r.chapter_scores_json ? JSON.parse(r.chapter_scores_json as string) : [],
      };
    });

    res.json({ history, cutoffs });
  });

  return router;
}
