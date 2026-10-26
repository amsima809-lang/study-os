/**
 * StudyOS backend entry point.
 * Public: /api/health, /api/login, /api/me, /api/logout.
 * Everything else under /api requires a valid session cookie.
 * In production the built client (client/dist) is served from here too.
 */
import express from "express";
import cookieParser from "cookie-parser";
import { join } from "node:path";
import { env, isProd } from "./env.js";
import { openDb } from "./db.js";
import { seedDatabase } from "./seed.js";
import { createAuthRouter, requireAuth } from "./auth.js";
import { scheduleDailyBackups } from "./backup.js";
import { createApiRouter } from "./api.js";
import { createNotesRouter } from "./notes.js";
import { createQuizRouter } from "./quiz.js";
import { createFlashcardsRouter } from "./flashcards.js";
import { createAnalyticsRouter } from "./analytics.js";
import { createPlannerRouter } from "./planner.js";
import { createMockRouter } from "./mock.js";
import { createMaterialsRouter } from "./materials.js";

const app = express();
const db = openDb(env.dbPath);

// Seed the curriculum on first boot (e.g. a fresh deploy on an empty volume).
if ((db.prepare("SELECT COUNT(*) n FROM courses").get() as { n: number }).n === 0) {
  seedDatabase(db);
  console.log("[StudyOS] empty database — seeded curriculum data.");
}

app.use(express.json({ limit: "50mb" }));
app.use(cookieParser(env.sessionSecret));

// --- public routes ---
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, app: "StudyOS", phase: 9, tz: env.tz, time: new Date().toISOString() });
});
app.use("/api", createAuthRouter()); // /api/login, /api/me, /api/logout

// --- everything else under /api needs auth ---
app.use("/api", requireAuth);

// Uploaded note images (private to the logged-in user).
app.use("/api/uploads", express.static(env.uploadDir));

app.get("/api/stats", (_req, res) => {
  const courses = (db.prepare("SELECT COUNT(*) n FROM courses").get() as { n: number }).n;
  const terms = (db.prepare("SELECT COUNT(*) n FROM plan_terms").get() as { n: number }).n;
  const plannedCredits = (
    db
      .prepare(
        `SELECT COALESCE(SUM(COALESCE(c.credits, 3)), 0) AS credits
         FROM plan_items pi LEFT JOIN courses c ON c.code = pi.course_code`,
      )
      .get() as { credits: number }
  ).credits;
  res.json({ courses, terms, plannedCredits });
});

app.use("/api", createApiRouter(db)); // today / schedule / exams
app.use("/api", createNotesRouter(db)); // notes + AI summary
app.use("/api", createQuizRouter(db)); // quiz + grading
app.use("/api", createFlashcardsRouter(db)); // flashcards
app.use("/api", createAnalyticsRouter(db)); // tracking + analytics
app.use("/api", createPlannerRouter(db)); // degree planner
app.use("/api", createMockRouter(db)); // mock exam
app.use("/api", createMaterialsRouter(db)); // Phase 1: materials + chapters

app.get("/api/ai/usage", (_req, res) => {
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(input_tokens),0) AS input_tokens,
              COALESCE(SUM(output_tokens),0) AS output_tokens,
              COUNT(*) AS calls FROM ai_usage`,
    )
    .get();
  res.json(row);
});

// --- production: serve the built client + SPA fallback ---
if (isProd) {
  app.use(express.static(env.clientDist));
  app.use((req, res) => {
    if (req.method === "GET" && !req.path.startsWith("/api")) {
      res.sendFile(join(env.clientDist, "index.html"));
    } else {
      res.status(404).json({ error: "not found" });
    }
  });
}

app.listen(env.port, () => {
  console.log(`[StudyOS] server listening on http://localhost:${env.port} (${env.nodeEnv})`);
});

// Daily SQLite backups in production (kept in <data>/backups, last 14).
if (isProd) scheduleDailyBackups(db, env.dbPath);
