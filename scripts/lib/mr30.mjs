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

/**
 * The two day groups a summer term is taught in: three days a week, every other day.
 * "MWF = Monday, Wednesday, Friday; TTS = Tuesday, Thursday, Saturday": the 2569 admission
 * guide's key to abbreviations (printed page 32, https://www.ru.ac.th/th/Center_study_plan/21/02_69.pdf),
 * and the registrar's office on its Q&A board, question 28288 (2 Mar 2561).
 */
const DAY_GROUPS = { MWF: [1, 3, 5], TTS: [2, 4, 6] };

/** "TH 0830-1100" -> one session; "M-F 0930-1630" -> five; "MWF 0830-1020" -> three; anything else has no weekday. */
function sessionsOf(kind, text, room) {
  const m = /^([A-Z]+)(?:-([A-Z]+))? (\d{2})(\d{2})-(\d{2})(\d{2})$/.exec(text);
  const group = m && !m[2] ? DAY_GROUPS[m[1]] : undefined;
  if (!m || (!group && (!WEEKDAY[m[1]] || (m[2] && !WEEKDAY[m[2]])))) return [{ kind, text, weekday: null, start: null, end: null, room }];
  const days = group ? [...group] : [];
  if (!group) for (let d = WEEKDAY[m[1]]; d <= WEEKDAY[m[2] ?? m[1]]; d++) days.push(d);
  return days.map((weekday) => ({ kind, text, weekday, start: `${m[3]}:${m[4]}`, end: `${m[5]}:${m[6]}`, room }));
}

// ---------- ม.ร.30 ----------
export async function readMr30(path) {
  const courses = new Map(), depts = {};
  let dept = null, cur = null, printedTotal = null;
  const all = await lines(path);
  const isColumnHeader = (l) => l.items.map((i) => i.s).join("").replace(/\s+/g, "").includes("วิชา(CR)"); // S/67 prints it spaced out
  // Each page starts with the date, "Page n of N" and on the first page the title, above the
  // page's first column header. Editions differ in page size, so that line is found per page.
  const headerY = new Map();
  for (const l of all) if (isColumnHeader(l) && !headerY.has(l.page)) headerY.set(l.page, l.y);
  for (const line of all) {
    const text = line.items.map((i) => i.s).join(" ");
    const total = /^รวม ([\d,]+) กระบวนวิชา$/.exec(text);
    if (total) { printedTotal = +total[1].replace(/,/g, ""); continue; }
    const head = line.items.length === 1 && line.items[0].x > 90 ? /^([A-Z]{3})\s*:\s*(.+)$/.exec(line.items[0].s) : null;
    if (head) { dept = head[1]; depts[dept] = head[2].trim(); cur = null; continue; }
    if (isColumnHeader(line) || line.y > (headerY.get(line.page) ?? Infinity) || text.includes("ประกาศกระบวนวิชา")) continue; // column header, page header, title
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

// ---------- writing term_offerings rows ----------
/** A value as SQL: NULL for nothing, otherwise a quoted string (numbers stay numbers). */
export const q = (v) => (v === null || v === undefined || v === "" ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);

/**
 * One course read by `readMr30`, as the VALUES of a term_offerings row (migration 032's
 * columns, in order). Shared by import-ru-term.mjs and import-ru-past-term.mjs.
 */
export function offeringRow(term, c, depts) {
  // "(AC101)PRINCIPLES OF ACCOUNTING 1": the bracket is the course's code in an older curriculum.
  const full = c.name.join(" ").replace(/\s+/g, " ").trim();
  const old = /^\(([^)]*)\)\s*(.*)$/.exec(full);
  // extra room lines ("ห้องปฏิบัติการ / คอมพิวเตอร์ / VKB ชั้น 2") continue the room of a course with one class
  const sessions = c.sessions.map((s) => ({ ...s }));
  if (c.roomExtra.length && new Set(sessions.map((s) => s.text)).size === 1) for (const s of sessions) s.room = [s.room, ...c.roomExtra].filter(Boolean).join(" ");
  const exam = c.exam ?? { date: null, slot: null, note: null };
  return `(${[
    q(term), q(c.code), c.credits, q(old ? old[2] : full), q(old ? old[1].replace(/[฀-๿]/g, "").trim() : null), q(c.dept), q(depts[c.dept]),
    q(c.notes.join("\n")), q(JSON.stringify(sessions)), q([...new Set(c.teachers)].join(", ")), q(exam.date), q(exam.slot), q(exam.note), c.page,
  ].join(", ")})`;
}
