/**
 * Grades: the student's results term by term, the grade average, the "what if" calculator and
 * the grade scale. (This file began as the degree planner. The plan to graduate, the verdict on
 * it and the progress through the curriculum now belong to the trail: trail.ts, trailRoutes.ts.
 * Results themselves are read and written through results.ts.)
 */
import { Router } from "express";
import type { DB } from "./db.js";
import { getSetting, setSetting } from "./api.js";
import { courseResults, setResult, type CourseResult } from "./results.js";

type GradeScale = { grade: string; points: number };

function getGradeScale(db: DB, userId: string): GradeScale[] {
  const raw = getSetting(db, "grade_scale", "[]", userId);
  try {
    return JSON.parse(raw) as GradeScale[];
  } catch {
    return [];
  }
}

export type GpaResult = { gpa: number | null; totalCredits: number; totalPoints: number; courseCount: number };

/** The grade average over the courses that carry a grade on the scale, weighted by credits. */
export function calculateGpa(courses: Array<{ credits: number; grade: string | null }>, scale: GradeScale[]): GpaResult {
  let totalCredits = 0;
  let totalPoints = 0;
  let courseCount = 0;
  for (const c of courses) {
    if (!c.grade) continue;
    const pts = scale.find((s) => s.grade === c.grade)?.points;
    if (pts == null) continue;
    totalCredits += c.credits;
    totalPoints += c.credits * pts;
    courseCount++;
  }
  return {
    gpa: totalCredits > 0 ? Math.round((totalPoints / totalCredits) * 100) / 100 : null,
    totalCredits,
    totalPoints,
    courseCount,
  };
}

const passedWithGrades = (results: CourseResult[]) => results.filter((r) => r.status === "PASSED").map((r) => ({ credits: r.credits, grade: r.grade }));

type Item = {
  course_code: string | null; placeholder_label: string | null; name_th: string | null; name_en: string | null;
  credits: number; category: string | null; status: "PLANNED" | "PASSED" | "FAILED" | null; grade: string | null;
};

/** What the grades page shows: each term she has courses in, courses passed before the app, and the average. */
export function gradesFor(db: DB, userId: string) {
  const results = courseResults(db, userId);
  const scale = getGradeScale(db, userId);
  const inTerm = new Map(results.filter((r) => r.term_id).map((r) => [`${r.course_code} ${r.term_id}`, r]));
  const earlier = results.filter((r) => r.term_id === null);
  const earlierByCourse = new Map(earlier.map((r) => [r.course_code, r]));

  const termRows = db.prepare("SELECT term_id, ord, max_credits FROM plan_terms ORDER BY ord").all() as Array<{ term_id: string; ord: number; max_credits: number }>;
  const itemStmt = db.prepare(
    `SELECT pi.course_code, pi.placeholder_label, c.name_th, c.name_en, c.credits, c.category
     FROM plan_items pi LEFT JOIN courses c ON c.code = pi.course_code
     WHERE pi.term_id = ? AND pi.user_id = ? ORDER BY pi.id`,
  );
  const placed = new Set<string>();
  const terms = termRows.map((t) => {
    const items: Item[] = (itemStmt.all(t.term_id, userId) as Array<Omit<Item, "status" | "grade" | "credits"> & { credits: number | null }>).map((it) => {
      if (it.course_code) placed.add(it.course_code);
      // The result in THIS term; failing that, a course passed before the app shows as passed.
      const r = it.course_code ? inTerm.get(`${it.course_code} ${t.term_id}`) ?? earlierByCourse.get(it.course_code) : undefined;
      return { ...it, credits: it.credits ?? 3, status: it.course_code ? r?.status ?? "PLANNED" : null, grade: r?.grade ?? null };
    });
    return {
      term_id: t.term_id, ord: t.ord, max_credits: t.max_credits,
      credits: items.reduce((s, it) => s + it.credits, 0),
      items,
      gpa: calculateGpa(items.filter((it) => it.status === "PASSED"), scale).gpa,
    };
  }).filter((t) => t.items.length > 0);

  // Passed before she used the app: no term to show them under.
  const names = db.prepare("SELECT name_th, name_en FROM courses WHERE code = ?");
  const before = earlier.filter((r) => !placed.has(r.course_code)).sort((a, b) => a.course_code.localeCompare(b.course_code)).map((r) => ({
    course_code: r.course_code, ...(names.get(r.course_code) as { name_th: string; name_en: string | null }), credits: r.credits, grade: r.grade,
  }));

  // A course whose prerequisite she did not pass (only where prerequisites are recorded).
  const notPassed = new Set(results.filter((r) => r.status === "FAILED").map((r) => r.course_code));
  for (const r of results) if (r.status === "PASSED") notPassed.delete(r.course_code);
  const blockedMap = new Map<string, string[]>();
  for (const p of db.prepare("SELECT course_code, requires_code FROM prerequisites").all() as Array<{ course_code: string; requires_code: string }>) {
    if (notPassed.has(p.requires_code)) blockedMap.set(p.course_code, [...(blockedMap.get(p.course_code) ?? []), p.requires_code]);
  }
  const blocked = [...blockedMap].map(([course_code, dueTo]) => ({
    course_code, name_th: (names.get(course_code) as { name_th: string } | undefined)?.name_th ?? course_code, dueTo,
  }));

  return { terms, before, blocked, gpa: calculateGpa(passedWithGrades(results), scale), gradeScale: scale };
}

export function createPlannerRouter(db: DB): Router {
  const router = Router();

  router.get("/plan", (req, res) => res.json(gradesFor(db, req.user!.id)));

  // How a course went: PASSED (with a grade or none yet), FAILED, or PLANNED to clear it.
  router.post("/enrollments", (req, res) => {
    const courseCode = String(req.body.course_code || "");
    const status = String(req.body.status || "");
    const grade: string | null | undefined = req.body.grade === undefined ? undefined : req.body.grade === null || req.body.grade === "" ? null : String(req.body.grade).slice(0, 4);
    const termId: string | undefined = typeof req.body.term_id === "string" ? req.body.term_id : undefined;
    if (!["PASSED", "FAILED", "PLANNED"].includes(status)) return res.status(400).json({ error: "สถานะไม่ถูกต้อง" });
    const ok = setResult(db, req.user!.id, courseCode, status === "PLANNED" ? null : (status as "PASSED" | "FAILED"), grade, termId);
    if (!ok) return res.status(404).json({ error: "ไม่พบวิชานี้" });
    res.json({ ok: true });
  });

  router.post("/plan/what-if", (req, res) => {
    const userId = req.user!.id;
    const hypothetical = req.body.courses as Array<{ course_code: string; grade: string }>;
    if (!Array.isArray(hypothetical)) return res.status(400).json({ error: "courses must be an array" });

    const scale = getGradeScale(db, userId);
    const current = passedWithGrades(courseResults(db, userId));
    const currentGpa = calculateGpa(current, scale);

    const withHypo = [...current];
    for (const h of hypothetical) {
      const course = db.prepare("SELECT credits FROM courses WHERE code = ?").get(h.course_code) as { credits: number } | undefined;
      if (course) withHypo.push({ credits: course.credits, grade: h.grade });
    }
    const whatIfGpa = calculateGpa(withHypo, scale);

    res.json({
      currentGpa: currentGpa.gpa,
      whatIfGpa: whatIfGpa.gpa,
      currentCredits: currentGpa.totalCredits,
      whatIfCredits: whatIfGpa.totalCredits,
      change: whatIfGpa.gpa != null && currentGpa.gpa != null
        ? Math.round((whatIfGpa.gpa - currentGpa.gpa) * 100) / 100
        : null,
    });
  });

  router.get("/plan/grade-scale", (req, res) => {
    const userId = req.user!.id;
    res.json({ scale: getGradeScale(db, userId) });
  });

  router.put("/plan/grade-scale", (req, res) => {
    const userId = req.user!.id;
    const scale = req.body.scale as GradeScale[];
    if (!Array.isArray(scale)) return res.status(400).json({ error: "scale must be an array" });
    setSetting(db, "grade_scale", JSON.stringify(scale), userId);
    res.json({ ok: true, scale });
  });

  return router;
}
