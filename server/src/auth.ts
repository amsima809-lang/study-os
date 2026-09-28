/**
 * Phase 9: single-user auth.
 * One password (env APP_PASSWORD) -> a signed, http-only session cookie.
 * requireAuth() gates every protected API route.
 */
import { Router, type Request, type Response, type NextFunction } from "express";
import { env, isProd } from "./env.js";

const COOKIE = "auth";
const THIRTY_DAYS = 30 * 24 * 60 * 60 * 1000;

function isAuthed(req: Request): boolean {
  return req.signedCookies?.[COOKIE] === "ok";
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  if (isAuthed(req)) return next();
  res.status(401).json({ error: "กรุณาเข้าสู่ระบบ", code: "UNAUTHENTICATED" });
}

export function createAuthRouter(): Router {
  const router = Router();

  router.get("/me", (req, res) => {
    res.json({ authed: isAuthed(req) });
  });

  router.post("/login", (req, res) => {
    const password = String(req.body?.password ?? "");
    if (password.length === 0 || password !== env.appPassword) {
      return res.status(401).json({ error: "รหัสผ่านไม่ถูกต้อง" });
    }
    res.cookie(COOKIE, "ok", {
      httpOnly: true,
      signed: true,
      sameSite: "lax",
      secure: isProd,
      maxAge: THIRTY_DAYS,
    });
    res.json({ ok: true });
  });

  router.post("/logout", (_req, res) => {
    res.clearCookie(COOKIE);
    res.json({ ok: true });
  });

  return router;
}
