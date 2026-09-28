import { describe, it, expect, beforeEach } from "vitest";
import { openDb, type DB } from "../src/db.js";
import { seedDatabase } from "../src/seed.js";
import { computeInternship, CATEGORY_REQUIRED } from "../src/planner.js";

let db: DB;
beforeEach(() => {
  db = openDb(":memory:");
  seedDatabase(db);
});

function pass(code: string) {
  const term = db
    .prepare("SELECT term_id FROM plan_items WHERE course_code = ? LIMIT 1")
    .get(code) as { term_id: string } | undefined;
  db.prepare("INSERT OR REPLACE INTO enrollments (course_code, term_id, status) VALUES (?, ?, 'PASSED')").run(
    code,
    term?.term_id ?? "2/69",
  );
}

describe("Phase 7 — internship readiness", () => {
  it("is not eligible with nothing passed", () => {
    const r = computeInternship(db);
    expect(r.eligible).toBe(false);
    expect(r.rules.find((x) => x.id === "credits")!.detail).toBe("0/108");
  });

  it("passes the major-required rule only when all 8 are passed", () => {
    const major = ["PSY2401", "PSY2402", "PSY2404", "PSY3401", "PSY3402", "PSY3403", "PSY4401"];
    major.forEach(pass); // 7 of 8
    expect(computeInternship(db).rules.find((r) => r.id === "major")!.ok).toBe(false);
    pass("PSY4405"); // the 8th
    expect(computeInternship(db).rules.find((r) => r.id === "major")!.ok).toBe(true);
  });

  it("passes the elective rule at 3 passed electives", () => {
    pass("PSY2403");
    pass("PSY2405");
    expect(computeInternship(db).rules.find((r) => r.id === "elective")!.ok).toBe(false);
    pass("PSY2406");
    const r = computeInternship(db).rules.find((x) => x.id === "elective")!;
    expect(r.ok).toBe(true);
    expect(r.detail).toBe("3/3");
  });

  it("requires the 6 named foundation courses for the foundation rule", () => {
    // Pass enough foundation credits but miss a required core course.
    ["PSY1002", "PSY2001", "PSY2002", "PSY2006", "PSY2007", "PSY2008", "PSY2010",
     "PSY3005", "PSY4001", "PSY2005", "PSY2009", "PSY3001", "PSY3002"].forEach(pass);
    // 13*3 = 39 credits, but PSY3003 & PSY3004 not passed -> core not complete
    expect(computeInternship(db).rules.find((r) => r.id === "foundation")!.ok).toBe(false);
    pass("PSY3003");
    pass("PSY3004");
    expect(computeInternship(db).rules.find((r) => r.id === "foundation")!.ok).toBe(true);
  });
});

describe("Phase 7 — category requirements", () => {
  it("matches the curriculum totals summing to 138", () => {
    const total = Object.values(CATEGORY_REQUIRED).reduce((s, n) => s + n, 0);
    expect(total).toBe(138);
    expect(CATEGORY_REQUIRED).toMatchObject({ GE: 30, FOUNDATION: 45, MAJOR_REQ: 30, MAJOR_ELEC: 9, MINOR: 18, FREE: 6 });
  });
});
