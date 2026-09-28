/**
 * StudyOS backend entry point.
 * Phase 0: just a health check so we can prove the server runs and the
 * client can talk to it. Real routes arrive in later phases.
 */
import express from "express";
import cookieParser from "cookie-parser";
import { env } from "./env.js";
import { openDb } from "./db.js";
import { createApiRouter } from "./api.js";
import { createNotesRouter } from "./notes.js";
import { createQuizRouter } from "./quiz.js";
import { createFlashcardsRouter } from "./flashcards.js";
import { createAnalyticsRouter } from "./analytics.js";
import { createPlannerRouter } from "./planner.js";
import { createMockRouter } from "./mock.js";

const app = express();
const db = openDb(env.dbPath);

app.use(express.json({ limit: "10mb" }));
app.use(cookieParser(env.sessionSecret));

// Serve uploaded note images through the /api proxy.
app.use("/api/uploads", express.static(env.uploadDir));

// Health check — used by the client and by Fly.io deploy checks.
app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    app: "StudyOS",
    phase: 1,
    tz: env.tz,
    time: new Date().toISOString(),
  });
});

// Quick curriculum stats, so we can prove the seeded database is live.
app.get("/api/stats", (_req, res) => {
  const courses = (db.prepare("SELECT COUNT(*) n FROM courses").get() as { n: number }).n;
  const terms = (db.prepare("SELECT COUNT(*) n FROM plan_terms").get() as { n: number }).n;
  const plannedCredits = (
    db
      .prepare(
        `SELECT COALESCE(SUM(COALESCE(c.credits, 3)), 0) AS credits
         FROM plan_items pi
         LEFT JOIN courses c ON c.code = pi.course_code`,
      )
      .get() as { credits: number }
  ).credits;
  res.json({ courses, terms, plannedCredits });
});

// Phase 2: Today / weekly schedule / exams
app.use("/api", createApiRouter(db));

// Phase 3: notes + AI summary
app.use("/api", createNotesRouter(db));

// Phase 4: quiz + grading
app.use("/api", createQuizRouter(db));

// Phase 5: spaced-repetition flashcards
app.use("/api", createFlashcardsRouter(db));

// Phase 6: study tracking + analytics
app.use("/api", createAnalyticsRouter(db));

// Phase 7: degree planner
app.use("/api", createPlannerRouter(db));

// Phase 8: mock exam
app.use("/api", createMockRouter(db));

// AI token usage totals (for a future settings/cost page).
app.get("/api/ai/usage", (_req, res) => {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(input_tokens),0) AS input_tokens,
              COALESCE(SUM(output_tokens),0) AS output_tokens,
              COUNT(*) AS calls
       FROM ai_usage`,
    )
    .get();
  res.json(row);
});

app.listen(env.port, () => {
  console.log(`[StudyOS] server listening on http://localhost:${env.port}`);
});
