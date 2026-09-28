/**
 * Loads and validates environment variables in ONE place.
 * Everything else in the server imports `env` from here.
 */
import "dotenv/config";

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
  dbPath: process.env.DB_PATH ?? "./data/studyos.db",
  uploadDir: process.env.UPLOAD_DIR ?? "./data/uploads",
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  anthropicModel: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5",
} as const;

export const isProd = env.nodeEnv === "production";
