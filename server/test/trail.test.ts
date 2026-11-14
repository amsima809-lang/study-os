import { describe, it, expect, beforeAll } from "vitest";
import { openDb, type DB } from "../src/db.js";
import { seedDatabase } from "../src/seed.js";
import { findOrCreateUser } from "../src/auth.js";
import { buildTrail, nextTerm, termIndex, CREDIT_LIMITS, type TrailInput, type TrailCourse } from "../src/trail.js";
import { loadTrailInput, trailGoal, passedCourses } from "../src/trailRoutes.js";

describe("terms", () => {
  it("run first term, second term, summer, then the next year", () => {
    expect(nextTerm("1/69", true)).toBe("2/69");
    expect(nextTerm("2/69", true)).toBe("S/69");
    expect(nextTerm("S/69", true)).toBe("1/70");
    expect(nextTerm("2/69", false)).toBe("1/70"); // not taking summers
    expect(termIndex("2/69")).toBeLessThan(termIndex("S/69"));
    expect(termIndex("S/69")).toBeLessThan(termIndex("1/70"));
  });
});

// A small made-up curriculum: 4 core courses, 2 required, 2 electives to choose from 3,
// one general-education choice of 2, one free elective. 3 credits each: 30 credits.
const course = (code: string, category: TrailCourse["category"], y: number | null, s: number | null, group: string | null = null): TrailCourse =>
  ({ code, credits: 3, category, planYear: y, planSem: s, group });
const base = (over: Partial<TrailInput> = {}): TrailInput => ({
  required: { GE: 3, CORE: 12, MAJOR_REQ: 6, MAJOR_ELEC: 6, FREE: 3 },
  courses: [
    course("COR1001", "CORE", 1, 1), course("COR1002", "CORE", 1, 2), course("COR2001", "CORE", 2, 1), course("COR2002", "CORE", 2, 2),
    course("REQ3001", "MAJOR_REQ", 3, 1), course("REQ4001", "MAJOR_REQ", 4, 1),
    course("ELE3001", "MAJOR_ELEC", null, null), course("ELE3002", "MAJOR_ELEC", null, null), course("ELE4001", "MAJOR_ELEC", null, null),
    course("GEN1001", "GE", 1, 1, "G"), course("GEN1002", "GE", 1, 1, "G"),
  ],
  slots: [
    { kind: "MAJOR_ELEC", planYear: 3, planSem: 2, label: "Major Elective" }, { kind: "MAJOR_ELEC", planYear: 4, planSem: 2, label: "Major Elective" },
    { kind: "FREE", planYear: 4, planSem: 2, label: "Free Elective" },
  ],
  groups: { G: 1 },
  // every course has run in every recorded first and second term, none in summer
  history: Object.fromEntries(["COR1001", "COR1002", "COR2001", "COR2002", "REQ3001", "REQ4001", "ELE3001", "ELE3002", "ELE4001", "GEN1001", "GEN1002"].map((c) => [c, ["1/67", "2/67", "1/68", "2/68"]])),
  historyTerms: ["1/67", "2/67", "S/67", "1/68", "2/68", "S/68"],
  passed: [], current: [], otherCredits: 0,
  currentTerm: "2/69", targetTerm: "2/70", summers: false,
  ...over,
});
const codes = (t: ReturnType<typeof buildTrail>) => t.terms.map((x) => [x.term, x.items.map((i) => i.code ?? `(${i.category})`)]);

describe("the trail planner", () => {
  it("counts what is left: 30 credits, nothing done", () => {
    const t = buildTrail(base());
    expect(t.credits).toEqual({ total: 30, done: 0, thisTerm: 0, left: 30 });
  });

  it("says a goal is achievable, and paces the plan to it rather than cramming", () => {
    // 30 credits in two terms (1/70, 2/70): 15 a term is enough, although 24 are allowed.
    const t = buildTrail(base());
    expect(t.achievable).toBe(true);
    expect(t.finishTerm).toBe("2/70");
    expect(t.pace).toBe(15);
    expect(t.terms.map((x) => [x.term, x.credits])).toEqual([["1/70", 15], ["2/70", 15]]);
    expect(t.earliestTerm).toBe("2/70"); // 24 + 6 at full load still needs two terms
  });

  it("takes courses in the order the faculty plans them", () => {
    const t = buildTrail(base());
    const first = t.terms[0].items.map((i) => i.code);
    expect(first.slice(0, 2)).toEqual(["COR1001", "GEN1001"]); // year 1 semester 1 first
    expect(first).toContain("COR1002");
    expect(t.terms[1].items.map((i) => i.code)).toContain("REQ4001"); // the year-4 course comes last
  });

  it("says a goal is NOT achievable and gives the earliest term that is", () => {
    const t = buildTrail(base({ targetTerm: "1/70" })); // 30 credits cannot fit in one term of 24
    expect(t.achievable).toBe(false);
    expect(t.earliestTerm).toBe("2/70");
    expect(t.finishTerm).toBe("2/70");
    expect(t.terms[0].credits).toBe(CREDIT_LIMITS.regular); // shown at full pace, since the goal cannot be met anyway
  });

  it("does not ask for what is already passed or being taken this term", () => {
    const t = buildTrail(base({ passed: ["COR1001", "GEN1002"], current: ["COR1002", "ELE3001"] }));
    expect(t.credits).toEqual({ total: 30, done: 6, thisTerm: 6, left: 18 });
    const all = t.terms.flatMap((x) => x.items.map((i) => i.code));
    for (const c of ["COR1001", "COR1002", "ELE3001", "GEN1001", "GEN1002"]) expect(all).not.toContain(c);
    expect(t.terms.flatMap((x) => x.items).filter((i) => i.category === "MAJOR_ELEC")).toHaveLength(1); // one elective place left
  });

  it("offers a choice where the curriculum gives one, with the alternatives", () => {
    const t = buildTrail(base());
    const ge = t.terms.flatMap((x) => x.items).find((i) => i.category === "GE")!;
    expect(ge.type).toBe("choice");
    expect(ge.code).toBe("GEN1001");
    expect(ge.alternatives).toEqual(["GEN1002"]);
    const electives = t.terms.flatMap((x) => x.items).filter((i) => i.category === "MAJOR_ELEC");
    expect(electives).toHaveLength(2);
    expect(new Set(electives.map((e) => e.code)).size).toBe(2); // never the same course twice
    expect(electives[0].label).toBe("Major Elective");
    const free = t.terms.flatMap((x) => x.items).find((i) => i.category === "FREE")!;
    expect(free).toMatchObject({ type: "free", code: null, credits: 3 });
  });

  it("puts a course only in a kind of term it has run in before", () => {
    // REQ3001 has only ever run in second terms.
    const history = { ...base().history, REQ3001: ["2/67", "2/68"] };
    const t = buildTrail(base({ history, targetTerm: "2/71" }));
    const at = t.terms.find((x) => x.items.some((i) => i.code === "REQ3001"))!;
    expect(at.kind).toBe("2");
    const item = at.items.find((i) => i.code === "REQ3001")!;
    expect([item.offered, item.of]).toEqual([2, 2]); // offered in both recorded second terms
  });

  it("uses summer terms only when asked, only for courses that have run in summer, and within the summer limit", () => {
    const history = { ...base().history };
    for (const c of ["COR1001", "COR1002", "COR2001", "COR2002", "REQ3001"]) history[c] = [...history[c], "S/67", "S/68"];
    const without = buildTrail(base({ history, targetTerm: "2/70" }));
    expect(without.terms.some((x) => x.kind === "S")).toBe(false);
    const withSummer = buildTrail(base({ history, targetTerm: "S/69", summers: true, currentTerm: "1/69" }));
    // 1/69 now -> 2/69 (24) + S/69 (6 of the 12 allowed)
    expect(withSummer.achievable).toBe(true);
    const summer = withSummer.terms.find((x) => x.kind === "S")!;
    expect(summer.max).toBe(CREDIT_LIMITS.summer);
    for (const i of summer.items.filter((i) => i.code)) expect(history[i.code!]).toContain("S/68");
  });

  it("flags a course with no record at all, and still gives it a regular term", () => {
    const history = { ...base().history };
    delete history.REQ4001; // a new course: in no past list
    const t = buildTrail(base({ history }));
    const item = t.terms.flatMap((x) => x.items).find((i) => i.code === "REQ4001")!;
    expect(item.offered).toBeNull();
    expect(t.achievable).toBe(true);
  });

  it("reports a required course that has never run in the kinds of term being used", () => {
    const history = { ...base().history, REQ4001: ["S/67", "S/68"] }; // summer only, and she takes no summers
    const t = buildTrail(base({ history }));
    expect(t.achievable).toBe(false);
    expect(t.finishTerm).toBeNull();
    expect(t.unplaced).toEqual([{ code: "REQ4001", category: "MAJOR_REQ", reason: "NEVER_IN_THESE_TERMS" }]);
    expect(buildTrail(base({ history, summers: true, targetTerm: "S/70" })).unplaced).toEqual([]);
  });

  it("respects the student's own ceiling on credits per term", () => {
    const t = buildTrail(base({ maxPerTerm: 9, targetTerm: "2/71" }));
    expect(Math.max(...t.terms.map((x) => x.credits))).toBeLessThanOrEqual(9);
    expect(t.achievable).toBe(true); // 30 credits at 9 a term: four terms, 1/70 to 2/71
    expect(buildTrail(base({ maxPerTerm: 9, targetTerm: "2/70" })).achievable).toBe(false);
  });

  it("counts courses taken outside the major as free electives", () => {
    const t = buildTrail(base({ otherCredits: 3 }));
    expect(t.terms.flatMap((x) => x.items).some((i) => i.category === "FREE")).toBe(false);
    expect(t.credits.left).toBe(27);
  });

  it("is finished when nothing is left", () => {
    const all = base().courses.filter((c) => c.category !== "MAJOR_ELEC" && c.code !== "GEN1002").map((c) => c.code);
    const t = buildTrail(base({ passed: [...all, "ELE3001", "ELE3002"], otherCredits: 3 }));
    expect(t.credits.left).toBe(0);
    expect(t.terms).toEqual([]);
    expect(t.achievable).toBe(true);
    expect(t.finishTerm).toBe("2/69");
  });
});

describe("the trail planner on the real curriculum", () => {
  let db: DB;
  let user: string;
  beforeAll(() => {
    db = openDb(":memory:");
    seedDatabase(db, { reset: false });
    user = findOrCreateUser(db, { email: "trail@studyos.test", name: "T", avatar: "" });
    db.prepare("UPDATE user_profiles SET program_id = 'bus-mkt', university_id = 'ru', entry_year = '69', onboarded = 1 WHERE user_id = ?").run(user);
  });

  it("has the records it needs: seven past terms, and an order for every required course", () => {
    const terms = (db.prepare("SELECT term_id, COUNT(*) n FROM course_offering_history GROUP BY 1 ORDER BY 1").all() as { term_id: string; n: number }[]);
    expect(Object.fromEntries(terms.map((t) => [t.term_id, t.n]))).toEqual({ "1/67": 2982, "2/67": 2923, "S/67": 1001, "1/68": 2927, "S/68": 946, "1/69": 2865, "2/69": 2762 });
    expect((db.prepare("SELECT COUNT(*) n FROM program_courses WHERE category IN ('GE','CORE','MAJOR_REQ') AND plan_year IS NULL").get() as { n: number }).n).toBe(0);
    for (const p of db.prepare("SELECT program_id, kind, COUNT(*) n FROM program_plan_slots GROUP BY 1, 2").all() as { program_id: string; kind: string; n: number }[]) {
      const need = (db.prepare("SELECT required_credits n FROM program_credit_requirements WHERE program_id = ? AND category = ?").get(p.program_id, p.kind) as { n: number }).n;
      expect(p.n * 3, `${p.program_id} ${p.kind}`).toBe(need);
    }
  });

  it("gives a new Marketing student a default goal four years from entry, and a complete plan to it", () => {
    expect(trailGoal(db, user)).toMatchObject({ target: "2/72", summers: false, isDefault: true });
    const input = loadTrailInput(db, user)!;
    const t = buildTrail(input);
    expect(t.credits.total).toBe(132);
    expect(t.credits.left).toBe(132);
    expect(t.achievable).toBe(true);
    expect(t.unplaced).toEqual([]);
    // every credit of the degree is in the plan, and no term is over the university's limit
    expect(t.terms.reduce((n, x) => n + x.credits, 0)).toBe(132);
    for (const x of t.terms) expect(x.credits).toBeLessThanOrEqual(CREDIT_LIMITS.regular);
    // no course twice, and every required course is there
    const placed = t.terms.flatMap((x) => x.items.map((i) => i.code)).filter((c): c is string => !!c);
    expect(new Set(placed).size).toBe(placed.length);
    for (const r of db.prepare("SELECT course_code FROM program_courses WHERE program_id = 'bus-mkt' AND category IN ('CORE','MAJOR_REQ')").all() as { course_code: string }[]) expect(placed).toContain(r.course_code);
    // ten general-education courses, seven major electives, two free electives
    const by = (c: string) => t.terms.flatMap((x) => x.items).filter((i) => i.category === c).length;
    expect([by("GE"), by("MAJOR_ELEC"), by("FREE")]).toEqual([10, 7, 2]);
    // each course sits in a kind of term it has been offered in
    for (const x of t.terms) for (const i of x.items) if (i.code && i.offered !== null) expect(i.offered, `${i.code} in ${x.term}`).toBeGreaterThan(0);
  });

  it("an impossible goal is refused with the earliest term that works", () => {
    db.prepare("UPDATE user_profiles SET trail_target = '2/70' WHERE user_id = ?").run(user);
    const t = buildTrail(loadTrailInput(db, user)!);
    expect(t.achievable).toBe(false);
    expect(t.earliestTerm).not.toBeNull();
    expect(termIndex(t.earliestTerm!)).toBeGreaterThan(termIndex("2/70"));
    db.prepare("UPDATE user_profiles SET trail_target = NULL WHERE user_id = ?").run(user);
  });

  it("counts passed courses and this term's courses, whichever way they were recorded", () => {
    db.prepare("INSERT INTO passed_courses (user_id, course_code) VALUES (?, 'ACC1103'), (?, 'RAM1111')").run(user, user);
    db.prepare("INSERT INTO plan_items (user_id, term_id, course_code) VALUES (?, '2/69', 'MKT2101')").run(user);
    expect(passedCourses(db, user).sort()).toEqual(["ACC1103", "RAM1111"]);
    const t = buildTrail(loadTrailInput(db, user)!);
    expect(t.credits).toMatchObject({ done: 6, thisTerm: 3, left: 123 });
    const placed = t.terms.flatMap((x) => x.items.map((i) => i.code));
    for (const c of ["ACC1103", "RAM1111", "MKT2101"]) expect(placed).not.toContain(c);
  });

  it("has nothing to plan for a student with no major or at a university without a curriculum", () => {
    const other = findOrCreateUser(db, { email: "cmu@studyos.test", name: "C", avatar: "" });
    db.prepare("UPDATE user_profiles SET university_id = 'cmu', onboarded = 1 WHERE user_id = ?").run(other);
    expect(loadTrailInput(db, other)).toBeNull();
  });
});
