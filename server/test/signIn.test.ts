import { describe, it, expect } from "vitest";
import { signInMethods } from "../src/env.js";
import { openDb } from "../src/db.js";
import { findOrCreateUser } from "../src/auth.js";

describe("which sign-in methods a server offers", () => {
  const cfg = (nodeEnv: string, googleClientId = "", allowDevLogin = false) => ({ nodeEnv, googleClientId, allowDevLogin });

  it("offers dev login on a developer's machine when Google is not set up", () => {
    expect(signInMethods(cfg("development"))).toEqual({ google: false, devLogin: true });
    expect(signInMethods(cfg("test"))).toEqual({ google: false, devLogin: true });
  });

  it("does NOT offer dev login in production: it signs anyone in as any email with no password", () => {
    expect(signInMethods(cfg("production"))).toEqual({ google: false, devLogin: false });
  });

  it("keeps it in production only when allowed on purpose", () => {
    expect(signInMethods(cfg("production", "", true))).toEqual({ google: false, devLogin: true });
  });

  it("never offers dev login once Google sign-in is configured, whatever the switch says", () => {
    expect(signInMethods(cfg("production", "client-id", true))).toEqual({ google: true, devLogin: false });
    expect(signInMethods(cfg("development", "client-id"))).toEqual({ google: true, devLogin: false });
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

  it("does not let a second Google identity take over an account already linked to one", () => {
    const db = openDb(":memory:");
    const id = findOrCreateUser(db, { googleId: "g-1", email: "a@student.test", name: "A", avatar: "" });
    findOrCreateUser(db, { googleId: "g-other", email: "a@student.test", name: "A", avatar: "" });
    expect((db.prepare("SELECT google_id FROM users WHERE id = ?").get(id) as { google_id: string }).google_id).toBe("g-1");
  });
});

