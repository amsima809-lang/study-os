// Build logo-with-name files ("lockups") with the lettering converted to outlines.
// Usage: node lockups.cjs <outDir> "Latin|ไทย" ["Latin|ไทย" ...]
const fs = require("node:fs");
const path = require("node:path");
const { outline } = require("./outline.cjs");

const LEFT = "M8 21.5c0-1.9 1.6-3.3 3.5-3 6.3 1 11.8 3.400 16.500 7.300V53c-4.700-3.700-10.300-6-16.700-6.900C9.400 45.900 8 44.300 8 42.400z";
const RIGHT = "M28 25.8 49.2 8.300c2.900-2.400 7.200 0.800 5.600 4.200L36.600 51.800c-1.500 3.200-5.600 4-8.600 1.200z";
const THEMES = { light: { mark: "#4f46e5", text: "#16162a" }, dark: { mark: "#c7d2fe", text: "#f4f4f8" } };
const MARK = 56;          // drawn size of the mark's 64-unit box
const SIZE = 40;          // lettering size
const GAP = 12, PAD = 10;
const BASELINE = 43;      // sits the lettering's body level with the middle of the mark

async function lockup(text, theme) {
  const word = await outline(text, SIZE, 700);
  if (word.missing) throw new Error(`"${text}": ${word.missing} letter(s) missing from the font`);
  const top = Math.min(0, BASELINE - word.ascent), bottom = Math.max(MARK, BASELINE + word.descent);
  const width = PAD + MARK + GAP + word.width + PAD, height = bottom - top + 2 * PAD;
  const f = (n) => Number(n.toFixed(1));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f(width)} ${f(height)}" width="${f(width)}" height="${f(height)}" role="img" aria-label="${text}">
  <g transform="translate(${PAD} ${f(PAD - top)})">
    <g transform="scale(${MARK / 64})" fill="${THEMES[theme].mark}"><path opacity=".5" d="${LEFT}"/><path d="${RIGHT}"/></g>
    <path transform="translate(${MARK + GAP} ${BASELINE})" fill="${THEMES[theme].text}" d="${word.d}"/>
  </g>
</svg>
`;
}

(async () => {
  const [outDir, ...names] = process.argv.slice(2);
  fs.mkdirSync(outDir, { recursive: true });
  for (const pair of names) {
    const [latin, thai] = pair.split("|");
    const slug = latin.toLowerCase().replace(/[^a-z0-9]+/g, "-");
    for (const theme of ["light", "dark"]) {
      fs.writeFileSync(path.join(outDir, `${slug}-${theme}.svg`), await lockup(latin, theme));
      if (thai) fs.writeFileSync(path.join(outDir, `${slug}-th-${theme}.svg`), await lockup(thai, theme));
    }
    console.log(slug, thai ? "(Latin + Thai)" : "(Latin)");
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
