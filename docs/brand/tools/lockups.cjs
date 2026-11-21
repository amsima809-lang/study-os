// Build logo-with-name files ("lockups") with the lettering converted to outlines.
// Usage: MARK_SVG=/path/to/docs/brand/mark-cairn.svg node lockups.cjs <outDir> "Latin|ไทย" ["Latin|ไทย" ...]
// (MARK_SVG may be left out when the script is run from docs/brand/tools itself.)
const fs = require("node:fs");
const path = require("node:path");
const { outline } = require("./outline.cjs");

// The mark is read from its own file, so the lockups always carry the current drawing.
const MARK_SVG = fs.readFileSync(process.env.MARK_SVG || path.join(__dirname, "../mark-cairn.svg"), "utf8")
  .replace(/^[\s\S]*?<svg[^>]*>\s*/, "").replace(/\s*<\/svg>\s*$/, "").replace(/<!--[\s\S]*?-->\s*/g, "");
const mark = (t) => MARK_SVG.replace(/var\(--logo-accent, currentColor\)/g, t.accent).replace(/currentColor/g, t.mark);
// Brand colours: the books in indigo, the top book in amber (a deeper amber on white, so it holds).
// Set BRAND=leaf for the leaf-green and lime exploration colours.
const THEMES = process.env.BRAND === "leaf"
  ? { light: { mark: "#15803d", accent: "#65a30d", text: "#16162a" }, dark: { mark: "#bbf7d0", accent: "#a3e635", text: "#f4f4f8" } }
  : { light: { mark: "#4f46e5", accent: "#d97706", text: "#16162a" }, dark: { mark: "#c7d2fe", accent: "#fbbf24", text: "#f4f4f8" } };
const MARK = 56;          // drawn size of the mark's 64-unit box
const SIZE = 40;          // lettering size
const GAP = 12, PAD = 10;
const BASELINE = 43;
const MARK_DY = -6.4;     // lifts the mark so the bottom book stands on the lettering's baseline

async function lockup(text, theme) {
  const word = await outline(text, SIZE, 700);
  if (word.missing) throw new Error(`"${text}": ${word.missing} letter(s) missing from the font`);
  const top = Math.min(0, BASELINE - word.ascent), bottom = Math.max(MARK, BASELINE + word.descent);
  const width = PAD + MARK + GAP + word.width + PAD, height = bottom - top + 2 * PAD;
  const f = (n) => Number(n.toFixed(1));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${f(width)} ${f(height)}" width="${f(width)}" height="${f(height)}" role="img" aria-label="${text}">
  <g transform="translate(${PAD} ${f(PAD - top)})">
    <g transform="translate(0 ${MARK_DY}) scale(${MARK / 64})">
${mark(THEMES[theme])}
    </g>
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
