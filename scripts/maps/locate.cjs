// Where each building on the campus maps really is (latitude and longitude), and how the
// two drawings relate to the ground. Writes client/src/maps/places.ts.
//
//   node scripts/maps/locate.cjs
//
// Positions come from OpenStreetMap (osm-buildings.json: every building in a box round each
// campus, with its centre). A building is located in one of two ways, and in no other:
//   1. OpenStreetMap names it by the same code the university uses ("KTB", "SBB", ...).
//   2. It is in IDENTIFIED below: OpenStreetMap has the building without its code, and it was
//      matched by looking the building up by name on Google Maps (14 November 2026). The script
//      checks the point seen there falls on that OpenStreetMap building and on no other.
// A building in neither group gets NO position: the app then offers no directions to it.
// The script writes nothing if a check fails.
const fs = require("node:fs");
const path = require("node:path");
const MAPS = path.join(__dirname, "../../client/src/maps/");
const osm = JSON.parse(fs.readFileSync(path.join(__dirname, "osm-buildings.json"), "utf8"));

// OpenStreetMap's name -> the code on our drawing, where they are not spelled the same.
const ALIAS = { "LOB 1": "LOB", RPB: "IIS", "BNB 7": "BNB7", "BNB 8": "BNB8", "BNB 10": "BNB10", "BNB 11": "BNB11", "หอสมุด": "LIBBN", "ตึกอำนวยการ": "ADMIN" };
// Matched by hand. `seen` is the place as Google Maps shows it; `at` is where it shows it.
const IDENTIFIED = {
  huamak: {
    BPB: { osm: "w390637304", seen: "Beakphon Building", at: [13.7527952, 100.6171646] },
    KMB: { osm: "w390637295", seen: "Khiri Mat Building", at: [13.753413, 100.6174002] },
    SB: { osm: "w390637307", seen: "อาคารศรีศรัทธา(SB)", at: [13.7574995, 100.6214293] },
    STB: { osm: "w818007360", seen: "Department of Statistics, Ramkhamhaeng University", at: [13.7550781, 100.6203034] },
  },
  bangna: {
    // OpenStreetMap calls these two "BNB 5" and "BNB 4"; the university's map and Google Maps
    // both have them as Song Khwae 1 and 2.
    SK1: { osm: "w34565246", seen: "Song Khwae Building 1 (SK1)", at: [13.6664414, 100.686656] },
    SK2: { osm: "w34565245", seen: "อาคารสองแคว ๒ (SK2)", at: [13.6666618, 100.6861009] },
  },
};
// Not located on purpose. OpenStreetMap's "SLB" stands where the university's map draws SLL,
// 425 m from where it draws SLB: one of the two is mislabelled, and nothing here says which.
const UNSURE = { huamak: ["SLB", "SLL"], bangna: [] };
// The fit of drawing to ground must be at least this good (median error, leaving each building
// out in turn), or something is wrong with the matches. Hua Mak's map is a sketch, not a survey.
const WORST_MEDIAN_M = { huamak: 40, bangna: 15 };

const fail = (msg) => { console.error("NOT WRITTEN: " + msg); process.exit(1); };
const metres = (a, b) => Math.hypot((a[0] - b[0]) * 110574, (a[1] - b[1]) * 111320 * Math.cos(a[0] * Math.PI / 180));

// Centre of each building on a drawing (weighted by area over its pieces).
function centresOf(svg) {
  const centres = new Map();
  for (const g of svg.matchAll(/<g id="([A-Z0-9]+)" data-code="\1">([\s\S]*?)<\/g>/g)) {
    let A = 0, X = 0, Y = 0;
    for (const p of g[2].matchAll(/<polygon class="b[^"]*"[^>]*points="([^"]+)"/g)) {
      const pts = p[1].trim().split(/\s+/).map((q) => q.split(",").map(Number));
      let a = 0, cx = 0, cy = 0;
      for (let i = 0; i < pts.length; i++) { const [x1, y1] = pts[i], [x2, y2] = pts[(i + 1) % pts.length]; const c = x1 * y2 - x2 * y1; a += c; cx += (x1 + x2) * c; cy += (y1 + y2) * c; }
      a /= 2; if (a === 0) continue;
      A += Math.abs(a); X += (cx / (6 * a)) * Math.abs(a); Y += (cy / (6 * a)) * Math.abs(a);
    }
    for (const r of g[2].matchAll(/<rect class="b[^"]*" x="([\d.]+)" y="([\d.]+)" width="([\d.]+)" height="([\d.]+)"/g)) { const [x, y, w, h] = r.slice(1).map(Number); A += w * h; X += (x + w / 2) * w * h; Y += (y + h / 2) * w * h; }
    if (A > 0) centres.set(g[1], [X / A, Y / A]);
  }
  return centres;
}
// Least squares for three unknowns: rhs ~ rows . x
function solve3(rows, rhs) {
  const A = [[0, 0, 0], [0, 0, 0], [0, 0, 0]], b = [0, 0, 0];
  rows.forEach((r, k) => { for (let i = 0; i < 3; i++) { b[i] += r[i] * rhs[k]; for (let j = 0; j < 3; j++) A[i][j] += r[i] * r[j]; } });
  for (let i = 0; i < 3; i++) {
    let p = i; for (let k = i + 1; k < 3; k++) if (Math.abs(A[k][i]) > Math.abs(A[p][i])) p = k;
    [A[i], A[p]] = [A[p], A[i]]; [b[i], b[p]] = [b[p], b[i]];
    for (let k = i + 1; k < 3; k++) { const f = A[k][i] / A[i][i]; b[k] -= f * b[i]; for (let j = i; j < 3; j++) A[k][j] -= f * A[i][j]; }
  }
  const x = [0, 0, 0];
  for (let i = 2; i >= 0; i--) x[i] = (b[i] - A[i].slice(i + 1).reduce((s, v, j) => s + v * x[i + 1 + j], 0)) / A[i][i];
  return x;
}

const result = {};
for (const campus of ["huamak", "bangna"]) {
  const svg = fs.readFileSync(MAPS + `ru-${campus}.svg`, "utf8");
  const centres = centresOf(svg);
  const buildings = osm.campuses[campus].map(([id, lat, lon, name]) => ({ id, lat, lon, name: name ?? null }));
  const byId = new Map(buildings.map((b) => [b.id, b]));
  const places = new Map(); // code -> { lat, lon, osm, how }

  // 1. named by code in OpenStreetMap
  for (const b of buildings) {
    if (!b.name) continue;
    const plain = b.name.replace(/ \(.*$/, "");
    const code = ALIAS[plain] ?? plain;
    if (!centres.has(code) || UNSURE[campus].includes(code)) continue;
    if (places.has(code)) fail(`${campus}: OpenStreetMap has two buildings named ${code}`);
    places.set(code, { lat: b.lat, lon: b.lon, osm: b.id, how: "name" });
  }
  // 2. matched by hand, and checked
  for (const [code, m] of Object.entries(IDENTIFIED[campus])) {
    if (!centres.has(code)) fail(`${campus}: ${code} is not on the drawing`);
    if (places.has(code)) fail(`${campus}: ${code} is already named in OpenStreetMap; remove it from IDENTIFIED`);
    const b = byId.get(m.osm);
    if (!b) fail(`${campus}: ${code}: no building ${m.osm} in the extract`);
    const d = metres(m.at, [b.lat, b.lon]);
    if (d > 25) fail(`${campus}: ${code}: "${m.seen}" is ${d.toFixed(0)} m from ${m.osm}`);
    const rival = buildings.filter((o) => o.id !== b.id && metres(m.at, [o.lat, o.lon]) < 40);
    if (rival.length > 0) fail(`${campus}: ${code}: "${m.seen}" is also near ${rival.map((o) => o.id).join(", ")}`);
    if ([...places.values()].some((p) => p.osm === b.id)) fail(`${campus}: ${code}: ${m.osm} is already another building`);
    places.set(code, { lat: b.lat, lon: b.lon, osm: b.id, how: "identified" });
  }

  // 3. how the drawing relates to the ground: [x, y] = F . [east, north, 1], in metres from `ref`.
  // Used to draw "you are here". Checked by leaving each building out and predicting it.
  const codes = [...places.keys()];
  const ref = [codes.reduce((s, c) => s + places.get(c).lat, 0) / codes.length, codes.reduce((s, c) => s + places.get(c).lon, 0) / codes.length];
  const ground = (lat, lon) => [(lon - ref[1]) * 111320 * Math.cos(ref[0] * Math.PI / 180), (lat - ref[0]) * 110574];
  const fit = (use) => { const rows = use.map((c) => [...ground(places.get(c).lat, places.get(c).lon), 1]); return [solve3(rows, use.map((c) => centres.get(c)[0])), solve3(rows, use.map((c) => centres.get(c)[1]))]; };
  const F = fit(codes);
  const unit = 1 / Math.sqrt(Math.abs(F[0][0] * F[1][1] - F[0][1] * F[1][0])); // metres per drawing unit
  const errorOf = (c, f) => { const [e, n] = ground(places.get(c).lat, places.get(c).lon); return Math.hypot(f[0][0] * e + f[0][1] * n + f[0][2] - centres.get(c)[0], f[1][0] * e + f[1][1] * n + f[1][2] - centres.get(c)[1]) * unit; };
  const loo = codes.map((c) => [c, errorOf(c, fit(codes.filter((k) => k !== c)))]).sort((a, b) => a[1] - b[1]);
  const median = loo[loo.length >> 1][1], worst = loo.at(-1);
  if (median > WORST_MEDIAN_M[campus]) fail(`${campus}: the drawing fits the ground to ${median.toFixed(0)} m (median); expected ${WORST_MEDIAN_M[campus]} m or better`);
  const p90 = loo[Math.floor(loo.length * 0.9)][1];

  const box = svg.match(/viewBox="([-\d.]+) ([-\d.]+) ([\d.]+) ([\d.]+)"/).slice(1).map(Number);
  const unplaced = [...centres.keys()].filter((c) => !places.has(c)).sort();
  console.log(`${campus}: ${centres.size} buildings on the drawing, ${places.size} located (${codes.filter((c) => places.get(c).how === "name").length} by name, ${Object.keys(IDENTIFIED[campus]).length} identified), ${unplaced.length} without a position: ${unplaced.join(" ") || "none"}`);
  console.log(`  drawing fits the ground to ${median.toFixed(0)} m (median), ${p90.toFixed(0)} m (9 in 10), worst ${worst[0]} ${worst[1].toFixed(0)} m; ${unit.toFixed(2)} m per unit`);
  result[campus] = { ref, F, unit, accuracy: Math.ceil(p90 / 5) * 5, box, places, codes: [...centres.keys()].sort() };
}

const n = (v, d) => +v.toFixed(d);
const ts = `// GENERATED by scripts/maps/locate.cjs. Do not edit by hand: change the script and run it.
// Building positions: (c) OpenStreetMap contributors, Open Database Licence (openstreetmap.org/copyright).

export type CampusId = "huamak" | "bangna";
/** Latitude and longitude of the centre of a building. */
export type Place = { lat: number; lon: number };

/** Every building drawn on each map, located or not. */
export const CODES: Record<CampusId, string[]> = {
${Object.entries(result).map(([c, r]) => `  ${c}: ${JSON.stringify(r.codes)},`).join("\n")}
};

/** Where each building is. A building that is not here has no confirmed position. */
export const PLACES: Record<CampusId, Record<string, Place>> = {
${Object.entries(result).map(([c, r]) => `  ${c}: {\n${[...r.places].sort((a, b) => a[0].localeCompare(b[0])).map(([code, p]) => `    ${code}: { lat: ${n(p.lat, 6)}, lon: ${n(p.lon, 6)} }, // ${p.osm}${p.how === "identified" ? ", identified" : ""}`).join("\n")}\n  },`).join("\n")}
};

/**
 * How each drawing relates to the ground. A point \`east\`, \`north\` metres from \`ref\` is drawn at
 * x = f[0]*east + f[1]*north + f[2], y = f[3]*east + f[4]*north + f[5]. The drawings are sketches:
 * \`accuracy\` is how far off (metres) that can be for 9 buildings in 10.
 */
export const GROUND: Record<CampusId, { ref: [number, number]; f: [number, number, number, number, number, number]; accuracy: number; unit: number; box: [number, number, number, number] }> = {
${Object.entries(result).map(([c, r]) => `  ${c}: { ref: [${n(r.ref[0], 6)}, ${n(r.ref[1], 6)}], f: [${[...r.F[0], ...r.F[1]].map((v) => n(v, 5)).join(", ")}], accuracy: ${r.accuracy}, unit: ${n(r.unit, 3)}, box: [${r.box.join(", ")}] },`).join("\n")}
};
`;
fs.writeFileSync(MAPS + "places.ts", ts);
console.log("wrote client/src/maps/places.ts");
