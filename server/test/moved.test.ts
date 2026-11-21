import { describe, it, expect } from "vitest";
import { parseOldAddresses, movedTo } from "../src/moved.js";

describe("a site that has moved sends its old addresses on to the new one", () => {
  const old = parseOldAddresses("https://amsima.com/termtrail, https://www.termtrail.com");
  const to = (host: string | undefined, url: string) => movedTo(old, "https://termtrail.com", host, url);

  it("reads the list of old addresses", () => {
    expect(old).toEqual([{ host: "amsima.com", path: "/termtrail" }, { host: "www.termtrail.com", path: "" }]);
    expect(parseOldAddresses(undefined)).toEqual([]);
    expect(parseOldAddresses(" , ")).toEqual([]);
    expect(parseOldAddresses("https://Example.COM/App/")).toEqual([{ host: "example.com", path: "/App" }]);
    expect(() => parseOldAddresses("termtrail")).toThrow();
    expect(() => parseOldAddresses("ftp://example.com")).toThrow();
  });

  it("keeps the page and the query, and drops the old sub-path", () => {
    expect(to("amsima.com", "/termtrail")).toBe("https://termtrail.com/");
    expect(to("amsima.com", "/termtrail/")).toBe("https://termtrail.com/");
    expect(to("amsima.com", "/termtrail/notes/12?tab=cards")).toBe("https://termtrail.com/notes/12?tab=cards");
    expect(to("amsima.com", "/termtrail/api/health")).toBe("https://termtrail.com/api/health");
    expect(to("amsima.com", "/termtrail?signin=failed")).toBe("https://termtrail.com/?signin=failed");
  });

  it("sends a whole old site on, page for page", () => {
    expect(to("www.termtrail.com", "/")).toBe("https://termtrail.com/");
    expect(to("WWW.Termtrail.com:443", "/plan?x=1")).toBe("https://termtrail.com/plan?x=1");
  });

  it("leaves the new address, and anything else on the old host, alone", () => {
    expect(to("termtrail.com", "/")).toBeNull();
    expect(to("termtrail.com", "/termtrail/notes")).toBeNull();
    expect(to("amsima.com", "/")).toBeNull();
    expect(to("amsima.com", "/termtrailx")).toBeNull();
    expect(to("amsima.com", "/instyle-cms-demo/termtrail")).toBeNull();
    expect(to(undefined, "/termtrail")).toBeNull();
    expect(movedTo([], "https://termtrail.com", "amsima.com", "/termtrail")).toBeNull();
  });

  it("never sends a browser round in circles", () => {
    // The new address listed as an old one by mistake.
    expect(movedTo(parseOldAddresses("https://termtrail.com"), "https://termtrail.com", "termtrail.com", "/notes")).toBeNull();
    // Moving deeper on the same host: the new address is inside the old one.
    expect(movedTo(parseOldAddresses("https://example.com/app"), "https://example.com/app/v2", "example.com", "/app/v2/x")).toBeNull();
    // Moving to the top of the same host is a real move, and ends there.
    const up = parseOldAddresses("https://example.com/app");
    expect(movedTo(up, "https://example.com", "example.com", "/app/x")).toBe("https://example.com/x");
    expect(movedTo(up, "https://example.com", "example.com", "/x")).toBeNull();
  });

  it("does not let the page part point somewhere else", () => {
    expect(to("amsima.com", "/termtrail//evil.example/x")).toBe("https://termtrail.com//evil.example/x");
    expect(new URL(to("amsima.com", "/termtrail//evil.example/x")!).hostname).toBe("termtrail.com");
    expect(new URL(to("www.termtrail.com", "//evil.example")!).hostname).toBe("termtrail.com");
  });
});
