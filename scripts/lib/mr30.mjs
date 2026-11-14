// Reading Ramkhamhaeng's ม.ร.30 (the registrar's list of every course offered in a term, with class
// times, rooms, lecturers, exam date and notes). Shared by scripts/import-ru-term.mjs (the full
// record of one term) and scripts/import-ru-history.mjs (which terms each course has run in).
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";

const require = createRequire(process.cwd() + "/server/package.json");
const pdfjs = await import(require.resolve("pdfjs-dist/legacy/build/pdf.mjs"));

/** Text of a PDF as lines: [{ page, y, items: [{ x, s }] }], top to bottom, left to right. */
export async function lines(path) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(path)), useSystemFonts: true, verbosity: 0 }).promise;
  const out = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const content = await (await doc.getPage(p)).getTextContent();
    const items = content.items.filter((i) => i.str && i.str.trim()).map((i) => ({ x: i.transform[4], y: i.transform[5], s: i.str.trim() }));
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    let cur = null;
    for (const i of items) {
      if (!cur || Math.abs(cur.y - i.y) > 2.5) out.push((cur = { page: p, y: i.y, items: [] }));
      cur.items.push(i);
    }
  }
  for (const l of out) l.items.sort((a, b) => a.x - b.x);
  return out;
}

const MONTHS = { JAN: 1, FEB: 2, MAR: 3, APR: 4, MAY: 5, JUN: 6, JUL: 7, AUG: 8, SEP: 9, OCT: 10, NOV: 11, DEC: 12 };
const WEEKDAY = { M: 1, TU: 2, W: 3, TH: 4, F: 5, S: 6, SUN: 7 };
const pad = (n) => String(n).padStart(2, "0");

/** "M 15 MAR. 2027 A" -> { date: "2027-03-15", slot: "A" }; anything else is kept as a note. */
export function examOf(text) {
  const s = text.replace(/\s+/g, " ").trim();
  if (!s) return { date: null, slot: null, note: null };
  const m = /^(SUN|M|TU|W|TH|F|S) (\d{1,2}) ([A-Z]{3})\.? (\d{4}) ([AB])$/.exec(s);
  if (!m) return { date: null, slot: null, note: s };
  const date = `${m[4]}-${pad(MONTHS[m[3]])}-${pad(+m[2])}`;
  // the weekday printed must be the weekday of that date
  const real = [7, 1, 2, 3, 4, 5, 6][new Date(`${date}T12:00:00Z`).getUTCDay()];
  if (real !== WEEKDAY[m[1]]) throw new Error(`exam "${s}": ${date} is not a ${m[1]}`);
  return { date, slot: m[5], note: null };
}

/** "TH 0830-1100" -> one session; "M-F 0930-1630" -> five; anything else has no weekday. */
function sessionsOf(kind, text, room) {
  const m = /^([A-Z]+)(?:-([A-Z]+))? (\d{2})(\d{2})-(\d{2})(\d{2})$/.exec(text);
  if (!m || !WEEKDAY[m[1]] || (m[2] && !WEEKDAY[m[2]])) return [{ kind, text, weekday: null, start: null, end: null, room }];
  const days = [];
  for (let d = WEEKDAY[m[1]]; d <= WEEKDAY[m[2] ?? m[1]]; d++) days.push(d);
  return days.map((weekday) => ({ kind, text, weekday, start: `${m[3]}:${m[4]}`, end: `${m[5]}:${m[6]}`, room }));
}

// ---------- ม.ร.30 ----------
export async function readMr30(path) {
  const courses = new Map(), depts = {};
  let dept = null, cur = null, printedTotal = null;
  for (const line of await lines(path)) {
    const text = line.items.map((i) => i.s).join(" ");
    const total = /^รวม ([\d,]+) กระบวนวิชา$/.exec(text);
    if (total) { printedTotal = +total[1].replace(/,/g, ""); continue; }
    if (line.y > 760 || text.includes("วิชา(CR)") || text.includes("ประกาศกระบวนวิชา")) continue; // page header, column header, title
    const head = line.items.length === 1 && line.items[0].x > 90 ? /^([A-Z]{3})\s*:\s*(.+)$/.exec(line.items[0].s) : null;
    if (head) { dept = head[1]; depts[dept] = head[2].trim(); cur = null; continue; }
    const col = { code: [], name: [], kind: [], time: [], room: [], teacher: [], exam: [] };
    for (const i of line.items) {
      const k = i.x < 55 ? "code" : i.x < 240 ? "name" : i.x < 280 ? "kind" : i.x < 340 ? "time" : i.x < 392 ? "room" : i.x < 505 ? "teacher" : "exam";
      col[k].push(i.s);
    }
    let first = false;
    if (col.code.length) {
      const m = /^([A-Z]{3}\d{4})\s*\((\d+)\)$/.exec(col.code.join(" "));
      if (!m) throw new Error(`page ${line.page}: cannot read the course code in "${text}"`);
      if (courses.has(m[1])) throw new Error(`page ${line.page}: ${m[1]} is listed twice`);
      cur = { code: m[1], credits: +m[2], dept, page: line.page, name: [], notes: [], sessions: [], roomExtra: [], teachers: [], exam: null };
      courses.set(m[1], cur);
      first = true;
    } else if (!cur) throw new Error(`page ${line.page}: a line belongs to no course: "${text}"`);
    const name = col.name.join(" ");
    if (name) {
      // The name is the first line plus any plain Latin lines right after it. Thai lines, and
      // "NOT OPEN…", "PR : …" lines, are the registrar's notes on who may register.
      // (The line that carries the course code is always the name, even with a stray Thai mark typed in it.)
      const note = !first && (/[\u0E00-\u0E7F]/.test(name) || /^(NOT OPEN|PR\s*:|CR\s*:)/.test(name) || cur.notes.length > 0);
      (note ? cur.notes : cur.name).push(name);
    }
    const time = col.time.join(" "), room = col.room.join(" ");
    if (time) cur.sessions.push(...sessionsOf(col.kind.join(" "), time, room === "--" ? "" : room));
    else if (room) cur.roomExtra.push(room);
    if (col.teacher.length) cur.teachers.push(col.teacher.join(" "));
    if (col.exam.length) {
      if (cur.exam) throw new Error(`page ${line.page}: ${cur.code} has two exam entries`);
      cur.exam = examOf(col.exam.join(" "));
    }
  }
  return { courses, depts, printedTotal };
}


/**
 * Just which courses a ม.ร.30 lists, and for which term: enough to know when a course has
 * run. Returns { term: "1/67" | "S/68" | …, courses: Map(code -> credits), printedTotal }.
 * (Older editions print the same table; only the wording around it differs.)
 */
export async function readOffered(path) {
  const courses = new Map();
  let term = null, printedTotal = null;
  for (const line of await lines(path)) {
    const text = line.items.map((i) => i.s).join(" ");
    const title = /ภาค\s*([12S])\s*\/\s*25(\d\d)/.exec(text);
    if (title && text.includes("ประกาศกระบวนวิชา")) { term ??= `${title[1]}/${title[2]}`; continue; }
    const total = /^รวม ([\d,]+) กระบวนวิชา$/.exec(text);
    if (total) { printedTotal = +total[1].replace(/,/g, ""); continue; }
    const first = line.items[0];
    const m = first.x < 55 ? /^([A-Z]{3}\d{4})\s*\((\d+)\)$/.exec(line.items.filter((i) => i.x < 55).map((i) => i.s).join(" ")) : null;
    if (m) {
      if (courses.has(m[1])) throw new Error(`${path}: ${m[1]} is listed twice`);
      courses.set(m[1], +m[2]);
    }
  }
  return { term, courses, printedTotal };
}
