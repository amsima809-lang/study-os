import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { randomBytes } from "node:crypto";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import { readFileSync } from "node:fs";
import { createHandoffs, challengeFor, isChallenge, appState, challengeFromState, appReturnUrl } from "../src/appSignIn.js";

const newVerifier = () => randomBytes(32).toString("base64url");

describe("the handoff code that carries a Google sign-in from the sign-in sheet to the iOS app", () => {
  it("gives the user to the web view that started the sign-in", () => {
    const h = createHandoffs();
    const verifier = newVerifier();
    const code = h.issue("user-1", challengeFor(verifier));
    expect(h.redeem(code, verifier)).toBe("user-1");
  });

  it("works once", () => {
    const h = createHandoffs();
    const verifier = newVerifier();
    const code = h.issue("user-1", challengeFor(verifier));
    expect(h.redeem(code, verifier)).toBe("user-1");
    expect(h.redeem(code, verifier)).toBeNull();
  });

  it("is useless without the verifier, and a wrong guess spends it", () => {
    const h = createHandoffs();
    const verifier = newVerifier();
    const code = h.issue("user-1", challengeFor(verifier));
    expect(h.redeem(code, newVerifier())).toBeNull(); // someone who caught the code
    expect(h.redeem(code, verifier)).toBeNull(); // and now the real one is too late: press the button again
  });

  it("does not take the challenge in place of the verifier", () => {
    const h = createHandoffs();
    const verifier = newVerifier();
    const challenge = challengeFor(verifier);
    const code = h.issue("user-1", challenge);
    expect(h.redeem(code, challenge)).toBeNull();
  });

  it("expires after two minutes", () => {
    const h = createHandoffs();
    const verifier = newVerifier();
    const t0 = 1_000_000;
    const late = h.issue("user-1", challengeFor(verifier), t0);
    expect(h.redeem(late, verifier, t0 + 2 * 60 * 1000)).toBeNull();
    const inTime = h.issue("user-1", challengeFor(verifier), t0);
    expect(h.redeem(inTime, verifier, t0 + 2 * 60 * 1000 - 1)).toBe("user-1");
  });

  it("answers null, not an error, to anything that is not a code", () => {
    const h = createHandoffs();
    for (const junk of [undefined, null, 42, {}, "", "nope", "x".repeat(5000)]) expect(h.redeem(junk, newVerifier())).toBeNull();
    const code = h.issue("user-1", challengeFor(newVerifier()));
    for (const junk of [undefined, null, 42, "short", "has spaces ".repeat(6)]) {
      expect(h.redeem(code, junk)).toBeNull();
    }
  });

  it("gives every sign-in its own code, and keeps them apart", () => {
    const h = createHandoffs();
    const a = newVerifier(), b = newVerifier();
    const codeA = h.issue("user-a", challengeFor(a)), codeB = h.issue("user-b", challengeFor(b));
    expect(codeA).not.toBe(codeB);
    expect(h.redeem(codeA, b)).toBeNull();
    expect(h.redeem(codeB, b)).toBe("user-b");
  });

  it("forgets expired codes and never holds more than its limit", () => {
    const h = createHandoffs(1000, 3);
    const first = newVerifier();
    const firstCode = h.issue("user-0", challengeFor(first), 0);
    for (let i = 1; i <= 3; i++) h.issue(`user-${i}`, challengeFor(newVerifier()), 0);
    expect(h.size).toBe(3);
    expect(h.redeem(firstCode, first, 1)).toBeNull(); // the oldest made room
    h.issue("user-9", challengeFor(newVerifier()), 5000); // everything before has expired
    expect(h.size).toBe(1);
  });

  it("refuses to issue a code for something that is not a challenge", () => {
    expect(() => createHandoffs().issue("user-1", "not a challenge")).toThrow();
  });
});

describe("marking a Google sign-in as started by the app", () => {
  it("carries the challenge to Google and back in the state", () => {
    const challenge = challengeFor(newVerifier());
    expect(isChallenge(challenge)).toBe(true);
    expect(challengeFromState(appState(challenge))).toBe(challenge);
  });

  it("reads anything else as an ordinary browser sign-in", () => {
    for (const state of [undefined, "", "app.", "app.short", "web." + challengeFor(newVerifier()), ["app.x"], `app.${"a".repeat(42)}!`]) {
      expect(challengeFromState(state)).toBeNull();
    }
  });

  it("returns to the app with the code, or with the failure", () => {
    expect(appReturnUrl("com.example.app", { code: "abc_-123" })).toBe("com.example.app://signin?code=abc_-123");
    expect(appReturnUrl("com.example.app", { error: "failed" })).toBe("com.example.app://signin?error=failed");
    expect(() => appReturnUrl("https://evil.example/x?", { code: "abc" })).toThrow();
  });
});

describe("the address that returns to the app", () => {
  const read = (path: string) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

  it("uses the scheme the app listens for: its bundle identifier", () => {
    const appId = JSON.parse(read("native/capacitor.config.json")).appId as string;
    expect(/IOS_APP_SCHEME \?\? "([^"]+)"/.exec(read("server/src/env.ts"))![1]).toBe(appId);
    const inProject = [...read("native/ios/App/App.xcodeproj/project.pbxproj").matchAll(/PRODUCT_BUNDLE_IDENTIFIER = ([^;]+);/g)].map((m) => m[1]);
    expect(inProject.length).toBeGreaterThan(0);
    expect(new Set(inProject)).toEqual(new Set([appId]));
  });

  it("is opened by the app's own screen, which carries the sign-in plugin", () => {
    // What the app really shows is built in SceneDelegate, not taken from the storyboard: a
    // plain CAPBridgeViewController there left the plugin out of TestFlight build 202611151106.
    const scene = read("native/ios/App/App/SceneDelegate.swift");
    expect(scene).toContain("rootViewController = MainViewController()");
    expect(scene).not.toMatch(/rootViewController = CAPBridgeViewController\(\)/);
    expect(read("native/ios/App/App/Base.lproj/Main.storyboard")).toContain('customClass="MainViewController" customModule="App"');
    expect(read("native/ios/App/App.xcodeproj/project.pbxproj")).toContain("AppSignIn.swift in Sources");
  });
});

/**
 * The real routes, with Google itself replaced: a stand-in strategy that signs in
 * whoever arrives with `?code=good`. Everything after Google is the real code.
 */
describe("the sign-in routes, end to end", () => {
  let server: Server;
  let base = "";
  let userId = "";

  beforeAll(async () => {
    vi.resetModules();
    vi.stubEnv("GOOGLE_CLIENT_ID", "test-client");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "test-secret");
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("BASE_PATH", "");
    vi.stubEnv("IOS_APP_SCHEME", "com.example.app");
    const express = (await import("express")).default;
    const session = (await import("express-session")).default;
    const passport = (await import("passport")).default;
    const { openDb } = await import("../src/db.js");
    const { setupAuth, findOrCreateUser } = await import("../src/auth.js");

    const db = openDb(":memory:");
    userId = findOrCreateUser(db, { email: "student@example.com", name: "Student", avatar: "" });

    const app = express();
    app.use(express.json());
    app.use(session({ secret: "test", resave: false, saveUninitialized: false }));
    app.use(passport.initialize());
    app.use(passport.session());
    app.use("/api", setupAuth(db));

    class StandIn extends passport.Strategy {
      name = "google";
      authenticate(req: { query: Record<string, unknown> }, options: { state?: string }) {
        if (req.query.code === undefined) return this.redirect(`https://accounts.example/o/oauth2?state=${encodeURIComponent(options.state ?? "")}`);
        if (req.query.code === "good") return this.success({ id: userId } as Express.User);
        return this.fail();
      }
    }
    passport.use("google", new StandIn());

    server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    vi.unstubAllEnvs();
    await new Promise((resolve) => server.close(resolve));
  });

  const get = (path: string, cookie = "") => fetch(base + path, { redirect: "manual", headers: cookie ? { cookie } : {} });
  const redeem = (body: unknown, cookie = "") =>
    fetch(`${base}/api/auth/app/redeem`, { method: "POST", headers: { "content-type": "application/json", ...(cookie ? { cookie } : {}) }, body: JSON.stringify(body) });
  const cookieOf = (res: Response) => (res.headers.get("set-cookie") ?? "").split(";")[0]!;
  const me = async (cookie: string) => (await (await get("/api/auth/me", cookie)).json()) as { id: string; email: string } | null;

  it("sends the app's sign-in to Google with the challenge in the state", async () => {
    const challenge = challengeFor(newVerifier());
    const res = await get(`/api/auth/google?app=${challenge}`);
    expect(res.status).toBe(302);
    expect(new URL(res.headers.get("location")!).searchParams.get("state")).toBe(`app.${challenge}`);
  });

  it("refuses a sign-in from the app with no proper challenge", async () => {
    expect((await get("/api/auth/google?app=nope")).status).toBe(400);
    expect((await get("/api/auth/google?app=")).status).toBe(400);
  });

  it("leaves an ordinary browser sign-in as it was: a session for that browser", async () => {
    const start = await get("/api/auth/google");
    expect(new URL(start.headers.get("location")!).searchParams.get("state")).toBe("");
    const back = await get("/api/auth/google/callback?code=good");
    expect(back.status).toBe(302);
    expect(back.headers.get("location")).toBe("/");
    expect((await me(cookieOf(back)))?.id).toBe(userId);
  });

  it("signs the app's web view in, and gives the sign-in sheet no session", async () => {
    const verifier = newVerifier();
    const state = appState(challengeFor(verifier));

    // The sign-in sheet comes back from Google…
    const sheet = await get(`/api/auth/google/callback?code=good&state=${state}`);
    expect(sheet.status).toBe(302);
    const back = new URL(sheet.headers.get("location")!);
    expect(back.protocol).toBe("com.example.app:");
    expect(back.host).toBe("signin");
    expect(sheet.headers.get("set-cookie")).toBeNull(); // …with no session of its own
    const code = back.searchParams.get("code")!;
    expect(code).toMatch(/^[A-Za-z0-9_-]{43}$/);

    // …and the web view collects one.
    const done = await redeem({ code, verifier });
    expect(done.status).toBe(200);
    const user = await me(cookieOf(done));
    expect(user?.id).toBe(userId);
    expect(user?.email).toBe("student@example.com");

    // The code is spent.
    expect((await redeem({ code, verifier })).status).toBe(403);
  });

  it("gives no session to someone with the code but not the verifier", async () => {
    const verifier = newVerifier();
    const sheet = await get(`/api/auth/google/callback?code=good&state=${appState(challengeFor(verifier))}`);
    const code = new URL(sheet.headers.get("location")!).searchParams.get("code")!;
    const thief = await redeem({ code, verifier: newVerifier() });
    expect(thief.status).toBe(403);
    expect(((await thief.json()) as { code: string }).code).toBe("BAD_HANDOFF");
    expect(thief.headers.get("set-cookie")).toBeNull();
  });

  it("returns to the app with the failure when Google does not sign the student in", async () => {
    const sheet = await get(`/api/auth/google/callback?code=bad&state=${appState(challengeFor(newVerifier()))}`);
    expect(sheet.headers.get("location")).toBe("com.example.app://signin?error=failed");
    // and an ordinary browser still goes back to the login page
    expect((await get("/api/auth/google/callback?code=bad")).headers.get("location")).toBe("/?signin=failed");
  });

  it("answers junk with a plain refusal", async () => {
    for (const body of [{}, { code: "x" }, { code: 1, verifier: 2 }, { verifier: newVerifier() }]) {
      expect((await redeem(body)).status).toBe(403);
    }
  });
});
