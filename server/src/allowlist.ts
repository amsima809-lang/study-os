/**
 * Invite-only trial (owner 2026-11-16: "lock down the webapp to just these emails").
 * ALLOWED_EMAILS on the server (comma- or space-separated, any case) lists the accounts that may
 * use the app. A signed-in account not on it is signed out on its next request and told it is not
 * invited; Google's own sign-in steps still pass, so someone can switch to an invited account.
 * With ALLOWED_EMAILS empty or unset, nothing is restricted (local copies, tests).
 * The list lives only in the server's environment, never in the repo.
 */
import type { RequestHandler } from "express";

export function allowedEmails(raw = process.env.ALLOWED_EMAILS ?? ""): Set<string> {
  return new Set(raw.split(/[\s,;]+/).map((e) => e.trim().toLowerCase()).filter(Boolean));
}

export function onlyInvited(list: Set<string> = allowedEmails()): RequestHandler {
  return (req, res, next) => {
    if (!list.size || !req.user) return next();
    const email = String((req.user as { email?: string }).email ?? "").trim().toLowerCase();
    if (list.has(email)) return next();
    // Signing in (or out) must still work, to change to an invited account.
    if (req.path.startsWith("/auth/google") || req.path.startsWith("/auth/app") || req.path === "/auth/logout" || req.path === "/auth/config") return next();
    const refuse = () => res.status(req.path === "/auth/me" ? 403 : 401)
      .json({ code: "NOT_INVITED", error: "บัญชีนี้ยังไม่ได้รับเชิญให้ใช้ช่วงทดลอง" });
    req.logout((err) => {
      if (err || !req.session) return refuse();
      req.session.destroy(() => refuse());
    });
  };
}
