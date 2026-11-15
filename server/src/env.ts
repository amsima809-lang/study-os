/**
 * Loads and validates environment variables in ONE place.
 * Everything else in the server imports `env` from here.
 */
import { config } from "dotenv";
import { fileURLToPath } from "node:url";
import { join, resolve } from "node:path";

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

/** "" at the top of a site, or a sub-path such as "/termtrail" (no trailing slash). */
export function normaliseBasePath(value: string | undefined): string {
  const trimmed = (value ?? "").trim().replace(/^\/+|\/+$/g, "");
  if (trimmed && !/^[A-Za-z0-9._~-]+(\/[A-Za-z0-9._~-]+)*$/.test(trimmed)) throw new Error(`BASE_PATH is not a plain path: ${value}`);
  return trimmed ? `/${trimmed}` : "";
}

export const env = {
  port: Number(process.env.PORT ?? 3100),
  /** Address to listen on. Unset: every address (what a container host expects). Set 127.0.0.1 behind a tunnel or proxy on the same machine. */
  host: process.env.HOST || undefined,
  /** Serve the whole app under this path (the client must be built with the same BASE_PATH). */
  basePath: normaliseBasePath(process.env.BASE_PATH),
  nodeEnv: process.env.NODE_ENV ?? "development",
  tz: process.env.TZ ?? "Asia/Bangkok",
  sessionSecret: required("SESSION_SECRET", "dev-secret"),
  dbPath: resolve(repoRoot, process.env.DB_PATH ?? "data/studyos.db"),
  uploadDir: resolve(repoRoot, process.env.UPLOAD_DIR ?? "data/uploads"),
  clientDist: process.env.CLIENT_DIST ?? `${repoRoot}client/dist`,
  anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? "",
  anthropicModel: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5",
  anthropicWorkspaceId: process.env.ANTHROPIC_WORKSPACE_ID ?? "",
  googleClientId: process.env.GOOGLE_CLIENT_ID ?? "",
  googleClientSecret: process.env.GOOGLE_CLIENT_SECRET ?? "",
  appUrl: process.env.APP_URL ?? "http://localhost:3100",
  /**
   * The URL scheme that returns a Google sign-in to the iOS app (its bundle identifier, which
   * the app listens for). See appSignIn.ts. server/test/brand.test.ts keeps it equal to the app's.
   */
  iosAppScheme: process.env.IOS_APP_SCHEME ?? "com.patrick.termtrail",
  /** Production only: set ALLOW_DEV_LOGIN=true to keep the password-less dev login. See signInMethods. */
  allowDevLogin: process.env.ALLOW_DEV_LOGIN === "true",
  /** With the dev login on: the access code a visitor must give to use it (a private trial site). */
  devLoginCode: process.env.DEV_LOGIN_CODE ?? "",
  /**
   * A Google Maps key for the Maps Embed API: with it, walking directions open on a Google map
   * inside the app; without it they open in Google Maps. The key is sent to signed-in browsers
   * (an embed key always is: it is part of the map's address), so restrict it at Google to the
   * Maps Embed API and to this site's address.
   */
  googleMapsEmbedKey: process.env.GOOGLE_MAPS_EMBED_KEY ?? "",
} as const;

export const isProd = env.nodeEnv === "production";

/**
 * Which ways of signing in this server offers.
 *
 * The "dev login" signs anyone in as ANY email address with no password. That
 * is what a developer wants on their own machine and exactly what must not be
 * on the internet, so in production it is off unless ALLOW_DEV_LOGIN=true is
 * set on purpose (for a private trial before Google sign-in is configured).
 * It is never offered once Google sign-in is configured.
 */
export function signInMethods(config: { nodeEnv: string; googleClientId: string; allowDevLogin: boolean; devLoginCode?: string }): { google: boolean; devLogin: boolean; needsCode: boolean } {
  const google = config.googleClientId !== "";
  const devLogin = !google && (config.nodeEnv !== "production" || config.allowDevLogin);
  // DEV_LOGIN_CODE turns the open dev login into "anyone who was given the code".
  return { google, devLogin, needsCode: devLogin && !!config.devLoginCode };
}

/**
 * Wrong access codes are counted per visitor, so the code cannot be guessed by
 * trying thousands: after `limit` wrong tries, that visitor waits out the window.
 */
export function codeGuard(limit = 8, windowMs = 15 * 60 * 1000) {
  const tries = new Map<string, { count: number; since: number }>();
  const current = (who: string, now: number) => {
    const t = tries.get(who);
    if (t && now - t.since > windowMs) tries.delete(who);
    return tries.get(who);
  };
  return {
    blocked: (who: string, now = Date.now()) => (current(who, now)?.count ?? 0) >= limit,
    wrong: (who: string, now = Date.now()) => {
      const t = current(who, now) ?? { count: 0, since: now };
      t.count += 1;
      tries.set(who, t);
      if (tries.size > 5000) for (const [k, v] of tries) if (now - v.since > windowMs) tries.delete(k);
    },
    right: (who: string) => void tries.delete(who),
  };
}
