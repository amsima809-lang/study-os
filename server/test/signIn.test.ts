import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { signInMethods, codeGuard, normaliseBasePath } from "../src/env.js";
import { openDb } from "../src/db.js";
import { findOrCreateUser } from "../src/auth.js";

describe("the offline worker and the server's own addresses", () => {
  it("does not answer a visit to /api/... with the app (that swallowed \"Sign in with Google\")", () => {
    const config = readFileSync(new URL("../../client/vite.config.ts", import.meta.url), "utf8");
    const list = /navigateFallbackDenylist: \[([^\]]*)\]/.exec(config);
    expect(list).not.toBeNull();
    const patterns = list![1]!.split(",").map((p) => p.trim()).filter(Boolean).map((p) => new RegExp(p.slice(1, p.lastIndexOf("/"))));
    const denied = (path: string) => patterns.some((p) => p.test(path));
    for (const path of ["/api/auth/google", "/api/auth/google/callback?code=x&state=y", "/termtrail/api/auth/google", "/api/calendar.ics", "/api/uploads/a.pdf"]) expect(denied(path)).toBe(true);
    for (const path of ["/", "/notes/12", "/termtrail/plan", "/apiary"]) expect(denied(path)).toBe(false);
  });
});

describe("which sign-in methods a server offers", () => {
  const cfg = (nodeEnv: string, googleClientId = "", allowDevLogin = false) => ({ nodeEnv, googleClientId, allowDevLogin });

  it("offers dev login on a developer's machine when Google is not set up", () => {
    expect(signInMethods(cfg("development"))).toEqual({ google: false, devLogin: true, needsCode: false });
    expect(signInMethods(cfg("test"))).toEqual({ google: false, devLogin: true, needsCode: false });
  });

  it("does NOT offer dev login in production: it signs anyone in as any email with no password", () => {
    expect(signInMethods(cfg("production"))).toEqual({ google: false, devLogin: false, needsCode: false });
  });

  it("keeps it in production only when allowed on purpose", () => {
    expect(signInMethods(cfg("production", "", true))).toEqual({ google: false, devLogin: true, needsCode: false });
  });

  it("never offers dev login once Google sign-in is configured, whatever the switch says", () => {
    expect(signInMethods(cfg("production", "client-id", true))).toEqual({ google: true, devLogin: false, needsCode: false });
    expect(signInMethods(cfg("development", "client-id"))).toEqual({ google: true, devLogin: false, needsCode: false });
  });
});

describe("a private trial site: dev login behind an access code", () => {
  const cfg = (devLoginCode: string, googleClientId = "") => ({ nodeEnv: "production", googleClientId, allowDevLogin: true, devLoginCode });

  it("asks for the code only when one is set, and never once Google is configured", () => {
    expect(signInMethods(cfg("river-42"))).toEqual({ google: false, devLogin: true, needsCode: true });
    expect(signInMethods(cfg(""))).toEqual({ google: false, devLogin: true, needsCode: false });
    expect(signInMethods(cfg("river-42", "client-id"))).toEqual({ google: true, devLogin: false, needsCode: false });
    // the code alone does not switch the dev login on
    expect(signInMethods({ nodeEnv: "production", googleClientId: "", allowDevLogin: false, devLoginCode: "river-42" })).toEqual({ google: false, devLogin: false, needsCode: false });
  });

  it("stops a visitor guessing: after the limit of wrong codes they wait out the window", () => {
    const guard = codeGuard(3, 60_000);
    const t0 = 1_000_000;
    for (let i = 0; i < 3; i++) { expect(guard.blocked("1.2.3.4", t0)).toBe(false); guard.wrong("1.2.3.4", t0); }
    expect(guard.blocked("1.2.3.4", t0 + 59_000)).toBe(true);
    expect(guard.blocked("5.6.7.8", t0)).toBe(false); // someone else is not affected
    expect(guard.blocked("1.2.3.4", t0 + 61_000)).toBe(false); // the window has passed
  });

  it("forgets the wrong tries of someone who then gets it right", () => {
    const guard = codeGuard(3, 60_000);
    guard.wrong("1.2.3.4", 0); guard.wrong("1.2.3.4", 0); guard.right("1.2.3.4");
    guard.wrong("1.2.3.4", 0);
    expect(guard.blocked("1.2.3.4", 0)).toBe(false);
  });
});

describe("serving the app under a sub-path", () => {
  it("reads BASE_PATH as a plain path with no trailing slash", () => {
    expect(normaliseBasePath(undefined)).toBe("");
    expect(normaliseBasePath("/")).toBe("");
    expect(normaliseBasePath("termtrail")).toBe("/termtrail");
    expect(normaliseBasePath("/termtrail/")).toBe("/termtrail");
    expect(normaliseBasePath("/apps/termtrail")).toBe("/apps/termtrail");
  });

  it("refuses anything that is not a plain path", () => {
    expect(() => normaliseBasePath("/term trail")).toThrow();
    expect(() => normaliseBasePath("https://example.com/x")).toThrow();
    expect(() => normaliseBasePath("/a/../b?x=1")).toThrow();
  });
});

describe("the account behind a sign-in", () => {
  it("creates a student with their profile rows on first sign-in", () => {
    const db = openDb(":memory:");
    const id = findOrCreateUser(db, { googleId: "g-1", email: "new@student.test", name: "New", avatar: "https://img/x" });
    expect(db.prepare("SELECT email, name, google_id, plan FROM users WHERE id = ?").get(id)).toEqual({ email: "new@student.test", name: "New", google_id: "g-1", plan: "free" });
    expect(db.prepare("SELECT COUNT(*) n FROM user_profiles WHERE user_id = ?").get(id)).toEqual({ n: 1 });
  });

  it("gives a returning student the same account, by email", () => {
    const db = openDb(":memory:");
    const first = findOrCreateUser(db, { googleId: "g-1", email: "a@student.test", name: "A", avatar: "" });
    const again = findOrCreateUser(db, { googleId: "g-1", email: "a@student.test", name: "A (renamed)", avatar: "" });
    expect(again).toBe(first);
    expect(db.prepare("SELECT COUNT(*) n FROM users WHERE email = 'a@student.test'").get()).toEqual({ n: 1 });
    expect((db.prepare("SELECT name FROM users WHERE id = ?").get(first) as { name: string }).name).toBe("A (renamed)");
  });

  it("keeps a dev-login account's data when the same email later signs in with Google", () => {
    const db = openDb(":memory:");
    const dev = findOrCreateUser(db, { email: "trial@student.test", name: "Trial", avatar: "" });
    db.prepare("INSERT INTO notes (user_id, created_at, title, raw_text) VALUES (?, '2026-11-01T00:00:00', 'Kept', 'x')").run(dev);
    const google = findOrCreateUser(db, { googleId: "g-77", email: "trial@student.test", name: "Trial", avatar: "" });
    expect(google).toBe(dev);
    expect((db.prepare("SELECT google_id FROM users WHERE id = ?").get(dev) as { google_id: string }).google_id).toBe("g-77");
    expect(db.prepare("SELECT COUNT(*) n FROM notes WHERE user_id = ?").get(google)).toEqual({ n: 1 });
  });

  it("knows the same address whatever its capitals: typed with a capital at the trial login, lowercase from Google", () => {
    const db = openDb(":memory:");
    const dev = findOrCreateUser(db, { email: "Trial.Student@gmail.com", name: "Trial", avatar: "" });
    db.prepare("INSERT INTO notes (user_id, created_at, title, raw_text) VALUES (?, '2026-11-01T00:00:00', 'Kept', 'x')").run(dev);
    const google = findOrCreateUser(db, { googleId: "g-88", email: "trial.student@gmail.com", name: "Trial", avatar: "" });
    expect(google).toBe(dev);
    expect(db.prepare("SELECT COUNT(*) n FROM users WHERE lower(email) = 'trial.student@gmail.com'").get()).toEqual({ n: 1 });
    expect(db.prepare("SELECT COUNT(*) n FROM notes WHERE user_id = ?").get(google)).toEqual({ n: 1 });
  });

  it("prefers the exactly matching account when two differ only in capitals", () => {
    const db = openDb(":memory:");
    const now = "2026-11-01T00:00:00.000Z";
    for (const [id, email] of [["u-upper", "Twin@gmail.com"], ["u-lower", "twin@gmail.com"]]) {
      db.prepare("INSERT INTO users (id, email, name, referral_code, created_at, last_login_at) VALUES (?, ?, 'Twin', ?, ?, ?)").run(id, email, id, now, now);
    }
    expect(findOrCreateUser(db, { googleId: "g-1", email: "twin@gmail.com", name: "Twin", avatar: "" })).toBe("u-lower");
    expect(findOrCreateUser(db, { email: "Twin@gmail.com", name: "Twin", avatar: "" })).toBe("u-upper");
    expect(db.prepare("SELECT COUNT(*) n FROM users WHERE lower(email) = 'twin@gmail.com'").get()).toEqual({ n: 2 });
  });

  it("does not let a second Google identity take over an account already linked to one", () => {
    const db = openDb(":memory:");
    const id = findOrCreateUser(db, { googleId: "g-1", email: "a@student.test", name: "A", avatar: "" });
    findOrCreateUser(db, { googleId: "g-other", email: "a@student.test", name: "A", avatar: "" });
    expect((db.prepare("SELECT google_id FROM users WHERE id = ?").get(id) as { google_id: string }).google_id).toBe("g-1");
  });
});

