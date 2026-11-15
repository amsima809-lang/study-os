import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), "utf8");

// The product's name lives in client/src/brand.ts. Two plain-JS files cannot import it
// and carry tagged copies; scripts/rename-app.mjs changes them together. This fails if
// someone edits one by hand and forgets the others.
// The logo is drawn once, by docs/brand/tools/cairn-books.cjs, which writes the brand SVGs
// and the paths the app uses; scripts/make-icons.mjs builds the favicon from the SVGs.
// This fails if one of them is edited by hand, or a script was not re-run.
describe("the logo is the same drawing everywhere", () => {
  const paths = (svg: string) => [...svg.matchAll(/ d="([^"]+)"/g)].map((m) => m[1]);
  const app = read("client/src/components/logoPaths.ts");
  const full = paths(read("docs/brand/mark-cairn.svg"));
  const small = paths(read("docs/brand/mark-cairn-small.svg"));

  it("in the app", () => {
    expect(full.length).toBe(6); // three covers, three page blocks
    expect(small.length).toBe(3); // three solid books
    for (const d of [...full, ...small]) expect(app.includes(`"${d}"`)).toBe(true);
  });

  it("in the browser-tab icon and the brand's app icon", () => {
    expect(paths(read("client/public/favicon.svg"))).toEqual(small);
    expect(paths(read("docs/brand/icon-cairn.svg"))).toEqual(full);
  });

  it("and the top book is the one that takes the second colour", () => {
    expect(read("docs/brand/mark-cairn.svg").match(/--logo-accent/g)?.length).toBe(1);
    expect(app.match(/"accent": true/g)?.length).toBe(2); // once in each drawing
  });
});

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

  it("in the iOS app", () => {
    const config = JSON.parse(read("native/capacitor.config.json"));
    const page = read("native/www/index.html");
    expect(config.appName).toBe(name);
    expect(/<key>CFBundleDisplayName<\/key>\s*<string>([^<]*)<\/string>/.exec(read("native/ios/App/App/Info.plist"))![1]).toBe(name);
    expect(/var APP_NAME = "([^"]*)"; \/\/ @app-name/.exec(page)![1]).toBe(name);
    // The "cannot connect" page returns to the same site the app opens.
    expect(/var APP_URL = "([^"]*)"; \/\/ @app-url/.exec(page)![1]).toBe(config.server.url);
  });

  it("and no translated string spells it out instead of using {app}", () => {
    const strings = read("client/src/i18n.tsx");
    expect(strings.includes(`"app.name": "{app}"`)).toBe(true);
    for (const literal of new Set([name, nameTh, "StudyOS"])) expect(strings.split("\n").filter((l) => /^\s+"[\w.-]+": "/.test(l) && l.includes(literal))).toEqual([]);
  });
});
