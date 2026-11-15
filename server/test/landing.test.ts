import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";

const root = new URL("../../", import.meta.url);
const read = (path: string) => readFileSync(new URL(path, root), "utf8");

describe("the front page's screenshots", () => {
  const strings = read("client/src/i18n.tsx");

  it("are there in Thai and in English, the same set", () => {
    const th = readdirSync(new URL("client/public/landing/th/", root)).sort();
    const en = readdirSync(new URL("client/public/landing/en/", root)).sort();
    expect(th.length).toBeGreaterThan(0);
    expect(en).toEqual(th);
  });

  it("each have a description for screen readers, in both languages", () => {
    for (const file of readdirSync(new URL("client/public/landing/en/", root))) {
      const key = `"land.shot.${file.replace(/\.webp$/, "")}"`;
      expect(strings.split(key).length - 1, key).toBe(2);
    }
  });

  it("include every screen the page shows", () => {
    const shown = [...read("client/src/components/Landing.tsx").matchAll(/shot: "([a-z]+)"/g), ...read("client/src/screens/Login.tsx").matchAll(/shot="([a-z]+)"/g)].map((m) => m[1]);
    expect(shown.length).toBeGreaterThan(0);
    const files = new Set(readdirSync(new URL("client/public/landing/en/", root)).map((f) => f.replace(/\.webp$/, "")));
    for (const shot of shown) expect(files.has(shot), shot).toBe(true);
  });
});
