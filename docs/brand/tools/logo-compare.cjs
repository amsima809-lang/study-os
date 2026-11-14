// Sheet: logo marks side by side, each as app icon, small sizes, and with the name, light and dark.
const fs = require("node:fs");
const { createRequire } = require("node:module");
const sharp = createRequire("/Users/patricktanna/Documents/Projects/study-os/server/package.json")("sharp");
const { outline } = require("./outline.cjs");
const DIR = "/Users/patricktanna/Documents/Projects/study-os/docs/brand/";
const [out, name, ...items] = process.argv.slice(2); // items: "file.svg|Label"
const inner = (file, colour, tick) => fs.readFileSync(DIR + file, "utf8").replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "").replace(/currentColor/g, colour).replace(/var\(--logo-\w+, [^)]*\)/g, tick).replace(/id="([\w-]+)"/g, (m, id) => `id="${id}-${Math.random().toString(36).slice(2, 7)}"`);
// (masks get unique ids per use so several copies can sit in one sheet)
function use(file, colour, tick, x, y, size) {
  let body = fs.readFileSync(DIR + file, "utf8").replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "").replace(/currentColor/g, colour).replace(/var\(--logo-\w+, [^)]*\)/g, tick);
  const suffix = Math.random().toString(36).slice(2, 8);
  body = body.replace(/id="([\w-]+)"/g, `id="$1-${suffix}"`).replace(/url\(#([\w-]+)\)/g, `url(#$1-${suffix})`);
  return `<g transform="translate(${x} ${y}) scale(${size / 64})">${body}</g>`;
}
(async () => {
  const word = await outline(name, 40, 700);
  const lab = async (t) => (await outline(t, 15, 600)).d;
  const ROW = 150, W = 1200;
  let body = "";
  for (let i = 0; i < items.length; i++) {
    const [file, label] = items[i].split("|"), y = i * ROW + 20;
    const icon = (x, size) => `<rect x="${x}" y="${y + (110 - size) / 2}" width="${size}" height="${size}" rx="${size * 0.23}" fill="#4f46e5"/>` + use(file, "#ffffff", "#fbbf24", x + size * 0.135, y + (110 - size) / 2 + size * 0.135, size * 0.73);
    const lock = (x, dark) => `<rect x="${x}" y="${y}" width="390" height="110" rx="16" fill="${dark ? "#12121c" : "#ffffff"}" stroke="#e4e4ee"/>` + use(file, dark ? "#c7d2fe" : "#4f46e5", dark ? "#fbbf24" : "#d97706", x + 20, y + 26, 58) + `<path transform="translate(${x + 92} ${y + 69})" fill="${dark ? "#f4f4f8" : "#16162a"}" d="${word.d}"/>`;
    body += `<path transform="translate(20 ${y + 132})" fill="#55556c" d="${await lab(label)}"/>` + icon(20, 110) + icon(148, 56) + icon(220, 32) + icon(264, 16) + lock(300, false) + lock(706, true);
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${items.length * ROW + 20}"><rect width="100%" height="100%" fill="#f6f6fb"/>${body}</svg>`;
  await sharp(Buffer.from(svg), { density: 144 }).png().toFile(out);
  console.log("ok");
})();
