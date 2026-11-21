// Sheet: candidates in columns, large. Usage: node side-by-side.cjs <out.png> <Name> "file.svg|Label" ...
const fs = require("node:fs");
const { createRequire } = require("node:module");
const sharp = createRequire("/Users/patricktanna/Documents/Projects/study-os/server/package.json")("sharp");
const { outline } = require("./outline.cjs");
const DIR = "/Users/patricktanna/Documents/Projects/study-os/docs/brand/";
const [out, name, ...items] = process.argv.slice(2);
function use(file, colour, accent, x, y, size) {
  let body = fs.readFileSync(DIR + file, "utf8").replace(/^[\s\S]*?<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "").replace(/currentColor/g, colour).replace(/var\(--logo-\w+, [^)]*\)/g, accent);
  return `<g transform="translate(${x} ${y}) scale(${size / 64})">${body}</g>`;
}
(async () => {
  const word = await outline(name, 34, 700);
  const COL = 400, H = 760;
  let body = "";
  for (let i = 0; i < items.length; i++) {
    const [file, label] = items[i].split("|"), x = i * COL + 30;
    const icon = (ix, iy, size) => `<rect x="${ix}" y="${iy}" width="${size}" height="${size}" rx="${size * 0.23}" fill="#4f46e5"/>` + use(file, "#ffffff", "#fbbf24", ix + size * 0.135, iy + size * 0.12, size * 0.73);
    body += `<path transform="translate(${x} 44)" fill="#16162a" d="${(await outline(label, 19, 700)).d}"/>`;
    body += icon(x, 66, 340);
    body += `<rect x="${x}" y="426" width="165" height="165" rx="18" fill="#fff" stroke="#e4e4ee"/>` + use(file, "#4f46e5", "#d97706", x + 22, 448, 121);
    body += `<rect x="${x + 175}" y="426" width="165" height="165" rx="18" fill="#12121c"/>` + use(file, "#c7d2fe", "#fbbf24", x + 197, 448, 121);
    body += icon(x, 612, 56) + icon(x + 72, 624, 32) + icon(x + 118, 628, 24) + icon(x + 154, 632, 16);
    body += use(file, "#4f46e5", "#d97706", x, 688, 46) + `<path transform="translate(${x + 58} 724)" fill="#16162a" d="${word.d}"/>`;
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${items.length * COL + 20}" height="${H}"><rect width="100%" height="100%" fill="#f6f6fb"/>${body}</svg>`;
  await sharp(Buffer.from(svg), { density: 144 }).png().toFile(out);
  console.log("ok");
})();
