/**
 * StudyOS backend entry point.
 * Phase 0: just a health check so we can prove the server runs and the
 * client can talk to it. Real routes arrive in later phases.
 */
import express from "express";
import cookieParser from "cookie-parser";
import { env } from "./env.js";
import { openDb } from "./db.js";

const app = express();
const db = openDb(env.dbPath);

app.use(express.json({ limit: "10mb" }));
app.use(cookieParser(env.sessionSecret));

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

app.listen(env.port, () => {
  console.log(`[StudyOS] server listening on http://localhost:${env.port}`);
});
