/**
 * Multi-user auth: Google OAuth (production) + dev login (when no Google config).
 * Ported from studyos-public, adapted for study-os's Express 5 setup.
 */
import { Router } from "express";
import type { Request, Response, NextFunction } from "express";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import type { DB } from "./db.js";
import { env } from "./env.js";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatar_url: string | null;
  plan: string;
  onboarded: number;
}

declare global {
  namespace Express {
    interface User extends AuthUser {}
  }
}

function findOrCreateUser(
  db: DB,
  profile: { googleId?: string; email: string; name: string; avatar: string },
): string {
  const existing = db
    .prepare("SELECT id FROM users WHERE email = ?")
    .get(profile.email) as { id: string } | undefined;

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
                COALESCE(up.onboarded, 0) AS onboarded
         FROM users u LEFT JOIN user_profiles up ON up.user_id = u.id
         WHERE u.id = ?`,
      )
      .get(id) as AuthUser | undefined;
    done(null, user ?? null);
  });

  const router = Router();

  // Dev login (only when Google OAuth is not configured)
  if (!env.googleClientId) {
    router.post("/auth/dev-login", (req: Request, res: Response) => {
      const { email, name } = req.body as { email?: string; name?: string };
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

  router.get(
    "/auth/google",
    passport.authenticate("google", { scope: ["profile", "email"] }),
  );
  router.get(
    "/auth/google/callback",
    passport.authenticate("google", { failureRedirect: "/login" }),
    (_req: Request, res: Response) => res.redirect("/"),
  );

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
