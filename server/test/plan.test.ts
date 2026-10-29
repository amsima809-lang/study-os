import { describe, it, expect, beforeAll } from "vitest";
import { openDb, type DB } from "../src/db.js";
import { seedDatabase } from "../src/seed.js";

let db: DB;

// Credit of a plan item: the course's credits, or 3 for a placeholder
// (all courses are 3 credits unless stated).
function planItemsWithCredits(db: DB) {
  return db
    .prepare(
      `SELECT pi.term_id, pi.course_code, pi.placeholder_label,
              COALESCE(c.credits, 3) AS credits, t.ord, t.max_credits
       FROM plan_items pi
       JOIN plan_terms t ON t.term_id = pi.term_id
       LEFT JOIN courses c ON c.code = pi.course_code`,
    )
    .all() as Array<{
      term_id: string;
      course_code: string | null;
      placeholder_label: string | null;
      credits: number;
      ord: number;
      max_credits: number;
    }>;
}

beforeAll(() => {
  db = openDb(":memory:");
  seedDatabase(db);
});

describe("Phase 1 — plan integrity", () => {
  it("total planned credits = 132", () => {
    const total = planItemsWithCredits(db).reduce((sum, r) => sum + r.credits, 0);
    expect(total).toBe(132);
  });

  it("every prerequisite is scheduled in an earlier term than the course that needs it", () => {
    // course -> ord of the term it is planned in
    const termOrd = new Map<string, number>();
    for (const r of planItemsWithCredits(db)) {
      if (r.course_code) termOrd.set(r.course_code, r.ord);
    }

    const prereqs = db
      .prepare("SELECT course_code, requires_code FROM prerequisites")
      .all() as Array<{ course_code: string; requires_code: string }>;

    for (const { course_code, requires_code } of prereqs) {
      const courseOrd = termOrd.get(course_code);
      // The catalog contains courses that aren't in the plan; only planned
      // courses need their prerequisites scheduled earlier.
      if (courseOrd === undefined) continue;
      const reqOrd = termOrd.get(requires_code);
      expect(reqOrd, `prerequisite ${requires_code} of planned ${course_code} must be in the plan`).toBeTypeOf(
        "number",
      );
      expect(
        reqOrd! < courseOrd,
        `${requires_code} (ord ${reqOrd}) must come before ${course_code} (ord ${courseOrd})`,
      ).toBe(true);
    }
  });

  it("no term exceeds its max_credits", () => {
    const perTerm = new Map<string, { sum: number; max: number }>();
    for (const r of planItemsWithCredits(db)) {
      const e = perTerm.get(r.term_id) ?? { sum: 0, max: r.max_credits };
      e.sum += r.credits;
      perTerm.set(r.term_id, e);
    }
    for (const [term, { sum, max }] of perTerm) {
      expect(sum, `term ${term} = ${sum} credits (max ${max})`).toBeLessThanOrEqual(max);
    }
  });

  it("bonus: no summer course depends on the immediately previous term", () => {
    const termOrd = new Map<string, number>();
    for (const r of planItemsWithCredits(db)) {
      if (r.course_code) termOrd.set(r.course_code, r.ord);
    }
    const prereqs = db
      .prepare("SELECT course_code, requires_code FROM prerequisites")
      .all() as Array<{ course_code: string; requires_code: string }>;

    // Summer terms start with "S/".
    const summerCourses = planItemsWithCredits(db).filter(
      (r) => r.course_code && r.term_id.startsWith("S/"),
    );
    for (const sc of summerCourses) {
      const scOrd = termOrd.get(sc.course_code!)!;
      for (const p of prereqs.filter((p) => p.course_code === sc.course_code)) {
        const reqOrd = termOrd.get(p.requires_code)!;
        expect(
          reqOrd < scOrd - 1,
          `summer course ${sc.course_code} needs ${p.requires_code} from the immediately previous term`,
        ).toBe(true);
      }
    }
  });
});

describe("Phase 1 — PLANNED credits by category", () => {
  it("matches the marketing curriculum structure (GE30/CORE42/REQ33/ELEC21/FREE6)", () => {
    const rows = db
      .prepare(
        `SELECT c.category AS category, SUM(c.credits) AS credits
         FROM plan_items pi JOIN courses c ON c.code = pi.course_code
         GROUP BY c.category`,
      )
      .all() as Array<{ category: string; credits: number }>;
    const byCat = Object.fromEntries(rows.map((r) => [r.category, r.credits]));
    expect(byCat.GE).toBe(30);
    expect(byCat.CORE).toBe(42);
    expect(byCat.MAJOR_REQ).toBe(33);

    // Placeholders carry the elective / free-elective credits (3 each).
    const elec = (
      db.prepare("SELECT COUNT(*) n FROM plan_items WHERE placeholder_label LIKE 'เอกเลือก%'").get() as {
        n: number;
      }
    ).n;
    const free = (
      db.prepare("SELECT COUNT(*) n FROM plan_items WHERE placeholder_label LIKE 'เลือกเสรี%'").get() as {
        n: number;
      }
    ).n;
    expect(elec * 3).toBe(21);
    expect(free * 3).toBe(6);
  });
});
