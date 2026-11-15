// Build a migration with each major's course lists from the faculty's official curriculum:
// the Business Administration chapter of Ramkhamhaeng's admission guide
// (ระเบียบการสมัครเข้าเป็นนักศึกษา), https://www.ru.ac.th/th/Center_study_plan/21/05_69.pdf for 2569.
//
// Usage (from the repo root; the PDF is NOT kept in the repo):
//   node scripts/import-ru-curriculum.mjs <chapter.pdf> <migration file name>      write the migration
//   node scripts/import-ru-curriculum.mjs <chapter.pdf> --report                   print what was read
//
// For each major the chapter prints, section by section, every course: code, Thai name,
// English name, credits. Section headings carry the credits required ("กลุ่มวิชาแกนธุรกิจ 42
// หน่วยกิต"). The script refuses to write unless, for every major, the courses read under each
// REQUIRED section add up to the credits its heading states, no course is listed twice,
// and the sections add up to a sensible degree total. Nothing is typed by hand.
import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { basename } from "node:path";
import { rebuildSql } from "./lib/term-rebuild-sql.mjs";

const require = createRequire(process.cwd() + "/server/package.json");
const pdfjs = await import(require.resolve("pdfjs-dist/legacy/build/pdf.mjs"));

const [pdfPath, outName, planName] = process.argv.slice(2);
const report = outName === "--report";
// Optional third argument: a second migration holding the ORDER the faculty recommends
// (which year and semester each course is planned for), read from the semester plans.
if (planName && !/^(\d{3}_[a-z0-9_]+\.sql|--names)$/.test(planName)) { console.error("the third argument must be a migration file name"); process.exit(1); }
if (!pdfPath || !(report || /^\d{3}_[a-z0-9_]+\.sql$/.test(outName ?? ""))) {
  console.error("usage: node scripts/import-ru-curriculum.mjs <chapter.pdf> <NNN_name.sql | --report>");
  process.exit(1);
}

// Where each major's curriculum is printed in the 2569 chapter, and the words its first page
// must carry (checked, so a different edition of the PDF is refused rather than misread).
// `plan` is the page of the major's semester-by-semester plan. `total` is the degree total the
// chapter states (page 12 for the B.B.A. majors, pages 42 and 45 for the B.Acc. ones).
const PROGRAMS = [
  { id: "bus-mgt", plan: 2, pages: [13, 15], mark: "สาขาวิชาการจัดการ", th: "การจัดการ", en: "Management", degree: "BBA", total: 132 },
  { id: "bus-fin", plan: 3, pages: [16, 18], mark: "สาขาวิชาการเงินและการธนาคาร", th: "การเงินและการธนาคาร", en: "Finance and Banking", degree: "BBA", total: 132 },
  { id: "bus-mkt", plan: 4, pages: [19, 21], mark: "สาขาวิชาการตลาด", th: "การตลาด", en: "Marketing", degree: "BBA", total: 132 },
  { id: "bus-adpr", plan: 5, pages: [22, 24], mark: "สาขาวิชาการสื่อสารธุรกิจดิจิทัล", th: "การสื่อสารธุรกิจยุคดิจิทัล", en: "Digital Business Communication", degree: "BBA", total: 132 },
  { id: "bus-tour", plan: 6, pages: [26, 29], mark: "อุตสาหกรรมบริการและการท่องเที่ยว", th: "อุตสาหกรรมบริการและการท่องเที่ยว", en: "Hospitality Industry and Tourism", degree: "BBA", total: 132 },
  { id: "bus-hrm", plan: 7, pages: [32, 34], mark: "สาขาวิชาการบริหารทรัพยากรมนุษย์", th: "การบริหารทรัพยากรมนุษย์", en: "Human Resource Management", degree: "BBA", total: 132 },
  { id: "bus-ib", plan: 8, pages: [35, 37], mark: "สาขาวิชาธุรกิจระหว่างประเทศ", th: "ธุรกิจระหว่างประเทศ", en: "International Business", degree: "BBA", total: 132 },
  { id: "bus-sbm", plan: 9, pages: [38, 40], mark: "สาขาวิชาการจัดการโลจิสติกส์และโซ่อุปทาน", th: "การจัดการโลจิสติกส์และโซ่อุปทาน", en: "Logistics and Supply Chain Management", degree: "BBA", total: 132 },
  { id: "bus-acc", plan: 10, pages: [42, 44], mark: "วิชาเอกการบัญชี", th: "การบัญชี", en: "Accounting", degree: "B.Acc", total: 129 },
  { id: "bus-accfin", plan: 11, pages: [45, 47], mark: "วิชาเอกการบัญชีและการเงิน", th: "การบัญชีและการเงิน", en: "Accounting and Financial", degree: "B.Acc", total: 129 },
];

// This PDF stores Thai tone marks and some vowels as private-use characters. The table
// gives each one back its real character (several positions of the same mark share one).
const PUA = { 0xf700: "ฐ", 0xf701: "ิ", 0xf702: "ี", 0xf703: "ึ", 0xf704: "ื", 0xf705: "่", 0xf706: "้", 0xf707: "๊", 0xf708: "๋", 0xf709: "์", 0xf70a: "่", 0xf70b: "้", 0xf70c: "๊", 0xf70d: "๋", 0xf70e: "์", 0xf70f: "ญ", 0xf710: "ั", 0xf711: "ํ", 0xf712: "็", 0xf713: "่", 0xf714: "้", 0xf715: "๊", 0xf716: "๋", 0xf717: "์", 0xf718: "ุ", 0xf719: "ู", 0xf71a: "ฺ" };
const thai = (s) =>
  [...s].map((c) => PUA[c.codePointAt(0)] ?? c).join("")
    .replace(/ํา/g, "ำ")                      // nikhahit + sara aa = sara am
    .replace(/\s+([ัิ-ฺ็-๎])/g, "$1") // no space before a mark
    .replace(/\s+/g, " ").trim();
const hasThai = (s) => /[฀-๿]/.test(s);
const leftover = (s) => [...s].filter((c) => c.codePointAt(0) >= 0xe000 && c.codePointAt(0) <= 0xf8ff);

async function readLines(path) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(readFileSync(path)), useSystemFonts: true, verbosity: 0 }).promise;
  const pages = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const content = await (await doc.getPage(p)).getTextContent();
    const items = content.items.filter((i) => i.str && i.str.trim()).map((i) => ({ x: i.transform[4], y: i.transform[5], s: thai(i.str) }));
    items.sort((a, b) => b.y - a.y || a.x - b.x);
    const lines = [];
    let cur = null;
    for (const i of items) {
      if (!cur || Math.abs(cur.y - i.y) > 2.5) lines.push((cur = { y: i.y, items: [] }));
      cur.items.push(i);
    }
    for (const l of lines) { l.items.sort((a, b) => a.x - b.x); l.text = l.items.map((i) => i.s).join(" "); }
    pages.push(lines);
  }
  return pages;
}

/**
 * Add the pieces of one printed line to a course: Thai name, English name, credits.
 * The credits are the single digit in the right-hand column. Digits and punctuation
 * elsewhere belong to the name they follow ("English for Tourism 1", "Safety & Security").
 */
function takeName(course, items) {
  let last = course.en.length ? course.en : course.th;
  let choosing = false;
  for (let k = 0; k < items.length; k++) {
    const i = items[k];
    if (/^\d$/.test(i.s) && i.x > 470) { course.credits ??= +i.s; continue; }
    if (i.s === "}" || i.s === "{") continue; // the brace of a choose-one group
    // "( RAM 1000 )": the course's code in the previous curriculum, printed before its name
    if (i.s === "(" && /^[A-Z]{3}$/.test(items[k + 1]?.s ?? "") && /^\d{4}$/.test(items[k + 2]?.s ?? "") && items[k + 3]?.s === ")") { k += 3; continue; }
    // "เลือก 1 วิชา" beside a choose-one group is not part of any name
    if (i.s === "เลือก") { choosing = true; continue; }
    if (choosing && /^\d$/.test(i.s)) continue;
    if (i.s === "วิชา") { choosing = false; continue; }
    if (i.x > 380 && /^\d$/.test(i.s)) continue;
    choosing = false;
    // a short all-capitals word straight after Thai text, with no English on the rest of the
    // line, is part of the Thai name ("…เศรษฐกิจ BCG")
    if (last === course.th && course.th.length && /^[A-Z]{2,5}$/.test(i.s) && !course.en.length && !items.slice(k + 1).some((n) => /[a-z]/.test(n.s))) { course.th.push(i.s); continue; }
    if (hasThai(i.s)) last = course.th;
    else if (/[A-Za-z]/.test(i.s)) last = course.en;
    last.push(i.s);
  }
}

// A heading changes the section only if it states credits ("… 42 หน่วยกิต").
const CREDITS = /(\d+)\s*หน่วยกิต/;
function sectionOf(text) {
  if (!CREDITS.test(text)) return undefined;
  const t = text.replace(/\s+/g, "");
  if (/เลือกเสรี/.test(t)) return "FREE";
  if (/หมวดวิชาศึกษาทั่วไป/.test(t)) return "GE";
  if (/แกน(ทาง)?ธุรกิจ|พ[ื้ี]+นฐานวิชาชีพ/.test(t)) return "CORE";
  if (/เอกบังคับ|วิชาเฉพาะบังคับ|ฝึกประสบการณ์วิชาชีพ/.test(t)) return "MAJOR_REQ";
  if (/เอกเลือก|วิชาเฉพาะเลือก|กลุ่มวิชาความสนใจเฉพาะ|ภาษาต่างประเทศเพื่องานอาชีพ/.test(t)) return "MAJOR_ELEC";
  return undefined;
}

const pages = await readLines(pdfPath);
const problems = [];
const programs = [];
for (const P of PROGRAMS) {
  const first = pages[P.pages[0] - 1].map((l) => l.text.replace(/\s+/g, "")).join("|");
  if (!first.includes(P.mark.replace(/\s+/g, ""))) problems.push(`${P.id}: page ${P.pages[0]} does not carry "${P.mark}": is this the 2569 chapter?`);
  let section = null, cur = null, freeSeen = false;
  const courses = [], stated = {}, electiveStated = [];
  const listedSince = {}; // courses read since the last heading of each section
  for (let p = P.pages[0]; p <= P.pages[1]; p++) {
    for (const line of pages[p - 1]) {
      const text = line.text;
      if (/ระเบียบการสมัครเข้าเป็นนักศึกษา/.test(text.replace(/\s+/g, ""))) continue; // page footer
      const head = line.items[0].s.replace(/\s+/g, "");
      const isCourse = /^[A-Z]{3}\d{4}$/.test(head);
      if (!isCourse) {
        const next = sectionOf(text);
        if (next) {
          const credits = +CREDITS.exec(text)[1];
          if (next === "FREE") { freeSeen = true; stated.FREE = credits; section = null; }
          else {
            section = next;
            if (next === "MAJOR_ELEC") electiveStated.push(credits);
            else if (next === "GE") stated.GE = credits; // a sub-heading never matches "หมวดวิชาศึกษาทั่วไป"
            // A chapter may open with a summary ("2. วิชาแกนธุรกิจ 42 หน่วยกิต") before the real
            // heading: a heading that had no courses under it is replaced, not added to.
            else stated[next] = (listedSince[next] ? stated[next] ?? 0 : 0) + credits;
            listedSince[next] = 0;
          }
          cur = null;
          continue;
        }
        // A line under a course carries the rest of its name and often its credits.
        // A line under a course, starting in the name column, carries the rest of its name
        // and often its credits. Anything starting further left is a heading or a note.
        if (cur && section && line.items[0].x >= 150 && !CREDITS.test(text)) takeName(cur, line.items);
        else cur = null;
        continue;
      }
      if (!section) { cur = null; continue; } // codes after "free electives" are lists of exclusions
      cur = { code: head, section, th: [], en: [], credits: null, page: p };
      listedSince[section] = (listedSince[section] ?? 0) + 1;
      takeName(cur, line.items.slice(1));
      courses.push(cur);
    }
  }
  // tidy names: "( RAM 1000 )" before a name is the course's old code
  for (const c of courses) {
    // "( RAM 1000 )" before a name is the course's old code; "เลือก 1 วิชา" beside a name
    // belongs to the choose-one group it is in, not to the name.
    const tidy = (t) => t.replace(/\s+/g, " ").replace(/\s+([,.)])/g, "$1").replace(/\(\s+/g, "(").replace(/\s*-\s*/g, "-").trim();
    c.name_th = tidy(c.th.join(" ").replace(/^\(\s*[A-Z]{3}\s*\d{4}\s*\)\s*/, "").replace(/\(?\s*เลือก\s*\d*\s*วิชา\s*\)?/g, " "));
    c.name_en = tidy(c.en.join(" ").replace(/^\(?\s*[A-Z]{3}\s*\d{4}\s*\)?\s*/, ""));
    // General-education courses are printed in choose-one groups whose credits stand beside the group.
    if (c.credits === null && c.section === "GE") c.credits = 3;
    if (!c.name_th && !c.name_en) problems.push(`${P.id}: no name read for ${c.code} (page ${c.page})`);
    if (leftover(c.name_th).length) problems.push(`${P.id}: ${c.code} has a character with no known Thai equivalent`);
  }
  const elective = electiveStated[0]; // the first elective heading states the total; later ones are its groups
  const required = { GE: stated.GE, CORE: stated.CORE, MAJOR_REQ: stated.MAJOR_REQ, MAJOR_ELEC: elective, FREE: stated.FREE };
  const total = Object.values(required).reduce((n, v) => n + (v ?? 0), 0);
  if (!freeSeen) problems.push(`${P.id}: the free-electives heading was not found (so the end of the lists is unknown)`);
  programs.push({ ...P, courses, required, sum: total });
}

// A course has the same credits in every major. Where one major's list leaves the number out
// (a slip in the printing), the number printed in another major's list is used.
const credits = new Map(), names = new Map(), notes = [];
for (const P of programs) for (const c of P.courses) if (c.credits !== null && !credits.has(c.code)) credits.set(c.code, c.credits);
for (const P of programs) for (const c of P.courses) {
  if (c.credits === null && credits.has(c.code)) {
    c.credits = credits.get(c.code);
    notes.push(`${c.code}: its credits are not printed in the ${P.en} list (page ${c.page}); ${c.credits} taken from the other majors' lists`);
  }
  if (c.credits === null) problems.push(`${P.id}: no credits read for ${c.code} (page ${c.page})`);
  else if (credits.get(c.code) !== c.credits) problems.push(`${c.code}: ${credits.get(c.code)} credits in one major, ${c.credits} in ${P.id}`);
}
for (const P of programs) {
  const seen = new Map();
  for (const c of P.courses) {
    if (seen.has(c.code)) problems.push(`${P.id}: ${c.code} is listed under ${seen.get(c.code)} and again under ${c.section}`);
    seen.set(c.code, c.section);
  }
  const sum = (sec) => P.courses.filter((c) => c.section === sec).reduce((n, c) => n + (c.credits ?? 0), 0);
  // Required sections: what is listed must add up to what the heading states.
  for (const sec of ["CORE", "MAJOR_REQ"]) {
    if (P.required[sec] === undefined) problems.push(`${P.id}: no heading found for ${sec}`);
    else if (sum(sec) !== P.required[sec]) problems.push(`${P.id}: ${sec} lists ${sum(sec)} credits but its heading states ${P.required[sec]}`);
  }
  // Elective sections: the list must offer at least what must be chosen.
  if (P.required.MAJOR_ELEC === undefined) problems.push(`${P.id}: no heading found for the major electives`);
  else if (sum("MAJOR_ELEC") < P.required.MAJOR_ELEC) problems.push(`${P.id}: ${sum("MAJOR_ELEC")} credits of electives are listed but ${P.required.MAJOR_ELEC} must be chosen`);
  if (P.required.GE === undefined || sum("GE") < P.required.GE) problems.push(`${P.id}: general education lists ${sum("GE")} credits, heading states ${P.required.GE}`);
  if (P.sum !== P.total) problems.push(`${P.id}: the sections add up to ${P.sum} credits; the chapter states ${P.total}`);
  // A second, independent reading: the chapter also prints each major's plan semester by
  // semester (page `plan`). Every required course must be in it, and every course code in
  // the plan must be one of the major's listed courses.
  const planCodes = new Set(pages[P.plan - 1].flatMap((l) => l.text.match(/[A-Z]{3}\s?\d{4}/g) ?? []).map((c) => c.replace(/\s/g, "")));
  const listed = new Set(P.courses.map((c) => c.code));
  P.notInPlan = P.courses.filter((c) => (c.section === "CORE" || c.section === "MAJOR_REQ") && !planCodes.has(c.code)).map((c) => c.code);
  P.planOnly = [...planCodes].filter((c) => !listed.has(c));
  if (planCodes.size < 20) problems.push(`${P.id}: the study plan on page ${P.plan} could not be read`);
  if (P.notInPlan.length) problems.push(`${P.id}: required but not in the semester plan on page ${P.plan}: ${P.notInPlan.join(" ")}`);
  if (P.planOnly.length) problems.push(`${P.id}: in the semester plan on page ${P.plan} but not in the major's lists: ${P.planOnly.join(" ")}`);
}
for (const P of programs) for (const c of P.courses) {
  // keep the fullest name seen
  const n = names.get(c.code);
  if (!n || (c.name_th.length + c.name_en.length > n.name_th.length + n.name_en.length)) names.set(c.code, c);
}

// ---------- the semester-by-semester plan: which year and semester each course is meant for ----------
// The page is two columns, each read top to bottom: "Freshman Year", "First Semester", courses,
// "Total 18", "Second Semester", … The right column carries on from where the left one stops.
const YEARS = { Freshman: 1, Sophomore: 2, Junior: 3, Senior: 4 };
const planNotes = [];
for (const P of programs) {
  const items = pages[P.plan - 1].flatMap((l) => l.items.map((i) => ({ ...i, y: l.y })));
  // Where the right column begins differs a little from page to page: it is where its course
  // codes (or the dots standing for an elective) start.
  const divide = Math.min(...items.filter((i) => i.x > 250 && /^([A-Z]{3}\d{4}|[A-Z]{0,3}\.{6,})$/.test(i.s.replace(/\s/g, ""))).map((i) => i.x)) - 1;
  const column = (left) => {
    const lines = [];
    let cur = null;
    for (const i of items.filter((i) => (i.x < divide) === left).sort((a, b) => b.y - a.y || a.x - b.x)) {
      if (!cur || Math.abs(cur.y - i.y) > 2.5) lines.push((cur = { y: i.y, items: [] }));
      cur.items.push(i);
    }
    return lines.map((l) => ({ ...l, text: l.items.sort((a, b) => a.x - b.x).map((i) => i.s).join(" ") }));
  };
  const listed = new Map(P.courses.map((c) => [c.code, c]));
  let year = 0, sem = 0, rangeFrom = null;
  P.order = new Map(); // code -> { year, sem }
  P.slots = [];        // elective places: { year, sem, kind, label }
  const semesters = new Map(); // "year.sem" -> { digits, total }
  const key = () => `${year}.${sem}`;
  for (const line of [...column(true), ...column(false)]) {
    const t = line.text;
    if (/Total for 4 years/.test(t)) continue;
    const y = /(Freshman|Sophomore|Junior|Senior) Year/.exec(t);
    if (y) { year = YEARS[y[1]]; continue; }
    const sm = /(First|Second) Semester/.exec(t);
    if (sm) { sem = sm[1] === "First" ? 1 : 2; continue; }
    if (!year || !sem) continue;
    const here = semesters.get(key()) ?? semesters.set(key(), { digits: 0, total: null }).get(key());
    const total = /T\s?otal\s+(\d+)/.exec(t);
    if (total) { here.total = +total[1]; continue; }
    for (const i of line.items) {
      const code = i.s.replace(/\s/g, "");
      if (/^[A-Z]{3}\d{4}-$/.test(code)) { rangeFrom = code.slice(0, 7); continue; } // "RAM1112-" … "RAM1128": choose one of the range
      if (/^[A-Z]{3}\d{4}$/.test(code)) {
        const codes = rangeFrom ? [...listed.keys()].filter((c) => c >= rangeFrom && c <= code && c.slice(0, 3) === code.slice(0, 3)) : [code];
        rangeFrom = null;
        for (const c of codes) {
          if (P.order.has(c)) problems.push(`${P.id}: ${c} appears twice in the semester plan`);
          P.order.set(c, { year, sem });
        }
      } else if (/^\d$/.test(i.s)) here.digits += +i.s;
    }
    const slot = /(Major Elective[^0-9(]*|Free Elective)/.exec(t);
    if (slot) P.slots.push({ year, sem, kind: /Free/.test(slot[1]) ? "FREE" : "MAJOR_ELEC", label: t.replace(/^[.\sA-Z]*\.{3,}\s*/, "").replace(/\s+\d$/, "").trim() });
  }
  // Each semester's credits, as read, must add up to the total printed under it.
  // (One line printed without its credits, as happens once in the Logistics plan, is noted, not refused:
  // the eight printed totals must still add up to the degree, which is checked just below.)
  for (const [k, v] of semesters) {
    if (v.total !== null && v.total - v.digits === 3) planNotes.push(`${P.en}, year ${k.replace(".", " semester ")}: one 3-credit line of the plan is printed without its credits (${v.digits} read, total ${v.total} printed)`);
    else if (v.total === null || v.digits !== v.total) problems.push(`${P.id}: semester ${k} of the plan adds up to ${v.digits} credits; the page prints ${v.total}`);
  }
  if (semesters.size !== 8) problems.push(`${P.id}: ${semesters.size} semesters were read from the plan, not 8`);
  const planTotal = [...semesters.values()].reduce((n, v) => n + (v.total ?? 0), 0);
  if (planTotal !== P.total) problems.push(`${P.id}: the semester plan adds up to ${planTotal} credits; the degree is ${P.total}`);
  for (const c of P.courses) if ((c.section === "CORE" || c.section === "MAJOR_REQ" || c.section === "GE") && !P.order.has(c.code)) problems.push(`${P.id}: ${c.code} (${c.section}) has no place in the semester plan`);
  const need = (kind) => P.required[kind] / 3;
  // (elective lines may wrap, so count what was found against what the sections require)
  for (const kind of ["MAJOR_ELEC", "FREE"]) {
    const n = P.slots.filter((x) => x.kind === kind).length;
    if (n !== need(kind)) problems.push(`${P.id}: ${n} ${kind} places in the semester plan; ${need(kind)} are required`);
  }
}

if (report) {
  for (const P of programs) {
    console.log(`\n${P.id}  ${P.en}  pages ${P.pages.join("-")}  total ${P.sum}  required ${JSON.stringify(P.required)}`);
    for (const s of ["GE", "CORE", "MAJOR_REQ", "MAJOR_ELEC"]) {
      const list = P.courses.filter((c) => c.section === s);
      console.log(`  ${s.padEnd(10)} ${String(list.length).padStart(3)} courses ${String(list.reduce((n, c) => n + (c.credits ?? 0), 0)).padStart(3)} cr: ${list.map((c) => c.code).join(" ")}`);
    }
  }
  for (const P of programs) console.log(`order ${P.id}: ${[1, 2, 3, 4].flatMap((y) => [1, 2].map((m) => `${y}.${m}:${[...P.order.values()].filter((o) => o.year === y && o.sem === m).length}c+${P.slots.filter((x) => x.year === y && x.sem === m).length}e`)).join(" ")}`);
  for (const P of programs) console.log(`plan check ${P.id}: required courses missing from the semester plan: ${P.notInPlan.join(" ") || "none"} | in the plan but not in the lists: ${P.planOnly.join(" ") || "none"}`);
  console.log(`\n${names.size} different courses in all`);
  for (const n of [...notes, ...planNotes]) console.log("note: " + n);
  if (process.argv.includes("--names")) for (const c of [...names.values()].sort((a, b) => a.code.localeCompare(b.code))) console.log(`${c.code}\t${c.credits}\t${c.name_th}\t${c.name_en}`);
}
if (problems.length) {
  console.error(`\n${report ? "" : "Not written. "}${problems.length} problem(s):\n  ` + problems.join("\n  "));
  process.exit(report ? 0 : 1);
}
if (report) process.exit(0);

// ---------- write the migration ----------
// Every table that points at a course (server/test/curriculum.test.ts checks this list is complete).
const REFERRING = ["chapter_mastery", "chapters", "class_sessions", "course_lectures", "enrollments", "etesting_courses", "exams", "lecture_transcripts", "materials", "mock_exams", "notes", "plan_items", "prerequisites", "prerequisites.requires_code", "questions", "reminders", "study_sessions", "study_tasks", "topics"];
const q = (v) => (v === null || v === undefined || v === "" ? "NULL" : `'${String(v).replace(/'/g, "''")}'`);
const sha = createHash("sha256").update(readFileSync(pdfPath)).digest("hex");
const all = [...names.values()].sort((a, b) => a.code.localeCompare(b.code));
const sql = `-- Migration ${outName.slice(0, 3)}: each major's courses, from the faculty's official curriculum.
-- GENERATED by scripts/import-ru-curriculum.mjs. Do not edit by hand: fix the script and run it again.
--
-- Source: Ramkhamhaeng University, admission guide 2569, Faculty of Business Administration chapter
--   ${basename(pdfPath)}  sha256 ${sha}
--   https://www.ru.ac.th/th/Center_study_plan/21/05_69.pdf  (pages 94 to 128 of the guide)
-- Checked while generating, for every major: the courses read under "core" and "major required"
-- add up to the credits their headings state; every required course is in the semester-by-semester
-- plan the chapter prints for that major, and the plan names no course outside the major's
-- lists (two separate parts of the document agreeing); no course is listed twice; a course has the same
-- credits in every major; the lists stop at the free-electives heading (the codes printed after
-- it are courses a student may NOT take as free electives).
${notes.map((n) => "-- Note: " + n).join("\n")}
--
-- This replaces what migrations 016 and 017 held, which had been read from the same guide less
-- carefully: they carried codes that exist in no university document and missed real courses.

-- Courses the catalogue did not have yet. Existing rows keep their names; only a missing
-- English or Thai name is filled in.
${all.map((c) => `INSERT INTO courses (code, name_th, name_en, credits, category) VALUES (${q(c.code)}, ${q(c.name_th) === "NULL" ? "''" : q(c.name_th)}, ${q(c.name_en)}, ${c.credits}, ${q(c.section)})
  ON CONFLICT(code) DO UPDATE SET credits = excluded.credits,
    name_th = CASE WHEN courses.name_th IS NULL OR courses.name_th = '' THEN excluded.name_th ELSE courses.name_th END,
    name_en = CASE WHEN courses.name_en IS NULL OR courses.name_en = '' THEN excluded.name_en ELSE courses.name_en END;`).join("\n")}

-- The majors themselves: name, degree total, and the credits each part requires.
${programs.map((P) => `INSERT INTO programs (id, faculty_id, code, name_th, name_en, degree, total_credits) VALUES (${q(P.id)}, 'fac-bus', ${q(P.id.replace("bus-", "").toUpperCase())}, ${q(P.th)}, ${q(P.en)}, ${q(P.degree)}, ${P.total})
  ON CONFLICT(id) DO UPDATE SET name_th = excluded.name_th, name_en = excluded.name_en, degree = excluded.degree, total_credits = excluded.total_credits;`).join("\n")}
DELETE FROM program_credit_requirements WHERE program_id IN (${programs.map((P) => q(P.id)).join(", ")});
${programs.map((P) => `INSERT INTO program_credit_requirements (program_id, category, required_credits) VALUES ${Object.entries(P.required).map(([k, v]) => `(${q(P.id)}, ${q(k)}, ${v})`).join(", ")};`).join("\n")}

-- Which courses belong to which major, and as what.
DELETE FROM program_courses WHERE program_id IN (${programs.map((P) => q(P.id)).join(", ")});
${programs.map((P) => `INSERT INTO program_courses (program_id, course_code, category) VALUES\n${P.courses.map((c) => `  (${q(P.id)}, ${q(c.code)}, ${q(c.section)})`).join(",\n")};`).join("\n")}
`;
writeFileSync(`server/migrations/${outName}`, sql + `
-- Codes that are in no major any more AND have no name: they came from the earlier reading and
-- appear in no university document. Removed, unless something a student made refers to one.
DELETE FROM courses
WHERE (name_th IS NULL OR name_th = '')
  AND code NOT IN (SELECT course_code FROM program_courses)
${REFERRING.map((t) => `  AND code NOT IN (SELECT ${t.includes(".") ? t.split(".")[1] : "course_code"} FROM ${t.split(".")[0]} WHERE ${t.includes(".") ? t.split(".")[1] : "course_code"} IS NOT NULL)`).join("\n")};

-- The catalogue has gained courses, so the timetable and exams of every term the app plans
-- (plan_terms) are rebuilt: the new courses get the class times and exam dates the registrar
-- published. Past terms kept only as reference (S/67, S/68, migration 039) get no timetable.
${rebuildSql("term_id IN (SELECT DISTINCT o.term_id FROM term_offerings o JOIN plan_terms p ON p.term_id = o.term_id)")}`);
console.log(`server/migrations/${outName}: ${programs.length} majors, ${all.length} courses, ${programs.reduce((n, P) => n + P.courses.length, 0)} placements`);

// ---------- the recommended order, as its own migration ----------
if (planName && planName.endsWith(".sql")) {
  const orderSql = `-- Migration ${planName.slice(0, 3)}: the order the faculty recommends for each major's courses.
-- GENERATED by scripts/import-ru-curriculum.mjs. Do not edit by hand: fix the script and run it again.
--
-- Source: the semester-by-semester "Program of Study" pages of the same chapter
--   ${basename(pdfPath)}  sha256 ${sha}
-- Checked while generating, for every major: eight semesters were read; the credits read in each
-- add up to the total printed under it; the eight totals add up to the degree; every required
-- and general-education course has a place; the elective places equal what the sections require.
${planNotes.map((n) => "-- Note: " + n).join("\n")}
--
-- plan_year 1 to 4 and plan_sem 1 or 2 say where the faculty puts a course in a four-year plan.
-- The long-term planner uses this as the order to take courses in. Electives have no fixed
-- course there, only places ("Major Elective", "Free Elective"): program_plan_slots.

ALTER TABLE program_courses ADD COLUMN plan_year INTEGER;
ALTER TABLE program_courses ADD COLUMN plan_sem INTEGER;
CREATE TABLE IF NOT EXISTS program_plan_slots (
  program_id TEXT NOT NULL REFERENCES programs(id) ON DELETE CASCADE,
  plan_year  INTEGER NOT NULL,
  plan_sem   INTEGER NOT NULL,
  kind       TEXT NOT NULL CHECK (kind IN ('MAJOR_ELEC', 'FREE')),
  seq        INTEGER NOT NULL,      -- 1, 2, … within the major, in plan order
  label      TEXT NOT NULL,         -- as printed, e.g. "Major Elective in Foreign Language (2)"
  PRIMARY KEY (program_id, kind, seq)
);
DELETE FROM program_plan_slots WHERE program_id IN (${programs.map((P) => q(P.id)).join(", ")});
${programs.map((P) => [...P.order].map(([code, o]) => `UPDATE program_courses SET plan_year = ${o.year}, plan_sem = ${o.sem} WHERE program_id = ${q(P.id)} AND course_code = ${q(code)};`).join("\n")).join("\n")}
${programs.map((P) => { const seq = { MAJOR_ELEC: 0, FREE: 0 }; const rows = [...P.slots].sort((a, b) => a.year - b.year || a.sem - b.sem).map((x) => `(${q(P.id)}, ${x.year}, ${x.sem}, ${q(x.kind)}, ${++seq[x.kind]}, ${q(x.label)})`); return `INSERT INTO program_plan_slots (program_id, plan_year, plan_sem, kind, seq, label) VALUES\n  ${rows.join(",\n  ")};`; }).join("\n")}
`;
  writeFileSync(`server/migrations/${planName}`, orderSql);
  console.log(`server/migrations/${planName}: order for ${programs.reduce((n, P) => n + P.order.size, 0)} placements, ${programs.reduce((n, P) => n + P.slots.length, 0)} elective places`);
}
