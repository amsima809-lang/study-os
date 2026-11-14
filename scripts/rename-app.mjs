// Rename the product everywhere it is shown, in one go.
//
//   node scripts/rename-app.mjs "Khuenjai" "ขึ้นใจ"
//   node scripts/rename-app.mjs "Khuenjai"            (same name in Thai and English)
//   node scripts/rename-app.mjs --check               (print the current name, change nothing)
//
// The name lives in client/src/brand.ts. Two plain-JS files cannot import it
// and carry their own copy on lines marked "@app-name" / "@app-name-th"; this
// script keeps all of them the same. It does NOT touch: the logo
// (client/src/components/Logo.tsx and client/public icons), internal
// identifiers (localStorage keys, the "studyos-" notification tags, the
// StudyOSCollector global, server log prefixes), documentation, or the Fly app
// name. After running it: npm run build, and check docs/brand/README.md.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const FILES = ["client/src/brand.ts", "client/public/push-sw.js", "client/public/collector/ru-vod.js"];
const [first, second] = process.argv.slice(2);

const current = /export const APP_NAME = "([^"]*)";/.exec(readFileSync(root + "client/src/brand.ts", "utf8"))?.[1];
const currentTh = /export const APP_NAME_TH = "([^"]*)";/.exec(readFileSync(root + "client/src/brand.ts", "utf8"))?.[1];
if (!first || first === "--check") {
  console.log(`Current name: ${current}${currentTh !== current ? ` / ${currentTh}` : ""}`);
  process.exit(first ? 0 : 1);
}

const name = first.trim();
const nameTh = (second ?? first).trim();
for (const value of [name, nameTh]) {
  if (!value || /["\\\n]/.test(value) || value.length > 40) {
    console.error(`Not a usable name: ${JSON.stringify(value)} (no quotes or backslashes, 40 characters at most)`);
    process.exit(1);
  }
}

let changed = 0;
for (const file of FILES) {
  const before = readFileSync(root + file, "utf8");
  const after = before
    .replace(/(export const APP_NAME = )"[^"]*"/, `$1"${name}"`)
    .replace(/(export const APP_NAME_TH = )"[^"]*"/, `$1"${nameTh}"`)
    .replace(/((?:const|var) APP_NAME = )"[^"]*"(; \/\/ @app-name)$/m, `$1"${name}"$2`)
    .replace(/((?:const|var) APP_NAME_TH = )"[^"]*"(; \/\/ @app-name-th)$/m, `$1"${nameTh}"$2`);
  if (after !== before) { writeFileSync(root + file, after); changed++; }
  console.log(`${after !== before ? "updated  " : "unchanged"} ${file}`);
}
console.log(`\n${current} -> ${name}${nameTh !== name ? ` (Thai: ${nameTh})` : ""}. ${changed} file(s) changed. Now run: npm run build`);
