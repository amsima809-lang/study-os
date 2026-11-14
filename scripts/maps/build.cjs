// Build the themeable campus maps from the traced shapes (shapes.json) and a hand-kept table
// saying what each shape is. Writes ru-huamak.svg and ru-bangna.svg.
const fs = require("node:fs");
const OUT = require("node:path").join(__dirname, "../../client/src/maps/");
const { shapes } = JSON.parse(fs.readFileSync(__dirname + "/shapes.json", "utf8"));
const S = new Map(shapes.map((s) => [s.n, s]));

// What each traced shape is. Buildings: code, and the English name printed on the university's map
// (only where it could be read with certainty).
const B = {
  7: ["DS", "Ramkhamhaeng University Demonstration School"], 8: ["SLL", "Si Chulalak Building"], 9: ["BPB", "Bekphon Building"], 10: ["GB1", "Gymnasium Building 1"],
  11: ["PYB", ""], 12: ["LTB", "Laisue Thai Building (Faculty of Engineering)"], 13: ["SCL", "Science Laboratory Building"], 16: ["KMB", "Khiri Mat Building"],
  20: ["STB", "Department of Statistics Building"], 22: ["SCO", "Faculty of Science"], 23: ["SOB", "Sports Office"], 27: ["SLB", ""], 28: ["SWB", "Sawankhalok Building"],
  31: ["TTM", "Thai Traditional Medicine Building"], 32: ["LOB2", "Faculty of Law Building 2"], 34: ["HUB", "Faculty of Humanities"], 37: ["LOB", "Faculty of Law"],
  38: ["SCB", "Si Chum Building"], 39: ["NB", ""], 40: ["NMB", "Noppamat Building"], 49: ["DSE2", "Demonstration School (Elementary) 2"], 51: ["POB", "Faculty of Political Science"],
  52: ["SAB", "Student Activities Building"], 53: ["LIB", "Central Library"], 54: ["SIB", "Si Intharathit Building"], 55: ["PMB", "Pha Mueang Building"], 56: ["ECB", "Faculty of Economics"],
  57: ["GB2", "Gymnasium Building 2"], 58: ["SBB", "Sila Bat Building"], 59: ["DSE1", "Demonstration School (Elementary) 1"], 60: ["SB", "Si Sattha Building"], 61: ["NCB", "Nakhon Chum Building"],
  62: ["KRA", "King Ramkhamhaeng the Great Auditorium"], 63: ["SKB", "Sukhothai Building"], 66: ["VKB", "Viang Kham Building"], 67: ["ECB2", "Faculty of Economics Building 2"],
  68: ["EOB", "Faculty of Education"], 69: ["CPB", "Car Park Building"], 73: ["CIB", "Computer Institute"], 74: ["TCB", "Tha Chai Building"], 76: ["VPB", "Viang Pha Building"],
  79: ["AOB", "Admissions and Records Office"], 80: ["SPC", ""], 81: ["SSB", "Faculty of Business Administration (Si Satchanalai Building)"], 83: ["KLB", "Kong Krailat Building"],
  84: ["OPB", "Office of the President · Academic Services and Administration Building (AAB)"], 90: ["SAS", "Si Akson Building"], 96: ["MHB", "Medical Treatment and Health Care Building"],
  25: ["GB4", "Gymnasium Building 4"], 33: ["TC", "Tennis Court"], 82: ["IIS", "Institute of International Studies · Ramkhamhaeng University Press (RPB)"], 89: ["RTB", "Rattanathan Building"],
};
const PART_OF = { 72: 62, 75: 68, 93: 89, 50: 60 };   // second piece of the same building: drawn, not labelled again
const LABEL = { 84: "OPB · AAB", 82: "IIS · RPB" };
const GREEN = [21, 24, 42, 43, 85, 70, 71], WATER = [44, 45, 46, 47, 48, 91], OTHER = { 17: "Cafeteria", 64: "Student clubs" };
const ROAD = shapes.filter((s) => s.colour === "mauve" && !B[s.n] && !PART_OF[s.n] && (s.area > 20000 || s.box[1] < 420)).map((s) => s.n);
const GROUND = 5, PLAZA = 41, SITE = 36, PITCH = 29, BUS = [94, 99, 103, 105], GATE = 100;

const pts = (n) => S.get(n).pts.map((p) => p.join(",")).join(" ");
const poly = (n, cls, extra = "") => `<polygon class="${cls}"${extra} points="${pts(n)}"/>`;
const esc = (t) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;");
// the frame: the campus ground and the roads round it, with a little air
const frame = [GROUND, ...ROAD].map((n) => S.get(n).box);
const x0 = Math.min(...frame.map((b) => b[0])) - 20, y0 = Math.min(...frame.map((b) => b[1])) - 20;
const x1 = Math.max(...frame.map((b) => b[2])) + 20, y1 = Math.max(...frame.map((b) => b[3])) + 20;

// Colours come from CSS custom properties, so the page that shows the map decides them
// (see maps.css). The values after the commas are used when the file is opened on its own.
const STYLE = `
  .outside { fill: var(--map-outside, #eef0f7); }
  .road { fill: var(--map-road, #c6c9d6); }
  .ground { fill: var(--map-ground, #ffffff); }
  .green { fill: var(--map-green, #cfe8d3); }
  .pitch { fill: none; stroke: var(--map-ground, #ffffff); stroke-width: 3; }
  .water { fill: var(--map-water, #cfe5f6); }
  .plaza { fill: var(--map-plaza, #fde9a8); stroke: var(--map-line, #8b80e3); stroke-width: 2; }
  .site { fill: none; stroke: var(--map-line, #8b80e3); stroke-width: 2; stroke-dasharray: 7 6; }
  .b { fill: var(--map-building, #dedaf8); stroke: var(--map-line, #8b80e3); stroke-width: 2; stroke-linejoin: round; }
  .b.other { fill: var(--map-building-2, #eceaf6); }
  .b.is-selected { fill: var(--map-highlight, #6d5cdf); stroke: var(--map-highlight-line, #4f3fd0); }
  .b.is-selected ~ text { fill: var(--map-highlight-label, #ffffff); }
  text { font-family: var(--map-font, "IBM Plex Sans Thai Looped", "IBM Plex Sans", system-ui, sans-serif); fill: var(--map-label, #1f1d33); text-anchor: middle; dominant-baseline: central; pointer-events: none; }
  .code { font-size: 19px; font-weight: 700; }
  .code.small { font-size: 14px; }
  .note { font-size: 14px; font-weight: 500; fill: var(--map-label-soft, #5d5a78); }
  .bus { fill: var(--map-ground, #ffffff); stroke: var(--map-line, #8b80e3); stroke-width: 2; }`;

const buildings = [];
for (const s of shapes) {
  const own = B[s.n], whole = PART_OF[s.n];
  if (own) buildings.push(`<g id="${own[0]}" data-code="${own[0]}">${own[1] ? `<title>${esc(own[0] + " · " + own[1])}</title>` : ""}${poly(s.n, "b")}<text class="code${s.area < 5200 ? " small" : ""}" x="${s.cx}" y="${s.cy}">${LABEL[s.n] ?? own[0]}</text></g>`);
  else if (whole) buildings.push(`<g data-code="${B[whole][0]}">${poly(s.n, "b")}</g>`);
  else if (OTHER[s.n]) buildings.push(`<g>${poly(s.n, "b other")}<text class="note" x="${s.cx}" y="${s.cy}">${OTHER[s.n]}</text></g>`);
}
const gate = S.get(GATE), plaza = S.get(PLAZA), field = S.get(21);
const huamak = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x0} ${y0} ${x1 - x0} ${y1 - y0}" role="img" aria-labelledby="map-title">
<title id="map-title">Ramkhamhaeng University, Hua Mak campus</title>
<!-- A redrawing of the university's own campus map, for the app: the same buildings in the same
     places, plain shapes, colours set by the app's theme. South is at the top, as on the original.
     Each building is <g id="CODE" data-code="CODE">; add class "is-selected" to its polygon to highlight it. -->
<style>${STYLE}
</style>
<rect class="outside" x="${x0}" y="${y0}" width="${x1 - x0}" height="${y1 - y0}"/>
${ROAD.map((n) => poly(n, "road")).join("\n")}
${poly(GROUND, "ground")}
${GREEN.map((n) => poly(n, "green")).join("\n")}
${poly(PITCH, "pitch")}
${WATER.map((n) => poly(n, "water")).join("\n")}
${(() => { // the central pond: its water is the same blue as the map's surround, so only its rim (65) and its lower part (78) were traced
  const a = S.get(65).box, b = S.get(78).box;
  return `<rect class="water" x="${Math.min(a[0], b[0])}" y="${a[1]}" width="${Math.max(a[2], b[2]) - Math.min(a[0], b[0])}" height="${b[3] - a[1]}" rx="10"/>` + poly(77, "b other");
})()}
${poly(SITE, "site")}
<g id="KRS" data-code="KRS"><title>KRS · King Ramkhamhaeng the Great Statue</title>${poly(PLAZA, "plaza")}<text class="code" x="${plaza.cx}" y="${plaza.cy}">KRS</text></g>
${buildings.join("\n")}
<text class="note" x="${field.cx - 40}" y="${field.cy + 55}">Sports field</text>
<text class="note" x="${S.get(65).cx}" y="${S.get(65).cy + 10}">Pond</text>
<text class="note" x="${gate.cx}" y="${gate.cy - 34}">Gate 1–2</text>
${BUS.map((n) => `<g><circle class="bus" cx="${S.get(n).cx}" cy="${S.get(n).cy}" r="26"/><text class="note" x="${S.get(n).cx}" y="${S.get(n).cy}">Bus</text></g>`).join("\n")}
<text class="note" x="${S.get(3).cx - 380}" y="${S.get(GATE).cy + 118}">Ramkhamhaeng Road</text>
<g transform="translate(${x0 + 330} ${y0 + 300})"><path class="b" d="M0 34 L-13 -6 L0 2 L13 -6 Z"/><text class="code small" y="52">N</text></g>
</svg>
`;
fs.writeFileSync(OUT + "ru-huamak.svg", huamak);

// ---------- Bang Na campus: a simple plan, drawn directly ----------
const R = (cls, x, y, w, h, r = 10, extra = "") => `<rect class="${cls}"${extra} x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}"/>`;
const T = (cls, x, y, t) => `<text class="${cls}" x="${x}" y="${y}">${esc(t)}</text>`;
const bld = (code, name, x, y, w, h, label = code, small = false) => `<g id="${code}" data-code="${code}">${name ? `<title>${esc(code + " · " + name)}</title>` : ""}${R("b", x, y, w, h)}${T("code" + (small ? " small" : ""), x + w / 2, y + h / 2, label)}</g>`;
const bangna = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1088 632" role="img" aria-labelledby="map-title-bn">
<title id="map-title-bn">Ramkhamhaeng University, Bang Na campus</title>
<!-- A redrawing of the university's plan of the Bang Na campus. Same conventions as ru-huamak.svg. -->
<style>${STYLE}
  .code { font-size: 17px; } .code.small { font-size: 12px; } .note { font-size: 12px; }
</style>
<rect class="outside" width="1088" height="632"/>
${R("road", 88, 18, 62, 596, 4)}
${R("road", 18, 566, 1010, 46, 4)}
${R("ground", 172, 158, 876, 394, 14)}
${[[348, 312, 96, 98], [487, 314, 104, 97], [638, 314, 120, 97], [882, 328, 58, 74], [888, 432, 54, 82]].map((p) => R("water", ...p, 22)).join("\n")}
${bld("BNB7", "", 345, 213, 46, 60, "BNB7", true)}
${bld("BNB8", "", 396, 213, 46, 60, "BNB8", true)}
${bld("BNB10", "", 540, 213, 46, 60, "BNB10", true)}
${bld("BNB11", "", 650, 213, 48, 60, "BNB11", true)}
${R("b other", 703, 213, 46, 60)}
${bld("PRB", "พระมาส", 810, 210, 64, 82)}
${bld("KTB", "คณฑี", 810, 326, 64, 84)}
${bld("PBB", "พระบาง", 810, 436, 64, 86)}
${R("b other", 345, 452, 46, 62)}
${R("b other", 396, 452, 46, 62)}
${bld("SK2", "สองแคว 2", 545, 455, 66, 60, "SK2", true)}
${bld("SK1", "สองแคว 1", 648, 455, 66, 60, "SK1", true)}
${R("b other", 734, 450, 38, 64)}${T("note", 753, 482, "Food")}
<g id="ADMIN" data-code="ADMIN"><title>อาคารอำนวยการ · Administration Building</title>${R("b", 178, 312, 88, 86)}${T("code small", 222, 355, "Admin")}</g>
<g id="LIBBN" data-code="LIBBN"><title>ห้องสมุด วข. · Campus Library</title>${R("b", 184, 486, 78, 46)}${T("code small", 223, 509, "Library")}</g>
${T("note", 212, 282, "Entrance →")}
${T("note", 212, 462, "← Exit")}
${T("note", 1012, 300, "Demonstration")}${T("note", 1012, 316, "School")}
${T("note", 968, 540, "Back gate")}
<text class="note" transform="translate(119 300) rotate(-90)">Chaloem Phrakiat Ratchakan Thi 9 Road</text>
${T("note", 560, 589, "To Kanchanaphisek outer ring road · Prawet · On Nut →")}
</svg>
`;
fs.writeFileSync(OUT + "ru-bangna.svg", bangna);
console.log("roads:", ROAD.join(","), "| buildings:", buildings.length, "| huamak", (huamak.length / 1024).toFixed(0), "KB | bangna", (bangna.length / 1024).toFixed(1), "KB | frame", x0, y0, x1, y1);
