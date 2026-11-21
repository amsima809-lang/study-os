/**
 * Routes of the trail planner. The planning itself is in trail.ts; this file
 * reads what it needs from the database and stores the student's goal and the
 * courses they say they have passed.
 */
import { Router } from "express";
import { z } from "zod";
import type { DB } from "./db.js";
import { getSetting, hasCatalog, termCourses } from "./api.js";
import { buildTrail, nextTerm, parseTerm, termIndex, CREDIT_LIMITS, type Category, type TrailInput } from "./trail.js";
import { courseResults, passedCourses, passedCreditsByCategory, setPassedList, setResult } from "./results.js";
import { courseExams, etestingBefore, termExamWindows, type CourseExam } from "./termExams.js";

export { passedCourses };

const currentTerm = (db: DB) => getSetting(db, "current_term_id", "2/69");

type Profile = { program_id: string | null; entry_year: string | null; entry_term: string | null; target_years: number | null; trail_target: string | null; trail_summers: number; trail_max: number | null };

/**
 * The entry year as the two digits of its Buddhist-era year ("69"), however it was typed: "69",
 * "2569", Thai digits, or a Christian-era year ("2026"). Null when it cannot be read.
 */
export function entryYearOf(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim().replace(/[๐-๙]/g, (d) => String(d.charCodeAt(0) - 0x0e50));
  if (/^\d{2}$/.test(s)) return s;
  if (/^25\d{2}$/.test(s)) return s.slice(2);
  if (/^20\d{2}$/.test(s)) return String(+s + 543).slice(2);
  return null;
}

type Goal = { target: string; summers: boolean; maxPerTerm: number; isDefault: boolean };
/** The first regular term at or after a term (a summer is followed by the next year's first term). */
const regularFrom = (t: string) => (parseTerm(t).kind === "S" ? nextTerm(t, false) : t);
const regularAfter = (t: string, n: number) => { let x = t; for (let i = 0; i < n; i++) x = nextTerm(x, false); return x; };

/**
 * What she saved, as the screen can send it back. `target` is null when she has not set one (or
 * it is no longer in the future); `entryGuess` is four years from her entry year, if known.
 */
function storedGoal(db: DB, userId: string): { target: string | null; entryGuess: string | null; summers: boolean; maxPerTerm: number } {
  const p = db.prepare("SELECT program_id, entry_year, entry_term, target_years, trail_target, trail_summers, trail_max FROM user_profiles WHERE user_id = ?").get(userId) as Profile | undefined;
  const now = currentTerm(db);
  // A target that is no longer in the future (the term has moved on) counts as not set.
  const target = p?.trail_target && termIndex(p.trail_target) > termIndex(now) ? p.trail_target : null;
  // Four years from entry: in term 1 of 67 it ends with term 2 of 70; in term 2 of 69, with term 1 of 73.
  const entry = entryYearOf(p?.entry_year);
  const years = Math.ceil(p?.target_years ?? 4);
  const guess = entry === null ? null : p?.entry_term === "2" ? `1/${+entry + years}` : `2/${+entry + years - 1}`;
  // A ceiling saved under the old rules (3 to 24) is read as one the menu offers today: a
  // multiple of 3 from 9, or the limit (22).
  const stored = p?.trail_max ?? CREDIT_LIMITS.regular;
  const max = stored >= CREDIT_LIMITS.regular ? CREDIT_LIMITS.regular : Math.max(CREDIT_LIMITS.regularMin, Math.floor(stored / 3) * 3);
  return { target, entryGuess: guess && termIndex(guess) > termIndex(now) ? guess : null, summers: !!p?.trail_summers, maxPerTerm: max };
}

/**
 * The goal to plan for. What she set; otherwise a STARTING goal that the plan can meet, so the
 * first thing a new student sees is a plan, not "not on track" for a date nobody chose
 * (owner 2026-11-15, north star: calm defaults):
 *   four years from her entry year, when that can still be met;
 *   else the faculty's own pace (its plan spreads the degree over its regular terms, e.g. 132
 *   credits over 8: 17 a term, or her ceiling if lower), from the first term the plan fills;
 *   never sooner than the earliest finish at her ceiling.
 */
export function trailGoal(db: DB, userId: string): Goal {
  const g = storedGoal(db, userId);
  if (g.target) return { target: g.target, summers: g.summers, maxPerTerm: g.maxPerTerm, isDefault: false };
  const input = loadTrailInput(db, userId);
  return { target: input?.targetTerm ?? g.entryGuess ?? regularAfter(currentTerm(db), 2), summers: g.summers, maxPerTerm: g.maxPerTerm, isDefault: true };
}

/**
 * The starting goal for a plan she has not set a target for (see trailGoal): the latest of four
 * years from her entry, the faculty's own pace for what is left, and her earliest finish — so it
 * is never a crammed plan, and always one the plan can meet.
 */
function startingTarget(input: TrailInput, entryGuess: string | null): string {
  const now = input.currentTerm;
  // Plan towards a far target to learn what is left and the earliest finish.
  const open = buildTrail({ ...input, targetTerm: regularAfter(now, 30) });
  const planTerms = 2 * Math.max(0, ...input.courses.map((c) => c.planYear ?? 0)) || 8;
  const perTerm = Math.min(Math.ceil(open.credits.total / planTerms), input.maxPerTerm ?? CREDIT_LIMITS.regular);
  const terms = Math.max(1, Math.ceil(open.credits.left / perTerm));
  const candidates = [regularAfter(regularFrom(input.firstTerm ?? nextTerm(now, false)), terms - 1)];
  if (entryGuess) candidates.push(entryGuess);
  if (open.earliestTerm) candidates.push(regularFrom(open.earliestTerm));
  const target = candidates.sort((a, b) => termIndex(b) - termIndex(a))[0];
  // The goal is always a term still ahead (the screen offers targets from next term on).
  return termIndex(target) > termIndex(now) ? target : nextTerm(now, false);
}

/**
 * Everything the engine needs about one student, read from the database. Null if they have
 * no major with a curriculum. `ignoreChosen` plans as if this term's courses were not chosen
 * yet: that is how the course picker gets its suggestions.
 */
export function loadTrailInput(db: DB, userId: string, { ignoreChosen = false } = {}): TrailInput | null {
  const programId = (db.prepare("SELECT program_id FROM user_profiles WHERE user_id = ?").get(userId) as { program_id: string | null } | undefined)?.program_id;
  if (!programId || !hasCatalog(db, userId)) return null;
  const required = Object.fromEntries(
    (db.prepare("SELECT category, required_credits FROM program_credit_requirements WHERE program_id = ?").all(programId) as { category: Category; required_credits: number }[]).map((r) => [r.category, r.required_credits]),
  ) as Record<Category, number>;
  if (!("CORE" in required)) return null;
  const courses = db.prepare(
    `SELECT c.code, c.credits, pc.category, pc.plan_year AS planYear, pc.plan_sem AS planSem, c.name_en,
            CASE WHEN pc.category = 'GE' THEN c.choose_group END AS "group"
     FROM program_courses pc JOIN courses c ON c.code = pc.course_code WHERE pc.program_id = ?`,
  ).all(programId) as TrailInput["courses"];
  const slots = db.prepare("SELECT kind, plan_year AS planYear, plan_sem AS planSem, label FROM program_plan_slots WHERE program_id = ?").all(programId) as TrailInput["slots"];
  const groups = Object.fromEntries((db.prepare("SELECT id, choose FROM course_groups").all() as { id: string; choose: number }[]).map((g) => [g.id, g.choose]));
  const history: Record<string, string[]> = {};
  for (const r of db.prepare(
    "SELECT h.course_code, h.term_id FROM course_offering_history h WHERE h.course_code IN (SELECT course_code FROM program_courses WHERE program_id = ?)",
  ).all(programId) as { course_code: string; term_id: string }[]) (history[r.course_code] ??= []).push(r.term_id);
  const historyTerms = (db.prepare("SELECT DISTINCT term_id FROM course_offering_history").all() as { term_id: string }[]).map((r) => r.term_id);

  const now = currentTerm(db);
  const inMajor = new Set(courses.map((c) => c.code));
  const passed = passedCourses(db, userId);
  const current = ignoreChosen ? [] : termCourses(db, userId, now).filter((c) => !passed.includes(c));
  // Passed or current courses outside the major's lists count towards free electives.
  const outside = [...new Set([...passed, ...current])].filter((c) => !inMajor.has(c));
  const otherCredits = outside.length === 0 ? 0 : (db.prepare(
    `SELECT COALESCE(SUM(credits), 0) AS n FROM courses WHERE code IN (${outside.map(() => "?").join(",")})`,
  ).get(...outside) as { n: number }).n;
  const goal = storedGoal(db, userId);
  // Nothing chosen for this term yet: the plan starts with this term, and uses its published
  // course list (what really runs, and when each exam is) if there is one.
  const fromNow = current.length === 0;
  const listed = fromNow
    ? (db.prepare("SELECT course_code, exam_date, exam_slot FROM term_offerings WHERE term_id = ?").all(now) as { course_code: string; exam_date: string | null; exam_slot: string | null }[])
    : [];
  const published = listed.length > 0
    ? { term: now, offered: listed.map((r) => r.course_code).filter((c) => inMajor.has(c)), exams: Object.fromEntries(listed.filter((r) => r.exam_date && inMajor.has(r.course_code)).map((r) => [r.course_code, `${r.exam_date} ${r.exam_slot}`])) }
    : undefined;
  const input: TrailInput = {
    firstTerm: fromNow ? now : nextTerm(now, goal.summers), published,
    required, courses, slots, groups, history, historyTerms,
    passed: passed.filter((c) => inMajor.has(c)), current: current.filter((c) => inMajor.has(c)), otherCredits,
    currentTerm: now, targetTerm: goal.target ?? goal.entryGuess ?? regularAfter(now, 2), summers: goal.summers, maxPerTerm: goal.maxPerTerm,
  };
  if (!goal.target) input.targetTerm = startingTarget(input, goal.entryGuess);
  return input;
}

/**
 * The same plan with summer terms the other way round, so the screen can say what switching
 * them changes ("without summers the earliest is …").
 */
export function otherSummers(input: TrailInput): { summers: boolean; achievable: boolean; earliestTerm: string | null } {
  const summers = !input.summers;
  // A plan that starts next term starts in the summer straight after this term when summers are on.
  const firstTerm = input.firstTerm === input.currentTerm ? input.firstTerm : nextTerm(input.currentTerm, summers);
  const t = buildTrail({ ...input, summers, firstTerm });
  return { summers, achievable: t.achievable, earliestTerm: t.earliestTerm };
}

export type LastRun = {
  /** The past summer it ran in, e.g. "S/68". */
  term: string;
  /** Its classes then: days (1 = Monday … 7 = Sunday), times and room; `text` when no day was printed ("ไม่มีบรรยาย"). */
  classes: Array<{ days: number[]; start: string | null; end: string | null; room: string; kind: string; text: string }>;
  exam_date: string | null;
  exam_slot: string | null;
  exam_note: string | null;
};

/**
 * How each course ran in the latest past summer on record (the registrar's ม.ร.30, migration
 * 039). A future summer's own list is published only shortly before it, so this is the best
 * guide to its days and times. Courses that ran in no recorded summer are left out.
 */
export function lastSummer(db: DB, codes: string[], now: string): Record<string, LastRun> {
  if (codes.length === 0) return {};
  const rows = db.prepare(
    `SELECT term_id, course_code, sessions, exam_date, exam_slot, exam_note FROM term_offerings
     WHERE term_id LIKE 'S/%' AND course_code IN (${codes.map(() => "?").join(",")})`,
  ).all(...codes) as { term_id: string; course_code: string; sessions: string; exam_date: string | null; exam_slot: string | null; exam_note: string | null }[];
  const out: Record<string, LastRun> = {};
  for (const r of rows) {
    if (termIndex(r.term_id) > termIndex(now)) continue; // only summers that have happened
    if (out[r.course_code] && termIndex(out[r.course_code].term) >= termIndex(r.term_id)) continue;
    // One line per class as printed: "MWF 0830-1020" became three sessions, one a day.
    const byLine = new Map<string, LastRun["classes"][number]>();
    for (const x of JSON.parse(r.sessions) as { kind: string; text: string; weekday: number | null; start: string | null; end: string | null; room: string }[]) {
      const key = `${x.kind}|${x.text}|${x.room}`;
      const line = byLine.get(key) ?? byLine.set(key, { days: [], start: x.start, end: x.end, room: x.room, kind: x.kind, text: x.text }).get(key)!;
      if (x.weekday) line.days.push(x.weekday);
    }
    out[r.course_code] = { term: r.term_id, classes: [...byLine.values()], exam_date: r.exam_date, exam_slot: r.exam_slot, exam_note: r.exam_note };
  }
  return out;
}

/**
 * What the trail says to take THIS term, for the course picker: the plan as it would be with
 * nothing chosen yet. Empty when there is no plan, or the plan does not start this term.
 */
export function suggestedCourses(db: DB, userId: string): { term: string; codes: string[]; credits: number } {
  const input = loadTrailInput(db, userId, { ignoreChosen: true });
  if (!input) return { term: currentTerm(db), codes: [], credits: 0 };
  const first = buildTrail(input).terms[0];
  const here = first && first.term === input.currentTerm ? first.items.filter((i) => i.code) : [];
  return { term: input.currentTerm, codes: here.map((i) => i.code!), credits: here.reduce((n, i) => n + i.credits, 0) };
}

/**
 * This term on the trail screen: the courses she has registered for, and the ones the trail
 * would have her take this term that she has not. Ticking or unticking one there saves this
 * term's courses (PUT /api/term-courses), and the terms after it are planned again around them.
 * In order of code, whichever they are, so a row does not jump away when it is ticked or unticked.
 */
export type ThisTermCourse = { code: string; name_th: string; name_en: string | null; credits: number; category: string | null; classes: string | null; registered: boolean; suggested: boolean } & CourseExam;
export function thisTermCourses(db: DB, userId: string): { term: string; courses: ThisTermCourse[] } {
  const term = currentTerm(db);
  const registered = termCourses(db, userId, term);
  const suggested = suggestedCourses(db, userId).codes;
  const codes = [...new Set([...registered, ...suggested])];
  if (codes.length === 0) return { term, courses: [] };
  const rows = db.prepare(
    `SELECT c.code, c.name_th, c.name_en, c.credits, COALESCE(pc.category, c.category) AS category,
            (SELECT GROUP_CONCAT(cs.weekday || ' ' || cs.start_time || '-' || cs.end_time || '|' || COALESCE(cs.kind, ''), ';')
               FROM class_sessions cs WHERE cs.course_code = c.code AND cs.term_id = ?) AS classes
     FROM courses c
     LEFT JOIN program_courses pc ON pc.course_code = c.code
          AND pc.program_id = (SELECT program_id FROM user_profiles WHERE user_id = ?)
     WHERE c.code IN (${codes.map(() => "?").join(",")})`,
  ).all(term, userId, ...codes) as Omit<ThisTermCourse, "registered" | "suggested" | keyof CourseExam>[];
  const mine = new Set(registered), plan = new Set(suggested);
  const exams = courseExams(db, term, rows.map((r) => r.code));
  return {
    term,
    courses: rows
      .map((r) => ({ ...r, ...exams[r.code], registered: mine.has(r.code), suggested: plan.has(r.code) }))
      .sort((a, b) => a.code.localeCompare(b.code)),
  };
}

// ---- a new term: which of last term's courses were passed? ----
export type TermCheck = { term: string; due: boolean; courses: { term_id: string; code: string; name_th: string; name_en: string | null }[] };
/** Courses the student chose in an EARLIER term that have no result yet: not passed, and not marked "not passed" for that term. */
function unsettled(db: DB, userId: string, now: string): TermCheck["courses"] {
  const results = courseResults(db, userId);
  const passed = new Set(results.filter((r) => r.status === "PASSED").map((r) => r.course_code));
  const settled = new Set(results.filter((r) => r.term_id).map((r) => `${r.course_code} ${r.term_id}`));
  return (db.prepare(
    `SELECT DISTINCT pi.term_id, c.code, c.name_th, c.name_en
     FROM plan_items pi JOIN courses c ON c.code = pi.course_code
     WHERE pi.user_id = ? AND pi.course_code IS NOT NULL ORDER BY c.code`,
  ).all(userId) as TermCheck["courses"])
    .filter((r) => termIndex(r.term_id) < termIndex(now) && !passed.has(r.code) && !settled.has(`${r.code} ${r.term_id}`));
}
/** Asked once per term (`user_profiles.term_reviewed`), so the new term's plan starts from what is really done. */
export function termCheck(db: DB, userId: string): TermCheck {
  const now = currentTerm(db);
  const reviewed = (db.prepare("SELECT term_reviewed FROM user_profiles WHERE user_id = ?").get(userId) as { term_reviewed: string | null } | undefined)?.term_reviewed;
  const courses = reviewed === now ? [] : unsettled(db, userId, now);
  return { term: now, due: courses.length > 0, courses };
}
/**
 * Her answer: the ticked courses were passed, the others were not. Each is recorded against the
 * term it was taken in (results.ts), so the grades page shows the same thing and she is not asked
 * about them again. Only courses that were asked about are touched.
 */
export function answerTermCheck(db: DB, userId: string, codes: string[]): void {
  const now = currentTerm(db);
  const passed = new Set(codes);
  db.transaction(() => {
    for (const c of unsettled(db, userId, now)) setResult(db, userId, c.code, passed.has(c.code) ? "PASSED" : "FAILED", undefined, c.term_id);
    db.prepare("UPDATE user_profiles SET term_reviewed = ? WHERE user_id = ?").run(now, userId);
  })();
}

/**
 * What the new-term answer changed, for the sheet that follows it (owner 2026-11-15, north star:
 * a failed course gets a plan, not a red verdict): where each course not passed now sits in the
 * plan, the finish with and without them, and the earliest finish if the goal is out of reach.
 */
export function failEffect(db: DB, userId: string, failed: string[]) {
  const input = loadTrailInput(db, userId);
  if (!input || failed.length === 0) return null;
  const inMajor = new Set(input.courses.map((c) => c.code));
  const now = buildTrail(input);
  // The same plan had she passed them: the finish she would have had.
  const was = buildTrail({ ...input, passed: [...new Set([...input.passed, ...failed.filter((c) => inMajor.has(c))])] });
  const movedTo = Object.fromEntries(failed.map((c) => [c, now.terms.find((t) => t.items.some((i) => i.code === c || i.alternatives?.includes(c)))?.term ?? null]));
  return {
    failed, movedTo, wasFinish: was.achievable ? was.finishTerm : null, nowFinish: now.finishTerm, achievable: now.achievable,
    earliestTerm: now.earliestTerm, aim: now.earliestTerm ? regularFrom(now.earliestTerm) : null,
    goal: { target: input.targetTerm, summers: input.summers, maxPerTerm: input.maxPerTerm ?? CREDIT_LIMITS.regular },
  };
}

const TERM = /^[12S]\/\d{2}$/;
const goalSchema = z.object({
  /** Null keeps the starting goal (worked out again from the new ceiling and summers). */
  target: z.string().regex(TERM).nullable(),
  summers: z.boolean(),
  // A multiple of 3 (most courses are 3 credits), or the university's limit itself.
  maxPerTerm: z.number().int().min(CREDIT_LIMITS.regularMin).max(CREDIT_LIMITS.regular).refine((n) => n % 3 === 0 || n === CREDIT_LIMITS.regular, "a multiple of 3, or the limit"),
});
const passedSchema = z.object({ codes: z.array(z.string().regex(/^[A-Z]{3}\d{4}$/)).max(200) });

/**
 * Everything the trail screen shows: the goal, the plan, this term's courses and what switching
 * summers would change. Sent by GET /trail and, after a change, by PUT /trail/goal itself, so the
 * screen never depends on a second request to see what it just saved.
 */
export function trailPayload(db: DB, userId: string) {
  const input = loadTrailInput(db, userId);
  if (!input) return { available: false as const };
  const stored = storedGoal(db, userId);
  const goal: Goal = { target: input.targetTerm, summers: input.summers, maxPerTerm: stored.maxPerTerm, isDefault: !stored.target };
  const trail = buildTrail(input);
  const thisTerm = thisTermCourses(db, userId);
  // Terms she may aim for: every regular term from the next one, eight years on.
  const targets: string[] = [];
  for (let t = nextTerm(input.currentTerm, false), i = 0; i < 16; i++, t = nextTerm(t, false)) targets.push(t);
  if (!targets.includes(goal.target) && parseTerm(goal.target).kind !== "S") targets.push(goal.target);
  // Names for every course the plan mentions.
  const codes = [...new Set(trail.terms.flatMap((t) => t.items.flatMap((i) => [i.code, ...(i.alternatives ?? [])])).filter((c): c is string => !!c))];
  const names = codes.length === 0 ? [] : db.prepare(`SELECT code, name_th, name_en FROM courses WHERE code IN (${codes.map(() => "?").join(",")})`).all(...codes);
  const summerCodes = [...new Set(trail.terms.filter((t) => t.kind === "S").flatMap((t) => t.items.map((i) => i.code)).filter((c): c is string => !!c))];
  return {
    available: true as const, currentTerm: input.currentTerm, goal, targets, limits: CREDIT_LIMITS, trail, names,
    otherSummers: otherSummers(input), lastSummer: lastSummer(db, summerCodes, input.currentTerm),
    // This term's finals fortnight and e-Testing window; for later terms, which planned
    // courses were on an e-Testing list before (a term's own list is announced each term).
    examWindows: termExamWindows(db, input.currentTerm),
    etestingBefore: etestingBefore(db, trail.terms.filter((t) => t.term !== input.currentTerm).flatMap((t) => t.items.map((i) => i.code)).filter((c): c is string => !!c), input.currentTerm),
    history: [...input.historyTerms].sort((a, b) => termIndex(a) - termIndex(b)),
    chosenThisTerm: input.current.length, passedCount: input.passed.length, thisTerm,
    // Credits passed in each part of the curriculum (the bars the degree planner used to show).
    categories: (() => {
      const done = passedCreditsByCategory(db, userId);
      return (["GE", "CORE", "MAJOR_REQ", "MAJOR_ELEC", "FREE"] as Category[]).filter((c) => input.required[c] > 0).map((c) => ({ category: c, required: input.required[c], passed: Math.min(done[c] ?? 0, input.required[c]) }));
    })(),
  };
}

export function createTrailRouter(db: DB): Router {
  const router = Router();

  router.get("/trail", (req, res) => res.json(trailPayload(db, req.user!.id)));

  router.get("/trail/suggested", (req, res) => res.json(suggestedCourses(db, req.user!.id)));

  router.get("/trail/term-check", (req, res) => res.json(termCheck(db, req.user!.id)));

  router.post("/trail/term-check", (req, res) => {
    const parsed = passedSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "รายการวิชาไม่ถูกต้อง", code: "BAD_COURSES" });
    const asked = unsettled(db, req.user!.id, currentTerm(db)).map((c) => c.code);
    answerTermCheck(db, req.user!.id, parsed.data.codes);
    const kept = new Set(parsed.data.codes);
    res.json({ ok: true, passed: passedCourses(db, req.user!.id), effect: failEffect(db, req.user!.id, asked.filter((c) => !kept.has(c))) });
  });

  router.put("/trail/goal", (req, res) => {
    const parsed = goalSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "เป้าหมายไม่ถูกต้อง", code: "BAD_GOAL" });
    const { target, summers, maxPerTerm } = parsed.data;
    if (target !== null && termIndex(target) <= termIndex(currentTerm(db))) return res.status(400).json({ error: "เลือกภาคเรียนในอนาคต", code: "BAD_GOAL" });
    db.prepare("UPDATE user_profiles SET trail_target = ?, trail_summers = ?, trail_max = ? WHERE user_id = ?").run(target, summers ? 1 : 0, maxPerTerm, req.user!.id);
    // The plan as it is now, so the screen shows the change straight from this answer.
    res.json({ ok: true, ...trailPayload(db, req.user!.id) });
  });

  // The major's courses, with the ones the student has passed ticked.
  router.get("/trail/passed", (req, res) => {
    const userId = req.user!.id;
    const programId = (db.prepare("SELECT program_id FROM user_profiles WHERE user_id = ?").get(userId) as { program_id: string | null } | undefined)?.program_id;
    if (!programId || !hasCatalog(db, userId)) return res.json({ courses: [], passed: [] });
    const courses = db.prepare(
      `SELECT c.code, c.name_th, c.name_en, c.credits, pc.category, pc.plan_year AS planYear,
              CASE WHEN pc.category = 'GE' THEN c.choose_group END AS "group"
       FROM program_courses pc JOIN courses c ON c.code = pc.course_code WHERE pc.program_id = ? ORDER BY c.code`,
    ).all(programId) as { code: string; group: string | null }[];
    // "Choose N of" groups where every course is needed (N at least the group's size in this
    // major, e.g. the one-course required English) are required like any other course.
    const choose = Object.fromEntries((db.prepare("SELECT id, choose FROM course_groups").all() as { id: string; choose: number }[]).map((g) => [g.id, g.choose]));
    const size: Record<string, number> = {};
    for (const c of courses) if (c.group) size[c.group] = (size[c.group] ?? 0) + 1;
    res.json({ courses: courses.map((c) => ({ ...c, required: !c.group || (choose[c.group] ?? 1) >= size[c.group] })), passed: passedCourses(db, userId) });
  });

  // Make the passed courses exactly this list. A course that stays passed keeps its grade.
  router.put("/trail/passed", (req, res) => {
    const userId = req.user!.id;
    const parsed = passedSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "รายการวิชาไม่ถูกต้อง", code: "BAD_COURSES" });
    const wanted = [...new Set(parsed.data.codes)];
    const known = new Set(wanted.length === 0 ? [] : (db.prepare(`SELECT code FROM courses WHERE code IN (${wanted.map(() => "?").join(",")})`).all(...wanted) as { code: string }[]).map((r) => r.code));
    if (wanted.some((c) => !known.has(c))) return res.status(400).json({ error: "ไม่พบบางวิชา", code: "BAD_COURSES" });
    setPassedList(db, userId, wanted);
    res.json({ passed: passedCourses(db, userId) });
  });

  return router;
}
