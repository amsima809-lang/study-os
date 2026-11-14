// Build the PNG app icons from the logo mark.
// Run from the repo root after changing the mark or its colours:  node scripts/make-icons.mjs
// (favicon.svg is a copy of docs/brand/icon-book-warm.svg; the mark itself is client/src/components/Logo.tsx.)
import { createRequire } from "node:module";
const require = createRequire(process.cwd() + "/server/package.json");
const sharp = require("sharp");
// The icon colours (docs/brand/): indigo, and amber for the lifted page.
const TILE = "#4f46e5", PAGE = "#fbbf24";
const LEFT = "M8 21.5c0-1.9 1.6-3.3 3.5-3 6.3 1 11.8 3.4 16.5 7.3V53c-4.7-3.7-10.3-6-16.7-6.900C9.400 45.900 8 44.300 8 42.400z";
const RIGHT = "M28 25.8 49.2 8.300c2.900-2.400 7.200 0.800 5.600 4.200L36.600 51.800c-1.500 3.200-5.600 4-8.600 1.200z";
// `scale` = how much of the square the 64-unit mark box fills. Home-screen icons are
// cropped to circles and squircles by the system ("maskable"), so the mark stays
// inside the safe middle (within the central 80% circle) and the colour runs to the edge.
const svg = (scale, radius) => {
  const box = 96 * scale, off = (96 - box) / 2, k = box / 64;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><rect width="96" height="96" rx="${radius}" fill="${TILE}"/>
  <g transform="translate(${off + 1} ${off + 1}) scale(${k})"><path fill="#fff" opacity=".9" d="${LEFT}"/><path fill="${PAGE}" d="${RIGHT}"/></g></svg>`;
};
const out = async (file, size, scale, radius) => {
  await sharp(Buffer.from(svg(scale, radius)), { density: 72 * (size / 96) * 2 }).resize(size, size).png().toFile(`client/public/${file}`);
  console.log(file, size);
};
await out("pwa-192x192.png", 192, 0.74, 0);
await out("pwa-512x512.png", 512, 0.74, 0);
await out("apple-touch-icon.png", 180, 0.78, 0);   // iOS rounds the corners itself
await out("favicon-32x32.png", 32, 0.76, 22);       // small, so the mark fills more of it
