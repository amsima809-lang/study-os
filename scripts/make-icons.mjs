// Build the app icons from the logo mark.
// Run from the repo root after changing the mark or its colours:  node scripts/make-icons.mjs
// The mark is drawn by docs/brand/tools/cairn-books.cjs, which writes docs/brand/mark-cairn.svg
// (and -small.svg, the solid drawing for small sizes) and the paths the app uses.
import { createRequire } from "node:module";
import { readFileSync, writeFileSync } from "node:fs";
const require = createRequire(process.cwd() + "/server/package.json");
const sharp = require("sharp");
// The icon colours (docs/brand/): an indigo tile, white books, and amber for the top book.
const TILE = "#4f46e5", BOOKS = "#ffffff", TOP = "#fbbf24";
const mark = (file) =>
  readFileSync(`docs/brand/${file}`, "utf8")
    .replace(/^[\s\S]*?<svg[^>]*>\s*/, "").replace(/\s*<\/svg>\s*$/, "").replace(/<!--[\s\S]*?-->\s*/g, "")
    .replace(/var\(--logo-accent, currentColor\)/g, TOP).replace(/currentColor/g, BOOKS);
const FULL = mark("mark-cairn.svg"), SMALL = mark("mark-cairn-small.svg");
// `scale` = how much of the square the 64-unit mark box fills. Home-screen icons are
// cropped to circles and squircles by the system ("maskable"), so the mark stays
// inside the safe middle (within the central 80% circle) and the colour runs to the edge.
// The stack sits a little low in its box, so it is lifted 2 units to look centred.
const svg = (body, scale, radius, label = "") => {
  const box = 96 * scale, off = (96 - box) / 2, k = box / 64, f = (v) => +v.toFixed(3);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"${label ? ` role="img" aria-label="${label}"` : ""}>
  <rect width="96" height="96" rx="${radius}" fill="${TILE}"/>
  <g transform="translate(${f(off)} ${f(off - 2 * k)}) scale(${f(k)})">
${body}
  </g>
</svg>
`;
};
const png = async (file, size, body, scale, radius, dir = "client/public") => {
  let image = sharp(Buffer.from(svg(body, scale, radius)), { density: 72 * (size / 96) * 2 }).resize(size, size);
  // The iOS images carry no transparency at all (the App Store refuses an icon that has any).
  if (dir !== "client/public") image = image.flatten({ background: TILE });
  await image.png().toFile(`${dir}/${file}`);
  console.log(file, size);
};
await png("pwa-192x192.png", 192, FULL, 0.74, 0);
await png("pwa-512x512.png", 512, FULL, 0.74, 0);
await png("apple-touch-icon.png", 180, FULL, 0.78, 0);    // iOS rounds the corners itself
await png("favicon-32x32.png", 32, SMALL, 0.8, 22);        // small: solid books, filling more of the tile
// Browser tabs show this at 16 to 32 pixels, so it uses the solid drawing too.
writeFileSync("client/public/favicon.svg", svg(SMALL, 0.8, 22, "App icon"));
// For documents and stores: the full drawing on the rounded tile.
writeFileSync("docs/brand/icon-cairn.svg", svg(FULL, 0.76, 22, "App icon: a cairn of three books, the top one amber"));
console.log("favicon.svg, docs/brand/icon-cairn.svg");
// The iOS app (native/): one square icon (iOS cuts the corners itself), the launch screen (a big
// square that the phone crops to its own shape, so the mark is small and in the middle), and the
// picture on the app's own "cannot connect" page.
const IOS = "native/ios/App/App/Assets.xcassets";
await png("AppIcon-512@2x.png", 1024, FULL, 0.72, 0, `${IOS}/AppIcon.appiconset`);
for (const file of ["splash-2732x2732.png", "splash-2732x2732-1.png", "splash-2732x2732-2.png"]) await png(file, 2732, FULL, 0.16, 0, `${IOS}/Splash.imageset`);
await png("icon.png", 192, FULL, 0.74, 0, "native/www");
