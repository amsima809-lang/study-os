/**
 * Multi-user auth: Google OAuth (production) + dev login (when no Google config).
 * Ported from studyos-public, adapted for study-os's Express 5 setup.
 */
import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import type { DB } from "./db.js";
import { env, signInMethods, codeGuard } from "./env.js";
import { createHash, timingSafeEqual } from "node:crypto";
import { createHandoffs, isChallenge, appState, challengeFromState, appReturnUrl } from "./appSignIn.js";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  plan: string;
  onboarded: number;
  university_id: string | null;
}

declare global {
  namespace Express {
    interface User extends AuthUser {}
  }
}

/**
 * The account for a sign-in: the existing one with that email (so a student who
 * first used dev login keeps their notes when they later sign in with Google,
 * and the Google identity is attached once), or a new one.
 *
 * Capitals do not make a different address: someone who typed "Name@gmail.com" at
 * the dev login is the same person Google later reports as "name@gmail.com".
 * Matching them exactly would hand that student a new, empty account.
 */
export function findOrCreateUser(
  db: DB,
  profile: { googleId?: string; email: string; name: string; avatar: string },
): string {
  // The exact address first; otherwise the oldest account that differs only in capitals.
  const existing = db
    .prepare("SELECT id FROM users WHERE lower(email) = lower(?) ORDER BY email = ? DESC, created_at LIMIT 1")
    .get(profile.email, profile.email) as { id: string } | undefined;

  if (existing) {
    db.prepare(
      "UPDATE users SET name = ?, avatar_url = ?, google_id = COALESCE(google_id, ?), last_login_at = ? WHERE id = ?",
    ).run(profile.name, profile.avatar, profile.googleId ?? null, new Date().toISOString(), existing.id);
    return existing.id;
  }

  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  const referralCode = id.slice(0, 8);
  db.prepare(
    `INSERT INTO users (id, email, name, avatar_url, google_id, referral_code, created_at, last_login_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(id, profile.email, profile.name, profile.avatar, profile.googleId ?? null, referralCode, now, now);
  db.prepare("INSERT INTO user_profiles (user_id) VALUES (?)").run(id);
  db.prepare("INSERT INTO notification_settings (user_id) VALUES (?)").run(id);
  return id;
}

/** Compare two strings without giving away, by timing, how much of a guess was right. */
function sameText(a: string, b: string): boolean {
  const x = createHash("sha256").update(a).digest(), y = createHash("sha256").update(b).digest();
  return timingSafeEqual(x, y);
}

export function setupAuth(db: DB): Router {
  if (env.googleClientId) {
    passport.use(
      new GoogleStrategy(
        {
          clientID: env.googleClientId,
          clientSecret: env.googleClientSecret,
          callbackURL: `${env.appUrl}/api/auth/google/callback`,
        },
        (_accessToken, _refreshToken, profile, done) => {
          const email = profile.emails?.[0]?.value ?? "";
          // Accounts are matched by email, so a sign-in with no email, or with one
          // Google has not verified, must not be let in: every email-less sign-in
          // would land in the same account, and an unverified address could claim
          // someone else's.
          const verified = (profile as { _json?: { email_verified?: boolean } })._json?.email_verified;
          if (!email || verified === false) return done(null, false);
          const name = profile.displayName ?? "";
          const avatar = profile.photos?.[0]?.value ?? "";
          const userId = findOrCreateUser(db, {
            googleId: profile.id,
            email,
            name,
            avatar,
          });
          done(null, { id: userId } as any);
        },
      ),
    );
  }

  passport.serializeUser((user: any, done) => done(null, user.id));
  passport.deserializeUser((id: string, done) => {
    const user = db
      .prepare(
        `SELECT u.id, u.email, u.name, u.avatar_url, u.plan,
                COALESCE(up.onboarded, 0) AS onboarded, up.university_id
         FROM users u LEFT JOIN user_profiles up ON up.user_id = u.id
         WHERE u.id = ?`,
      )
      .get(id) as AuthUser | undefined;
    done(null, user ?? null);
  });

  const router = Router();

  const methods = signInMethods(env);

  // Public: which sign-in buttons the login page should show.
  router.get("/auth/config", (_req: Request, res: Response) => {
    res.json(methods);
  });

  // Dev login: any email, no password. Off in production unless allowed on purpose (see signInMethods).
  if (methods.devLogin) {
    const guard = codeGuard();
    router.post("/auth/dev-login", (req: Request, res: Response) => {
      const { email, name, code } = req.body as { email?: string; name?: string; code?: string };
      if (methods.needsCode) {
        const who = req.ip ?? "unknown";
        if (guard.blocked(who)) {
          res.status(429).json({ error: "ลองหลายครั้งเกินไป รอสักครู่แล้วลองใหม่", code: "TOO_MANY" });
          return;
        }
        if (!sameText(typeof code === "string" ? code : "", env.devLoginCode)) {
          guard.wrong(who);
          res.status(403).json({ error: "รหัสเข้าใช้ไม่ถูกต้อง", code: "BAD_CODE" });
          return;
        }
        guard.right(who);
      }
      if (!email) {
        res.status(400).json({ error: "email required" });
        return;
      }
      const userId = findOrCreateUser(db, {
        email,
        name: name ?? email.split("@")[0]!,
        avatar: "",
      });
      (req.session as any).passport = { user: userId };
      req.session.save(() => {
        const user = db
          .prepare("SELECT id, email, name, avatar_url, plan FROM users WHERE id = ?")
          .get(userId);
        res.json(user);
      });
    });
  }

  if (methods.google) {
    // Sign-ins started by the iOS app, waiting to be collected by its web view (appSignIn.ts).
    const handoffs = createHandoffs();

    // `?app=<challenge>`: the iOS app started this, in the system's sign-in sheet.
    router.get("/auth/google", (req: Request, res: Response, next: NextFunction) => {
      const app = req.query.app;
      if (app !== undefined && !isChallenge(app)) {
        res.status(400).json({ error: "คำขอเข้าสู่ระบบจากแอปไม่ถูกต้อง", code: "BAD_APP_SIGNIN" });
        return;
      }
      passport.authenticate("google", {
        scope: ["profile", "email"],
        ...(app ? { state: appState(app) } : {}),
      })(req, res, next);
    });
    // Back from Google. Anything that goes wrong (the student pressed Cancel, the
    // code expired or was reused, Google is unreachable) returns to the login
    // page with a plain message, never a bare server error.
    router.get("/auth/google/callback", (req: Request, res: Response, next: NextFunction) => {
      const challenge = challengeFromState(req.query.state);
      passport.authenticate("google", (err: unknown, user: Express.User | false) => {
        if (challenge) {
          // This browser is the sign-in sheet, not the app: it gets no session. It
          // goes back to the app with a one-time code for the app's web view.
          if (err || !user) return res.redirect(appReturnUrl(env.iosAppScheme, { error: "failed" }));
          return res.redirect(appReturnUrl(env.iosAppScheme, { code: handoffs.issue(user.id, challenge) }));
        }
        if (err || !user) return res.redirect(`${env.basePath}/?signin=failed`);
        req.logIn(user, (loginErr) => res.redirect(loginErr ? `${env.basePath}/?signin=failed` : `${env.basePath}/`));
      })(req, res, next);
    });
    // The app's web view collects its session: the code from the sign-in sheet,
    // and the verifier only this web view has.
    router.post("/auth/app/redeem", (req: Request, res: Response) => {
      const { code, verifier } = (req.body ?? {}) as { code?: unknown; verifier?: unknown };
      const userId = handoffs.redeem(code, verifier);
      if (!userId) {
        res.status(403).json({ error: "การเข้าสู่ระบบจากแอปหมดอายุหรือถูกใช้ไปแล้ว ลองใหม่อีกครั้ง", code: "BAD_HANDOFF" });
        return;
      }
      req.logIn({ id: userId } as Express.User, (loginErr) => {
        if (loginErr) {
          res.status(500).json({ error: "เข้าสู่ระบบไม่สำเร็จ", code: "SIGNIN_FAILED" });
          return;
        }
        res.json({ ok: true });
      });
    });
  } else {
    // Not configured: say so, instead of an unexplained server error.
    router.get(["/auth/google", "/auth/google/callback"], (_req: Request, res: Response) => {
      res.status(503).json({ error: "ยังไม่ได้ตั้งค่าการเข้าสู่ระบบด้วย Google", code: "GOOGLE_NOT_CONFIGURED" });
    });
  }

  router.get("/auth/me", (req: Request, res: Response) => {
    res.json(req.user ?? null);
  });

  router.post("/auth/logout", (req: Request, res: Response) => {
    req.logout(() => res.json({ ok: true }));
  });

  return router;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "กรุณาเข้าสู่ระบบ", code: "UNAUTHENTICATED" });
    return;
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.user) {
    res.status(401).json({ error: "กรุณาเข้าสู่ระบบ", code: "UNAUTHENTICATED" });
    return;
  }
  const admins = (process.env.ADMIN_EMAILS ?? "").split(",").map((e) => e.trim());
  if (!admins.includes(req.user.email)) {
    res.status(403).json({ error: "admin only" });
    return;
  }
  next();
}
