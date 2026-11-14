/**
 * StudyOS backend entry point.
 * Public: /api/health, /api/auth/*.
 * Everything else under /api requires a valid session (Google OAuth or dev login).
 * In production the built client (client/dist) is served from here too.
 */
import express from "express";
import cookieParser from "cookie-parser";
import session from "express-session";
import { SqliteSessionStore } from "./sessionStore.js";
import passport from "passport";
import { join } from "node:path";
import { env, isProd, signInMethods } from "./env.js";
import { openDb } from "./db.js";
import { seedDatabase, needsSeed } from "./seed.js";
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
import { createLecturesRouter } from "./lectures.js";
import { createRemindersRouter } from "./reminders.js";
import { createPushRouter, loadVapidKeys, startPushScheduler } from "./push.js";

const app = express();
const db = openDb(env.dbPath);

if (needsSeed(db)) {
  seedDatabase(db, { reset: false });
  console.log("[StudyOS] new database — seeded curriculum data.");
}

// In production the app sits behind the host's HTTPS proxy (Fly). Without this,
// Express sees every request as plain HTTP, refuses to send the "secure" session
// cookie, and nobody can stay signed in.
if (isProd) app.set("trust proxy", 1);

app.use(express.json({ limit: "50mb" }));
app.use(cookieParser(env.sessionSecret));
app.use(
  session({
    store: new SqliteSessionStore(db),
    secret: env.sessionSecret,
    resave: false,
    saveUninitialized: false,
    cookie: {
      secure: isProd,
      httpOnly: true,
      maxAge: 30 * 24 * 60 * 60 * 1000,
      sameSite: "lax",
      // Under a sub-path, keep the cookie to this app: other apps may share the site.
      path: env.basePath || "/",
    },
  }),
);
app.use(passport.initialize());
app.use(passport.session());

// --- public routes ---
app.get("/api/health", (_req, res) => {
  res.json({ ok: true, app: "StudyOS", phase: 56, tz: env.tz, time: new Date().toISOString() });
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
    ? db.prepare("SELECT id, faculty_id, code, name_th, name_en, degree, total_credits FROM programs WHERE faculty_id = ? ORDER BY rowid").all(facultyId)
    : db.prepare("SELECT id, faculty_id, code, name_th, name_en, degree, total_credits FROM programs ORDER BY rowid").all();
  res.json(rows);
});

app.get("/api/catalog/courses", (req, res) => {
  const userId = req.user!.id;
  const programId = (req.query.program_id as string | undefined) ??
    (db.prepare("SELECT program_id FROM user_profiles WHERE user_id = ?").get(userId) as
      { program_id: string | null } | undefined)?.program_id;
  if (!programId) return res.json([]);
  const rows = db.prepare(
    `SELECT c.code, c.name_th, c.name_en, c.credits, pc.category, c.choose_group
     FROM program_courses pc JOIN courses c ON c.code = pc.course_code
     WHERE pc.program_id = ? ORDER BY pc.category, c.code`,
  ).all(programId);
  res.json(rows);
});

// --- e-Testing ---
app.get("/api/etesting", (req, res) => {
  const userId = req.user!.id;
  const termId = (req.query.term_id as string | undefined) ?? "2/69";
  const programId = (db.prepare("SELECT program_id FROM user_profiles WHERE user_id = ?").get(userId) as
    { program_id: string | null } | undefined)?.program_id;

  const schedule = db.prepare("SELECT * FROM etesting_schedule WHERE term_id = ?").get(termId);
  const courses = programId
    ? db.prepare(
        `SELECT ec.course_code, ec.fee_central, ec.fee_regional, ec.has_essay,
                c.name_th, c.name_en, c.credits
         FROM etesting_courses ec
         LEFT JOIN courses c ON c.code = ec.course_code
         INNER JOIN program_courses pc ON pc.course_code = ec.course_code AND pc.program_id = ?
         WHERE ec.term_id = ?
         ORDER BY ec.course_code`,
      ).all(programId, termId)
    : db.prepare(
        `SELECT ec.course_code, ec.fee_central, ec.fee_regional, ec.has_essay,
                c.name_th, c.name_en, c.credits
         FROM etesting_courses ec
         LEFT JOIN courses c ON c.code = ec.course_code
         WHERE ec.term_id = ?
         ORDER BY ec.course_code`,
      ).all(termId);
  res.json({ schedule, courses });
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
  const { university_id, faculty_id, program_id, entry_year, entry_term, target_years } = req.body as {
    university_id?: string;
    faculty_id?: string;
    program_id?: string;
    entry_year?: string;
    entry_term?: string;
    target_years?: number;
  };
  // university_id is a short slug from the client's university list.
  if (university_id !== undefined && !/^[a-z]{2,12}$/.test(university_id)) {
    return res.status(400).json({ error: "Invalid university_id" });
  }
  db.prepare(
    `UPDATE user_profiles SET
       university_id = COALESCE(?, university_id),
       faculty_id = COALESCE(?, faculty_id),
       program_id = COALESCE(?, program_id),
       entry_year = COALESCE(?, entry_year),
       entry_term = COALESCE(?, entry_term),
       target_years = COALESCE(?, target_years),
       onboarded = 1
     WHERE user_id = ?`,
  ).run(university_id ?? null, faculty_id ?? null, program_id ?? null, entry_year ?? null, entry_term ?? null, target_years ?? null, userId);
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
app.use("/api", createLecturesRouter(db));
app.use("/api", createRemindersRouter(db));

// Notifications when the app is closed: routes for devices, and the half-minute check for due items.
const vapidKeys = loadVapidKeys(db);
app.use("/api", createPushRouter(db, vapidKeys));
startPushScheduler(db, vapidKeys);

// --- subscription ---
app.get("/api/subscription", (req, res) => {
  const userId = req.user!.id;
  const sub = db.prepare(
    "SELECT * FROM subscriptions WHERE user_id = ? AND status = 'active' AND expires_at > datetime('now') ORDER BY expires_at DESC LIMIT 1",
  ).get(userId) as any;
  const user = db.prepare("SELECT plan FROM users WHERE id = ?").get(userId) as { plan: string };
  res.json({ plan: user.plan, subscription: sub ?? null, isPremium: user.plan === "premium" || !!sub });
});

app.post("/api/subscription/activate", (req, res) => {
  const userId = req.user!.id;
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
  db.prepare(
    "INSERT INTO subscriptions (user_id, plan, status, price, expires_at) VALUES (?, 'premium', 'active', 99, ?)",
  ).run(userId, expiresAt);
  db.prepare("UPDATE users SET plan = 'premium' WHERE id = ?").run(userId);
  res.json({ ok: true, expires_at: expiresAt });
});

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
  // "Share → StudyOS" is normally taken by the service worker (client/public/share-sw.js).
  // If it is not running yet, open the app instead of answering 404; the shared
  // content is not read or stored here.
  app.post("/share", (_req, res) => res.redirect(303, `${env.basePath}/`));
  app.use(express.static(env.clientDist));
  app.use((req, res) => {
    if (req.method === "GET" && !req.path.startsWith("/api")) {
      res.sendFile(join(env.clientDist, "index.html"));
    } else {
      res.status(404).json({ error: "not found" });
    }
  });
}

// Under a sub-path (BASE_PATH=/termtrail) the whole app is mounted there: every route
// above keeps its own address, and anything outside the sub-path is "not found".
const site = env.basePath ? express().use(env.basePath, app) : app;
if (env.basePath && isProd) site.set("trust proxy", 1);
const onListening = () => {
  console.log(`[StudyOS] server listening on http://${env.host ?? "localhost"}:${env.port}${env.basePath} (${env.nodeEnv})`);
  if (isProd) {
    const methods = signInMethods(env);
    if (methods.devLogin && methods.needsCode) {
      console.warn("[StudyOS] Trial sign-in is on: anyone holding DEV_LOGIN_CODE can sign in as any email address. Configure Google sign-in before real students use this.");
    } else if (methods.devLogin) {
      console.warn("[StudyOS] WARNING: ALLOW_DEV_LOGIN is on in production with no DEV_LOGIN_CODE. Anyone can sign in as any email address, with no password. Set DEV_LOGIN_CODE, or configure Google sign-in and remove it, before this is on the internet.");
    } else if (!methods.google) {
      console.warn("[StudyOS] WARNING: no way to sign in is configured. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (see docs/DEPLOY.md).");
    }
  }
};
if (env.host) site.listen(env.port, env.host, onListening);
else site.listen(env.port, onListening);

if (isProd) scheduleDailyBackups(db, env.dbPath);
