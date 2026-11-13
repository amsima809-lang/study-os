import { describe, it, expect, beforeEach } from "vitest";
import { openDb, type DB } from "../src/db.js";
import { seedDatabase } from "../src/seed.js";
import { computeInternship, CATEGORY_REQUIRED } from "../src/planner.js";

let db: DB;
beforeEach(() => {
  db = openDb(":memory:");
  seedDatabase(db);
});

const TEST_USER = "legacy-user-0001";

function pass(code: string) {
  const term = db
    .prepare("SELECT term_id FROM plan_items WHERE course_code = ? LIMIT 1")
    .get(code) as { term_id: string } | undefined;
  db.prepare("INSERT OR REPLACE INTO enrollments (user_id, course_code, term_id, status) VALUES (?, ?, ?, 'PASSED')").run(
    TEST_USER,
    code,
    term?.term_id ?? "2/69",
  );
}

describe("Phase 7 — graduation readiness", () => {
  it("is not eligible with nothing passed", () => {
    const r = computeInternship(db, TEST_USER);
    expect(r.eligible).toBe(false);
    expect(r.rules.find((x) => x.id === "credits")!.detail).toBe("0/132");
  });

  it("checks core business credits", () => {
    ["ACC1103", "ACC1104", "DBC2101", "ECO1121", "ECO1122", "FIN2101",
     "HRM2101", "LAW2116", "MGT2101", "MGT2102", "MGT3101", "MGT3102",
     "MKT2101"].forEach(pass); // 13 of 14 = 39 credits
    expect(computeInternship(db, TEST_USER).rules.find((r) => r.id === "core")!.ok).toBe(false);
    pass("STA2016"); // 14th = 42 credits
    expect(computeInternship(db, TEST_USER).rules.find((r) => r.id === "core")!.ok).toBe(true);
  });
});

describe("Phase 7 — category requirements", () => {
  it("matches the marketing curriculum totals summing to 132", () => {
    const total = Object.values(CATEGORY_REQUIRED).reduce((s, n) => s + n, 0);
    expect(total).toBe(132);
    expect(CATEGORY_REQUIRED).toMatchObject({ GE: 30, CORE: 42, MAJOR_REQ: 33, MAJOR_ELEC: 21, FREE: 6 });
  });
});
