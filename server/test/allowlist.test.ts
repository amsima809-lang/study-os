/** The invite-only trial: only ALLOWED_EMAILS may use the app; others are signed out and told why. */
import { describe, it, expect } from "vitest";
import express from "express";
import type { AddressInfo } from "node:net";
import { allowedEmails, onlyInvited } from "../src/allowlist.js";

function serve(email: string | null, list: string) {
  const app = express();
  let loggedOut = false;
  app.use((req, _res, next) => {
    (req as unknown as { user?: { email: string } }).user = email ? { email } : undefined;
    (req as unknown as { logout: (cb: (e?: unknown) => void) => void }).logout = (cb) => { loggedOut = true; cb(); };
    next();
  });
  app.use("/api", onlyInvited(allowedEmails(list)));
  app.get("/api/auth/me", (_req, res) => res.json({ ok: true }));
  app.get("/api/today", (_req, res) => res.json({ ok: true }));
  app.get("/api/auth/google", (_req, res) => res.json({ signingIn: true }));
  const server = app.listen(0, "127.0.0.1");
  const url = () => `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  return { server, url, loggedOut: () => loggedOut };
}

describe("invite-only trial", () => {
  const list = "patrick@example.com, Partner@Example.com";
  it("reads the list in any case, separated by commas or spaces", () => {
    expect([...allowedEmails(" A@x.com,b@X.com  c@x.com ")]).toEqual(["a@x.com", "b@x.com", "c@x.com"]);
    expect(allowedEmails("").size).toBe(0);
  });
  it("lets invited accounts in, whatever the case of their email", async () => {
    const s = serve("partner@example.com", list);
    await new Promise((r) => s.server.once("listening", r));
    expect((await fetch(`${s.url()}/api/today`)).status).toBe(200);
    s.server.close();
  });
  it("signs out anyone else: 403 on who-am-I (the login page explains), 401 elsewhere", async () => {
    const s = serve("stranger@example.com", list);
    await new Promise((r) => s.server.once("listening", r));
    const me = await fetch(`${s.url()}/api/auth/me`);
    expect(me.status).toBe(403);
    expect(((await me.json()) as { code: string }).code).toBe("NOT_INVITED");
    expect(s.loggedOut()).toBe(true);
    expect((await fetch(`${s.url()}/api/today`)).status).toBe(401);
    expect((await fetch(`${s.url()}/api/auth/google`)).status).toBe(200); // can still switch account
    s.server.close();
  });
  it("restricts nothing when the list is empty", async () => {
    const s = serve("anyone@example.com", "");
    await new Promise((r) => s.server.once("listening", r));
    expect((await fetch(`${s.url()}/api/today`)).status).toBe(200);
    s.server.close();
  });
});
