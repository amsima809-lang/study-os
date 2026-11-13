/**
 * StudyOS backend entry point.
 * Public: /api/health, /api/auth/*.
 * Everything else under /api requires a valid session (Google OAuth or dev login).
 * In production the built client (client/dist) is served from here too.
 */
import express from "express";
import cookieParser from "cookie-parser";
import session from "express-session";
import passport from "passport";
import { join } from "node:path";
import { env, isProd } from "./env.js";
import { openDb } from "./db.js";
import { seedDatabase } from "./seed.js";
import { setupAuth, requireAuth } from "./auth.js";
import { scheduleDailyBackups } from "./backup.js";
import { createApiRouter } from "./api.js";
import { createNotesRouter } from "./notes.js";
import { createQuizRouter } from "./quiz.js";
import { createFlashcardsRouter } from "./flashcards.js";
import { createAnalyticsRouter } from "./analytics.js";
import { createPlannerRouter } from "./planner.js";
import { createMockRouter } from "./mock.js";
import { createMaterialsRouter } from "./materials.js";
import { createStudyPlanRouter } from "./studyplan.js";

const app = express();
const db = openDb(env.dbPath);

if ((db.prepare("SELECT COUNT(*) n FROM courses").get() as { n: number }).n === 0) {
  seedDatabase(db);
  console.log("[StudyOS] empty database — seeded curriculum data.");
}

app.use(express.json({ limit: "50mb" }));
app.use(cookieParser(env.sessionSecret));
app.use(
  session({
    secret: env.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: isProd,
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000,
      sameSite: "lax",
    },
  }),
);
app.use(passport.initialize());
app.use(passport.session());

// --- public routes ---
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, app: "StudyOS", phase: 15, tz: env.tz, time: new Date().toISOString() });
});
app.use("/api", setupAuth(db));

// --- everything else under /api needs auth ---
app.use("/api", requireAuth);

app.use("/api/uploads", express.static(env.uploadDir));

app.get("/api/stats", (req, res) => {
  const userId = req.user!.id;
  const courses = (db.prepare("SELECT COUNT(*) n FROM courses").get() as { n: number }).n;
  const terms = (db.prepare("SELECT COUNT(*) n FROM plan_terms").get() as { n: number }).n;
  const plannedCredits = (
    db
      .prepare(
        `SELECT COALESCE(SUM(COALESCE(c.credits, 3)), 0) AS credits
         FROM plan_items pi LEFT JOIN courses c ON c.code = pi.course_code
         WHERE pi.user_id = ?`,
      )
      .get(userId) as { credits: number }
  ).credits;
  res.json({ courses, terms, plannedCredits });
});

// --- catalog (read-only) ---
app.get("/api/catalog/faculties", (_req, res) => {
  const rows = db.prepare("SELECT id, code, name_th, name_en FROM faculties ORDER BY name_th").all();
  res.json(rows);
});

app.get("/api/catalog/programs", (req, res) => {
  const facultyId = req.query.faculty_id as string | undefined;
  const rows = facultyId
    ? db.prepare("SELECT id, faculty_id, code, name_th, name_en, degree, total_credits FROM programs WHERE faculty_id = ? ORDER BY name_th").all(facultyId)
    : db.prepare("SELECT id, faculty_id, code, name_th, name_en, degree, total_credits FROM programs ORDER BY name_th").all();
  res.json(rows);
});

// --- user profile ---
app.get("/api/profile", (req, res) => {
  const userId = req.user!.id;
  const profile = db.prepare(
    `SELECT up.*, p.name_th AS program_name, p.name_en AS program_name_en, p.degree,
            f.name_th AS faculty_name, f.name_en AS faculty_name_en
     FROM user_profiles up
     LEFT JOIN programs p ON p.id = up.program_id
     LEFT JOIN faculties f ON f.id = up.faculty_id
     WHERE up.user_id = ?`,
  ).get(userId);
  res.json(profile ?? { user_id: userId });
});

app.put("/api/profile", (req, res) => {
  const userId = req.user!.id;
  const { faculty_id, program_id, entry_year, target_years } = req.body as {
    faculty_id?: string;
    program_id?: string;
    entry_year?: string;
    target_years?: number;
  };
  db.prepare(
    `UPDATE user_profiles SET
       faculty_id = COALESCE(?, faculty_id),
       program_id = COALESCE(?, program_id),
       entry_year = COALESCE(?, entry_year),
       target_years = COALESCE(?, target_years),
       onboarded = 1
     WHERE user_id = ?`,
  ).run(faculty_id ?? null, program_id ?? null, entry_year ?? null, target_years ?? null, userId);
  res.json({ ok: true });
});

app.use("/api", createApiRouter(db));
app.use("/api", createNotesRouter(db));
app.use("/api", createQuizRouter(db));
app.use("/api", createFlashcardsRouter(db));
app.use("/api", createAnalyticsRouter(db));
app.use("/api", createPlannerRouter(db));
app.use("/api", createMockRouter(db));
app.use("/api", createMaterialsRouter(db));
app.use("/api", createStudyPlanRouter(db));

app.get("/api/ai/usage", (req, res) => {
  const userId = req.user!.id;
  const row = db
    .prepare(
      `SELECT COALESCE(SUM(input_tokens),0) AS input_tokens,
              COALESCE(SUM(output_tokens),0) AS output_tokens,
              COUNT(*) AS calls FROM ai_usage WHERE user_id = ?`,
    )
    .get(userId);
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

if (isProd) scheduleDailyBackups(db, env.dbPath);
