// Text -> outlined SVG path, with real text shaping (HarfBuzz), so Thai vowels and tone marks sit where they should.
const fs = require("node:fs");
const zlib = require("node:zlib");
const path = require("node:path");

/** WOFF (v1) -> plain sfnt bytes, which HarfBuzz reads. */
function woffToSfnt(woff) {
  if (woff.toString("latin1", 0, 4) !== "wOFF") throw new Error("not a WOFF file");
  const flavor = woff.readUInt32BE(4), n = woff.readUInt16BE(12);
  const tables = [];
  for (let i = 0; i < n; i++) {
    const o = 44 + i * 20;
    const tag = woff.toString("latin1", o, o + 4), off = woff.readUInt32BE(o + 4), comp = woff.readUInt32BE(o + 8), orig = woff.readUInt32BE(o + 12), sum = woff.readUInt32BE(o + 16);
    const raw = woff.subarray(off, off + comp);
    tables.push({ tag, sum, data: comp < orig ? zlib.inflateSync(raw) : Buffer.from(raw) });
  }
  const pow = 2 ** Math.floor(Math.log2(n));
  const head = Buffer.alloc(12 + 16 * n);
  head.writeUInt32BE(flavor, 0); head.writeUInt16BE(n, 4); head.writeUInt16BE(pow * 16, 6); head.writeUInt16BE(Math.log2(pow), 8); head.writeUInt16BE(n * 16 - pow * 16, 10);
  let offset = head.length; const parts = [head];
  tables.forEach((t, i) => {
    const o = 12 + i * 16;
    head.write(t.tag, o, "latin1"); head.writeUInt32BE(t.sum, o + 4); head.writeUInt32BE(offset, o + 8); head.writeUInt32BE(t.data.length, o + 12);
    const pad = (4 - (t.data.length % 4)) % 4;
    parts.push(t.data, Buffer.alloc(pad)); offset += t.data.length + pad;
  });
  return Buffer.concat(parts);
}

const FILES = path.join(__dirname, "node_modules/@fontsource/ibm-plex-sans-thai-looped/files");
let hbPromise;
const fonts = {};
async function load(subset, weight) {
  hbPromise ??= import("harfbuzzjs");
  const hb = await hbPromise;
  const key = `${subset}-${weight}`;
  if (!fonts[key]) {
    const sfnt = woffToSfnt(fs.readFileSync(path.join(FILES, `ibm-plex-sans-thai-looped-${subset}-${weight}-normal.woff`)));
    const face = new hb.Face(new hb.Blob(sfnt), 0);
    fonts[key] = { hb, face, font: new hb.Font(face), upem: face.upem };
  }
  return fonts[key];
}

/** Shape `text` and return { d, width, ascent, descent } in pixels at `size`; the baseline is y = 0. */
async function outline(text, size, weight = 700) {
  const thai = /[฀-๿]/.test(text);
  const { hb, font, upem } = await load(thai ? "thai" : "latin", weight);
  const buf = new hb.Buffer();
  buf.addText(text);
  buf.guessSegmentProperties();
  hb.shape(font, buf);
  const k = size / upem;
  let x = 0, d = "", top = 0, bottom = 0, missing = 0;
  for (const raw of buf.getGlyphInfosAndPositions()) {
    const g = { g: raw.codepoint, ax: raw.xAdvance ?? 0, dx: raw.xOffset ?? 0, dy: raw.yOffset ?? 0 };
    if (g.g === 0) missing++;
    const glyph = font.glyphToPath(g.g);
    // Move each glyph to its place and flip y (fonts count upwards, SVG downwards).
    const ox = (x + g.dx) * k, oy = -g.dy * k;
    d += glyph.replace(/([MLQCZ])([^MLQCZ]*)/g, (_, cmd, args) => {
      if (cmd === "Z") return "Z";
      const nums = args.trim().split(/[ ,]+/).filter(Boolean).map(Number);
      const out = [];
      for (let i = 0; i < nums.length; i += 2) {
        const px = ox + nums[i] * k, py = oy - nums[i + 1] * k;
        top = Math.min(top, py); bottom = Math.max(bottom, py);
        out.push(px.toFixed(2).replace(/\.?0+$/, ""), py.toFixed(2).replace(/\.?0+$/, ""));
      }
      return cmd + out.join(" ");
    });
    x += g.ax;
  }
  return { d, width: x * k, ascent: -top, descent: bottom, missing };
}
module.exports = { outline };

if (require.main === module) {
  (async () => {
    for (const t of ["Khuenjai", "ขึ้นใจ", "ThamEng", "ทำเอง", "แม่นใจ", "จำแม่น", "นึกออก"]) {
      const o = await outline(t, 40);
      console.log(t.padEnd(10), "width", o.width.toFixed(1), "ascent", o.ascent.toFixed(1), "descent", o.descent.toFixed(1), "missing", o.missing, "path chars", o.d.length);
    }
  })();
}
