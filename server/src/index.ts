/**
 * StudyOS backend entry point.
 * Phase 0: just a health check so we can prove the server runs and the
 * client can talk to it. Real routes arrive in later phases.
 */
import express from "express";
import cookieParser from "cookie-parser";
import { env } from "./env.js";

const app = express();

app.use(express.json({ limit: "10mb" }));
app.use(cookieParser(env.sessionSecret));

// Health check — used by the client and by Fly.io deploy checks.
app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    app: "StudyOS",
    phase: 0,
    tz: env.tz,
    time: new Date().toISOString(),
  });
});

app.listen(env.port, () => {
  console.log(`[StudyOS] server listening on http://localhost:${env.port}`);
});
