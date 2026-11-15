/**
 * Signing in with Google from inside the iOS app (Phase 65).
 *
 * Google refuses to sign anyone in inside an app's web view, so the app opens
 * Google in the system's own sign-in sheet (a real browser). That browser is not
 * the app: its cookies are its own, so the session it would get is no use to the
 * app's web view. Instead of a session, the browser is sent back to the app with
 * a HANDOFF CODE, and the web view exchanges the code for its own session.
 *
 * Two things keep the code from being worth stealing:
 *  - it works once, and only for two minutes;
 *  - it is bound to a secret only the web view that started the sign-in knows.
 *    The web view makes a random VERIFIER, keeps it, and sends only its SHA-256
 *    (the CHALLENGE) along with the sign-in. To redeem the code it must show the
 *    verifier. Another app that caught the code on its way back cannot.
 *    (The same idea as PKCE, RFC 7636.)
 *
 * Codes are kept in memory, hashed: a restart in the middle of a sign-in means
 * the student presses the button again.
 */
import { createHash, randomBytes, timingSafeEqual } from "node:crypto";

const b64url = (b: Buffer) => b.toString("base64url");
const sha256 = (text: string) => createHash("sha256").update(text).digest();

/** A challenge is the base64url SHA-256 of a verifier: always 43 characters. */
export function isChallenge(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}

/** What a verifier may look like (RFC 7636: 43 to 128 unreserved characters). */
function isVerifier(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9._~-]{43,128}$/.test(value);
}

export function challengeFor(verifier: string): string {
  return b64url(sha256(verifier));
}

/**
 * The OAuth "state" that marks a sign-in as started by the app. It goes to
 * Google and comes back unchanged, carrying the challenge with it.
 */
export function appState(challenge: string): string {
  return `app.${challenge}`;
}

/** The challenge from a returning "state", or null when the sign-in was not started by the app. */
export function challengeFromState(state: unknown): string | null {
  if (typeof state !== "string" || !state.startsWith("app.")) return null;
  const challenge = state.slice(4);
  return isChallenge(challenge) ? challenge : null;
}

/** Where the browser is sent to return to the app: `<scheme>://signin?code=…` or `?error=failed`. */
export function appReturnUrl(scheme: string, result: { code: string } | { error: string }): string {
  if (!/^[a-z][a-z0-9+.-]*$/i.test(scheme)) throw new Error(`not a URL scheme: ${scheme}`);
  const query = "code" in result ? `code=${encodeURIComponent(result.code)}` : `error=${encodeURIComponent(result.error)}`;
  return `${scheme}://signin?${query}`;
}

export interface Handoffs {
  /** A new one-time code for this user, bound to the challenge. */
  issue(userId: string, challenge: string, now?: number): string;
  /** The user the code was issued for, or null. Whatever the answer, the code is spent. */
  redeem(code: unknown, verifier: unknown, now?: number): string | null;
  readonly size: number;
}

export function createHandoffs(ttlMs = 2 * 60 * 1000, max = 2000): Handoffs {
  const open = new Map<string, { userId: string; challenge: string; expires: number }>();
  const key = (code: string) => sha256(code).toString("hex");
  const sweep = (now: number) => {
    for (const [k, v] of open) if (v.expires <= now) open.delete(k);
  };

  return {
    issue(userId, challenge, now = Date.now()) {
      if (!isChallenge(challenge)) throw new Error("not a challenge");
      sweep(now);
      // A flood of sign-ins must not grow the map without end: drop the oldest.
      while (open.size >= max) open.delete(open.keys().next().value!);
      const code = b64url(randomBytes(32));
      open.set(key(code), { userId, challenge, expires: now + ttlMs });
      return code;
    },
    redeem(code, verifier, now = Date.now()) {
      if (typeof code !== "string" || code.length > 200) return null;
      const k = key(code);
      const entry = open.get(k);
      if (!entry) return null;
      open.delete(k); // one try only, right or wrong
      if (entry.expires <= now) return null;
      if (!isVerifier(verifier)) return null;
      const given = Buffer.from(challengeFor(verifier)), wanted = Buffer.from(entry.challenge);
      return given.length === wanted.length && timingSafeEqual(given, wanted) ? entry.userId : null;
    },
    get size() {
      return open.size;
    },
  };
}
