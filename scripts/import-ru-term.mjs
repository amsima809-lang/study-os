// Build a migration from Ramkhamhaeng's two official documents for one term:
//   - ม.ร.30: every course offered, with class times, rooms, lecturers, exam date and notes
//   - the exam list: every course with its exam date and period
// Both are published by the registrar (สวป.) at http://www.regis.ru.ac.th/document/6_regis_examSV/MorLor30/
//
// Usage (from the repo root; the PDFs are NOT kept in the repo):
//   node scripts/import-ru-term.mjs <mr30.pdf> <exam.pdf> <term, e.g. 2/69> <migration file name>
//   node scripts/import-ru-term.mjs ~/Downloads/20260904_mr30_269.pdf ~/Downloads/20260904_exam_269.pdf 2/69 032_term_2_69_official.sql
// For a later term add --data-only (the table already exists), e.g. … 1/70 0NN_term_1_70_official.sql --data-only
//
// It refuses to write anything unless the documents check out: the number of courses read
// equals the total printed on each document's last page, both documents list the same
// courses, and they agree on every exam date. Nothing is typed by hand.
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { rebuildSql } from "./lib/term-rebuild-sql.mjs";
import { lines, examOf, readMr30 } from "./lib/mr30.mjs";


const [mr30Path, examPath, term, outName] = process.argv.slice(2);
// The first import creates the table; later terms pass --data-only. Add --make-current when the
// term has started: the app then treats it as the current term (students are asked what they
// passed last term, and choose their courses for this one).
const flags = process.argv.slice(6);
const dataOnly = flags.includes("--data-only");
const makeCurrent = flags.includes("--make-current");
if (!mr30Path || !examPath || !/^\d\/\d\d$/.test(term ?? "") || !/^\d{3}_[a-z0-9_]+\.sql$/.test(outName ?? "")) {
  console.error("usage: node scripts/import-ru-term.mjs <mr30.pdf> <exam.pdf> <term e.g. 2/69> <NNN_name.sql> [--data-only] [--make-current]");
  process.exit(1);
}

// ---------- the exam list ----------
async function readExamList(path) {
  const exams = new Map();
  let printedTotal = null;
  for (const line of await lines(path)) {
    const text = line.items.map((i) => i.s).join(" ");
    const total = /^รวมทั้งหมด ([\d,]+) วิชา$/.exec(text);
    if (total) { printedTotal = +total[1].replace(/,/g, ""); continue; }
    if (text.includes("ลำดับที่") || text.includes("กระบวนวิชาและวันเวลาสอบ")) continue;
    const code = line.items.filter((i) => i.x >= 120 && i.x < 210).map((i) => i.s).join("").replace(/\s+/g, "");
    const m = /^([A-Z]{3}\d{4})\((\d+)\)$/.exec(code);
    if (!m) throw new Error(`exam list page ${line.page}: cannot read "${text}"`);
    if (exams.has(m[1])) throw new Error(`exam list: ${m[1]} is listed twice`);
    exams.set(m[1], { credits: +m[2], ...examOf(line.items.filter((i) => i.x >= 210).map((i) => i.s).join(" ")) });
  }
  return { exams, printedTotal };
}

const mr30 = await readMr30(mr30Path);
const list = await readExamList(examPath);

// ---------- the documents must check out ----------
const problems = [];
if (mr30.printedTotal !== mr30.courses.size) problems.push(`ม.ร.30 prints a total of ${mr30.printedTotal} courses but ${mr30.courses.size} were read`);
if (list.printedTotal !== list.exams.size) problems.push(`the exam list prints a total of ${list.printedTotal} courses but ${list.exams.size} were read`);
for (const code of mr30.courses.keys()) if (!list.exams.has(code)) problems.push(`${code} is in ม.ร.30 but not in the exam list`);
for (const code of list.exams.keys()) if (!mr30.courses.has(code)) problems.push(`${code} is in the exam list but not in ม.ร.30`);
for (const [code, c] of mr30.courses) {
  const e = list.exams.get(code);
  if (!e) continue;
  const mine = c.exam ?? { date: null, slot: null, note: null };
  if (mine.date !== e.date || mine.slot !== e.slot || mine.note !== e.note) problems.push(`${code}: exam differs between the two documents`);
  if (c.credits !== e.credits) problems.push(`${code}: credits differ between the two documents`);
  if (c.sessions.length === 0) problems.push(`${code}: no class line was read`);
  if (!c.name.join("").replace(/\([^)]*\)/, "").trim()) problems.push(`${code}: no course name was read`);
}
if (problems.length) {
  console.error(`Not written. ${problems.length} problem(s):\n  ` + problems.slice(0, 30).join("\n  "));
  process.exit(1);
}

// ---------- write the migration ----------
const q = (v) => (v === null || v === undefined || v === "" ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);
const sha = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");
const rows = [...mr30.courses.values()].map((c) => {
  // "(AC101)PRINCIPLES OF ACCOUNTING 1": the bracket is the course's code in an older curriculum.
  const full = c.name.join(" ").replace(/\s+/g, " ").trim();
  const old = /^\(([^)]*)\)\s*(.*)$/.exec(full);
  // extra room lines ("ห้องปฏิบัติการ / คอมพิวเตอร์ / VKB ชั้น 2") continue the room of a course with one class
  const sessions = c.sessions.map((s) => ({ ...s }));
  if (c.roomExtra.length && new Set(sessions.map((s) => s.text)).size === 1) for (const s of sessions) s.room = [s.room, ...c.roomExtra].filter(Boolean).join(" ");
  const exam = c.exam ?? { date: null, slot: null, note: null };
  return `(${[
    q(term), q(c.code), c.credits, q(old ? old[2] : full), q(old ? old[1].replace(/[\u0E00-\u0E7F]/g, "").trim() : null), q(c.dept), q(mr30.depts[c.dept]),
    q(c.notes.join("\n")), q(JSON.stringify(sessions)), q([...new Set(c.teachers)].join(", ")), q(exam.date), q(exam.slot), q(exam.note), c.page,
  ].join(", ")})`;
});
const dated = [...mr30.courses.values()].filter((c) => c.exam?.date).length;
const SCHEMA = `CREATE TABLE IF NOT EXISTS term_offerings (
  term_id     TEXT NOT NULL,
  course_code TEXT NOT NULL,
  credits     INTEGER NOT NULL,
  name_en     TEXT NOT NULL,            -- as printed (the registrar's spelling)
  old_code    TEXT,                     -- the course's code in an older curriculum, when printed
  dept        TEXT,                     -- the heading it is printed under, e.g. ACC
  dept_name   TEXT,
  notes       TEXT,                     -- the registrar's notes on who may register, one per line
  sessions    TEXT NOT NULL,            -- JSON: [{ kind, text, weekday, start, end, room }]
  teachers    TEXT,
  exam_date   TEXT,                     -- YYYY-MM-DD when the university sets the exam
  exam_slot   TEXT,                     -- A or B
  exam_note   TEXT,                     -- e.g. "คณะจัดสอบเอง" (the faculty arranges it)
  source_page INTEGER,
  PRIMARY KEY (term_id, course_code)
);

ALTER TABLE class_sessions ADD COLUMN kind TEXT;  -- "LEC.", "LAB.", "SEC. 1" … when printed

`;
const sql = `-- Migration ${outName.slice(0, 3)}: term ${term} from the registrar's own documents.
-- GENERATED by scripts/import-ru-term.mjs. Do not edit by hand: fix the script and run it again.
--
-- Sources (Ramkhamhaeng University, สวป., http://www.regis.ru.ac.th/document/6_regis_examSV/MorLor30/):
--   ${basename(mr30Path)}  sha256 ${sha(mr30Path)}
--   ${basename(examPath)}  sha256 ${sha(examPath)}
-- Checked while generating: ${mr30.courses.size} courses read from each document, equal to the total each
-- prints on its last page; the two list the same courses and agree on every exam date
-- (${dated} with a date and period, the rest arranged by the faculty or none).
--
-- term_offerings is the complete official record for a term: EVERY course the university
-- offers, whether or not it is in a curriculum this app knows. The timetable (class_sessions)
-- and the exam dates (exams) of the courses in the app's catalogue are rebuilt from it
-- below, replacing what migration 018 typed in, which had wrong times and dates.

${dataOnly ? "" : SCHEMA}DELETE FROM term_offerings WHERE term_id = ${q(term)};
${chunks(rows, 200).map((part) => `INSERT INTO term_offerings (term_id, course_code, credits, name_en, old_code, dept, dept_name, notes, sessions, teachers, exam_date, exam_slot, exam_note, source_page) VALUES\n${part.join(",\n")};`).join("\n")}

-- Credits as the registrar prints them, where the catalogue had another number.
UPDATE courses SET credits = (SELECT o.credits FROM term_offerings o WHERE o.term_id = ${q(term)} AND o.course_code = courses.code)
WHERE code IN (SELECT o.course_code FROM term_offerings o WHERE o.term_id = ${q(term)} AND o.credits <> courses.credits);

-- Rebuild the timetable and exams of this term for the courses in the catalogue.
-- (The same statements are in server/src/termSchedule.ts, which the seed runs again after it adds courses.)
${rebuildSql(`term_id = ${q(term)}`)}`;
// Position of a term among the planner's terms: 2/69 is 0, 1/70 is 1, 2/70 is 2 … (as the seed
// numbers them); a summer term sits half a step after the second term before it.
const ordOf = (t) => { const kind = t[0], y = +t.slice(2); return kind === "S" ? (y - 69) * 2 + 0.5 : (y - 69) * 2 + (kind === "1" ? -1 : 0); };
const CURRENT = makeCurrent ? `
-- This term has started: make it the current one.
INSERT OR IGNORE INTO plan_terms (term_id, ord, max_credits) VALUES (${q(term)}, ${ordOf(term)}, ${term[0] === "S" ? 12 : 24});
UPDATE settings SET value = ${q(term)} WHERE key = 'current_term_id';
` : "";
function chunks(list, size) { const out = []; for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size)); return out; }
writeFileSync(`server/migrations/${outName}`, sql + CURRENT);
console.log(`server/migrations/${outName}: ${mr30.courses.size} courses, ${Object.keys(mr30.depts).length} headings, ${dated} dated exams (${(sql.length / 1024).toFixed(0)} KB)`);
