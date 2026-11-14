import { describe, it, expect } from "vitest";
import { signInMethods } from "../src/env.js";

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
