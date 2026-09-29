/**
 * Loads and validates environment variables in ONE place.
 * Everything else in the server imports `env` from here.
 */
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

// Resolve default data paths to the repo root, so they don't depend on which
// directory `npm run ...` was launched from (workspace scripts run in server/).
const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

// Load .env from repo root (npm workspace CWD is server/, not root).
config({ path: join(repoRoot, ".env") });

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (value === undefined) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

export const env = {
  port: Number(process.env.PORT ?? 3100),
  nodeEnv: process.env.NODE_ENV ?? "development",
  tz: process.env.TZ ?? "Asia/Bangkok",
  appPassword: required("APP_PASSWORD", "change-me"),
  sessionSecret: required("SESSION_SECRET", "dev-secret"),
  dbPath: process.env.DB_PATH ?? `${repoRoot}data/studyos.db`,
  uploadDir: process.env.UPLOAD_DIR ?? `${repoRoot}data/uploads`,
  clientDist: process.env.CLIENT_DIST ?? `${repoRoot}client/dist`,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  anthropicModel: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5",
  anthropicWorkspaceId: process.env.ANTHROPIC_WORKSPACE_ID ?? "",
} as const;

export const isProd = env.nodeEnv === "production";
