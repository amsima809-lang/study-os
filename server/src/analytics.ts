/**
 * Phase 6: study-time tracking + per-course analytics with a risk flag.
 *
 * Risk formula (also documented in docs/ARCHITECTURE.md):
 *   effort  = hoursRatio >= 0.8 ? 0 : hoursRatio >= 0.5 ? 15 : 30
 *   perf    = quizAvg == null ? 10 : quizAvg >= 70 ? 0 : quizAvg >= 50 ? 15 : 30
 *   urgency = daysToExam == null ? 0 : daysToExam <= 7 ? 25 : daysToExam <= 21 ? 12 : 0
 *   score   = min(effort + perf + urgency, 100)
 *   flag    = score >= 50 ? red : score >= 25 ? yellow : green
 */
import { Router } from "express";
import type { DB } from "./db.js";
import { bangkokToday, bangkokWeekday, addDaysISO, daysBetween, studyTargets } from "./api.js";

export type RiskFlag = "green" | "yellow" | "red";

export function computeRisk(input: {
  hoursRatio: number;
  quizAvg: number | null;
  daysToExam: number | null;
}): { score: number; flag: RiskFlag } {
  const { hoursRatio, quizAvg, daysToExam } = input;
  const effort = hoursRatio >= 0.8 ? 0 : hoursRatio >= 0.5 ? 15 : 30;
  const perf = quizAvg == null ? 10 : quizAvg >= 70 ? 0 : quizAvg >= 50 ? 15 : 30;
  const urgency = daysToExam == null ? 0 : daysToExam <= 7 ? 25 : daysToExam <= 21 ? 12 : 0;
  const score = Math.min(effort + perf + urgency, 100);
  const flag: RiskFlag = score >= 50 ? "red" : score >= 25 ? "yellow" : "green";
  return { score, flag };
}

/** Monday of the current Bangkok week, as "YYYY-MM-DD". */
export function weekStartISO(today = bangkokToday(), weekday = bangkokWeekday()): string {
  return addDaysISO(today, -(weekday - 1));
}

function currentTermId(db: DB): string {
  const row = db.prepare("SELECT value FROM settings WHERE key = 'current_term_id'").get() as
    | { value: string }
    | undefined;
  return row?.value ?? "2/69";
}

export function createAnalyticsRouter(db: DB): Router {
  const router = Router();

  // Log a study session (from the Pomodoro timer or a manual entry).
  router.post("/study-sessions", (req, res) => {
    const courseCode = (req.body.course_code as string) || null;
    const minutes = Math.max(0, Math.round(Number(req.body.minutes) || 0));
    const kind = (req.body.kind as string) || "read";
    if (minutes <= 0) return res.status(400).json({ error: "จำนวนนาทีต้องมากกว่า 0" });
    if (!["read", "quiz", "review", "mock"].includes(kind)) {
      return res.status(400).json({ error: "ประเภทไม่ถูกต้อง" });
    }
    const info = db
      .prepare(
        "INSERT INTO study_sessions (course_code, started_at, minutes, kind) VALUES (?, ?, ?, ?)",
      )
      .run(courseCode, new Date().toISOString(), minutes, kind);
    res.status(201).json({ id: Number(info.lastInsertRowid) });
  });

  router.get("/analytics", (_req, res) => {
    const term = currentTermId(db);
    const today = bangkokToday();
    const weekStart = weekStartISO();
    const weekStartTs = `${weekStart}T00:00:00.000Z`;
    const targets = studyTargets(db, term);

    const hoursStmt = db.prepare(
      "SELECT COALESCE(SUM(minutes),0) AS m FROM study_sessions WHERE course_code = ? AND started_at >= ?",
    );
    const quizStmt = db.prepare(
      `SELECT AVG(a.ai_score) AS avg, COUNT(*) AS n
       FROM attempts a JOIN questions q ON q.id = a.question_id
       WHERE q.course_code = ?`,
    );
    const topicStmt = db.prepare(
      `SELECT q.topic AS topic, AVG(a.ai_score) AS avg, COUNT(*) AS n
       FROM attempts a JOIN questions q ON q.id = a.question_id
       WHERE q.course_code = ? AND q.topic IS NOT NULL
       GROUP BY q.topic`,
    );
    const examStmt = db.prepare(
      "SELECT MIN(datetime_start) AS d FROM exams WHERE course_code = ? AND term_id = ?",
    );

    const courses = targets.courses.map((c) => {
      const minutes = (hoursStmt.get(c.code, weekStartTs) as { m: number }).m;
      const actualWeeklyHours = Math.round((minutes / 60) * 10) / 10;
      const hoursRatio = c.weeklyHours > 0 ? actualWeeklyHours / c.weeklyHours : 1;

      const quizRow = quizStmt.get(c.code) as { avg: number | null; n: number };
      const quizAverage = quizRow.n > 0 && quizRow.avg != null ? Math.round((quizRow.avg / 2) * 100) : null;

      const topics = (topicStmt.all(c.code) as Array<{ topic: string; avg: number; n: number }>)
        .map((t) => ({ name: t.topic, mastery: Math.round((t.avg / 2) * 100) }))
        .sort((a, b) => a.mastery - b.mastery);

      const examRow = examStmt.get(c.code, term) as { d: string | null };
      const daysToExam = examRow.d ? daysBetween(today, examRow.d.slice(0, 10)) : null;

      const risk = computeRisk({ hoursRatio, quizAvg: quizAverage, daysToExam });

      return {
        code: c.code,
        name_th: c.name_th,
        difficulty: c.difficulty,
        targetWeeklyHours: c.weeklyHours,
        actualWeeklyHours,
        quizAverage,
        attempts: quizRow.n,
        daysToExam: daysToExam != null && daysToExam >= 0 ? daysToExam : null,
        weakestTopics: topics.slice(0, 3),
        risk: risk.flag,
        riskScore: risk.score,
      };
    });

    res.json({ term, today, weekStart, weeklyTarget: targets.weeklyTarget, courses });
  });

  return router;
}
