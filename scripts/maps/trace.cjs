// Find the coloured shapes on the university's campus map (Hua Mak) and write their outlines:
// shapes.json, and overlay.jpg with each shape numbered. build.cjs then says what each number is
// and draws the app's own map. The image itself is the university's and is not kept in the repo.
const { createRequire } = require("node:module");
const fs = require("node:fs");
const sharp = createRequire(require("node:path").join(__dirname, "../../server/package.json"))("sharp");
const DIR = __dirname + "/";
// Usage: node scripts/maps/trace.cjs <the university's campus map image>   (writes shapes.json and overlay.jpg beside this file)
const IMAGE = process.argv[2];
if (!IMAGE) { console.error("usage: node scripts/maps/trace.cjs <campus map image>"); process.exit(1); }
const PALETTE = { mauve: [184, 140, 152], gray: [190, 203, 205], peach: [253, 204, 180], green: [118, 188, 86], mint: [206, 232, 204], cyan: [0, 184, 242], red: [232, 50, 40],
  cream: [250, 236, 170], maroon: [150, 48, 50], navy: [38, 66, 138], yellow: [255, 242, 0], orange: [247, 148, 30], purple: [186, 152, 200], pink: [236, 120, 172], salmon: [240, 150, 150], lavender: [226, 226, 238], khaki: [180, 185, 150] };
(async () => {
  const W = 2438;
  const { data, info } = await sharp(IMAGE).resize({ width: W }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const H = info.height, names = Object.keys(PALETTE), cls = new Int8Array(W * H).fill(-1);
  for (let p = 0; p < W * H; p++) {
    const r = data[p * 3], g = data[p * 3 + 1], b = data[p * 3 + 2];
    let best = -1, bd = 46 * 46;
    for (let k = 0; k < names.length; k++) { const c = PALETTE[names[k]]; const d = (r - c[0]) ** 2 + (g - c[1]) ** 2 + (b - c[2]) ** 2; if (d < bd) { bd = d; best = k; } }
    cls[p] = best;
  }
  // connected components per colour class (4-neighbour)
  const label = new Int32Array(W * H).fill(0); const comps = []; const stack = [];
  for (let p0 = 0; p0 < W * H; p0++) {
    if (cls[p0] < 0 || label[p0]) continue;
    const id = comps.length + 1, k = cls[p0]; let area = 0, sx = 0, sy = 0, x0 = W, x1 = 0, y0 = H, y1 = 0;
    stack.push(p0); label[p0] = id;
    while (stack.length) { const p = stack.pop(); const x = p % W, y = (p - x) / W; area++; sx += x; sy += y; if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (const q of [p - 1, p + 1, p - W, p + W]) { if (q < 0 || q >= W * H) continue; if ((q === p - 1 && x === 0) || (q === p + 1 && x === W - 1)) continue; if (!label[q] && cls[q] === k) { label[q] = id; stack.push(q); } } }
    comps.push({ id, colour: names[k], area, cx: sx / area, cy: sy / area, x0, x1, y0, y1 });
  }
  const big = comps.filter((c) => c.area > 700 && c.y0 > H * 0.2 && c.y1 < H * 0.955 && c.x0 > W * 0.05 && c.x1 < W * 0.955);
  console.log("largest:", big.filter((c) => c.area > 60000).map((c) => `#${big.indexOf(c) + 1} ${c.colour} ${c.area}`).join(", "));
  // outer boundary of a component by Moore tracing on its mask, then simplify
  // Lettering printed on a building leaves notches and holes in its shape. "Closing" the shape
  // (grow it by R pixels, then shrink it by R) fills them without moving the real edges.
  const R = 7;
  const closed = (c) => {
    const x0 = c.x0 - R - 1, y0 = c.y0 - R - 1, w = c.x1 - c.x0 + 2 * R + 3, h = c.y1 - c.y0 + 2 * R + 3;
    let m = new Uint8Array(w * h);
    for (let y = c.y0; y <= c.y1; y++) for (let x = c.x0; x <= c.x1; x++) if (label[y * W + x] === c.id) m[(y - y0) * w + (x - x0)] = 1;
    const pass = (src, grow, horizontal) => { const out = new Uint8Array(w * h);
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { let v = grow ? 0 : 1;
        for (let d = -R; d <= R; d++) { const xx = horizontal ? x + d : x, yy = horizontal ? y : y + d; const s = xx < 0 || yy < 0 || xx >= w || yy >= h ? 0 : src[yy * w + xx]; if (grow ? s : !s) { v = grow ? 1 : 0; break; } }
        out[y * w + x] = v; }
      return out; };
    m = pass(pass(m, true, true), true, false); m = pass(pass(m, false, true), false, false);
    return { m, x0, y0, w, h };
  };
  const trace = (c) => {
    const k = c.area < 200000 ? closed(c) : null; // (not the huge road and ground shapes: too slow, and they carry no lettering that matters)
    const inside = k ? (x, y) => x >= k.x0 && y >= k.y0 && x < k.x0 + k.w && y < k.y0 + k.h && k.m[(y - k.y0) * k.w + (x - k.x0)] === 1
                     : (x, y) => x >= 0 && y >= 0 && x < W && y < H && label[y * W + x] === c.id;
    if (k) { c = { ...c, x0: k.x0, y0: k.y0, x1: k.x0 + k.w - 1, y1: k.y0 + k.h - 1 }; }
    let sx = -1, sy = -1; outer: for (let y = c.y0; y <= c.y1; y++) for (let x = c.x0; x <= c.x1; x++) if (inside(x, y)) { sx = x; sy = y; break outer; }
    const dirs = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];
    const pts = []; let x = sx, y = sy, dir = 0, guard = 0;
    do { pts.push([x, y]); let found = false;
      for (let i = 0; i < 8; i++) { const d = (dir + 6 + i) % 8; const nx = x + dirs[d][0], ny = y + dirs[d][1]; if (inside(nx, ny)) { x = nx; y = ny; dir = d; found = true; break; } }
      if (!found) break; } while ((x !== sx || y !== sy) && ++guard < 200000);
    return pts;
  };
  const simplify = (pts, eps) => { // Douglas-Peucker on a closed ring
    if (pts.length < 4) return pts;
    const dp = (a, b) => { let md = 0, mi = -1; const [x1, y1] = pts[a], [x2, y2] = pts[b]; const L = Math.hypot(x2 - x1, y2 - y1) || 1;
      for (let i = a + 1; i < b; i++) { const d = Math.abs((y2 - y1) * pts[i][0] - (x2 - x1) * pts[i][1] + x2 * y1 - y2 * x1) / L; if (d > md) { md = d; mi = i; } }
      return md > eps ? [...dp(a, mi), ...dp(mi, b).slice(1)] : [pts[a], pts[b]]; };
    let far = 0, fd = 0; for (let i = 1; i < pts.length; i++) { const d = Math.hypot(pts[i][0] - pts[0][0], pts[i][1] - pts[0][1]); if (d > fd) { fd = d; far = i; } }
    return [...dp(0, far), ...dp(far, pts.length - 1).slice(1)];
  };
  const shapes = big.map((c, n) => ({ n: n + 1, colour: c.colour, area: c.area, cx: Math.round(c.cx), cy: Math.round(c.cy), box: [c.x0, c.y0, c.x1, c.y1], pts: simplify(trace(c), 2.6) }));
  fs.writeFileSync(DIR + "shapes.json", JSON.stringify({ W, H, shapes }));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}"><rect width="100%" height="100%" fill="#fff"/>` +
    shapes.map((s) => `<polygon points="${s.pts.map((p) => p.join(",")).join(" ")}" fill="rgb(${PALETTE[s.colour].join(",")})" stroke="#222" stroke-width="1.5"/>`).join("") +
    shapes.map((s) => `<text x="${s.cx}" y="${s.cy + 7}" font-size="22" font-family="Helvetica" font-weight="700" text-anchor="middle" fill="#000" stroke="#fff" stroke-width="4" paint-order="stroke">${s.n}</text>`).join("") + `</svg>`;
  await sharp(Buffer.from(svg)).extract({ left: Math.round(W * 0.1), top: Math.round(H * 0.22), width: Math.round(W * 0.76), height: Math.round(H * 0.72) }).jpeg({ quality: 80 }).toFile(DIR + "overlay.jpg");
  console.log("components", comps.length, "kept", shapes.length, "by colour", JSON.stringify(shapes.reduce((m, s) => (m[s.colour] = (m[s.colour] || 0) + 1, m), {})));
})();
