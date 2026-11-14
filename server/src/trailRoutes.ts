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

const currentTerm = (db: DB) => getSetting(db, "current_term_id", "2/69");

type Profile = { program_id: string | null; entry_year: string | null; target_years: number | null; trail_target: string | null; trail_summers: number; trail_max: number | null };

/** Courses the student has passed: marked here, or recorded with a grade in the degree planner. */
export function passedCourses(db: DB, userId: string): string[] {
  return (db.prepare(
    `SELECT course_code FROM passed_courses WHERE user_id = ?
     UNION SELECT course_code FROM enrollments WHERE user_id = ? AND status = 'PASSED'`,
  ).all(userId, userId) as { course_code: string }[]).map((r) => r.course_code);
}

/** The goal to plan for: what the student set, or four years from their entry year, or the term after next. */
export function trailGoal(db: DB, userId: string): { target: string; summers: boolean; maxPerTerm: number; isDefault: boolean } {
  const p = db.prepare("SELECT program_id, entry_year, target_years, trail_target, trail_summers, trail_max FROM user_profiles WHERE user_id = ?").get(userId) as Profile | undefined;
  const now = currentTerm(db);
  let target = p?.trail_target ?? null;
  if (!target) {
    // Entry year 67 and a four-year plan end with the second term of year 70.
    const entry = /^\d{2}$/.test(p?.entry_year ?? "") ? +p!.entry_year! : null;
    const guess = entry === null ? null : `2/${entry + Math.ceil(p?.target_years ?? 4) - 1}`;
    target = guess && termIndex(guess) > termIndex(now) ? guess : nextTerm(nextTerm(now, false), false);
  }
  return { target, summers: !!p?.trail_summers, maxPerTerm: p?.trail_max ?? CREDIT_LIMITS.regular, isDefault: !p?.trail_target };
}

/** Everything the engine needs about one student, read from the database. Null if they have no major with a curriculum. */
export function loadTrailInput(db: DB, userId: string): TrailInput | null {
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
  const current = termCourses(db, userId, now).filter((c) => !passed.includes(c));
  // Passed or current courses outside the major's lists count towards free electives.
  const outside = [...new Set([...passed, ...current])].filter((c) => !inMajor.has(c));
  const otherCredits = outside.length === 0 ? 0 : (db.prepare(
    `SELECT COALESCE(SUM(credits), 0) AS n FROM courses WHERE code IN (${outside.map(() => "?").join(",")})`,
  ).get(...outside) as { n: number }).n;
  const goal = trailGoal(db, userId);
  return {
    required, courses, slots, groups, history, historyTerms,
    passed: passed.filter((c) => inMajor.has(c)), current: current.filter((c) => inMajor.has(c)), otherCredits,
    currentTerm: now, targetTerm: goal.target, summers: goal.summers, maxPerTerm: goal.maxPerTerm,
  };
}

const TERM = /^[12S]\/\d{2}$/;
const goalSchema = z.object({
  target: z.string().regex(TERM),
  summers: z.boolean(),
  maxPerTerm: z.number().int().min(3).max(CREDIT_LIMITS.regular).refine((n) => n % 3 === 0, "a multiple of 3"),
});
const passedSchema = z.object({ codes: z.array(z.string().regex(/^[A-Z]{3}\d{4}$/)).max(200) });

export function createTrailRouter(db: DB): Router {
  const router = Router();

  router.get("/trail", (req, res) => {
    const userId = req.user!.id;
    const input = loadTrailInput(db, userId);
    if (!input) return res.json({ available: false });
    const goal = trailGoal(db, userId);
    const trail = buildTrail(input);
    // Terms she may aim for: every regular term from the next one, eight years on.
    const targets: string[] = [];
    for (let t = nextTerm(input.currentTerm, false), i = 0; i < 16; i++, t = nextTerm(t, false)) targets.push(t);
    if (!targets.includes(goal.target) && parseTerm(goal.target).kind !== "S") targets.push(goal.target);
    // Names for every course the plan mentions.
    const codes = [...new Set(trail.terms.flatMap((t) => t.items.flatMap((i) => [i.code, ...(i.alternatives ?? [])])).filter((c): c is string => !!c))];
    const names = codes.length === 0 ? [] : db.prepare(`SELECT code, name_th, name_en FROM courses WHERE code IN (${codes.map(() => "?").join(",")})`).all(...codes);
    res.json({
      available: true, currentTerm: input.currentTerm, goal, targets, limits: CREDIT_LIMITS, trail, names,
      history: [...input.historyTerms].sort((a, b) => termIndex(a) - termIndex(b)),
      chosenThisTerm: input.current.length, passedCount: input.passed.length,
    });
  });

  router.put("/trail/goal", (req, res) => {
    const parsed = goalSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "เป้าหมายไม่ถูกต้อง", code: "BAD_GOAL" });
    const { target, summers, maxPerTerm } = parsed.data;
    if (termIndex(target) <= termIndex(currentTerm(db))) return res.status(400).json({ error: "เลือกภาคเรียนในอนาคต", code: "BAD_GOAL" });
    db.prepare("UPDATE user_profiles SET trail_target = ?, trail_summers = ?, trail_max = ? WHERE user_id = ?").run(target, summers ? 1 : 0, maxPerTerm, req.user!.id);
    res.json({ ok: true });
  });

  // The major's courses, with the ones the student has passed ticked.
  router.get("/trail/passed", (req, res) => {
    const userId = req.user!.id;
    const programId = (db.prepare("SELECT program_id FROM user_profiles WHERE user_id = ?").get(userId) as { program_id: string | null } | undefined)?.program_id;
    if (!programId || !hasCatalog(db, userId)) return res.json({ courses: [], passed: [] });
    const courses = db.prepare(
      `SELECT c.code, c.name_th, c.name_en, c.credits, pc.category
       FROM program_courses pc JOIN courses c ON c.code = pc.course_code WHERE pc.program_id = ? ORDER BY c.code`,
    ).all(programId);
    res.json({ courses, passed: passedCourses(db, userId) });
  });

  // Replace the list of passed courses (those marked here; grades in the degree planner are left alone).
  router.put("/trail/passed", (req, res) => {
    const userId = req.user!.id;
    const parsed = passedSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: "รายการวิชาไม่ถูกต้อง", code: "BAD_COURSES" });
    const wanted = [...new Set(parsed.data.codes)];
    const known = new Set(wanted.length === 0 ? [] : (db.prepare(`SELECT code FROM courses WHERE code IN (${wanted.map(() => "?").join(",")})`).all(...wanted) as { code: string }[]).map((r) => r.code));
    if (wanted.some((c) => !known.has(c))) return res.status(400).json({ error: "ไม่พบบางวิชา", code: "BAD_COURSES" });
    db.transaction(() => {
      db.prepare("DELETE FROM passed_courses WHERE user_id = ?").run(userId);
      const ins = db.prepare("INSERT INTO passed_courses (user_id, course_code) VALUES (?, ?)");
      for (const c of wanted) ins.run(userId, c);
    })();
    res.json({ passed: passedCourses(db, userId) });
  });

  return router;
}
