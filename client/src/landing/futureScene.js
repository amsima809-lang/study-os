// Termtrail landing, first screen: "the city of tomorrow" around the mountain.
// drawScene(a) -> { sky, far, mid, near, top, css }  (pure: no DOM access, deterministic, every class/id/keyframe is fv-*).
// Layers, back to front: sky -> hazy ridge -> far -> summit ridge -> mid -> nearest ridge -> near -> trail -> top.
// Notes for the port:
//  - two of the page's ridge fills are repeated here (RIDGE1, RIDGE2) to hide things inside the mountain / under the trailhead knoll;
//  - the summit is taken to be at grid x 720 (as in the mountain grid); its flanks are read from a.ridgeY;
//  - one <clipPath> (a plain rectangle) hides the spare rocket inside its pad tower; no filters, no <text>, CSS keyframes only
//    (transform + opacity), and a prefers-reduced-motion block that freezes everything on a complete frame;
//  - within each layer the static art is emitted first and the animated bits after it, and animated paths are kept small
//    (per-building window twinkles and roof glints, capped per row; small star swirls): this keeps the compositor-layer
//    count and memory low;
//  - the moon is oversized and is placed from a.column: its disc never enters the column box grown by 14 px, nor the
//    corner buttons' box (x > W-120, y < 70); its glow is a user-space gradient kept under 0.08 opacity inside those zones.
//    Four layouts (see THE MOON): a full disc in the left gutter (cut by the left edge, larger and lit from the right,
//    where the gutter is narrow), a limb in the top-left corner (portrait tablets), a moonrise behind the skyline left of
//    the summit (phones), or the wide limb of a very large disc over the top edge (short phones);
//  - the rocket flies TO the moon in every layout and never noses down: on phones with the low moon it is a short lift and
//    a receding fly-away to the base on the top of the limb (heading clamped under 80 degrees); there is no trajectory line;
//  - the stars swirl: 2 (phone) to 3 small groups turn about their own centres, pivoted exactly like the turbine rotors
//    (fill-box + an invisible centring circle; every point and control point stays inside that circle); each group's box
//    is at most a quarter of the width (a third on phones);
//  - on the trail: the girl (the page's protagonist), her robot pup and the hover-bot (a levitating cairn of three cream
//    pebbles: coral cheeks, plain cream hands, lavender antenna stalk with an amber ball). The pup and the hover-bot are the
//    same two individuals as among the trail friends: keep both files to one spec.
export function drawScene(a) {
  const W = a.W, H = a.H, P = !!a.phone, s = a.s;
  const f = (n) => String(Math.round(n * 10) / 10);
  const kx = a.place(721, 0).x - a.place(720, 0).x;
  const gxOf = (px) => 720 + (px - a.peak.x) / kx;
  const pxOf = (gx) => a.place(gx, 0).x;
  const yOf = (gy) => a.place(0, gy).y;
  const rY = (i, px) => yOf(a.ridgeY(i, gxOf(px)));
  const rYlow = (i, x0, x1) => { let m = -1e9; for (let k = 0; k <= 4; k++) m = Math.max(m, rY(i, x0 + (x1 - x0) * k / 4)); return m; };
  const rng = (seed) => () => { seed = (seed + 0x6D2B79F5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  // palette
  const AMB = "#fbbf24", LAV = "#c4bbff", PERI = "#a5a0f0", SHADE = "#7d76d6", INK = "#1c1b33", CY = "#a5f3fc", CY2 = "#67e8f9", CORAL = "#f9a8d4", CREAM = "#ede9fe", WARM = "#fde68a";
  const lav = (o) => `rgba(196,187,255,${o})`;
  // NOTE for the port: the page's own ridge fills, needed to hide things "inside" the mountain / foothill.
  const RIDGE1 = "#3a3577", RIDGE2 = "#24243e";

  // ---------- page geometry ----------
  const col = a.column, mock = a.mock, colB = col.y + col.h;
  const bandL = pxOf(a.trailBand[0]), bandR = pxOf(a.trailBand[1]);
  const Lz = P ? 24 : col.x;                                         // free sky: 0..Lz
  const RzX = P ? W - 24 : (mock ? mock.x + mock.w : col.x + col.w); // free sky: RzX..W
  const Rw = W - RzX;
  const freeTop = H * 0.34;
  const tight = P || Lz < 110 || Rw < 110;                           // no usable sky beside the content: keep the city under it
  const capY = Math.max(colB, mock ? mock.y + mock.h : 0) + 8;
  const ceilAt = (x) => {
    if (tight) return capY;
    if (x > col.x - 14 && x < col.x + col.w + 14) return colB + 12;
    if (mock && x >= col.x + col.w + 14 && x < mock.x + mock.w + 14) return Math.max(colB, mock.y + mock.h) + 12;
    return freeTop;
  };
  const uM = s * (P ? 1.5 : 1.64);                         // px per detail unit, city
  const uN = P ? s * 1.9 : Math.max(Math.min(s * 2.45, kx * 1.25), Math.min(1.25, kx * 1.25)); // px per local unit, foreground figures (floor: people stay >= 60 px on laptops)
  const kc = uN * 0.8;                                     // boulevard cars
  const kp = uM * 1.25;                                    // glide-way pods
  // the moon rocket and its pad: big -- but where it must climb a narrow gutter beside the column, its body has to fit in it
  const kr = tight ? clamp(kp * 1.7, 1.5, Math.max(1.5, (Lz - 2) / 14.4)) : Math.max(kp * 1.7, 1.5);
  const yG = yOf(205);
  const yT = yOf(136);                                     // glide-way rail height
  const gTop = tight ? capY : freeTop;

  const css = [];
  let sky = "", far = "", mid = "", near = "", top = "";
  // Paint order inside each layer: the big static art first, the animated bits after it. A browser gives every
  // animated element its own compositor layer and must start a new one for whatever static art is painted above it,
  // so interleaving the two multiplies full-size layers (and, on big / high-density screens, drops paint).
  // mid = city (static) -> back-row twinkle -> needles + front row (static) -> front-row twinkle -> masts, rail (static)
  //       -> glide pods -> tunnel cover, gantry, pad tower (small static) -> rotors, beads, the rocket.
  let skyA = "", farA = "", midA0 = "", midS1 = "", midA1 = "", midS2 = "", midA2 = "", midS3 = "", midA3 = "", nearRoad = "", nearCars = "";

  // ====================================================================
  // THE MOON: oversized -- and never behind the page's text
  // ====================================================================
  // No-moon zones: the content column grown by 14 px on every side, and the corner buttons (x > W-120, y < 70).
  // The disc may be cut by the screen's edges, or rise from behind the skyline. Four layouts:
  //  gutter: there is free sky left of the column -> a full disc in it. Where the gutter is too narrow for the whole
  //          disc the left edge cuts it: the disc is then larger (a tall limb) and lit from the right, so that its
  //          bright side is the one on screen;
  //  corner: portrait tablets (a tall sky above the content) -> the lower limb of a huge disc hangs from the top-left corner;
  //  low:    phones -> a giant moon rising behind the skyline left of the summit, its top edge below the column;
  //  cap:    short phones (no sky is left below the column) -> the wide limb of a very large disc over the top edge.
  const zL = col.x - 14, zT = col.y - 14, zR = col.x + col.w + 14, zB = colB + 14;
  // launch pad: half-width of its deck in rocket units (the gantry needs the extra room); rk0y: where the rocket stands (its centre)
  const padW = tight ? 13 : 16;
  const padX = tight ? Math.max(bandL * 0.25, (padW + 3) * kr + 1) : Lz * 0.8;
  const rk0y = Math.min(rY(1, padX) + 4 - 26 * kr, yT - 16 * kp) - 18 * kr;
  const rCorner = clamp(W * 0.22, 120, 200);
  let moon;
  if (!tight) {
    const rFull = Math.min(Lz * 0.47, H * 0.2, W * 0.125), rMin = Math.min(Math.max(90, W * 0.11), H * 0.2);
    if (rFull < rMin && zT >= rCorner * 0.9) moon = { kind: "corner" };
    else {
      let r = Math.max(rFull, rMin);
      const cut = clamp(1 - (zL - 20 - r) / r, 0, 1); r += cut * cut * Math.max(0, Math.min(H * 0.2, 150, (zL - 20) / 0.72) - r);
      const x = Math.min(zL - 20 - r, Lz * 0.46);
      moon = { kind: "gutter", r, x, y: Math.max(H * 0.29, r * 0.9), bx: Math.max(0.4, ((x + r) * 0.45 - x) / r), by: 0.46, rot: 0, flip: x < r * 0.45 };
    }
  } else if (!P && zT >= 96) moon = { kind: "corner" };
  else {
    const r = clamp(W * 0.25, 80, 120), x = Math.max(bandL * 0.72, r * 0.3);
    // (low only if the rocket need not come down to reach it: the top of the disc is at most a few px below where it stands)
    if (rY(1, x) - (zB + 3) >= 48 && zB + 3 + r * 0.08 - rk0y <= 18) moon = { kind: "low", r, x, y: zB + 3 + r, bx: 0.3, by: -0.92, rot: -25 };
    else {
      const d = zT - 3, r2 = clamp(W * 0.72, 200, 320), hc = Math.sqrt(Math.max(0, 2 * r2 * d - d * d)), by = 1 - 0.62 * d / r2;   // d: how deep the limb hangs into the screen
      moon = { kind: "cap", r: r2, x: Math.min(W * 0.35, W - 130 - hc), y: d - r2, bx: -Math.sqrt(Math.max(0, 0.937 - by * by)), by, rot: 0 };
    }
  }
  if (moon.kind === "corner") moon = { kind: "corner", r: rCorner, x: rCorner * 0.36, y: Math.min(zT - 4 - rCorner, rCorner * 0.55), bx: 0.05, by: 0.72, rot: 35 };
  const moonBase = { x: moon.x + moon.bx * moon.r, y: moon.y + moon.by * moon.r };   // the moon base: where the rocket is bound
  const circ = (cx, cy, r) => `M${f(cx - r)},${f(cy)}a${f(r)},${f(r)} 0 1 0 ${f(2 * r)},0a${f(r)},${f(r)} 0 1 0 ${f(-2 * r)},0`;

  // ---------- shared symbols ----------
  const defs = `<defs>
<radialGradient id="fv-ga"><stop offset="0" stop-color="${AMB}" stop-opacity=".6"/><stop offset="1" stop-color="${AMB}" stop-opacity="0"/></radialGradient>
<radialGradient id="fv-gc"><stop offset="0" stop-color="${CY}" stop-opacity=".55"/><stop offset="1" stop-color="${CY}" stop-opacity="0"/></radialGradient>
<radialGradient id="fv-gh"><stop offset="0" stop-color="${CY2}" stop-opacity=".62"/><stop offset="1" stop-color="${CY2}" stop-opacity="0"/></radialGradient>
<linearGradient id="fv-pb" x1=".3" y1="0" x2=".62" y2="1"><stop offset=".1" stop-color="#fff"/><stop offset=".5" stop-color="#f8f6ff"/><stop offset="1" stop-color="${LAV}"/></linearGradient>
<radialGradient id="fv-gd"><stop offset="0" stop-color="${AMB}" stop-opacity=".2"/><stop offset="1" stop-color="${CORAL}" stop-opacity="0"/></radialGradient>
<linearGradient id="fv-ex" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${WARM}" stop-opacity=".75"/><stop offset=".4" stop-color="${AMB}" stop-opacity=".32"/><stop offset="1" stop-color="${AMB}" stop-opacity="0"/></linearGradient>
<linearGradient id="fv-beam"><stop offset="0" stop-color="${WARM}" stop-opacity=".4"/><stop offset="1" stop-color="${WARM}" stop-opacity="0"/></linearGradient>
<linearGradient id="fv-tb" gradientUnits="userSpaceOnUse" x1="0" y1="${f(gTop)}" x2="0" y2="${f(yG)}"><stop offset="0" stop-color="#7a73cf"/><stop offset="1" stop-color="#3c387f"/></linearGradient>
<linearGradient id="fv-tf" gradientUnits="userSpaceOnUse" x1="0" y1="${f(gTop + (yG - gTop) * 0.35)}" x2="0" y2="${f(yG)}"><stop offset="0" stop-color="#57519f"/><stop offset="1" stop-color="#28255a"/></linearGradient>
<linearGradient id="fv-ns" gradientUnits="userSpaceOnUse" x1="0" y1="${f(gTop)}" x2="0" y2="${f(yG)}"><stop offset="0" stop-color="#cfc8ff"/><stop offset="1" stop-color="#655fba"/></linearGradient>
${P ? "" : `<linearGradient id="fv-hb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4a4599"/><stop offset="1" stop-color="#262358"/></linearGradient>`}
<linearGradient id="fv-mn" ${moon.kind === "cap" ? `x1=".22" y1="1" x2=".8" y2=".84"` : `x1="${moon.flip ? ".88" : ".12"}" y1=".08" x2="${moon.flip ? ".1" : ".9"}" y2=".94"`}><stop offset="0" stop-color="#fff"/><stop offset=".5" stop-color="#f1edff"/><stop offset="1" stop-color="#cbc3f8"/></linearGradient>
<g id="fv-bot"><rect x="-12" y="-19" width="24" height="16" rx="7.5" fill="${PERI}"/><path d="M-11.6,-10Q-10,-3 0,-3Q10,-3 11.6,-10Q6,-5.6 0,-5.6Q-6,-5.6 -11.6,-10Z" fill="${SHADE}"/><rect x="-10" y="-35" width="22" height="16.6" rx="7.6" fill="${LAV}"/><rect x="-7" y="-32.2" width="16" height="10.6" rx="5.2" fill="${INK}"/><path d="M-2.65,-40.25h5.3a2.55,2.55 0 0 1 0,5.1h-5.3a2.55,2.55 0 0 1 0,-5.1ZM0,-41L1.5,-46.5" fill="${PERI}" stroke="${PERI}" stroke-width="1.5" stroke-linecap="round"/><circle cx="1.7" cy="-48.2" r="2.2" fill="${AMB}"/></g>
<g id="fv-car0"><ellipse cx="0" cy="2" rx="26" ry="3.2" fill="url(#fv-gc)"/><path d="M-29,-3Q-31,-10 -24,-11.5L-13,-13Q-3,-21.5 11,-19.5Q22,-17.5 28,-11Q31.5,-7 29,-3Q15,-1 0,-1Q-15,-1 -29,-3Z"/><path d="M-10.5,-13.2Q-2,-19.2 10,-17.6Q17,-16.4 22,-12Z" fill="${INK}" fill-opacity=".88"/><path d="M-5,-15.2Q2,-17.6 9,-16.4" fill="none" stroke="${CY}" stroke-opacity=".75" stroke-width="1"/><circle cx="28.2" cy="-8" r="2" fill="${WARM}"/><path d="M-29.6,-9.2V-5.4" stroke="${CORAL}" stroke-width="2.2" stroke-linecap="round"/></g>
<g id="fv-car"><path d="M29,-9L66,-14V2Z" fill="url(#fv-beam)"/><use href="#fv-car0"/></g>
<g id="fv-bus"><ellipse cx="0" cy="2" rx="34" ry="3.4" fill="url(#fv-gc)"/><path d="M39,-9L74,-14V2Z" fill="url(#fv-beam)"/><path d="M-36,-1.5Q-40,-1.5 -40,-6V-18Q-40,-25 -32,-25H22Q34,-25 38.5,-13Q40.5,-7 38,-3.5Q37,-1.5 33,-1.5Z"/><path d="M-33,-16.5H27" fill="none" stroke="${AMB}" stroke-opacity=".9" stroke-width="7" stroke-dasharray="8.4 3"/><circle cx="38" cy="-8" r="2" fill="${WARM}"/><path d="M-40,-13V-8" stroke="${CORAL}" stroke-width="2.2" stroke-linecap="round"/></g>
${tight ? "" : `<g id="fv-fly"><ellipse cx="0" cy="5" rx="13" ry="3.6" fill="url(#fv-gc)"/><path d="M-17,-2Q-18,-9 -9,-10Q0,-15 9,-11Q17,-9 18,-4Q18,0 12,0H-12Q-17,0 -17,-2Z"/><path d="M-6,-9.6Q1,-13 8,-10Q12,-8.6 13.6,-6H-6Z" fill="${INK}" fill-opacity=".88"/><path d="M-12,1.8h8M4,1.8h8" stroke="${CY}" stroke-width="2" stroke-linecap="round"/><circle cx="17.2" cy="-4.6" r="1.6" fill="${WARM}"/></g>`}
<g id="fv-pod"><rect x="-18" y="-12" width="36" height="10.5" rx="5.2"/><path d="M-12.4,-7.2H13" fill="none" stroke="${AMB}" stroke-width="3.6" stroke-dasharray="4.4 2.2"/><path d="M-9,-1.5v1.6M9,-1.5v1.6" stroke="${LAV}" stroke-width="2.4"/><circle cx="16.6" cy="-6" r="1.4" fill="${WARM}"/></g>
</defs>`;

  // ====================================================================
  // SKY: horizon glow, a steady star field, swirling stars, the moon
  // ====================================================================
  {
    const gl = (cx, rx) => `<ellipse cx="${f(cx)}" cy="${f(yG)}" rx="${f(rx)}" ry="${f(rx * (P ? 0.9 : 0.62))}" fill="url(#fv-gd)"/>`;
    sky += defs + gl(bandL * 0.42, Math.max(bandL * 0.9, 120)) + gl(bandR + (W - bandR) * 0.6, Math.max((W - bandR) * 0.62, 130));

    // ---------- swirling stars ----------
    // Each swirl is one small group turning about its own centre: star trails (concentric arcs with a bright head) for
    // the "wheels", spiral arms of dots for the "whorls". The pivot is made exactly as for the turbine rotors:
    // transform-box:fill-box + transform-origin:center, with an invisible circle that keeps the fill-box centred on
    // the pivot. Boxes stay under a quarter of the screen width (a third on phones); the still frame already looks swirled.
    // Inside the content column the dots are at most 2 px and under half opacity; no pivot lies inside the column box.
    const sw = [];   // {x, y, R, r0 (inner radius share), wheel, dur (s per turn), rev, seed}
    if (!tight) {
      const R = Math.min(Rw * 0.46, W / 8 - 2, H * 0.22, 240), wx = RzX + Rw * 0.54, wy = Math.max(H * 0.23, R * 0.72);
      sw.push({ x: wx, y: wy, R, r0: 0.53, wheel: true, dur: 100, seed: 71 }, { x: wx, y: wy, R: R * 0.5, r0: 0, wheel: true, dur: 76, seed: 72 });
      // a whorl beside the moon (up and to the right of it)
      const ra = clamp(Lz * 0.16, 32, 72), da = moon.r + ra + 14, cy = zT * 0.5, dy = cy - moon.y;
      sw.push(moon.kind === "corner" ? { x: moon.x + Math.sqrt(Math.max(0, moon.r * moon.r - dy * dy)) + ra + 16, y: cy, R: ra, dur: 50, rev: true, seed: 73 }
        : { x: Math.min(moon.x + da * 0.616, zL - ra + 12), y: Math.max(moon.y - da * 0.788, ra + 6), R: ra, dur: 50, rev: true, seed: 73 });
    } else if (!P) {
      // portrait tablets: the sky is the band above the content
      const R = Math.min(W / 6 - 2, 110), wx = Math.max(zR + R * 0.7, W * 0.66), wy = zT * 0.42;
      sw.push({ x: wx, y: wy, R, r0: 0.53, wheel: true, dur: 96, seed: 71 }, { x: wx, y: wy, R: R * 0.5, r0: 0, wheel: true, dur: 70, seed: 72 });
      if (moon.kind === "corner") { const ra = clamp(zT * 0.3, 26, 44), y = zT * 0.5, dy = y - moon.y; sw.push({ x: moon.x + Math.sqrt(Math.max(0, moon.r * moon.r - dy * dy)) + ra + 16, y, R: ra, dur: 46, rev: true, seed: 73 }); }
    } else {
      // phones: a star wheel turning about a point just off the right edge, beside the title, and a whorl low on the left
      const R = Math.min(W / 6 - 1, 62);
      sw.push({ x: W + 6, y: col.y + 122, R, r0: 0.3, wheel: true, dur: 62, seed: 71 }, { x: 20, y: zB - 96, R: R * 0.94, dur: 54, rev: true, seed: 73 });
    }
    const inCol = (g) => Math.hypot(g.x - clamp(g.x, col.x, col.x + col.w), g.y - clamp(g.y, col.y, colB)) < g.R;   // does it reach into the column box?
    for (const g of sw) {
      const r = rng(g.seed), R = g.R, faint = inCol(g), dir = g.rev ? -1 : 1, pt = (rad, an) => `${f(g.x + rad * Math.cos(an))},${f(g.y + rad * Math.sin(an))}`;
      let A = "", B = "";                                  // A: fine trails and star dust, B: the bright stars
      if (g.wheel) {
        // star trails: each streak curls a little inward towards its head, so the wheel reads as a slow vortex even when still
        const n = Math.max(2, Math.round(R * (0.88 - g.r0) / (P ? 9 : 14)));
        for (let j = 0; j < n; j++) {
          const rad = R * (g.r0 + (0.88 - g.r0) * (j + 0.7) / n), m = Math.max(3, Math.round(rad * 6.283 / (P ? 30 : 42)));
          for (let i = 0; i < m; i++) {
            const a1 = (i + r() * 0.8) / m * 6.283, len = (6 + r() * (P ? 14 : 22)) * (r() < 0.18 ? 2.2 : 1), da = Math.min(len / rad, 1.1), a0 = a1 - dir * da, out = 1 + 0.085 * Math.min(1, da * 1.6);
            const rh = rad * (1 + (r() - 0.5) * 0.05);
            A += `M${pt(rh * out, a0)}Q${pt(Math.min(rh * (1 + (out - 1) * 0.42) / Math.cos(da / 2), R * 0.985), a1 - dir * da / 2)} ${pt(rh, a1)}`;   // (control points too stay inside the circle)
            if (r() < 0.62) B += `M${pt(rh, a1)}h.01`;
          }
        }
        if (!g.r0) B += `M${pt(0, 0)}h.01`;
      } else {
        // a little spiral of stars: two trailing arms of streaks and dust, a bright core
        const N = Math.max(14, Math.round(R / 2.2));
        for (let k = 0; k < 2; k++) {
          let pen = false;
          for (let i = 0; i <= N; i++) {
            const u = i / N, rad = R * (0.09 + 0.84 * u), an = k * 3.1416 - dir * u * 4.3, jr = (r() - 0.5) * R * 0.09, ja = (r() - 0.5) * 0.22;
            if (Math.floor(u * 6.999) % 2 === 0) { A += (pen ? "L" : "M") + pt(rad, an); pen = true; } else { pen = false; if (i % 2) A += `M${pt(rad + jr, an + ja)}h.01`; }
            if (i % 3 === 1 && u < 0.86) B += `M${pt(rad + jr * 0.6, an - ja)}h.01`;
          }
        }
        B += `M${pt(0, 0)}h.01`;
      }
      const sp = (d, w, o) => `<path d="${d}" fill="none" stroke="${CREAM}" stroke-opacity="${o}" stroke-width="${w}" stroke-linecap="round"/>`;
      skyA += `<g class="fv-swirl" style="animation-duration:${g.dur}s;animation-delay:-${f(g.dur * 0.3)}s${g.rev ? ";animation-direction:reverse" : ""}"><circle cx="${f(g.x)}" cy="${f(g.y)}" r="${f(R)}" fill="none"/>` +
        sp(A, faint ? 1.1 : 1.25, faint ? 0.4 : 0.46) + sp(B, faint ? 2 : g.wheel ? 2.5 : 2.3, faint ? 0.48 : 0.88) + `</g>`;
    }

    // ---------- the steady star field (thinner where the swirls and the moon are) ----------
    const r = rng(11); let st = "";
    const star = (x, y) => {
      if (Math.hypot(x - moon.x, y - moon.y) < moon.r + 5 || (x > W - 124 && y < 74)) return;
      if (x > col.x - 3 && x < col.x + col.w + 3 && y > col.y - 3 && y < colB + 3) return;   // never behind the column's text
      for (const g of sw) if (Math.hypot(x - g.x, y - g.y) < g.R * 0.92) return;
      st += `M${f(x)},${f(y)}h.01`;
    };
    if (tight) {
      for (let i = 0; i < 6; i++) star(4 + r() * (Lz - 8), 90 + r() * H * 0.55); for (let i = 0; i < 5; i++) star(W - Lz + 4 + r() * (Lz - 8), 80 + r() * H * 0.6);
      if (!P) for (let i = 0; i < 22; i++) star(8 + r() * (W - 16), 6 + r() * (zT - 12));
      else {
        for (let i = 0; i < 12; i++) star(6 + r() * (W - 12), 5 + r() * (col.y - 12));                       // the strip above the column
        for (let i = 0; i < 10; i++) { const x = 6 + r() * (W - 12); star(x, colB + 8 + r() * Math.max(0, rY(1, x) - colB - 14)); }   // the sky left under it
      }
    } else {
      const n = Math.round(clamp(Lz / 9, 12, 44));
      for (let i = 0; i < n; i++) star(6 + r() * (Lz - 14), 10 + r() * H * 0.46);
      for (let i = 0; i < n; i++) star(RzX + 10 + r() * (Rw - 16), 12 + r() * H * 0.48);
      if (zT > 22) for (let i = 0, m = Math.round((RzX - zL) * zT / 4200); i < m; i++) star(zL + r() * (RzX - zL), 6 + r() * (zT - 12));
    }
    sky += `<path d="${st}" fill="none" stroke="${CREAM}" stroke-opacity=".7" stroke-width="1.8" stroke-linecap="round"/>`;

    // a little satellite drifting across the upper-right sky (emerges from behind the phone mockup)
    if (!tight) {
      const k = clamp(uM * 1.3, 1.1, 1.9), x0 = RzX - 40, x1 = W + 50, y0 = Math.max(104, H * 0.25), y1 = Math.max(78, H * 0.13);
      css.push(`@keyframes fv-sat{from{transform:translate(${f(x0)}px,${f(y0)}px)}to{transform:translate(${f(x1)}px,${f(y1)}px)}}`);
      skyA += `<g class="fv-veh" transform="translate(${f(x0 + (x1 - x0) * 0.55)} ${f(y0 + (y1 - y0) * 0.55)})" style="animation-name:fv-sat;animation-duration:70s;animation-delay:-38.5s"><g transform="rotate(-18) scale(${f(k)})"><path d="M-18,-3.6h11v7.2h-11ZM7,-3.6h11v7.2h-11Z" fill="#35317a" stroke="${CY2}" stroke-opacity=".85" stroke-width="1"/><path d="M-7,0h14M-12.5,-3.6v7.2M12.5,-3.6v7.2" stroke="${LAV}" stroke-width="1.2"/><rect x="-4.6" y="-4.6" width="9.2" height="9.2" rx="2.8" fill="${LAV}"/><circle class="fv-bead" cy="-7" r="1.7" fill="${AMB}"/></g></g>`;
    }

    // ---------- the moon (drawn over the stars) ----------
    const m = moon, R = m.r, F3 = (n) => String(Math.round(n * 1000) / 1000);
    // soft wide glow: a gradient in user space; it is under 0.08 wherever it reaches a no-moon zone
    const gapTo = (x0, y0, x1, y1) => Math.hypot(m.x - clamp(m.x, x0, x1), m.y - clamp(m.y, y0, y1)) - R;
    const gap = Math.min(gapTo(zL, zT, zR, zB), gapTo(W - 120, 0, W, 70)), G = R * 1.9;
    const a0 = gap > 2 ? clamp(0.07 + gap * 0.006, 0.07, 0.24) : 0.07;
    sky += `<radialGradient id="fv-gl" gradientUnits="userSpaceOnUse" cx="${f(m.x)}" cy="${f(m.y)}" r="${f(G)}"><stop offset="${F3(R / G)}" stop-color="${LAV}" stop-opacity="${F3(a0)}"/>` +
      (gap > 2 && R + gap < G * 0.92 ? `<stop offset="${F3((R + gap) / G)}" stop-color="${LAV}" stop-opacity=".07"/>` : "") + `<stop offset="1" stop-color="${LAV}" stop-opacity="0"/></radialGradient>`;
    const tf = (rot) => ` transform="translate(${f(m.x)} ${f(m.y)})${m.flip ? " scale(-1 1)" : ""} rotate(${rot})"`, cu = (x, y, r) => circ(x * R, y * R, r * R);
    const craters = [[-0.72, -0.06, 0.07], [-0.2, -0.7, 0.08], [0.52, -0.5, 0.06], [0.64, 0.5, 0.07], [-0.44, 0.64, 0.09], [0.06, 0.02, 0.06], [-0.14, 0.84, 0.055], [0.33, 0.3, 0.05], [-0.84, 0.36, 0.05], [0.06, -0.9, 0.045], [0.84, -0.1, 0.055]];
    // only a limb shows in the cap layout: small craters and two maria along it
    const limb = m.kind === "cap" ? [[-0.3, 0.925, 0.022], [-0.1, 0.955, 0.03], [0.08, 0.93, 0.02], [0.22, 0.94, 0.028], [0.33, 0.925, 0.015], [-0.2, 0.96, 0.014], [0.36, 0.905, 0.012], [-0.38, 0.9, 0.016]] : [];
    for (const c of limb) craters.push(c);
    const lw = m.kind === "cap" ? 1.3 : Math.max(1, R * 0.011);
    sky += `<circle cx="${f(m.x)}" cy="${f(m.y)}" r="${f(G)}" fill="url(#fv-gl)"/>` +
      `<circle id="fv-moon" cx="${f(m.x)}" cy="${f(m.y)}" r="${f(R)}" fill="url(#fv-mn)"/>` +
      // maria
      `<path${tf(m.rot)} d="${cu(-0.36, -0.3, 0.24) + cu(-0.18, -0.44, 0.16) + cu(-0.54, -0.14, 0.13) + cu(0.16, -0.5, 0.17) + cu(0.32, -0.4, 0.1) + cu(-0.1, 0.26, 0.25) + cu(0.14, 0.36, 0.16) + cu(-0.3, 0.42, 0.13) + cu(0.48, 0.1, 0.15) + cu(-0.62, 0.3, 0.1) + cu(0.2, 0.68, 0.14) + cu(0.02, 0.75, 0.09) + (limb.length ? cu(0.02, 0.9, 0.07) + cu(0.1, 0.915, 0.05) + cu(-0.25, 0.915, 0.045) : "")}" fill="#9d95e6" fill-opacity=".26"/>` +
      // craters; a gentle terminator (two soft crescents on the side away from the light)
      `<path${tf(m.rot)} d="${craters.map((c) => cu(c[0], c[1], c[2])).join("")}" fill="#a59eea" fill-opacity=".5"/>` +
      `<path${tf(36)} d="M0,${f(-R)}A${f(R)},${f(R)} 0 0 1 0,${f(R)}A${f(R * 1.3)},${f(R * 1.3)} 0 0 0 0,${f(-R)}Z" fill="${SHADE}" fill-opacity=".13"/>` +
      `<path${tf(36)} d="M${f(R * 0.26)},${f(-R * 0.966)}A${f(R)},${f(R)} 0 0 1 ${f(R * 0.26)},${f(R * 0.966)}A${f(R * 1.5)},${f(R * 1.5)} 0 0 0 ${f(R * 0.26)},${f(-R * 0.966)}Z" fill="#8a83da" fill-opacity=".3"/>` +
      // the craters' lit lower rims and the lit limb (one white stroke)
      `<path${tf(m.rot)} d="${craters.map((c) => `M${f((c[0] + c[2] * 0.94) * R)},${f((c[1] - c[2] * 0.34) * R)}A${f(c[2] * R)},${f(c[2] * R)} 0 0 1 ${f((c[0] - c[2] * 0.5) * R)},${f((c[1] + c[2] * 0.87) * R)}`).join("")}${(() => { const q = (an) => { const t = (an + 36 - m.rot) * Math.PI / 180; return `${f(R * 0.992 * Math.cos(t))},${f(R * 0.992 * Math.sin(t))}`; }; return `M${q(110)}A${f(R * 0.992)},${f(R * 0.992)} 0 0 1 ${q(233)}`; })()}" fill="none" stroke="#fff" stroke-opacity=".65" stroke-width="${f(lw * 1.2)}" stroke-linecap="round"/>` +
      // the moon base: a tiny warm light
      `<circle cx="${f(moonBase.x)}" cy="${f(moonBase.y)}" r="${f(clamp(R * 0.02, 1.7, 3.4))}" fill="${AMB}"/>`;
    skyA += `<circle class="fv-bead" cx="${f(moonBase.x)}" cy="${f(moonBase.y)}" r="${f(clamp(R * 0.085, 6, 14))}" fill="url(#fv-ga)"/>`;
  }

  // ====================================================================
  // CITY ROWS (generated): far (hazy, ridge 0), back + front (ridge 1)
  // ====================================================================
  const shape = (type, x0, w, t, b, u) => {
    const x1 = x0 + w, h = b - t, F = f;
    switch (type) {
      case "round": { const r = w / 2; return { d: `M${F(x0)},${F(b)}V${F(t + r)}A${F(r)},${F(r)} 0 0 1 ${F(x1)},${F(t + r)}V${F(b)}Z`, top: (x) => t + r - Math.sqrt(Math.max(0, r * r - (x - x0 - r) * (x - x0 - r))) + 1.5 * u, flat: null }; }
      case "step": { const a1 = w * 0.17, a2 = w * 0.34, y1 = t + h * 0.34, y2 = t + h * 0.13; return { d: `M${F(x0)},${F(b)}V${F(y1)}H${F(x0 + a1)}V${F(y2)}H${F(x0 + a2)}V${F(t)}H${F(x1 - a2)}V${F(y2)}H${F(x1 - a1)}V${F(y1)}H${F(x1)}V${F(b)}Z`, top: (x) => { const dx = Math.min(x - x0, x1 - x); return dx < a1 ? y1 : dx < a2 ? y2 : t; }, flat: [x0 + a2, x1 - a2] }; }
      case "stepL": { const xa = x0 + w * 0.46, xb = x0 + w * 0.74, y1 = t + h * 0.2, y2 = t + h * 0.42; return { d: `M${F(x0)},${F(b)}V${F(t)}H${F(xa)}V${F(y1)}H${F(xb)}V${F(y2)}H${F(x1)}V${F(b)}Z`, top: (x) => x < xa ? t : x < xb ? y1 : y2, flat: [xb, x1], flatY: y2 }; }
      case "slant": { const yl = t + w * 0.36; return { d: `M${F(x0)},${F(b)}V${F(yl)}L${F(x1)},${F(t)}V${F(b)}Z`, top: (x) => yl + (t - yl) * (x - x0) / w + 2 * u, flat: null, glint: [x0 + w * 0.12, yl + (t - yl) * 0.12, x1 - w * 0.12, yl + (t - yl) * 0.88] }; }
      case "dome": { const dh = Math.min(w * 0.44, h * 0.4); return { d: `M${F(x0)},${F(b)}V${F(t + dh)}H${F(x0 + w * 0.1)}A${F(w * 0.4)},${F(dh)} 0 0 1 ${F(x1 - w * 0.1)},${F(t + dh)}H${F(x1)}V${F(b)}Z`, top: () => t + dh, flat: null, dome: [x0 + w * 0.1, x1 - w * 0.1, t + dh] }; }
      case "taper": { const i = w * 0.2; return { d: `M${F(x0)},${F(b)}L${F(x0 + i)},${F(t + 3 * u)}Q${F(x0 + i)},${F(t)} ${F(x0 + i + 3 * u)},${F(t)}H${F(x1 - i - 3 * u)}Q${F(x1 - i)},${F(t)} ${F(x1 - i)},${F(t + 3 * u)}L${F(x1)},${F(b)}Z`, top: (x) => (x - x0 < i + u || x1 - x < i + u) ? 1e9 : t, flat: null }; }
      case "twin": { const wl = w * 0.35, t2 = t + h * 0.14, by = t2 + h * 0.16, by2 = t2 + h * 0.46, bh = 5.4 * u, br = (y) => `M${F(x0 + wl)},${F(y)}H${F(x1 - wl)}V${F(y + bh)}H${F(x0 + wl)}Z`; return { d: `M${F(x0)},${F(b)}V${F(t)}H${F(x0 + wl)}V${F(b)}ZM${F(x1 - wl)},${F(b)}V${F(t2)}H${F(x1)}V${F(b)}Z${br(by)}${br(by2)}`, top: (x) => x < x0 + wl ? t : x > x1 - wl ? t2 : 1e9, flat: [x0, x0 + wl], bridge: [x0 + wl + u, x1 - wl - u, by + bh / 2, by2 + bh / 2] }; }
      default: { const r = Math.min(3 * u, w / 4); return { d: `M${F(x0)},${F(b)}V${F(t + r)}Q${F(x0)},${F(t)} ${F(x0 + r)},${F(t)}H${F(x1 - r)}Q${F(x1)},${F(t)} ${F(x1)},${F(t + r)}V${F(b)}Z`, top: () => t, flat: [x0 + r, x1 - r] }; }
    }
  };
  const TYPES = ["slab", "step", "round", "slant", "twin", "stepL", "dome", "taper", "slab", "step"];
  const row = (x0, x1, c, rnd, skip) => {
    const o = { body: "", A: "", tw: [], lines: "", beads: "", trees: "", bloom: "", glints: "", ng: 0, solar: "", n: 0 }, u = c.u;
    let x = x0, i = 0, owed = false;                       // owed: (phones) the building whose turn it was to twinkle had no windows for it
    while (x < x1 - c.wMin * u * 0.7) {
      const w = (c.wMin + rnd() * (c.wMax - c.wMin)) * u, gap = (c.gapMin + rnd() * (c.gapMax - c.gapMin)) * u;
      const v1 = rnd(), v2 = rnd(), v3 = rnd(), xe = x + w, cx = x + w / 2;
      if (skip && skip(x, xe)) { x = xe + gap; i++; continue; }
      let B = "";                                          // in every 2nd-4th building some windows twinkle (one small animated path per building)
      const tw = !c.simple && (i % (P ? 3 : 6) === 1 || owed) && o.tw.length < (P ? 2 : 3);
      const b = rYlow(c.ridge, x, xe) + c.sink;
      const cl = Math.max(ceilAt(x), ceilAt(xe), ceilAt(cx)), free = cl === freeTop, avail = Math.max(b - cl, 22 * u);
      const rr = free ? c.hFree : c.hCap, h = Math.max(avail * (rr[0] + v1 * (rr[1] - rr[0])), 16 * u), t = b - h;
      let type = c.simple ? ["slab", "round", "step", "slab", "taper"][Math.floor(v2 * 5)] : TYPES[Math.floor(v2 * TYPES.length)];
      if (h < w * 1.1 && (type === "twin" || type === "step" || type === "taper" || type === "round")) type = v2 < 0.5 ? "slant" : "dome";
      if (type === "twin" && w < 44 * u) type = "stepL";
      const sh = shape(type, x, w, t, b, u);
      o.body += sh.d; o.n++;
      // windows: columns of dashes, split into a steady set and two slowly twinkling sets
      const p = 6.2 * u, n = Math.max(1, Math.floor((w - 3.4 * u) / p));
      if (type === "slab" && i % 2 === 0 && h > 30 * u) { // ribbon-window tower
        for (let y = t + 6 * u, j = 0; y < b - 5 * u - c.sink; y += 5.6 * u, j++) { const k = (j + i) % 4; if (k !== 2) { const d = `M${f(x + 3 * u)},${f(y)}H${f(xe - 3 * u)}`; if (tw && k === 0) B += d; else o.A += d; } }
      } else for (let j = 0; j < n; j++) {
        const wx = cx + (j - (n - 1) / 2) * p, yt = sh.top(wx) + 4.5 * u, yb = b - 4 * u - c.sink;
        if (yb - yt > (P ? 4.4 : 5) * u) { const k = (j + i * 3) % 5, d = `M${f(wx)},${f(yt)}V${f(yb)}`; if (tw && (k === 1 || k === 3)) B += d; else o.A += d; }
      }
      if (B) o.tw.push(B);
      owed = P && tw && !B;
      if (!c.simple) {
        if (sh.bridge) o.A += `M${f(sh.bridge[0])},${f(sh.bridge[2])}H${f(sh.bridge[1])}M${f(sh.bridge[0])},${f(sh.bridge[3])}H${f(sh.bridge[1])}`;
        if (sh.glint) { const g = sh.glint, gl = 0.3; if (v3 < 0.62 && o.ng++ < 2) o.glints += `<path class="fv-glint" style="--fv-dx:${f((g[2] - g[0]) * (1 - gl))}px;--fv-dy:${f((g[3] - g[1]) * (1 - gl))}px;animation-delay:-${f(v3 * 7)}s" d="M${f(g[0])},${f(g[1] - 1.2 * u)}l${f((g[2] - g[0]) * gl)},${f((g[3] - g[1]) * gl)}" fill="none" stroke="${CY}" stroke-width="${f(1.8 * u)}" stroke-linecap="round" opacity=".85"/>`; o.solar += `M${f(g[0] - w * 0.08)},${f(g[1] + w * 0.03 - 1.2 * u)}L${f(g[2] + w * 0.08)},${f(g[3] - w * 0.03 - 1.2 * u)}`; }
        if (sh.dome) o.lines += `M${f(cx)},${f(t)}v${f(-6 * u)}`, o.beads += `M${f(cx)},${f(t - 7 * u)}h.01`;
        else if (sh.flat && v3 < 0.42) { // rooftop garden with blossom
          const fy = sh.flatY || t, fa = sh.flat[0], fb = sh.flat[1], m = Math.max(1, Math.min(3, Math.floor((fb - fa) / (7 * u))));
          for (let j = 0; j < m; j++) { const tx = fa + (fb - fa) * (j + 0.5) / m, tr = (3 + ((j + i) % 2) * 1.2) * u; o.trees += circ(tx, fy - tr * 0.8, tr); o.bloom += `M${f(tx - tr * 0.3)},${f(fy - tr * 1.1)}h.01`; }
        } else if (v3 > 0.6 && type !== "slant") { const ah = (6 + v3 * 10) * u, ax = type === "stepL" ? x + w * 0.2 : cx, ay = type === "round" ? t : sh.top(ax); if (ay < 1e8) { o.lines += `M${f(ax)},${f(ay)}v${f(-ah)}`; o.beads += `M${f(ax)},${f(ay - ah - u)}h.01`; } }
      }
      x = xe + gap; i++;
    }
    return o;
  };
  const dA = [3, 2.6, 3, 2.6, 3, 8.2, 3, 2.6, 3, 13.8, 3, 2.6], dB = [3, 8.2, 3, 2.6, 3, 13.8];
  const dash = (arr, u) => arr.map((v) => f(v * u)).join(" ");
  const winPath = (d, u, arr, op, cls, delay, dur) => d ? `<path${cls ? ` class="${cls}" style="animation-delay:-${delay}s;animation-duration:${dur}s"` : ""} d="${d}" fill="none" stroke="${AMB}" stroke-opacity="${op}" stroke-width="${f(2.7 * u)}" stroke-dasharray="${dash(arr, u)}"/>` : "";
  const renderRow = (o, u, fill, stroke, wOp, k, hazy) => !o.body ? ["", ""] : [   // -> [static art, animated bits]
    `<path d="${o.body}" fill="${fill}"${hazy ? ` fill-opacity="${hazy}"` : ""} stroke="${stroke}" stroke-width="1" stroke-linejoin="round"/>` +
    winPath(o.A, u, dA, wOp, "", 0, 0) +
    (o.trees ? `<path d="${o.trees}" fill="#6a63c2" stroke="${lav(0.35)}" stroke-width=".8"/><path d="${o.bloom}" fill="none" stroke="${CORAL}" stroke-width="${f(1.9 * u)}" stroke-linecap="round"/>` : "") +
    (o.lines ? `<path d="${o.lines}" fill="none" stroke="${lav(0.6)}" stroke-width="${f(Math.max(1, 0.9 * u))}" stroke-linecap="round"/>` : "") +
    (o.solar ? `<path d="${o.solar}" fill="none" stroke="${CY2}" stroke-opacity=".55" stroke-width="${f(2.2 * u)}" stroke-linecap="round" stroke-dasharray="${f(4.2 * u)} ${f(1.2 * u)}"/>` : "") +
    (o.beads ? `<path d="${o.beads}" fill="none" stroke="${AMB}" stroke-opacity=".85" stroke-width="${f(2.6 * u)}" stroke-linecap="round"/>` : ""),
    o.tw.map((d, j) => winPath(d, u, dB, wOp, "fv-tw", f((j * 3.7 + k * 2.3) % 9), 8 + ((j + k) % 3) * 2)).join("") + o.glints];

  // ---------- needles ----------
  const needle = (cx, hf, v, hazy) => {
    const u = uM, b = rY(hazy ? 0 : 1, cx) + 3, cl = ceilAt(cx), h = Math.max((b - cl) * hf, 44 * u), t = b - h;
    const R = tight ? clamp(h * 0.15, 11.5 * u, 48 * u) : clamp(h * 0.105, 8 * u, 48 * u), py = b - h * (v === 1 ? 0.7 : 0.76);
    const bw = Math.max(3.4 * u, h * 0.03), ww = Math.max(1.3 * u, h * 0.009);
    const g = (inner) => hazy ? `<g opacity=".5">${inner}</g>` : inner;
    let m = `<ellipse cx="${f(cx)}" cy="${f(py + R * 0.1)}" rx="${f(R * 1.9)}" ry="${f(R * 0.95)}" fill="url(#fv-ga)" opacity=".55"/>` +
      `<path d="M${f(cx - bw)},${f(b)}C${f(cx - ww * 1.3)},${f(b - h * 0.2)} ${f(cx - ww)},${f(b - h * 0.4)} ${f(cx - ww)},${f(py)}H${f(cx + ww)}C${f(cx + ww)},${f(b - h * 0.4)} ${f(cx + ww * 1.3)},${f(b - h * 0.2)} ${f(cx + bw)},${f(b)}Z" fill="url(#fv-ns)"/>`;
    if (v === 2) { // ringed sphere pod
      const r0 = R * 0.56;
      m += `<circle cx="${f(cx)}" cy="${f(py - r0 * 0.2)}" r="${f(r0)}" fill="${LAV}"/><path d="M${f(cx - r0 * 0.92)},${f(py + r0 * 0.1)}A${f(r0)},${f(r0)} 0 0 0 ${f(cx + r0 * 0.92)},${f(py + r0 * 0.1)}Z" fill="${SHADE}"/>` +
        `<ellipse cx="${f(cx)}" cy="${f(py - r0 * 0.1)}" rx="${f(R)}" ry="${f(R * 0.2)}" fill="${INK}" fill-opacity=".85" stroke="${LAV}" stroke-width="${f(Math.max(1, R * 0.05))}"/>` +
        `<path d="M${f(cx - R * 0.8)},${f(py - r0 * 0.1)}H${f(cx + R * 0.8)}" fill="none" stroke="${AMB}" stroke-width="${f(R * 0.13)}" stroke-dasharray="${f(R * 0.13)} ${f(R * 0.09)}"/>`;
    } else {
      m += `<path d="M${f(cx - R)},${f(py)}Q${f(cx - R * 0.5)},${f(py + R * 0.46)} ${f(cx - ww * 2.4)},${f(py + R * 0.62)}H${f(cx + ww * 2.4)}Q${f(cx + R * 0.5)},${f(py + R * 0.46)} ${f(cx + R)},${f(py)}Z" fill="${SHADE}"/>` +
        `<path d="M${f(cx - R)},${f(py)}Q${f(cx - R * 0.92)},${f(py - R * 0.2)} ${f(cx - R * 0.5)},${f(py - R * 0.28)}Q${f(cx)},${f(py - R * 0.66)} ${f(cx + R * 0.5)},${f(py - R * 0.28)}Q${f(cx + R * 0.92)},${f(py - R * 0.2)} ${f(cx + R)},${f(py)}Z${v === 1 ? `M${f(cx - R * 0.15)},${f(py - R * 0.4)}V${f(py - R * 0.72)}H${f(cx + R * 0.15)}V${f(py - R * 0.4)}Z` : ""}" fill="${LAV}"/>` +
        `<path d="M${f(cx - R * 0.9)},${f(py)}H${f(cx + R * 0.9)}" fill="none" stroke="${AMB}" stroke-width="${f(R * 0.14)}" stroke-dasharray="${f(R * 0.14)} ${f(R * 0.085)}"/>`;
      if (v === 1) m += `<path d="M${f(cx - R * 0.56)},${f(py - R * 0.82)}Q${f(cx)},${f(py - R * 1.3)} ${f(cx + R * 0.56)},${f(py - R * 0.82)}Q${f(cx)},${f(py - R * 0.5)} ${f(cx - R * 0.56)},${f(py - R * 0.82)}Z" fill="${PERI}" stroke="${AMB}" stroke-opacity=".8" stroke-width="${f(Math.max(0.8, R * 0.05))}"/>`;
    }
    m += `<path d="M${f(cx)},${f(py - R * (v === 2 ? 0.7 : v === 1 ? 1.06 : 0.45))}V${f(t)}" fill="none" stroke="${LAV}" stroke-width="${f(Math.max(1.1, 0.9 * u))}" stroke-linecap="round"/>`;
    const bead = (cls) => `<circle${cls ? ` class="fv-bead" style="animation-delay:-${f((cx * 0.013) % 4)}s"` : ""} cx="${f(cx)}" cy="${f(t)}" r="${f(1.9 * u)}" fill="${AMB}"/>`;
    return hazy ? [g(m), ""] : [m, bead(true)];   // -> [static art, blinking bead]
  };

  // ---------- turbine (hub at top, base y = ground) ----------
  const turbine = (cx, hpx, dur, delay, op) => {
    const b = rY(1, cx) + 3, L = hpx * 0.44, y = b - hpx, w = Math.max(1, hpx * 0.02);
    let blades = "";                                       // three blades in one path (the invisible circle keeps the fill-box centred on the hub)
    for (let i = 0; i < 3; i++) { const c = Math.cos(i * 2.0944), n = Math.sin(i * 2.0944), q = (x, y) => `${f((x * c - y * n) * L)},${f((x * n + y * c) * L)}`; blades += `M0,0C${q(0.09, -0.2)} ${q(0.07, -0.7)} ${q(0, -1)}C${q(-0.035, -0.7)} ${q(-0.05, -0.2)} 0,0Z`; }
    return [`<path d="M${f(cx - w * 1.5)},${f(b)}L${f(cx - w * 0.6)},${f(y)}H${f(cx + w * 0.6)}L${f(cx + w * 1.5)},${f(b)}Z" fill="${LAV}" opacity="${op}"/>`,
      `<g transform="translate(${f(cx)} ${f(y)})" opacity="${op}"><g class="fv-spin" style="animation-duration:${dur}s;animation-delay:-${delay}s"><circle r="${f(L)}" fill="none"/><path d="${blades}" fill="${CREAM}"/><circle r="${f(w * 2)}" fill="${LAV}"/></g></g>`];   // -> [mast, rotor]
  };

  // ---------- place the city ----------
  const hc = (lo, hi, tlo, thi) => tight ? [tlo, thi] : [lo, hi];   // tight layouts keep the towers low so the needle pods stand proud
  const cfgFar = { u: uM, ridge: 0, sink: 5, wMin: P ? 20 : 24, wMax: P ? 34 : 46, gapMin: 3, gapMax: 26, hFree: [0.42, 0.8], hCap: hc(0.55, 1, 0.42, 0.74), simple: true };
  const cfgBack = { u: uM, ridge: 1, sink: 2, wMin: P ? 26 : 32, wMax: P ? 44 : 60, gapMin: -1, gapMax: 8, hFree: [0.28, 0.58], hCap: hc(0.55, 0.98, 0.36, 0.6) };
  const cfgFront = { u: uM, ridge: 1, sink: 5, wMin: P ? 22 : 26, wMax: P ? 40 : 52, gapMin: 1, gapMax: 12, hFree: [0.12, 0.28], hCap: hc(0.28, 0.6, 0.2, 0.4) };
  const noPad = (x0, x1) => x1 > padX - (padW + 5) * kr && x0 < padX + (padW + 5) * kr;
  const farSkip = (x0, x1) => x1 > pxOf(596) && x0 < pxOf(838);
  // foreground vignettes: plan the nearest ridge first, so the skyline can leave them clean backdrops
  const L0 = 8 * uN, L1 = bandL - 8 * uN, R0 = bandR + 10 * uN, R1 = W - 6 * uN;
  const plan = (x0, x1, items) => { // items: [key, width, order]; keeps (in priority order) what fits, then spreads it in spatial order
    let tot = 0; const keep = [];
    for (const it of items) if (tot + it[1] * uN <= x1 - x0 + 0.5) { keep.push(it); tot += it[1] * uN; }
    keep.sort((p, q) => p[2] - q[2]);
    const gap = keep.length > 1 ? Math.min((x1 - x0 - tot) / (keep.length - 1), 46 * uN) : 0;
    let x = x0 + (x1 - x0 - tot - gap * (keep.length - 1)) / 2; const out = {};
    for (const it of keep) { out[it[0]] = x; x += it[1] * uN + gap; }
    return out;
  };
  const leftOfPad = (x1) => plan(L0, x1, [["point", 60, 2], ["port", 80, 1], ["scope", 44, 0]]);   // the pointing pair first: it must always be there
  let slotsL = P ? plan(L0 - 4 * uN, L1 + 6 * uN, [["point", 60, 0]]) : tight ? plan(L0, L1, [["point", 60, 0]]) : leftOfPad(padX - (padW + 4) * kr - 10 * uN);
  if (slotsL.point == null) slotsL = leftOfPad(padX - (padW + 1) * kr);
  if (!tight) Object.assign(slotsL, plan(padX - 2 * uN, L1, [["desk", 28, 0]]));
  const slots = Object.assign(slotsL, P ? plan(R0 - 4 * uN, R1 + 4 * uN, [["build", 84, 0]]) : plan(R0, R1, [["build", 112, 0], ["wheel", 84, 1], ["hub", 116, 2], ["garden", 80, 3]]));
  {
    const fl = row(-6, bandL + 30, cfgFar, rng(5), farSkip), fr = row(bandR - 30, W + 6, cfgFar, rng(9), farSkip);
    far += renderRow(fl, uM, "#6a63bd", "none", 0.34, 1, 0.5)[0] + renderRow(fr, uM, "#6a63bd", "none", 0.34, 2, 0.5)[0];
    if (!tight) far += (Lz > 250 ? needle(Lz * 0.7, 0.72, 0, true)[0] : "") + needle(RzX + Rw * 0.38, 0.8, 2, true)[0];
  }
  let needles, turbines;                                   // needle: [x, height share, variant]; turbine: [x, seconds per turn, phase, size]
  if (tight) {
    const span = W - bandR, nl0 = padX + (padW + 5) * kr, nl1 = bandL - 5;
    needles = span > 300 ? [[0.23, 0.7, 1], [0.47, 1, 2], [0.7, 0.84, 0], [0.92, 0.6, 1]].map((n) => [bandR + span * n[0], n[1], n[2]]) : [[bandR + span * 0.44, 1, 2], [bandR + span * 0.83, 0.7, 1]];
    turbines = span > 300 ? [[bandR + 26, 21, 9, 0.6], [bandR + span * 0.585, 17, 3, 0.4]] : [[bandR + 9, 19, 7, 0.5]];
    if (nl1 - nl0 > 26 * uM) needles.unshift([(nl0 + nl1) / 2 - 3, 0.97, 0]);
  } else {
    needles = [[Lz * 0.11, 0.64, 1], [Lz * 0.43, 0.9, 0], [RzX + Rw * 0.2, 0.72, 2], [RzX + Rw * 0.56, 1, 0], [RzX + Rw * 0.9, 0.56, 1]];
    // a short needle under the phone mockup, in the gap between two vignettes
    if (slots.wheel != null && slots.hub != null && slots.hub - (slots.wheel + 84 * uN) > 24 * uM && (slots.wheel + 84 * uN + slots.hub) / 2 + 2 * uN < RzX - 6 * uM) needles.push([(slots.wheel + 84 * uN + slots.hub) / 2 + 2 * uN, 1, 1]);
    turbines = [[bandL - 12, 17, 3, 0.72], [bandR + 26, 21, 9, 0.72], [RzX + Rw * 0.735, 15, 5, 0.72]];
  }
  // the delivery drone hovers left of the wheelchair vignette: no needle or turbine may stand right behind it
  const droneX = !P && slots.wheel != null ? slots.wheel - 12 * uN : null;
  if (droneX != null) for (const list of [needles, turbines]) for (const n of list) if (Math.abs(n[0] - droneX) < 36 * uN) n[0] = droneX + (n[0] < droneX ? -38 : 38) * uN;
  {
    const bl = row(-8, bandL - 4, cfgBack, rng(21), null), br = row(bandR + 4, W + 8, cfgBack, rng(33), null);
    for (const r of [renderRow(bl, uM, "url(#fv-tb)", lav(0.28), 0.6, 1), renderRow(br, uM, "url(#fv-tb)", lav(0.28), 0.6, 2)]) { mid += r[0]; midA0 += r[1]; }
    for (const n of needles) { const r = needle(n[0], n[1], n[2], false); midS1 += r[0]; midA3 += r[1]; }
    const fl = row(-4, bandL - 10, cfgFront, rng(47), noPad), fr = row(bandR + 10, W + 4, cfgFront, rng(58), null);
    for (const r of [renderRow(fl, uM, "url(#fv-tf)", lav(0.34), 0.9, 3), renderRow(fr, uM, "url(#fv-tf)", lav(0.34), 0.9, 4)]) { midS1 += r[0]; midA1 += r[1]; }
    for (const t of turbines) { const r = turbine(t[0], clamp(rY(1, t[0]) - ceilAt(t[0]) - 4, 46 * uM, 150 * uM) * t[3], t[1], t[2], 0.9); midS2 += r[0]; midA3 += r[1]; }
  }

  // ====================================================================
  // GLIDE-WAY: an elevated rail that tunnels through the mountain (mid layer).
  // Right-bound pods ride on top of the beam, left-bound pods hang beneath it.
  // ====================================================================
  {
    const gyOf = (y) => (y - yOf(0)) / s;
    // grid x of the summit ridge's flank at grid height gy (dir -1: left of the summit, +1: right) -- from a.ridgeY
    const flankX = (gy, dir) => { let g = 720; while (Math.abs(g - 720) < 420 && a.ridgeY(1, g + dir * 4) < gy) g += dir * 4; let lo = g, hi = g + dir * 4; for (let i = 0; i < 12; i++) { const m = (lo + hi) / 2; if (a.ridgeY(1, m) < gy) lo = m; else hi = m; } return (lo + hi) / 2; };
    // tunnel portals: taller than a pod above and below the beam; everything between them is inside the mountain
    const y1 = yT - 14.5 * kp, y2 = yT + 14.5 * kp, prx = 6 * kp, pry = 14.5 * kp;
    const xpL = pxOf(flankX(gyOf(y1), -1)) + 3 * kp, xpR = pxOf(flankX(gyOf(y1), 1)) - 3 * kp;
    let py = "";
    const step = 58 * kp;
    for (let x = xpL - step * 0.8; x > -10; x -= step) py += `M${f(x)},${f(yT)}V${f(rY(1, x) + 2)}`;
    for (let x = xpR + step * 0.8; x < W + 10; x += step) py += `M${f(x)},${f(yT)}V${f(rY(1, x) + 2)}`;
    midS2 += `<path d="${py}" fill="none" stroke="${lav(0.4)}" stroke-width="${f(1.6 * kp)}"/>` +
      `<path d="M-10,${f(yT)}H${f(xpL)}M${f(xpR)},${f(yT)}H${f(W + 10)}" fill="none" stroke="${LAV}" stroke-opacity=".62" stroke-width="${f(1.8 * kp)}"/>` +
      `<path d="M-10,${f(yT)}H${f(xpL - prx)}M${f(xpR + prx)},${f(yT)}H${f(W + 10)}" fill="none" stroke="${AMB}" stroke-opacity=".75" stroke-width="${f(1.1 * kp)}" stroke-dasharray="${f(2 * kp)} ${f(12 * kp)}"/>` +
      `<path d="M${f(xpL)},${f(y1)}A${f(prx)},${f(pry)} 0 0 0 ${f(xpL)},${f(y2)}ZM${f(xpR)},${f(y1)}A${f(prx)},${f(pry)} 0 0 1 ${f(xpR)},${f(y2)}Z" fill="${INK}" fill-opacity=".9" stroke="${lav(0.7)}" stroke-width="${f(Math.max(1.2, 1.1 * kp))}" stroke-linejoin="round"/>`;
    const M = 30 * kp, span = W + 2 * M;
    css.push(`@keyframes fv-gR{from{transform:translateX(${f(-M)}px)}to{transform:translateX(${f(W + M)}px)}}`, `@keyframes fv-gL{from{transform:translateX(${f(W + M)}px)}to{transform:translateX(${f(-M)}px)}}`);
    const pod = (frac, right, dur, fill) => { const x0 = -M + frac * span; return `<g class="fv-veh" transform="translate(${f(x0)} 0)" style="animation-name:fv-g${right ? "R" : "L"};animation-duration:${dur}s;animation-delay:-${f(dur * (right ? frac : 1 - frac))}s"><use href="#fv-pod" fill="${fill}" transform="translate(0 ${f(yT)}) scale(${f(right ? kp : -kp)} ${f(right ? kp : -kp)})"/></g>`; };
    midA2 += (P ? [[0.2, 1, 26, CREAM], [0.86, 0, 34, LAV]] : [[0.14, 1, 34, CREAM], [0.74, 1, 34, PERI], [0.9, 0, 44, LAV], [0.2, 0, 44, CORAL]]).map((p) => pod(p[0], p[1], p[2], p[3])).join("");
    // the mountain swallows the pods at the portals' vertical edges
    midS3 += `<path d="M${f(xpL)},${f(y1 - 1)}H${f(xpR)}V${f(y2 + 1)}H${f(xpL)}Z" fill="${RIDGE1}"/>`;
  }

  // ====================================================================
  // SKY LANES: flying pods that come in over the towers and land behind the skyline (far layer:
  // they sink behind the towers, and finally behind the summit ridge itself -- never fading in open sky)
  // ====================================================================
  if (!tight) {
    const flyer = (id, xEdge, xa, xb, yl, dur, delay, fill, rev) => {
      const dir = xb > xEdge ? 1 : -1, k = uM * 1.25, d = xb - xa, yh = rY(1, xb) + 16 * k, dy = yh - yl, rot = dir * 14;
      css.push(`@keyframes fv-fl${id}{0%{transform:translate(${f(xEdge)}px,${f(yl)}px) rotate(0deg)}52%{transform:translate(${f(xa)}px,${f(yl)}px) rotate(0deg)}66%{transform:translate(${f(xa + d * 0.42)}px,${f(yl + dy * 0.16)}px) rotate(${f(rot)}deg)}86%{transform:translate(${f(xa + d * 0.84)}px,${f(yl + dy * 0.66)}px) rotate(${f(rot)}deg)}100%{transform:translate(${f(xb)}px,${f(yh)}px) rotate(${f(rot * 0.4)}deg)}}`);
      const fx = dir * (rev ? -1 : 1);
      const x0 = xEdge + (xa - xEdge) * 0.62;
      return `<g class="fv-veh" transform="translate(${f(x0)} ${f(yl)})" style="animation-name:fv-fl${id};animation-duration:${dur}s;animation-delay:-${f(delay)}s${rev ? ";animation-direction:reverse" : ""}"><use href="#fv-fly" fill="${fill}" transform="scale(${f(fx * k)} ${f(k)})"/></g>`;
    };
    const gl = rY(1, Lz * 0.5), al = gl - freeTop, gr = rY(1, RzX + Rw * 0.5), ar = gr - freeTop;
    farA += flyer(1, -50, Lz * 0.16, Lz * 0.52, gl - al * 0.8, 23, 5, CREAM, false) +     // both stay left of the rocket's climb-out
      flyer(2, -50, Lz * 0.06, Lz * 0.3, gl - al * 0.62, 29, 21, CORAL, true) +
      flyer(3, W + 50, RzX + Rw * 0.74, RzX + Rw * 0.36, gr - ar * 0.86, 25, 12, LAV, false) +
      flyer(4, W + 50, RzX + Rw * 0.5, RzX + Rw * 0.12, gr - ar * 0.6, 31, 3, WARM, true);
  }

  // ====================================================================
  // ROCKET TO THE MOON (mid layer, in front of the skyline)
  // ====================================================================
  {
    const gy = rY(1, padX) + 4;
    // the pad tower is tall enough that the glide-way passes behind it, below the rocket
    const hp = Math.max(26 * kr, gy - yT + 16 * kp) / kr, padTop = gy - hp * kr;
    const P0 = { x: padX, y: padTop - 18 * kr };
    // It flies TO the moon: a curving climb that ends, much smaller, on the disc's face at the moon base.
    //  gutter: straight up from the pad, then over to the left onto the face;
    //  corner / cap: up the narrow gutter beside the column, then into the limb at the top;
    //  low: the moon stands right behind the pad -- a low fly-away: a short lift, then it banks over and recedes, dwindling,
    //       to the base on the top of the limb. It never climbs far (the page's content is above) and never noses down:
    //       the apex is at most 24 px above the start, the final settle a few px, and the heading stays under 80 degrees.
    const P3 = moonBase, mk = moon.kind;
    let P1, P2;
    if (mk === "low") {
      const apex = Math.max(Math.min(P0.y - 24, P3.y - 6), P3.y - 16);
      let lo = apex - 80, hi = apex;                        // the control height that puts the curve's top exactly at `apex`
      for (let i = 0; i < 16; i++) { const c = (lo + hi) / 2; let top = 1e9; for (let j = 1; j < 24; j++) { const t = j / 24, m = 1 - t; top = Math.min(top, m * m * m * P0.y + 3 * m * t * c + t * t * t * P3.y); } if (top < apex) lo = c; else hi = c; }
      P1 = { x: P0.x, y: hi }; P2 = { x: P0.x + (P3.x - P0.x) * 0.46, y: hi };
    } else if (tight) { P1 = { x: Lz * 0.44, y: P0.y - (P0.y - P3.y) * 0.27 }; P2 = { x: Lz * 0.5, y: P3.y + (P0.y - P3.y) * 0.34 }; }
    else { P1 = { x: P0.x + (P0.x - P3.x) * 0.08, y: P0.y - (P0.y - P3.y) * 0.58 }; P2 = { x: P3.x + (P0.x - P3.x) * 0.6, y: P3.y + (P0.y - P3.y) * 0.05 }; }
    const B = (t) => { const m = 1 - t; return { x: m * m * m * P0.x + 3 * m * m * t * P1.x + 3 * m * t * t * P2.x + t * t * t * P3.x, y: m * m * m * P0.y + 3 * m * m * t * P1.y + 3 * m * t * t * P2.y + t * t * t * P3.y }; };
    const ang = (t) => { const m = 1 - t; const dx = 3 * m * m * (P1.x - P0.x) + 6 * m * t * (P2.x - P1.x) + 3 * t * t * (P3.x - P2.x), dy = 3 * m * m * (P1.y - P0.y) + 6 * m * t * (P2.y - P1.y) + 3 * t * t * (P3.y - P2.y); return clamp(Math.atan2(dx, -dy) * 180 / Math.PI, -78, 78); };
    const shrink = (t) => mk === "low" ? 1 - 0.84 * Math.pow(t, 0.8) : 1 - 0.7 * t;   // it recedes, all the way to the moon
    const pose = (t) => { const p = B(t); return `translate(${f(p.x)}px,${f(p.y)}px) rotate(${f(ang(t))}deg) scale(${Math.round(shrink(t) * 100) / 100})`; };
    const T = 32, N = 16, kf = [], low = `translate(${f(P0.x)}px,${f(P0.y + 46 * kr)}px) rotate(0deg) scale(1)`;
    kf.push(`0%,7%{transform:${pose(0)};opacity:1}`);
    for (let n = 1; n <= N; n++) { const v = n / N, t = Math.pow(v, 1.55); kf.push(`${f(7 + v * 63)}%{transform:${pose(t)};opacity:${n === N ? 0 : n === N - 1 ? 0.6 : 1}}`); }
    // a fresh rocket is raised out of the pad tower (the clip below hides it while it is inside)
    kf.push(`71%{transform:${low};opacity:0}`, `73%{transform:${low};opacity:1}`, `90%,100%{transform:${pose(0)};opacity:1}`);
    css.push(`@keyframes fv-rk{${kf.join("")}}`, `@keyframes fv-burn{0%,5%{opacity:0}8%,69%{opacity:1}70%,100%{opacity:0}}`,
      `.fv-rk{animation:fv-rk ${T}s linear infinite}.fv-burn{animation:fv-burn ${T}s linear infinite}`,
      `.fv-flick{transform-box:fill-box;transform-origin:50% 0%;animation:fv-flick 1.1s ease-in-out infinite alternate}@keyframes fv-flick{from{transform:scaleY(.84)}to{transform:scaleY(1.08)}}`);
    const ts = 0.5, tp = Math.pow(ts, 1.55), sp = B(tp);
    const rocket = `<g class="fv-burn"><path d="M-5.6,17Q-7.6,58 0,96Q7.6,58 5.6,17Z" fill="url(#fv-ex)"/><circle cy="27" r="16" fill="url(#fv-ga)"/><path class="fv-flick" d="M-5,17Q-4,34 0,49Q4,34 5,17Z" fill="${AMB}"/><path d="M-2.4,17Q-1.7,26 0,33Q1.7,26 2.4,17Z" fill="${WARM}"/></g>` +
      `<path d="M-7,5L-13.5,18L-7,15ZM7,5L13.5,18L7,15Z" fill="${CORAL}"/>` +
      `<path d="M0,-24C6,-17 7.2,-8 7.2,2V17H-7.2V2C-7.2,-8 -6,-17 0,-24Z" fill="${CREAM}" stroke="#4a4599" stroke-width=".8"/>` +
      `<path d="M0,-24C3.6,-19.6 5.2,-15.6 6.2,-11.4H-6.2C-5.2,-15.6 -3.6,-19.6 0,-24Z" fill="${AMB}"/>` +
      `<circle cy="-3.4" r="3" fill="${INK}" stroke="${CY2}" stroke-width="1.3"/><path d="M-7.2,8.4H7.2" stroke="${PERI}" stroke-width="2.2"/>`;
    // gantry
    midS3 += (tight ? "" : `<path transform="translate(${f(padX)} ${f(padTop)}) scale(${f(kr)})" d="M-15.4,0V-37M-11.8,0V-37M-15.4,-1L-11.8,-7L-15.4,-13L-11.8,-19L-15.4,-25L-11.8,-31L-15.4,-37M-11.8,-13H-7.4M-11.8,-28H-6.2" fill="none" stroke="${lav(0.75)}" stroke-width="1"/>`) +
      // pad tower: the rocket stands on its deck; a fresh one is raised out of it (see the clip below)
      `<g transform="translate(${f(padX)} ${f(gy)}) scale(${f(kr)})"><path d="M${-(padW + 3)},1.5L${-padW},${f(-hp)}H${padW}L${padW + 3},1.5Z" fill="#48438f" stroke="${lav(0.5)}" stroke-width=".7"/><path d="M${-(padW + 1.6)},${f(-hp)}H${padW + 1.6}" stroke="${LAV}" stroke-width="1.8" stroke-linecap="round"/><path d="M${-(padW - 3.4)},${f(-hp + 6.4)}H${padW - 3.4}M${-(padW - 2.8)},${f(-hp + 13)}H${padW - 2.8}" fill="none" stroke="${AMB}" stroke-opacity=".9" stroke-width="2.7" stroke-dasharray="3.2 2.1"/>${P ? "" : `<path d="M${-(padW - 1)},-4.6H${padW - 1}" stroke="${CY2}" stroke-opacity=".7" stroke-width="1.1" stroke-dasharray="4.6 3"/>`}</g>`;
    midA3 += (tight ? "" : `<circle class="fv-bead" cx="${f(padX - 13.6 * kr)}" cy="${f(padTop - 39.4 * kr)}" r="${f(1.6 * kr)}" fill="${AMB}"/>`) +
      // nothing of the rocket shows below the deck (a plain rectangle clip)
      `<clipPath id="fv-pc"><rect x="-60" y="-300" width="${f(W + 120)}" height="${f(padTop + 300)}"/></clipPath>` +
      `<g clip-path="url(#fv-pc)"><g class="fv-rk" transform="translate(${f(sp.x)} ${f(sp.y)}) rotate(${f(ang(tp))}) scale(${f(shrink(tp))})"><g transform="scale(${f(kr)})">${rocket}</g></g></g>`;
  }

  // ====================================================================
  // FOREGROUND FIGURES (local units, feet at y = 0)
  // ====================================================================
  const eyes = (kind, cy, delay, cx) => {
    cx = cx == null ? 1 : cx;
    const d = kind === "happy" ? `M${cx - 5.4},${cy + 0.9}q1.9,-3.2 3.8,0M${cx + 1.6},${cy + 0.9}q1.9,-3.2 3.8,0`
      : kind === "up" ? `M${cx - 2.6},${cy - 1.8}h.01M${cx + 4.2},${cy - 1.8}h.01`
        : `M${cx - 3.4},${cy}h.01M${cx + 3.4},${cy}h.01`;
    return `<path class="fv-eye" style="animation-delay:-${delay}s" d="${d}" fill="none" stroke="${AMB}" stroke-width="${kind === "happy" ? 2 : 3.3}" stroke-linecap="round"/>`;
  };
  const arm = (d, cls) => `<path${cls ? ` class="${cls}"` : ""} d="${d}" fill="none" stroke="#8f89e6" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>`;
  // cairn-bot. kind: walk | roll | hover.  o: {eyes, delay, arms (markup), extra (markup), cheeks, tall (a third pebble)}
  const bot = (kind, o) => {
    const core = `<use href="#fv-bot"/>` + eyes(o.eyes || "dot", -27, o.delay || 0) +
      (o.cheeks ? `<path d="M-4.6,-24.3h.01M6.6,-24.3h.01" fill="none" stroke="${CORAL}" stroke-width="2.3" stroke-linecap="round"/>` : "") + (o.arms || "") + (o.extra || "");
    const body = o.tall ? `<rect x="-13" y="-11.6" width="26" height="12.6" rx="6" fill="${SHADE}"/><g transform="translate(0 -8.6)">${core}</g>` : core;
    if (kind === "walk") return `<path d="M-8.6,-1.7h5.2M3.4,-1.7h5.2" stroke="${SHADE}" stroke-width="3.6" stroke-linecap="round"/>` + body;
    if (kind === "roll") return `<circle cx="0" cy="-4.8" r="4.8" fill="${INK}" stroke="${PERI}" stroke-width="1.7"/><g transform="translate(0 -5.6)">${body}</g>`;
    return `<ellipse cx="0" cy="-.6" rx="9" ry="1.8" fill="#0b0b18" fill-opacity=".35"/><g class="fv-bob" style="animation-delay:-${o.delay || 0}s"><g transform="translate(0 -10)"><ellipse cx="0" cy="-1.4" rx="9.5" ry="3.6" fill="url(#fv-gc)"/>${body}</g></g>`;
  };
  // student, facing right.  o.face: undefined = eye + smile, "smile" = smile only (visor), false = none
  const person = (o) => {
    const hx = 0.8, hy = -46.6, hc = o.hairC || INK, sk = o.skin;
    let pre = "", post = "";
    const short = `M${hx - 5.9},${hy + 1.6}A6,6 0 0 1 ${hx + 5},${hy - 3.3}Q${hx + 1.5},${hy - 1.9} ${hx - 2},${hy - 2.1}Q${hx - 3.6},${hy + 0.6} ${hx - 5.9},${hy + 1.6}Z`;
    if (o.hair === "afro") pre = `<circle cx="${hx - 1.1}" cy="${hy - 1.9}" r="8.3" fill="${hc}"/>`;
    else if (o.hair === "long") pre = `<path d="M${hx - 6.2},${hy - 1}a6.2,6.2 0 0 1 11.6,-2.6l-3.2,1.6l-1.4,11h-6.6Z" fill="${hc}"/>`;
    else if (o.hair === "hijab") post = `<path d="M${hx - 7.4},${hy}a6.9,6.9 0 1 1 13.8,0q0,4.6 -2.6,7.2l2.6,5.6h-13l2.2,-5.4q-3,-2.6 -3,-7.4Z" fill="${hc}"/><ellipse cx="${hx + 1.9}" cy="${hy + 0.5}" rx="3.5" ry="4.3" fill="${sk}"/>`;
    else if (o.hair === "pony") post = `<path d="${short}M${hx - 4.6},${hy - 2.6}q-7,0 -6.2,9.4q2.6,-3.8 4.8,-4.6Z" fill="${hc}"/>`;
    else if (o.hair === "bun") post = `<path d="${short}${circ(hx - 4.9, hy - 6.3, 3)}" fill="${hc}"/>`;
    else if (o.hair === "cap") post = `<path d="M${hx - 5.8},${hy - 1.6}a5.9,5.9 0 0 1 11.2,-1.2l4.4,1v1.6h-15.4Z" fill="${hc}"/>`;
    else post = `<path d="${short}" fill="${hc}"/>`;
    const fx = o.hair === "hijab" ? hx + 0.5 : hx;
    if (o.face !== false) post += `<path d="${o.face === "smile" ? "" : `M${f(fx + 2.9)},${f(hy - 0.3)}h.01`}M${f(fx + 1.3)},${f(hy + 2.2)}q1.7,1.5 3.1,-.2" fill="none" stroke="#3f2a45" stroke-width="1.25" stroke-linecap="round"/>`;
    const st = (d, c, w, cls) => `<path${cls ? ` class="${cls}"` : ""} d="${d}" fill="none" stroke="${c}" stroke-width="${w}" stroke-linecap="round" stroke-linejoin="round"/>`;
    const upper = (o.pack ? `<rect x="-11.6" y="-39.6" width="7.2" height="15.6" rx="3.3" fill="${o.pack}"/>` : "") +
      (o.armB ? st(o.armB, o.shirt, 3.4) : "") +
      `<rect x="-6.4" y="-40.4" width="12.8" height="21.4" rx="5.4" fill="${o.shirt}"/>` + pre + `<circle cx="${hx}" cy="${hy}" r="5.6" fill="${sk}"/>` + post +
      (o.armF ? st(o.armF, o.shirt, 3.4, o.armC) : "") + (o.up || "");
    return (o.pre || "") + (o.legs !== "" ? st(o.legs || "M-2.6,-21L-3.2,-1.9M2.6,-21L3.4,-1.9", o.pants || INK, 4.7) : "") +
      (o.dy || o.lean ? `<g transform="translate(0 ${o.dy || 0}) rotate(${o.lean || 0} 0 -20)">${upper}</g>` : upper) + (o.post || "");
  };
  const SK = ["#f3cba8", "#d9a273", "#a8734d", "#e7b88d"];
  const tablet = (x, y, rot) => `<circle cx="${x + 3}" cy="${y + 4}" r="10" fill="url(#fv-gc)"/><rect x="${x}" y="${y}" width="6.4" height="9" rx="1.3" fill="${CY}" transform="rotate(${rot} ${x + 3} ${y + 4})"/>`;
  const tree = (h, r) => `<path d="M0,1V${-h}M0,${f(-h * 0.5)}l${f(r * 0.6)},${f(-r * 0.6)}" fill="none" stroke="#8f89e6" stroke-width="2.2" stroke-linecap="round"/><path d="${circ(0, -h - r * 0.6, r)}${circ(r * 0.8, -h + r * 0.1, r * 0.66)}${circ(-r * 0.75, -h + r * 0.2, r * 0.6)}" fill="#6a63c2" stroke="${lav(0.4)}" stroke-width=".8"/><path d="M${f(-r * 0.4)},${f(-h - r)}h.01M${f(r * 0.5)},${f(-h - r * 0.3)}h.01M${f(-r * 0.8)},${f(-h + r * 0.1)}h.01M${f(r * 0.9)},${f(-h + r * 0.4)}h.01M${f(r * 0.1)},${f(-h - r * 0.2)}h.01" fill="none" stroke="${CORAL}" stroke-width="2.4" stroke-linecap="round"/>`;

  // place on the nearest ridge
  const put = (px, inner, flip, k) => { const sc = uN * (k || 1); return `<g transform="translate(${f(px)} ${f(rY(2, px) + 1.5)}) scale(${f(flip ? -sc : sc)} ${f(sc)})">${inner}</g>`; };

  // --- the cast ---
  const sPointer = person({ skin: SK[3], hair: "hijab", hairC: CORAL, shirt: CREAM, pants: "#6d67c4", pack: AMB,
    armB: "M-2,-36L4,-28L9.6,-30", armF: "M4.6,-37L10.6,-47L15,-56.6", up: `<circle cx="15.6" cy="-58.2" r="1.9" fill="${SK[3]}"/>` + tablet(8.4, -35.6, -12) });
  const sScope = person({ skin: SK[2], hair: "afro", shirt: PERI, pants: INK, lean: 10, armF: "M4.4,-36.6L11,-39L16,-45.4" });
  const scope = `<path d="M26,-51L18,0M26,-51L35,0M26,-51V-3" fill="none" stroke="${lav(0.75)}" stroke-width="1.7" stroke-linecap="round"/><path d="M12.6,-42.6L43,-67" stroke="${LAV}" stroke-width="5.4" stroke-linecap="round"/><path d="M35,-60.6L44.4,-68.2" stroke="${CREAM}" stroke-width="8" stroke-linecap="round"/><circle class="fv-pulse" cx="46.6" cy="-70" r="2.6" fill="${CY}"/>`;
  const bLook = bot("roll", { eyes: "up", delay: 2, cheeks: true, arms: arm("M-12,-14q-4,3 -3,8") + arm("M11.6,-15.4L17,-24L19.6,-31", "fv-waveR") });
  const sKneel = person({ skin: SK[2], hair: "short", shirt: LAV, pants: "#6d67c4", dy: 12.6, lean: 12, legs: "M2,-8.6L11,-12.6L11,-1.9M-2,-8.2L3.4,-1.9L-9,-1.9",
    armF: "M4.4,-36L13,-31.4L19.6,-34", armC: "fv-nudge", up: `<path class="fv-nudge" d="M19,-35.4L25.4,-40" stroke="${CREAM}" stroke-width="1.8" stroke-linecap="round"/><circle class="fv-pulse" cx="26.4" cy="-41" r="2.2" fill="${CY2}"/>` });
  const miniRocket = `<path d="M-10,0L-5.4,-8.6H5.4L10,0M-13,0H13" fill="none" stroke="${lav(0.8)}" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/><path d="M-7,-19L-13.4,-7.6L-7,-10.4Z" fill="${CORAL}"/><path d="M0,-52C5.6,-45.6 7.2,-37 7.2,-28V-9H-7.2V-28C-7.2,-37 -5.6,-45.6 0,-52Z" fill="${CREAM}"/><path d="M0,-52C3.6,-47.6 5.2,-43.6 6.2,-39.4H-6.2C-5.2,-43.6 -3.6,-47.6 0,-52Z" fill="${AMB}"/><circle cy="-31" r="2.9" fill="${INK}" stroke="${CY2}" stroke-width="1.3"/><path d="M-7.2,-21.4H7.2" stroke="${PERI}" stroke-width="2.2"/>`;
  const bFin = bot("walk", { eyes: "happy", delay: 1, arms: arm("M-12,-14q-4,3 -3,8") + `<g class="fv-waveR">${arm("M11.6,-15L19.4,-22.6")}<path d="M18.4,-21.4L23.6,-34.4L27,-22.4Z" fill="${CORAL}"/></g>` });
  const sTablet = person({ skin: SK[0], hair: "bun", shirt: CORAL, pants: INK, armF: "M4.4,-36L9,-29L13,-31",
    up: tablet(11.6, -38.6, -10) + `<g class="fv-bob"><path d="M15,-76H33V-55H15Z" fill="${CY}" fill-opacity=".14" stroke="${CY}" stroke-opacity=".7" stroke-width=".9"/><path d="M24,-72.6C26.6,-69.6 27,-66 27,-63V-59.4H21V-63C21,-66 21.4,-69.6 24,-72.6ZM21,-61.6L18.6,-58.4M27,-61.6L29.4,-58.4" fill="none" stroke="${CY}" stroke-width="1.1" stroke-linejoin="round"/><path d="M16,-55L14.6,-44M32,-55L17.6,-44" stroke="${CY}" stroke-opacity=".25" stroke-width=".8"/></g>` });
  const sPlant = person({ skin: SK[1], hair: "afro", shirt: AMB, pants: INK, armF: "M4.4,-36L10,-28.6L12.4,-23", post: `<path d="M13.4,-33L11.6,-1M9,-3.6h5.6l-1,5h-3.6Z" fill="${CREAM}" stroke="${CREAM}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>` });
  const bWater = bot("walk", { eyes: "happy", delay: 3.4, tall: true, arms: arm("M-12,-14q-4,3 -3,8") + `<g class="fv-tip">${arm("M11.6,-15L18,-19.6")}<path d="M17,-27.4h9.4v9h-9.4ZM26.4,-24.4L33.4,-28.6" fill="${AMB}" stroke="${AMB}" stroke-width="1.8" stroke-linejoin="round" stroke-linecap="round"/></g><path class="fv-water" d="M34.4,-27.6q3.4,4.4 4.4,11" fill="none" stroke="${CY2}" stroke-width="1.9" stroke-linecap="round" stroke-dasharray="0.1 3.6"/>` });
  const sWheel = person({ skin: SK[1], hair: "long", shirt: CREAM, pants: "#6d67c4", dy: 9, legs: "M0,-12.4L10,-12.4L11.6,-2.6", face: "smile",
    pre: `<path d="M-7.6,-28V-9.6M-7.6,-27.6h-4" fill="none" stroke="${lav(0.8)}" stroke-width="2" stroke-linecap="round"/>`,
    armF: "M4.4,-36L12,-32L18.4,-37.6", up: `<path d="M-.6,-47.6h7.6" stroke="${CY2}" stroke-width="2.6" stroke-linecap="round"/>`,
    post: `<circle cx="-1.6" cy="-8.8" r="8.6" fill="${INK}" fill-opacity=".35" stroke="${LAV}" stroke-width="1.9"/><circle cx="-1.6" cy="-8.8" r="1.7" fill="${LAV}"/><circle cx="11.6" cy="-2.2" r="2.2" fill="${LAV}"/>` +
      `<g class="fv-bob"><path d="M23,-64L45,-67V-41L23,-39Z" fill="${CY}" fill-opacity=".14" stroke="${CY}" stroke-opacity=".7" stroke-width=".9"/><path d="M26.6,-45L30.6,-52L34.6,-49L41,-60" fill="none" stroke="${CY}" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"/><circle cx="41" cy="-60" r="1.9" fill="${AMB}"/></g>` });
  const bBooks = bot("hover", { eyes: "happy", delay: 1.6, cheeks: true, arms: arm("M10,-13L16,-9.6M-11,-13L-2,-8"), extra: `<path d="M12,-13.4h13M13,-17.6h11M12.6,-21.8h12" fill="none" stroke-width="3.7" stroke-linecap="round" stroke="${AMB}"/><path d="M13,-17.6h11" stroke="${CORAL}" stroke-width="3.7" stroke-linecap="round"/><path d="M12.6,-21.8h12" stroke="${CREAM}" stroke-width="3.7" stroke-linecap="round"/>` });
  const sLaptop = person({ skin: SK[0], hair: "pony", shirt: WARM, pants: INK, dy: 9.6, legs: "M0,-11.6L9,-11.6L10,-1.9",
    pre: `<path d="M-9,-11H9M-6,-11V0M6.6,-11V0" fill="none" stroke="${lav(0.75)}" stroke-width="2.1" stroke-linecap="round"/>`, armF: "M4.4,-36L9.4,-28L12.4,-26.6",
    post: `<circle cx="14" cy="-20" r="10" fill="url(#fv-gc)"/><path d="M8.6,-13.6h8.4" stroke="${LAV}" stroke-width="1.7" stroke-linecap="round"/><path d="M17,-13.8L19.6,-23.2" stroke="${CY}" stroke-width="2.3" stroke-linecap="round"/>` });
  // low solar carport with a charging pod, lights off (origin: left post), 80 wide
  const carport = `<path d="M3,0V-41M67,0V-50" fill="none" stroke="${lav(0.75)}" stroke-width="2.3" stroke-linecap="round"/><path d="M-5,-39.8L73,-50.6V-55.6L-5,-44.8Z" fill="#35317a" stroke="${lav(0.6)}" stroke-width="1"/><path d="M10.6,-46.8v5M26.2,-49v5M41.8,-51.2v5M57.4,-53.4v5" stroke="${lav(0.45)}" stroke-width=".9"/>` +
    `<path class="fv-glint" style="--fv-dx:56px;--fv-dy:-7.8px" d="M-2,-45.6L15,-48" fill="none" stroke="${CY}" stroke-width="2" stroke-linecap="round" opacity=".85"/>` +
    `<use href="#fv-car0" fill="${LAV}" transform="translate(32 -3.4)"/><rect x="64.4" y="-25" width="5.2" height="12" rx="2" fill="${INK}" stroke="${CY2}" stroke-width="1"/><path class="fv-pulse" d="M64.4,-18Q58,-4 61.4,-9.4" fill="none" stroke="${CY2}" stroke-width="1.7" stroke-linecap="round"/><circle class="fv-pulse" cx="67" cy="-20" r="6" fill="url(#fv-gc)"/>`;
  // learning hub (origin: bottom-left), 112 wide, hh tall (it grows when the glide-way would otherwise pass through the bots on its roof)
  const hub = (hh) => {
    const bal = `<g transform="translate(21 -47.4) scale(.66)">${bot("walk", { eyes: "happy", delay: 4, arms: arm("M-12,-14q-4,3 -3,8") + arm("M11.6,-15.4L17,-24L19.6,-31", "fv-waveR") })}</g>`;
    return `<path d="M0,6V${f(-hh + 34)}Q0,${f(-hh)} 34,${f(-hh)}H98Q112,${f(-hh)} 112,${f(-hh + 14)}V6Z" fill="url(#fv-hb)" stroke="${lav(0.5)}" stroke-width="1"/>` +
      `<path d="M9,-3V-30Q9,-38 17,-38H38Q46,-38 46,-30V-3Z" fill="${AMB}" fill-opacity=".85"/><path d="M21.4,-38V-3M33.6,-38V-3M9,-21H46" fill="none" stroke="#2b2862" stroke-width="1.5"/>` +
      `<path d="M58,-30H104M58,-12H104${hh > 106 ? "M58,-66H104" : ""}" fill="none" stroke="${AMB}" stroke-opacity=".88" stroke-width="9" stroke-dasharray="10 4.4 10 4.4 10 30"/>` +
      `<path class="fv-tw" d="M58,-48H104" fill="none" stroke="${AMB}" stroke-opacity=".88" stroke-width="9" stroke-dasharray="10 18.8 10 4.4"/>` +
      `<circle class="fv-pulse" cx="82" cy="${f(-hh + 20)}" r="15" fill="url(#fv-gc)"/><path d="M75,${f(-hh + 26.4)}h14M76.4,${f(-hh + 20.4)}h11.2M78.4,${f(-hh + 14.6)}h7.2" fill="none" stroke="${CY}" stroke-width="4.2" stroke-linecap="round"/>` +
      bal + `<path d="M-7,-46.6H50V-42.6H-7Z" fill="#3d3987" stroke="${lav(0.55)}" stroke-width=".8"/><path d="M-5,-47V-57H48V-47M9,-57V-47M22,-57V-47M35,-57V-47" fill="none" stroke="${lav(0.6)}" stroke-width="1.1"/>` +
      `<g transform="translate(50 ${f(-hh + 1)})">${tree(10, 7)}</g>` +
      // two cairn-bots watching the sky together from the roof
      `<g transform="translate(78 ${f(-hh)}) scale(.56)">${bot("walk", { eyes: "up", delay: 2.6, arms: arm("M-12,-14q-4,3 -3,8M12,-14q5,2 8,-1") })}<g transform="translate(29 0) scale(-1 1)">${bot("walk", { eyes: "happy", delay: 0.7, cheeks: true, arms: arm("M-12,-14q-4,3 -3,8M12,-14q5,2 8,-1") })}</g><path class="fv-bob" d="M14.5,-52C8.5,-57 10.6,-63 14.5,-59.6C18.4,-63 20.5,-57 14.5,-52Z" fill="${CORAL}"/></g>`;
  };
  // delivery drone (2-pebble bot with ring rotors and a parcel), origin at body bottom
  const drone = (delay) => `<g class="fv-bob" style="animation-delay:-${delay}s"><path d="M-10,-12L-19,-17M10,-12L19,-17" stroke="${PERI}" stroke-width="2.2" stroke-linecap="round"/><ellipse class="fv-rotor" cx="-20" cy="-19" rx="9" ry="2.3" fill="${LAV}" fill-opacity=".5" stroke="${LAV}" stroke-width=".9"/><ellipse class="fv-rotor" style="animation-delay:-.4s" cx="20" cy="-19" rx="9" ry="2.3" fill="${LAV}" fill-opacity=".5" stroke="${LAV}" stroke-width=".9"/>` +
    `<rect x="-11" y="-17" width="22" height="17" rx="8" fill="${LAV}"/><rect x="-8" y="-14" width="16" height="10.4" rx="5.1" fill="${INK}"/><rect x="-6" y="-23" width="12" height="6.6" rx="3.1" fill="${PERI}"/><path d="M0,-23L1.2,-27.6" stroke="${PERI}" stroke-width="1.5" stroke-linecap="round"/><circle cx="1.4" cy="-29.2" r="2.1" fill="${AMB}"/>` +
    `${eyes("happy", -8.8, delay, 0)}<path d="M-4,0V6M4,0V6" stroke="${PERI}" stroke-width="1.3"/><rect x="-7.4" y="6" width="14.8" height="11.4" rx="2" fill="${WARM}"/><path d="M0,6V17.4M-7.4,11.6H7.4" stroke="${CORAL}" stroke-width="1.7"/></g>`;

  // ---------- lay the vignettes out on the nearest ridge (positions planned above, in `slots`) ----------
  {
    const u = uN;
    const V = {
      // the bot and the student look up at the rocket together; mirrored when the launch is to their left
      point: (x) => tight ? put(x + 48 * u, bLook, true) + put(x + 14 * u, sPointer, true) : put(x + 12 * u, bLook) + put(x + 46 * u, sPointer),
      scope: (x) => put(x + 10 * u, sScope + scope),
      port: (x) => { const b = rYlow(2, x, x + 76 * u) + 1.5; return `<g transform="translate(${f(x + 4 * u)} ${f(b)}) scale(${f(u)})">${carport}</g>`; },
      desk: (x) => put(x + 12 * u, sLaptop),
      build: (x) => put(x + 12 * u, sKneel) + put(x + 42 * u, miniRocket, false, 0.86) + put(x + 68 * u, bFin, true, 0.94) + (P ? "" : put(x + 98 * u, sTablet, true)),
      garden: (x) => put(x + 6 * u, sPlant) + put(x + 28 * u, tree(14, 7.6)) + put(x + 67 * u, bWater, true, 0.9),
      wheel: (x) => { const dx = droneX, dy = Math.max(rY(2, dx) - 108 * u, (mock && dx < mock.x + mock.w + 30 * u ? mock.y + mock.h : colB) + 12 + 24 * u);
        return put(x + 12 * u, sWheel) + put(x + 70 * u, bBooks, true, 0.94) + `<g class="fv-drift"><g transform="translate(${f(dx)} ${f(dy)}) scale(${f(u * 0.86)})">${drone(2)}</g></g>`; },
      hub: (x) => { const b = rYlow(2, x, x + 112 * u) + 1.5, need = (b - yT + 16 * kp) / u, hh = need > 90 && need < 128 ? need : 90; return `<g transform="translate(${f(x + 2 * u)} ${f(b)}) scale(${f(u)})">${hub(hh)}</g>`; },
    };
    for (const key of ["scope", "port", "point", "desk", "build", "wheel", "hub", "garden"]) if (slots[key] != null) near += V[key](slots[key]);
    if (P) {
      // the delivery drone commutes in over the right-hand city and hovers beside the summit for a while
      const hx = a.peak.x + 58, hy = colB + 27, k = u * 0.8, off = W + 44 - hx;
      css.push(`@keyframes fv-dfly{0%,100%{transform:translate(${f(off)}px,-9px)}22%,62%{transform:translate(0,0)}84%{transform:translate(${f(off)}px,-9px)}}.fv-dfly{animation:fv-dfly 26s ease-in-out -8s infinite}`);
      near += `<g class="fv-dfly"><g transform="translate(${f(hx)} ${f(hy)}) scale(${f(k)})">${drone(1)}</g></g>`;
    } else if (slots.wheel != null) css.push(`@keyframes fv-drift{0%,100%{transform:translate(0,0)}50%{transform:translate(${f(-10 * u)}px,${f(5 * u)}px)}}.fv-drift{animation:fv-drift 13s ease-in-out infinite}`);
  }

  // ====================================================================
  // BOULEVARD: two lanes of hover-cars, slipping under the trailhead knoll
  // ====================================================================
  {
    const yt = H - 35 * kc, yb = H - 1.5 * kc, yA = H - 21 * kc, yB = H - 5.5 * kc, M = 90 * kc, span = W + 2 * M;
    nearRoad += `<path d="M-4,${f(yt)}H${W + 4}V${f(yb)}H-4Z" fill="#2e2b5c"/><path d="M-4,${f(yt)}H${W + 4}M-4,${f(yb)}H${W + 4}" fill="none" stroke="${lav(0.28)}" stroke-width="1.2"/>` +
      `<path d="M-4,${f(H - 16 * kc)}H${W + 4}" stroke="${AMB}" stroke-opacity=".42" stroke-width="${f(1.4 * kc)}" stroke-dasharray="${f(9 * kc)} ${f(11 * kc)}"/>`;
    css.push(`@keyframes fv-R{from{transform:translateX(${f(-M)}px)}to{transform:translateX(${f(W + M)}px)}}`, `@keyframes fv-L{from{transform:translateX(${f(W + M)}px)}to{transform:translateX(${f(-M)}px)}}`);
    const car = (sym, fill, frac, right, dur, y, k) => { const x0 = -M + frac * span; return `<g class="fv-veh" transform="translate(${f(x0)} 0)" style="animation-name:fv-${right ? "R" : "L"};animation-duration:${dur}s;animation-delay:-${f(dur * (right ? frac : 1 - frac))}s"><use href="#fv-${sym}" fill="${fill}" transform="translate(0 ${f(y)}) scale(${f(right ? k : -k)} ${f(k)})"/></g>`; };
    // three or four vehicles per lane, evenly phased, so each side of the knoll always has traffic
    const A = P ? [["car", LAV, 0.1], ["bus", CREAM, 0.44], ["car", CORAL, 0.77]] : [["car", LAV, 0.1], ["bus", CREAM, 0.36], ["car", CORAL, 0.6], ["car", PERI, 0.86]];
    const Bn = P ? [["car", WARM, 0.27], ["car", PERI, 0.6], ["car", CREAM, 0.93]] : [["car", WARM, 0.22], ["bus", PERI, 0.6], ["car", CREAM, 0.93]];
    nearCars += A.map((c) => car(c[0], c[1], c[2], true, P ? 21 : 27, yA, kc * 0.92)).join("") + Bn.map((c) => car(c[0], c[1], c[2], false, P ? 15 : 19, yB, kc)).join("");
    // a spur of the foothill carries the trail across the boulevard: cars slip under it
    const c0 = a.climb[0], c1 = a.climb[1], yc = yt - 13 * kc, ye = H + 2;
    const tx = c1.y >= yc + 2 ? c1.x : c0.x + (c1.x - c0.x) * (c0.y - (yc + 2)) / (c0.y - c1.y);
    const xa = Math.min(tx, c0.x) - 7 * kc, xb = Math.max(tx, c0.x) + 7 * kc, sl = 24 * kc;
    const hump = `M${f(xa - sl)},${f(ye)}C${f(xa - sl * 0.45)},${f(ye)} ${f(xa - sl * 0.55)},${f(yc)} ${f(xa)},${f(yc)}H${f(xb)}C${f(xb + sl * 0.55)},${f(yc)} ${f(xb + sl * 0.45)},${f(ye)} ${f(xb + sl)},${f(ye)}`;
    nearCars += `<path d="${hump}Z" fill="${RIDGE2}" stroke="${lav(0.3)}" stroke-width="1.2"/>`;
  }

  // ====================================================================
  // ON THE TRAIL (top layer): the student walking her trail -- a girl with a ponytail, pack and pole --
  // her robot pup trotting ahead, and the hover-bot (a levitating cairn) floating at her shoulder.
  // The same two robots stand among the trail friends further down the page.
  // ====================================================================
  {
    const c1 = a.climb[1], c2 = a.climb[2], len = Math.hypot(c2.x - c1.x, c2.y - c1.y), slope = Math.atan2(c2.y - c1.y, c2.x - c1.x) * 180 / Math.PI;
    const at = (t) => ({ x: c1.x + (c2.x - c1.x) * t, y: c1.y + (c2.y - c1.y) * t });
    const c3 = a.climb[3], yU = (x) => c2.y + (c3.y - c2.y) * clamp((c2.x - x) / (c2.x - c3.x), 0, 1);   // the next switchback above
    // she walks just right of the switchback corner above (most headroom), the pup a pole's length ahead, both along the
    // upper edge of the path (feet and pole stay clear of the trail's dots: `lift`); the hover-bot floats behind her, off the path
    // (both are sized to the headroom under the next switchback, so they never touch its dots)
    const lift = 3.6, tg = 0.27, h = at(tg), k = Math.min(uN * (P ? 0.86 : 0.8), (h.y - lift - yU(h.x) - 6) / 53.5), kh = uN * (P ? 0.96 : 0.94);   // the hover-bot: as large as the other foreground robots
    const dg = at(tg + 48 * k / len), sl = slope * Math.PI / 180, kd = Math.min(k * 0.94, (dg.y - lift - yU(dg.x + 4 * k) - 6) / (32.4 * Math.cos(sl) - 15 * Math.sin(sl)));
    const hx = h.x - 13 * k - 21.5 * kh, hb = { x: hx, y: at((hx - c1.x) / (c2.x - c1.x)).y - 5 * kh };
    // --- the hover-bot: three glossy cream pebbles hanging in the air, amber-eyed face panel, antenna, amber band ---
    const hover = `<ellipse cx="0" cy="-1" rx="12.5" ry="3.3" fill="url(#fv-gh)"/>` +
      `<g class="fv-bob" style="animation-duration:4.6s">` +
      `<rect class="fv-brB" x="-7.6" y="-14.4" width="15.2" height="8.4" rx="4.2" fill="url(#fv-pb)"/>` +
      `<rect x="-12.6" y="-33.6" width="25.2" height="16.8" rx="8.4" fill="url(#fv-pb)"/>` +
      `<path d="M-12.3,-24.4Q0,-20.8 12.3,-24.4" fill="none" stroke="${AMB}" stroke-width="1.5"/>` +
      `<path d="${circ(-16, -23.4, 2.7)}${circ(16.2, -26.6, 2.7)}" fill="#f8f6ff"/>` +
      // the head pebble (it breathes up and down a little): face panel, amber eyes and smile, coral cheeks, lavender antenna stalk, amber ball
      `<g class="fv-brH"><rect x="-10" y="-51.6" width="21.4" height="15" rx="7.3" fill="url(#fv-pb)"/><rect x="-6.4" y="-48.8" width="15.6" height="9.4" rx="4.5" fill="${INK}"/>` +
      `<path class="fv-eye" style="animation-delay:-2.2s" d="M-1.8,-45.2h.01M5.2,-45.2h.01" fill="none" stroke="${AMB}" stroke-width="2.9" stroke-linecap="round"/>` +
      `<path d="M-4.2,-42.2h.01M7,-42.2h.01" stroke="${CORAL}" stroke-width="1.9" stroke-linecap="round"/>` +
      `<path d="M1.4,-51.6L2.6,-56" stroke="${PERI}" stroke-width="1.3" stroke-linecap="round"/>` +
      `<path d="M.2,-42.3q1.5,1.5 3,0Z${circ(3, -57.6, 1.75)}" fill="${AMB}" stroke="${AMB}" stroke-width=".9" stroke-linejoin="round"/>` +
      `<path d="M-8.3,-45.6Q-7.9,-49.3 -4.2,-50.3" fill="none" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/></g>` +
      `</g>`;
    // --- the robot pup: a lavender pebble on four stub legs, floppy ears, antenna tail, amber collar and tag ---
    const rr = (x, y, w, hh, r) => `M${x + r},${y}h${f(w - 2 * r)}a${r},${r} 0 0 1 ${r},${r}v${f(hh - 2 * r)}a${r},${r} 0 0 1 ${-r},${r}h${f(2 * r - w)}a${r},${r} 0 0 1 ${-r},${-r}v${f(2 * r - hh)}a${r},${r} 0 0 1 ${r},${-r}Z`;
    const dog = `<path d="${rr(-6.6, -9, 3.6, 8.4, 1.6)}${rr(9.6, -9, 3.6, 8.4, 1.6)}${rr(-11.2, -2.8, 5.8, 2.8, 1.3)}${rr(5, -2.8, 5.8, 2.8, 1.3)}" fill="${SHADE}"/>` +
      `<path d="${rr(-10.6, -9, 3.8, 6.6, 1.6)}${rr(5.6, -9, 3.8, 6.6, 1.6)}" fill="${PERI}"/>` +
      `<g class="fv-trot"><g class="fv-wag"><path d="M-12.6,-15.6L-14.3,-22.6" stroke="${PERI}" stroke-width="1.5" stroke-linecap="round"/><circle cx="-14.6" cy="-24.2" r="2.1" fill="${AMB}"/></g>` +
      `<rect x="-14.2" y="-18.8" width="25.4" height="12.2" rx="6.1" fill="${LAV}"/>` +
      `<path d="M-13.7,-11.4Q-12.4,-6.6 -8.1,-6.6H5.1Q9.6,-6.6 10.9,-11.6Q5,-8.9 -1.5,-8.9Q-8,-8.9 -13.7,-11.4ZM10.4,-26.6Q9.2,-34.8 14.6,-34.4Q18.4,-33.8 17.6,-26.6Z" fill="${PERI}"/>` +
      `<path d="M-5.6,-18.8H-.8V-8.9H-5.6Z" fill="${CREAM}"/>` +
      `<rect x="6.4" y="-29.2" width="16.6" height="14.8" rx="7.3" fill="${LAV}"/>` +
      `<path d="M4.6,-21.4Q5,-14.4 11,-12.2L12,-14.3Q7.2,-16 7,-21.6Z${circ(8, -11.2, 1.9)}" fill="${AMB}"/>` +
      `<rect x="11.4" y="-26.4" width="10.6" height="8" rx="3.8" fill="${INK}"/>` +
      `<path class="fv-eye" style="animation-delay:-3.7s" d="M14.7,-22.5h.01M19.1,-22.5h.01" fill="none" stroke="${AMB}" stroke-width="2.5" stroke-linecap="round"/>` +
      `<path d="M17.6,-15.4q.2,3.3 1.9,3.2q1.7,-.2 1.2,-3.6Z" fill="${CORAL}"/>` +
      `<path d="M9,-28Q5.2,-28.4 4.6,-23.2Q4.2,-19 6.6,-17.4Q9.8,-19.4 10.8,-24.2Q11.4,-27.2 9,-28Z" fill="${SHADE}"/></g>`;
    // --- the girl ---
    const leg = (rot, cls) => `<path class="${cls}" d="M0,-21.4L0,-1.9" transform="rotate(${rot} 0 -21.4)" stroke="#6d67c4" stroke-width="4.7" stroke-linecap="round"/>`;
    const girl = leg(15, "fv-legA") + leg(-15, "fv-legB") +
      `<g class="fv-step"><path d="M15,-33.6L17.8,${f(17.8 * Math.tan(slope * Math.PI / 180) + 0.4)}" stroke="${CREAM}" stroke-width="1.5" stroke-linecap="round"/>${person({ skin: SK[3], shirt: CREAM, pack: PERI, legs: "", armF: "M4.4,-36L10.4,-30L14.6,-32",
        up: `<path class="fv-sway" d="M-3.4,-51.6C-10,-52.6 -13.8,-46.6 -12.4,-39C-12,-36.4 -13,-34.4 -14.4,-33.4C-10.2,-32.8 -7.4,-36 -7.4,-40.4C-7.4,-44 -6.6,-46.4 -4,-47.4Z" fill="${INK}"/>` +
          `<path d="M-6.3,-25.6H6.3L8.8,-12.6Q0,-10.4 -8.8,-12.6Z${circ(-5.6, -48.2, 1.7)}" fill="${CORAL}"/>` })}</g>`;
    top += `<g transform="translate(${f(hb.x)} ${f(hb.y)}) scale(${f(kh)})">${hover}</g>` +
      `<g transform="translate(${f(dg.x)} ${f(dg.y - lift)}) rotate(${f(slope)}) scale(${f(kd)})">${dog}</g>` +
      `<g transform="translate(${f(h.x)} ${f(h.y - lift)}) scale(${f(k)})">${girl}</g>`;
  }

  // ====================================================================
  // CSS
  // ====================================================================
  css.push(`
.fv-tw{animation:fv-tw 9s ease-in-out infinite}
@keyframes fv-tw{0%,100%{opacity:1}50%{opacity:.22}}
.fv-bead{animation:fv-bead 3.8s ease-in-out infinite}
@keyframes fv-bead{0%,100%{opacity:.3}50%{opacity:1}}
.fv-pulse{animation:fv-pulse 3.4s ease-in-out infinite}
@keyframes fv-pulse{0%,100%{opacity:.5}50%{opacity:1}}
.fv-spin,.fv-swirl{transform-box:fill-box;transform-origin:center;animation:fv-spin 18s linear infinite}
@keyframes fv-spin{to{transform:rotate(360deg)}}
.fv-veh{animation:fv-R 24s linear infinite}
.fv-bob{animation:fv-bob 3.6s ease-in-out infinite}
@keyframes fv-bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-2.6px)}}
.fv-eye{transform-box:fill-box;transform-origin:center;animation:fv-blink 5.5s linear infinite}
@keyframes fv-blink{0%,92%,100%{transform:scaleY(1)}96%{transform:scaleY(.15)}}
.fv-waveR{transform-box:fill-box;transform-origin:0% 100%;animation:fv-wave 1.5s ease-in-out infinite alternate}
@keyframes fv-wave{from{transform:rotate(-10deg)}to{transform:rotate(13deg)}}
.fv-tip{transform-box:fill-box;transform-origin:0% 100%;animation:fv-tip 4.4s ease-in-out infinite alternate}
@keyframes fv-tip{from{transform:rotate(-7deg)}to{transform:rotate(5deg)}}
.fv-nudge{animation:fv-nudge 2.6s ease-in-out infinite alternate}
@keyframes fv-nudge{from{transform:translate(0,0)}to{transform:translate(1.6px,-1.4px)}}
.fv-water{animation:fv-water 1.3s linear infinite}
@keyframes fv-water{from{transform:translate(0,0);opacity:.95}to{transform:translate(.9px,3.5px);opacity:.5}}
.fv-rotor{transform-box:fill-box;transform-origin:center;animation:fv-rotor .9s ease-in-out infinite alternate}
@keyframes fv-rotor{from{transform:scaleX(1)}to{transform:scaleX(.55)}}
.fv-glint{animation:fv-glint 7s ease-in-out infinite}
@keyframes fv-glint{0%,50%{transform:translate(0,0);opacity:0}58%{opacity:.95}86%{opacity:.95}94%,100%{transform:translate(var(--fv-dx),var(--fv-dy));opacity:0}}
.fv-legA,.fv-legB{transform-box:fill-box;transform-origin:50% 0%;animation:fv-leg 1.6s ease-in-out infinite alternate}
.fv-legB{animation-delay:-1.6s}
@keyframes fv-leg{from{transform:rotate(16deg)}to{transform:rotate(-16deg)}}
.fv-step{animation:fv-step .8s ease-in-out infinite alternate}
@keyframes fv-step{from{transform:translateY(0)}to{transform:translateY(-1.2px)}}
.fv-sway{transform-box:fill-box;transform-origin:100% 0%;animation:fv-sway .8s ease-in-out infinite alternate}
@keyframes fv-sway{from{transform:rotate(-5deg)}to{transform:rotate(6deg)}}
.fv-brH{animation:fv-brH 4.6s ease-in-out -1.1s infinite}
@keyframes fv-brH{0%,100%{transform:translateY(0)}50%{transform:translateY(-1.3px)}}
.fv-brB{animation:fv-brB 4.6s ease-in-out -1.1s infinite}
@keyframes fv-brB{0%,100%{transform:translateY(0)}50%{transform:translateY(1px)}}
.fv-trot{animation:fv-trot .46s ease-in-out infinite alternate}
@keyframes fv-trot{from{transform:translateY(0)}to{transform:translateY(-1.5px)}}
.fv-wag{transform-box:fill-box;transform-origin:100% 100%;animation:fv-wag .36s ease-in-out infinite alternate}
@keyframes fv-wag{from{transform:rotate(-16deg)}to{transform:rotate(18deg)}}
@media (prefers-reduced-motion: reduce){[class^="fv-"],[class*=" fv-"]{animation:none !important}}`);

  return { sky: sky + skyA, far: far + farA, mid: mid + midA0 + midS1 + midA1 + midS2 + midA2 + midS3 + midA3, near: nearRoad + near + nearCars, top, css: css.join("\n") };
}
