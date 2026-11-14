import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), "utf8");

// The product's name lives in client/src/brand.ts. Two plain-JS files cannot import it
// and carry tagged copies; scripts/rename-app.mjs changes them together. This fails if
// someone edits one by hand and forgets the others.
describe("the product's name is the same everywhere", () => {
  const brand = read("client/src/brand.ts");
  const name = /export const APP_NAME = "([^"]*)";/.exec(brand)![1];
  const nameTh = /export const APP_NAME_TH = "([^"]*)";/.exec(brand)![1];

  it("in the notification code", () => {
    const sw = read("client/public/push-sw.js");
    expect(/const APP_NAME = "([^"]*)"; \/\/ @app-name/.exec(sw)![1]).toBe(name);
    expect(/const APP_NAME_TH = "([^"]*)"; \/\/ @app-name-th/.exec(sw)![1]).toBe(nameTh);
  });

  it("in the lecture collector", () => {
    expect(/var APP_NAME_TH = "([^"]*)"; \/\/ @app-name-th/.exec(read("client/public/collector/ru-vod.js"))![1]).toBe(nameTh);
  });

  it("and no translated string spells it out instead of using {app}", () => {
    const strings = read("client/src/i18n.tsx");
    expect(strings.includes(`"app.name": "{app}"`)).toBe(true);
    for (const literal of new Set([name, nameTh, "StudyOS"])) expect(strings.split("\n").filter((l) => /^\s+"[\w.-]+": "/.test(l) && l.includes(literal))).toEqual([]);
  });
});
