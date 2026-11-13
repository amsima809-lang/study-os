/**
 * Phase 7 + Phase 14: Degree planner with GPA tracking, graduation pace,
 * and "what if" GPA calculator.
 */
import { Router } from "express";
import type { DB } from "./db.js";
import { getSetting, setSetting } from "./api.js";

export const CATEGORY_REQUIRED: Record<string, number> = {
  GE: 30,
  CORE: 42,
  MAJOR_REQ: 33,
  MAJOR_ELEC: 21,
  FREE: 6,
};

const TOTAL_REQUIRED = 132;

type EnrollRow = { course_code: string; status: string; category: string; credits: number; grade: string | null };
type GradeScale = { grade: string; points: number };

function enrollments(db: DB, userId: string): EnrollRow[] {
  return db
    .prepare(
      `SELECT e.course_code, e.status, c.category, c.credits, e.grade
       FROM enrollments e JOIN courses c ON c.code = e.course_code
       WHERE e.user_id = ?`,
    )
    .all(userId) as EnrollRow[];
}

function getGradeScale(db: DB, userId: string): GradeScale[] {
  const raw = getSetting(db, "grade_scale", "[]", userId);
  try {
    return JSON.parse(raw) as GradeScale[];
  } catch {
    return [];
  }
}

function gradeToPoints(scale: GradeScale[], grade: string): number | null {
  const entry = scale.find((s) => s.grade === grade);
  return entry ? entry.points : null;
}

type GpaResult = { gpa: number | null; totalCredits: number; totalPoints: number; courseCount: number };

function calculateGpa(courses: Array<{ credits: number; grade: string | null }>, scale: GradeScale[]): GpaResult {
  let totalCredits = 0;
  let totalPoints = 0;
  let courseCount = 0;
  for (const c of courses) {
    if (!c.grade) continue;
    const pts = gradeToPoints(scale, c.grade);
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

export type Rule = { id: string; ok: boolean; detail: string };

export function computeInternship(db: DB, userId: string): { eligible: boolean; rules: Rule[] } {
  const rows = enrollments(db, userId);
  const passed = rows.filter((r) => r.status === "PASSED");
  const creditsIn = (cat: string) =>
    passed.filter((r) => r.category === cat).reduce((s, r) => s + r.credits, 0);

  const totalPassed = passed.reduce((s, r) => s + r.credits, 0);

  const rules: Rule[] = [
    { id: "credits", ok: totalPassed >= 132, detail: `${totalPassed}/132` },
    { id: "ge", ok: creditsIn("GE") >= 30, detail: `${creditsIn("GE")}/30` },
    { id: "core", ok: creditsIn("CORE") >= 42, detail: `${creditsIn("CORE")}/42` },
    { id: "major_req", ok: creditsIn("MAJOR_REQ") >= 33, detail: `${creditsIn("MAJOR_REQ")}/33` },
    { id: "major_elec", ok: creditsIn("MAJOR_ELEC") >= 21, detail: `${creditsIn("MAJOR_ELEC")}/21` },
    { id: "free", ok: creditsIn("FREE") >= 6, detail: `${creditsIn("FREE")}/6` },
  ];

  return { eligible: rules.every((r) => r.ok), rules };
}

function earliestRetakeTerm(db: DB, courseCode: string, userId: string): string | null {
  const planned = db
    .prepare(
      `SELECT MIN(t.ord) AS o FROM plan_items pi JOIN plan_terms t ON t.term_id = pi.term_id
       WHERE pi.course_code = ? AND pi.user_id = ?`,
    )
    .get(courseCode, userId) as { o: number | null };
  if (planned.o == null) return null;
  const next = db
    .prepare("SELECT term_id FROM plan_terms WHERE ord > ? ORDER BY ord LIMIT 1")
    .get(planned.o) as { term_id: string } | undefined;
  return next?.term_id ?? null;
}

export function createPlannerRouter(db: DB): Router {
  const router = Router();

  router.get("/plan", (req, res) => {
    const userId = req.user!.id;
    const statusByCourse = new Map<string, string>();
    const gradeByCourse = new Map<string, string | null>();
    for (const e of db.prepare("SELECT course_code, status, grade FROM enrollments WHERE user_id = ?").all(userId) as Array<{
      course_code: string;
      status: string;
      grade: string | null;
    }>) {
      statusByCourse.set(e.course_code, e.status);
      gradeByCourse.set(e.course_code, e.grade);
    }

    const termRows = db
      .prepare("SELECT term_id, ord, max_credits FROM plan_terms ORDER BY ord")
      .all() as Array<{ term_id: string; ord: number; max_credits: number }>;
    const itemStmt = db.prepare(
      `SELECT pi.course_code, pi.placeholder_label, c.name_th, c.name_en, c.credits, c.category, c.difficulty
       FROM plan_items pi LEFT JOIN courses c ON c.code = pi.course_code
       WHERE pi.term_id = ? AND pi.user_id = ? ORDER BY pi.id`,
    );

    const scale = getGradeScale(db, userId);

    let running = 0;
    const terms = termRows.map((t) => {
      const items = (itemStmt.all(t.term_id, userId) as Array<{
        course_code: string | null;
        placeholder_label: string | null;
        name_th: string | null;
        name_en: string | null;
        credits: number | null;
        category: string | null;
        difficulty: number | null;
      }>).map((it) => ({
        course_code: it.course_code,
        placeholder_label: it.placeholder_label,
        name_th: it.name_th,
        name_en: it.name_en,
        credits: it.credits ?? 3,
        category: it.category,
        difficulty: it.difficulty,
        status: it.course_code ? statusByCourse.get(it.course_code) ?? "PLANNED" : null,
        grade: it.course_code ? gradeByCourse.get(it.course_code) ?? null : null,
      }));
      const credits = items.reduce((s, it) => s + it.credits, 0);
      running += credits;

      const termGpa = calculateGpa(
        items.filter((it) => it.status === "PASSED").map((it) => ({ credits: it.credits, grade: it.grade })),
        scale,
      );

      return {
        term_id: t.term_id,
        ord: t.ord,
        max_credits: t.max_credits,
        credits,
        runningTotal: running,
        items,
        gpa: termGpa.gpa,
      };
    });

    const allEnrollments = enrollments(db, userId);
    const passedByCat = new Map<string, number>();
    for (const e of allEnrollments) {
      if (e.status === "PASSED") passedByCat.set(e.category, (passedByCat.get(e.category) ?? 0) + e.credits);
    }
    const categoryProgress = Object.entries(CATEGORY_REQUIRED).map(([category, required]) => ({
      category,
      required,
      passed: passedByCat.get(category) ?? 0,
    }));
    const totalPassedCredits = [...passedByCat.values()].reduce((s, n) => s + n, 0);

    const passedWithGrades = allEnrollments
      .filter((e) => e.status === "PASSED")
      .map((e) => ({ credits: e.credits, grade: e.grade }));
    const overallGpa = calculateGpa(passedWithGrades, scale);

    const remainingCredits = Math.max(0, TOTAL_REQUIRED - totalPassedCredits);
    const futureTerms = termRows.filter((t) => {
      const termItems = itemStmt.all(t.term_id, userId) as Array<{ course_code: string | null }>;
      return termItems.some(
        (it) => it.course_code && (statusByCourse.get(it.course_code) ?? "PLANNED") === "PLANNED",
      );
    });
    const futureTermCount = Math.max(futureTerms.length, 1);
    const creditsPerTerm = Math.ceil(remainingCredits / futureTermCount);
    const paceStatus: "on_track" | "heavy" | "behind" =
      remainingCredits === 0 ? "on_track" : creditsPerTerm <= 21 ? "on_track" : creditsPerTerm <= 24 ? "heavy" : "behind";

    const prereqs = db.prepare("SELECT course_code, requires_code FROM prerequisites").all() as Array<{
      course_code: string;
      requires_code: string;
    }>;
    const nameOf = (code: string) =>
      (db.prepare("SELECT name_th FROM courses WHERE code = ?").get(code) as { name_th: string } | undefined)
        ?.name_th ?? code;

    const failed: Array<{ course_code: string; name_th: string; retakeTerm: string | null }> = [];
    const blocked: Array<{ course_code: string; name_th: string; dueTo: string[] }> = [];
    for (const [code, status] of statusByCourse) {
      if (status === "FAILED") {
        failed.push({ course_code: code, name_th: nameOf(code), retakeTerm: earliestRetakeTerm(db, code, userId) });
      }
    }
    const blockedMap = new Map<string, string[]>();
    for (const p of prereqs) {
      if (statusByCourse.get(p.requires_code) === "FAILED") {
        blockedMap.set(p.course_code, [...(blockedMap.get(p.course_code) ?? []), p.requires_code]);
      }
    }
    for (const [code, dueTo] of blockedMap) blocked.push({ course_code: code, name_th: nameOf(code), dueTo });

    res.json({
      terms,
      totalPassedCredits,
      totalPlannedCredits: TOTAL_REQUIRED,
      categoryProgress,
      failed,
      blocked,
      internship: computeInternship(db, userId),
      gpa: overallGpa,
      gradeScale: scale,
      pace: {
        remainingCredits,
        futureTerms: futureTermCount,
        creditsPerTerm,
        status: paceStatus,
      },
    });
  });

  router.post("/enrollments", (req, res) => {
    const userId = req.user!.id;
    const courseCode = String(req.body.course_code || "");
    const status = String(req.body.status || "");
    const grade: string | null = req.body.grade ?? null;
    if (!["PASSED", "FAILED", "PLANNED", "ENROLLED", "WITHDRAWN"].includes(status)) {
      return res.status(400).json({ error: "สถานะไม่ถูกต้อง" });
    }
    const planned = db
      .prepare(
        `SELECT pi.term_id FROM plan_items pi JOIN plan_terms t ON t.term_id = pi.term_id
         WHERE pi.course_code = ? AND pi.user_id = ? ORDER BY t.ord LIMIT 1`,
      )
      .get(courseCode, userId) as { term_id: string } | undefined;
    if (!planned) return res.status(404).json({ error: "ไม่พบวิชานี้ในแผน" });

    if (status === "PLANNED") {
      db.prepare("DELETE FROM enrollments WHERE course_code = ? AND term_id = ? AND user_id = ?").run(
        courseCode,
        planned.term_id,
        userId,
      );
    } else {
      db.prepare(
        `INSERT INTO enrollments (user_id, course_code, term_id, status, grade)
         VALUES (@u, @c, @t, @s, @g)
         ON CONFLICT(course_code, term_id) DO UPDATE SET status = @s, grade = @g`,
      ).run({ u: userId, c: courseCode, t: planned.term_id, s: status, g: grade });
    }
    res.json({ ok: true });
  });

  router.post("/plan/what-if", (req, res) => {
    const userId = req.user!.id;
    const hypothetical = req.body.courses as Array<{ course_code: string; grade: string }>;
    if (!Array.isArray(hypothetical)) return res.status(400).json({ error: "courses must be an array" });

    const scale = getGradeScale(db, userId);
    const allEnrollments = enrollments(db, userId);

    const current = allEnrollments
      .filter((e) => e.status === "PASSED")
      .map((e) => ({ credits: e.credits, grade: e.grade }));

    const currentGpa = calculateGpa(current, scale);

    const withHypo = [...current];
    for (const h of hypothetical) {
      const course = db.prepare("SELECT credits FROM courses WHERE code = ?").get(h.course_code) as { credits: number } | undefined;
      if (course) {
        withHypo.push({ credits: course.credits, grade: h.grade });
      }
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
