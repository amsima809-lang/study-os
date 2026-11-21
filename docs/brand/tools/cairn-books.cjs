// Draws the logo mark: a cairn (the stacked stones that mark a trail and the top of a
// climb) built from books. Each book lies flat and is seen from its edge: a cover wrapped
// round a page block, with a rounded spine on one side.
// Run:  node docs/brand/tools/cairn-books.cjs   (rewrites ../mark-cairn*.svg and ../sketches/mark-cairn-*.svg)
// It also rewrites client/src/components/logoPaths.ts, which the app draws the logo from.
// Then run:  node scripts/make-icons.mjs   (favicon and PNG icons)
const fs = require("node:fs");
const path = require("node:path");
const DIR = path.join(__dirname, "..");
const n = (v) => +v.toFixed(2);
const ACCENT = "var(--logo-accent, currentColor)";

/** One book's outlines. `notch` > 0 draws it solid, with the covers overhanging a recessed page block. */
function shape({ x, y, w, h, spine = "left", fill = "currentColor", rot = 0, t = 3.9, R = 4.4, pages = 0.5, inset = 3, notch = 0, op = 1 }) {
  const c = t / 2, s = notch ? w - notch : t + 0.6, ri = notch ? 0.9 : 1.2;
  // d = +1: spine on the left. d = -1: the same book mirrored, spine on the right.
  const d = spine === "left" ? 1 : -1, sw = d === 1 ? 1 : 0, X = (u) => n(d === 1 ? x + u : x + w - u);
  const cover = [
    `M${X(R)} ${n(y)}`, `H${X(w - c)}`, `a${c} ${c} 0 0 ${sw} 0 ${t}`,
    `H${X(s + ri)}`, `a${ri} ${ri} 0 0 ${1 - sw} ${n(-d * ri)} ${ri}`, `V${n(y + h - t - ri)}`, `a${ri} ${ri} 0 0 ${1 - sw} ${n(d * ri)} ${ri}`,
    `H${X(w - c)}`, `a${c} ${c} 0 0 ${sw} 0 ${t}`, `H${X(R)}`,
    `a${R} ${R} 0 0 ${sw} ${n(-d * R)} ${-R}`, `V${n(y + R)}`, `a${R} ${R} 0 0 ${sw} ${n(d * R)} ${-R}`, "z",
  ].join("");
  const pw = w - s - inset, ph = h - 2 * t;
  const page = `M${X(s)} ${n(y + t)}h${n(d * (pw - 1))}a1 1 0 0 ${sw} ${d} 1v${n(ph - 2)}a1 1 0 0 ${sw} ${-d} 1h${n(-d * (pw - 1))}z`;
  return { cover, pages: notch || !pages ? "" : page, pagesOpacity: pages, fill, op, rotate: rot ? `rotate(${rot} ${n(x + w / 2)} ${n(y + h / 2)})` : "" };
}
function book(b) {
  const k = shape(b);
  const attrs = (k.rotate ? ` transform="${k.rotate}"` : "") + (k.op < 1 ? ` opacity="${k.op}"` : "");
  const pagePath = k.pages ? `<path class="pages" fill="currentColor" opacity="${k.pagesOpacity}" d="${k.pages}"/>` : "";
  return `  <g${attrs}><path fill="${k.fill}" d="${k.cover}"/>${pagePath}</g>`;
}

// The stack: three books, spines on alternate sides, each a little off-centre and off-level
// the way stones sit in a cairn. The small top book takes the accent colour.
// The top book is much the smallest, so the stack rises to a peak.
const stack = (o = {}, top = {}, mid = {}) => [
  { x: 6, y: 43, w: 52, h: 13.5, spine: "left", ...o },
  { x: 14, y: 27.7, w: 37, h: 13.2, spine: "right", rot: -2, ...o, ...mid },
  { x: 22, y: 13.2, w: 20, h: 12.2, spine: "left", rot: 3.5, fill: ACCENT, ...o, ...top },
];
const lean = (o = {}) => [
  { x: 6, y: 43, w: 52, h: 13.5, spine: "right", ...o },
  { x: 9, y: 27.9, w: 40, h: 13.2, spine: "left", rot: 2, ...o },
  { x: 23, y: 11.6, w: 27, h: 13, spine: "right", rot: -9, fill: ACCENT, ...o },
];
const solid = { notch: 3.4 };
const WIDE_MID = { x: 15, w: 40, rot: -2.5 };   // the middle book before the stack was tapered
const tones = (books) => books.map((b, i) => (i === 1 ? { ...b, op: 0.62 } : b));

const marks = {
  // The logo.
  "mark-cairn.svg": ["a cairn built from three books lying flat, the top one in the accent colour", stack()],
  // The same stack without the page lines, for sizes under 24 pixels (browser tabs).
  "mark-cairn-small.svg": ["a cairn built from three books, drawn solid for small sizes", stack(solid)],
  // Explored and not chosen.
  "sketches/mark-cairn-wide-top.svg": ["first version: a wider top book", stack({}, { x: 13, y: 12.4, w: 30, h: 13, rot: 4 }, WIDE_MID)],
  "sketches/mark-cairn-top-21.svg": ["top book 21 wide, off-centre", stack({}, { x: 21, y: 13.4, w: 21, h: 12, rot: 4 }, WIDE_MID)],
  "sketches/mark-cairn-top-18.svg": ["top book 18 wide, off-centre", stack({}, { x: 23, y: 13.9, w: 18, h: 11.5, rot: 5 }, WIDE_MID)],
  "sketches/mark-cairn-thin.svg": ["first draft: thinner covers", stack({ t: 2.8, R: 3.6, pages: 0.45, inset: 2.2 }, { x: 13, y: 12.4, w: 30, h: 13, rot: 4 }, WIDE_MID)],
  "sketches/mark-cairn-solid-tones.svg": ["solid books in three tones", tones(stack(solid))],
  "sketches/mark-cairn-solid-lean.svg": ["solid books, the top one balanced at a tilt", tones(lean(solid))],
  "sketches/mark-cairn-soft.svg": ["the page block shown tone on tone", stack({ pages: 0.72 })],
};
for (const [file, [label, books]] of Object.entries(marks)) {
  fs.writeFileSync(path.join(DIR, file), `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64" role="img" aria-label="Logo mark: ${label}">\n  <!-- A cairn marks the way on a trail and the top of the climb; here the stones are books -->\n${books.map(book).join("\n")}\n</svg>\n`);
  console.log(file);
}

// The app draws the mark from these (client/src/components/Logo.tsx).
const forApp = (books) => books.map(shape).map((k) => ({ cover: k.cover, ...(k.pages ? { pages: k.pages } : {}), ...(k.rotate ? { rotate: k.rotate } : {}), ...(k.fill === ACCENT ? { accent: true } : {}) }));
const ts = `// GENERATED by docs/brand/tools/cairn-books.cjs. Do not edit by hand: change the drawing there and run it.
// The logo mark: a cairn of three books (docs/brand/mark-cairn.svg), bottom book first.
export type LogoBook = { cover: string; pages?: string; rotate?: string; accent?: boolean };

/** How strongly the page blocks show against the covers. */
export const LOGO_PAGES_OPACITY = ${shape(stack()[0]).pagesOpacity};

export const LOGO_BOOKS: LogoBook[] = ${JSON.stringify(forApp(stack()), null, 2)};

/** The same stack drawn solid, for sizes under 24 pixels (docs/brand/mark-cairn-small.svg). */
export const LOGO_BOOKS_SMALL: LogoBook[] = ${JSON.stringify(forApp(stack(solid)), null, 2)};
`;
fs.writeFileSync(path.join(DIR, "../../client/src/components/logoPaths.ts"), ts);
console.log("client/src/components/logoPaths.ts");
