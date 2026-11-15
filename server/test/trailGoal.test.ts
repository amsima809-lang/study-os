/**
 * Phase 69: changing the trail's goal (graduate by, most credits per term, summer terms) and
 * what the planner knows about summers.
 *
 * The sweep at the end tries EVERY combination of the three controls, through the real route,
 * for students at four points of the degree: their first term (nothing registered, and
 * registered), the middle of the degree, and their last term. Whatever the student has passed
 * or registered for this term is never planned again, and the plan for what is left follows
 * the goal as set.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import type { AddressInfo } from "node:net";
import express from "express";
import { openDb, type DB } from "../src/db.js";
import { seedDatabase } from "../src/seed.js";
import { findOrCreateUser } from "../src/auth.js";
import { setPassedList } from "../src/results.js";
import { createTrailRouter, loadTrailInput, suggestedCourses, trailGoal } from "../src/trailRoutes.js";
import { buildTrail, CREDIT_LIMITS, nextTerm, parseTerm, termIndex } from "../src/trail.js";
import { offering } from "../src/termSchedule.js";

let db: DB;
let server: Server;
let base = "";
let as = "";

beforeAll(async () => {
  db = openDb(":memory:");
  seedDatabase(db, { reset: false });
  const app = express();
  app.use(express.json());
  // The signed-in student is whoever the test says (the real app's requireAuth sets req.user).
  app.use((req, _res, next) => { (req as unknown as { user: { id: string } }).user = { id: as }; next(); });
  app.use("/api", createTrailRouter(db));
  server = app.listen(0, "127.0.0.1");
  await new Promise((resolve) => server.once("listening", resolve));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => server?.close());

const NOW = "2/69";
function student(email: string): string {
  const id = findOrCreateUser(db, { email, name: email, avatar: "" });
  db.prepare("UPDATE user_profiles SET program_id = 'bus-mkt', university_id = 'ru', entry_year = '69', onboarded = 1 WHERE user_id = ?").run(id);
  return id;
}
const register = (user: string, codes: string[]) => {
  db.prepare("DELETE FROM plan_items WHERE user_id = ? AND term_id = ?").run(user, NOW);
  for (const c of codes) db.prepare("INSERT INTO plan_items (user_id, term_id, course_code) VALUES (?, ?, ?)").run(user, NOW, c);
};
const put = async (user: string, goal: { target: string; summers: boolean; maxPerTerm: number }) => {
  as = user;
  const r = await fetch(`${base}/api/trail/goal`, { method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(goal) });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the screen's own type lives in the client
  return { status: r.status, body: (await r.json()) as any };
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const get = async (user: string) => { as = user; return (await (await fetch(`${base}/api/trail`)).json()) as any; };

describe("the university's credit limits (regulation B.E. 2560, clause 13.4)", () => {
  it("are 9 to 22 credits in a regular term and at most 9 in a summer", () => {
    expect(CREDIT_LIMITS).toEqual({ regular: 22, summer: 9, regularMin: 9 });
  });

  it("accepts a ceiling of 22 or a multiple of 3 from 9, and nothing else", async () => {
    const u = student("limits@test");
    for (const n of [9, 12, 15, 18, 21, 22]) expect((await put(u, { target: "2/72", summers: false, maxPerTerm: n })).status).toBe(200);
    for (const n of [3, 6, 8, 20, 23, 24]) expect((await put(u, { target: "2/72", summers: false, maxPerTerm: n })).status).toBe(400);
  });

  it("reads a stored goal as one the screen can send back: old ceilings, a target now past", async () => {
    const u = student("old-limit@test");
    // Ceilings the old rules allowed (3 to 24), and odd ones only a hand edit could make.
    for (const [stored, read] of [[24, 22], [23, 22], [3, 9], [6, 9], [10, 9], [20, 18], [21, 21]] as const) {
      db.prepare("UPDATE user_profiles SET trail_target = '2/72', trail_summers = 0, trail_max = ? WHERE user_id = ?").run(stored, u);
      const shown = await get(u);
      expect(shown.goal.maxPerTerm, `stored ${stored}`).toBe(read);
      // The plan is built on the value shown, exactly as if it had been chosen.
      for (const t of shown.trail.terms) expect(t.credits, `stored ${stored}`).toBeLessThanOrEqual(read);
      const resaved = await put(u, { target: shown.goal.target, summers: !shown.goal.summers, maxPerTerm: shown.goal.maxPerTerm });
      expect(resaved.status, `stored ${stored}`).toBe(200);
      const back = await put(u, { target: shown.goal.target, summers: shown.goal.summers, maxPerTerm: shown.goal.maxPerTerm });
      expect(back.body.trail, `stored ${stored}`).toEqual(shown.trail);
    }
    // A target that is no longer in the future (the current term moved on) reads as the default.
    db.prepare("UPDATE user_profiles SET trail_target = ? WHERE user_id = ?").run(NOW, u);
    const goal = trailGoal(db, u);
    expect(goal.isDefault).toBe(true);
    expect(termIndex(goal.target)).toBeGreaterThan(termIndex(NOW));
    expect((await put(u, { target: goal.target, summers: true, maxPerTerm: goal.maxPerTerm })).status).toBe(200);
  });
});

describe("past summers, from the registrar's ม.ร.30 (migration 039)", () => {
  it("holds every course of S/67 and S/68, the totals each document prints", () => {
    const n = (t: string) => (db.prepare("SELECT COUNT(*) n FROM term_offerings WHERE term_id = ?").get(t) as { n: number }).n;
    expect(n("S/67")).toBe(1001);
    expect(n("S/68")).toBe(946);
  });

  it("reads the summer day groups: MWF = Mon, Wed, Fri; TTS = Tue, Thu, Sat", () => {
    const eco = offering(db, "S/68", "ECO1122")!; // page 14: MWF 1430-1620 KTB 401, exam M 25 MAY 2026 A
    expect(eco.sessions.map((s) => s.weekday)).toEqual([1, 3, 5]);
    expect(eco.sessions[0]).toMatchObject({ text: "MWF 1430-1620", start: "14:30", end: "16:20", room: "KTB 401" });
    expect([eco.exam_date, eco.exam_slot]).toEqual(["2026-05-25", "A"]);
    const acc = offering(db, "S/68", "ACC1104")!; // page 1: TTS 1030-1220 KTB 301
    expect(acc.sessions.map((s) => s.weekday)).toEqual([2, 4, 6]);
  });

  it("leaves the current term's timetable alone (no class or exam rows for a past summer)", () => {
    expect((db.prepare("SELECT COUNT(*) n FROM class_sessions WHERE term_id LIKE 'S/%'").get() as { n: number }).n).toBe(0);
    expect((db.prepare("SELECT COUNT(*) n FROM exams WHERE term_id LIKE 'S/%'").get() as { n: number }).n).toBe(0);
  });
});

describe("saving the goal", () => {
  it("answers with the new plan itself, the same as asking again", async () => {
    const u = student("answer@test");
    const saved = await put(u, { target: "1/72", summers: true, maxPerTerm: 15 });
    expect(saved.status).toBe(200);
    const { ok, ...plan } = saved.body;
    expect(ok).toBe(true);
    expect(plan.goal).toMatchObject({ target: "1/72", summers: true, maxPerTerm: 15 });
    expect(plan).toEqual(await get(u));
  });

  it("puts summer terms in when switched on and takes them out when switched off, with their last timetable", async () => {
    const u = student("summer-switch@test");
    const off = (await put(u, { target: "1/72", summers: false, maxPerTerm: 18 })).body;
    const on = (await put(u, { target: "1/72", summers: true, maxPerTerm: 18 })).body;
    const back = (await put(u, { target: "1/72", summers: false, maxPerTerm: 18 })).body;
    const summers = (p: { trail: { terms: { kind: string }[] } }) => p.trail.terms.filter((t) => t.kind === "S").length;
    expect(summers(off)).toBe(0);
    expect(summers(on)).toBeGreaterThan(0);
    expect(summers(back)).toBe(0);
    expect(back.trail).toEqual(off.trail);
    // Each says what switching would do, and that is what switching did.
    expect(off.otherSummers).toEqual({ summers: true, achievable: on.trail.achievable, earliestTerm: on.trail.earliestTerm });
    expect(on.otherSummers).toEqual({ summers: false, achievable: off.trail.achievable, earliestTerm: off.trail.earliestTerm });
    // Courses in a summer term carry how they ran in the latest past summer.
    const inSummer = on.trail.terms.filter((t: { kind: string }) => t.kind === "S").flatMap((t: { items: { code: string | null }[] }) => t.items.map((i) => i.code)).filter(Boolean);
    expect(inSummer.length).toBeGreaterThan(0);
    for (const code of inSummer) expect(on.lastSummer[code]?.term).toBe("S/68");
    expect(off.lastSummer).toEqual({});
  });
});

// ---------- every combination, for students at four points of the degree ----------
type Persona = { name: string; setup: () => string };
const sum = (n: number[]) => n.reduce((a, b) => a + b, 0);

/** The courses the trail would have a student take, term by term, to pass some of them first. */
function planOf(user: string): string[][] {
  db.prepare("UPDATE user_profiles SET trail_target = '2/73', trail_summers = 0, trail_max = 21 WHERE user_id = ?").run(user);
  return buildTrail(loadTrailInput(db, user, { ignoreChosen: true })!).terms.map((t) => t.items.map((i) => i.code).filter((c): c is string => !!c));
}

const PERSONAS: Persona[] = [
  // First term, nothing registered yet: the plan starts with this term.
  { name: "first term, not registered", setup: () => student("first-none@test") },
  // First term, registered for what the trail suggests: the plan starts next term.
  { name: "first term, registered", setup: () => { const u = student("first-reg@test"); register(u, suggestedCourses(db, u).codes); return u; } },
  // Middle of the degree: three terms passed (about a third of the credits), this term registered.
  { name: "middle of the degree", setup: () => {
    const u = student("middle@test");
    const plan = planOf(u);
    setPassedList(db, u, plan.slice(0, 3).flat());
    register(u, planOf(u)[0]);
    return u;
  } },
  // Final year: everything passed but the last term's courses, registered for what runs now.
  { name: "final year, registered this term", setup: () => {
    const u = student("final-year@test");
    const plan = planOf(u);
    setPassedList(db, u, plan.slice(0, -1).flat());
    register(u, planOf(u)[0]);
    return u;
  } },
  // Last term: registered for every course still needed (only free-elective places may be left).
  { name: "last term, registered for everything left", setup: () => {
    const u = student("last-reg@test");
    const plan = planOf(u);
    setPassedList(db, u, plan.slice(0, -1).flat());
    register(u, planOf(u).flat());
    return u;
  } },
  // Nothing left: every named course passed or registered, and the free electives made up with
  // courses outside the major (they count as free electives).
  { name: "last term, nothing left after this term", setup: () => {
    const u = student("done@test");
    const plan = planOf(u);
    setPassedList(db, u, plan.slice(0, -1).flat());
    const outside = (db.prepare(
      `SELECT o.course_code AS code FROM term_offerings o JOIN courses c ON c.code = o.course_code
       WHERE o.term_id = ? AND c.credits = 3 AND o.course_code NOT IN (SELECT course_code FROM program_courses WHERE program_id = 'bus-mkt')
       ORDER BY o.course_code LIMIT 2`,
    ).all(NOW) as { code: string }[]).map((r) => r.code);
    register(u, [...planOf(u).flat(), ...outside]);
    return u;
  } },
  // Last courses, not registered yet: the plan is this term.
  { name: "last courses, not registered", setup: () => {
    const u = student("last-none@test");
    const plan = planOf(u);
    setPassedList(db, u, plan.slice(0, -1).flat());
    return u;
  } },
];

describe("every goal, for every kind of student", () => {
  for (const persona of PERSONAS) {
    it(`${persona.name}: follows each combination of graduate-by, credits per term and summers`, async () => {
      const u = persona.setup();
      const passed = new Set(loadTrailInput(db, u)!.passed);
      const registered = new Set(loadTrailInput(db, u)!.current);
      const first = await get(u);
      if (persona.name.startsWith("last term")) {
        // Nothing named is left: at most the free-elective places, any course of the university.
        const named = (first.trail.terms as { items: { code: string | null }[] }[]).flatMap((t) => t.items).filter((i) => i.code);
        expect(named).toEqual([]);
        expect(first.trail.credits.left).toBeLessThanOrEqual(6);
      }
      const maxes = [9, 12, 15, 18, 21, 22];
      let checked = 0;
      const earliest: Record<string, string | null> = {};
      const answers: Record<string, { earliest: string | null; achievable: boolean; other: { earliestTerm: string | null; achievable: boolean }; finish: string | null; pace: number; plan: string }> = {};
      for (const target of first.targets as string[]) {
        for (const maxPerTerm of maxes) {
          for (const summers of [false, true]) {
            const { status, body } = await put(u, { target, summers, maxPerTerm });
            expect(status).toBe(200);
            const where = `${persona.name}: ${target} / ${maxPerTerm} / summers ${summers}`;
            const { trail, goal } = body;
            // The answer is for the goal just set.
            expect(goal, where).toMatchObject({ target, summers, maxPerTerm });
            expect(trail.target, where).toBe(target);

            const terms = trail.terms as { term: string; kind: string; max: number; credits: number; items: { code: string | null; credits: number }[] }[];
            const codes = terms.flatMap((t) => t.items.map((i) => i.code)).filter((c): c is string => !!c);
            // Passed or registered courses are never planned again; nothing is planned twice.
            for (const c of codes) {
              expect(passed.has(c), `${where}: ${c} is passed`).toBe(false);
              expect(registered.has(c), `${where}: ${c} is registered`).toBe(false);
            }
            expect(new Set(codes).size, where).toBe(codes.length);
            // The plan holds exactly what is left, unless something cannot be placed at all.
            if (trail.unplaced.length === 0) expect(sum(terms.map((t) => t.credits)), where).toBe(trail.credits.left);
            for (const t of terms) {
              expect(sum(t.items.map((i) => i.credits)), where).toBe(t.credits);
              // Never over the student's ceiling, the university's limit, or 9 in a summer.
              expect(t.credits, `${where}: ${t.term}`).toBeLessThanOrEqual(t.kind === "S" ? Math.min(maxPerTerm, CREDIT_LIMITS.summer) : maxPerTerm);
              // Summer terms only when she takes them.
              if (!summers) expect(t.kind, where).not.toBe("S");
            }
            // Terms in order, starting now if nothing is registered, otherwise straight after this term.
            const start = registered.size > 0 ? nextTerm(NOW, summers) : NOW;
            if (terms.length > 0) {
              expect(termIndex(terms[0].term), where).toBeGreaterThanOrEqual(termIndex(start));
              for (let i = 1; i < terms.length; i++) expect(termIndex(terms[i].term), where).toBeGreaterThan(termIndex(terms[i - 1].term));
              for (const t of terms) expect(parseTerm(t.term).kind, where).toBe(t.kind);
            }
            // The verdict matches the plan.
            if (trail.credits.left === 0) {
              expect(terms, where).toEqual([]);
            } else {
              expect(trail.achievable, where).toBe(trail.finishTerm !== null && termIndex(trail.finishTerm) <= termIndex(target));
              if (trail.achievable) expect(termIndex(trail.earliestTerm), where).toBeLessThanOrEqual(termIndex(trail.finishTerm));
              else expect(trail.finishTerm, where).toBe(trail.earliestTerm);
            }
            // The earliest finish does not depend on the target.
            const key = `${maxPerTerm}/${summers}`;
            if (key in earliest) expect(trail.earliestTerm, where).toBe(earliest[key]);
            earliest[key] = trail.earliestTerm;
            // What switching summers would give is what switching gives (checked after the loop).
            expect(body.otherSummers.summers, where).toBe(!summers);
            answers[`${target}/${key}`] = {
              earliest: trail.earliestTerm, achievable: trail.achievable, other: body.otherSummers,
              finish: trail.finishTerm, pace: trail.pace, plan: JSON.stringify(terms.map((t) => [t.term, t.items.map((i) => i.code ?? "·")])),
            };
            if (trail.credits.left === 0) {
              expect(trail.achievable, where).toBe(true);
              expect(trail.earliestTerm, where).toBe(NOW);
            }
            checked++;
          }
        }
      }
      const targets = first.targets as string[];
      for (const target of targets) for (const m of maxes) for (const s of [false, true]) {
        // Every answer's "with/without summers" is exactly the answer for the switched setting.
        const a = answers[`${target}/${m}/${s}`], b = answers[`${target}/${m}/${!s}`];
        expect(a.other, `${persona.name}: ${target}/${m}/${s} predicts switching summers`).toEqual({ summers: !s, earliestTerm: b.earliest, achievable: b.achievable });
      }
      for (const m of maxes) for (const s of [false, true]) {
        // Graduate-by drives the plan: a later target never makes it finish sooner or work harder,
        // and when there is room to spare the plan really does change with the target.
        const row = targets.map((target) => answers[`${target}/${m}/${s}`]);
        for (let i = 1; i < row.length; i++) {
          if (row[i - 1].achievable && row[i].achievable) {
            expect(termIndex(row[i].finish!), `${persona.name}: ${targets[i]}/${m}/${s} finish`).toBeGreaterThanOrEqual(termIndex(row[i - 1].finish!));
            expect(row[i].pace, `${persona.name}: ${targets[i]}/${m}/${s} pace`).toBeLessThanOrEqual(row[i - 1].pace);
          }
          if (row[i - 1].achievable) expect(row[i].achievable, `${persona.name}: a later target than an achievable one`).toBe(true);
        }
      }
      // Summers never make the earliest finish later; a lower ceiling never makes it sooner.
      for (const m of maxes) {
        const [off, on] = [earliest[`${m}/false`], earliest[`${m}/true`]];
        if (off && on) expect(termIndex(on), `${persona.name}: ${m}`).toBeLessThanOrEqual(termIndex(off));
      }
      for (let i = 1; i < maxes.length; i++) for (const s of [false, true]) {
        const [lo, hi] = [earliest[`${maxes[i - 1]}/${s}`], earliest[`${maxes[i]}/${s}`]];
        if (lo && hi) expect(termIndex(hi), `${persona.name}: ${maxes[i]} vs ${maxes[i - 1]}, summers ${s}`).toBeLessThanOrEqual(termIndex(lo));
      }
      // For a student with years left, both controls matter: the plan differs across targets, and
      // the full limit finishes strictly sooner than 9 credits a term.
      const left = first.trail.credits.left as number;
      if (left > 3 * 22) {
        for (const s of [false, true]) {
          expect(new Set(targets.map((t) => answers[`${t}/21/${s}`].plan)).size, `${persona.name}: plans across targets, summers ${s}`).toBeGreaterThan(1);
          expect(termIndex(earliest[`22/${s}`]!), `${persona.name}: 22 vs 9, summers ${s}`).toBeLessThan(termIndex(earliest[`9/${s}`]!));
        }
      }
      if (persona.name === "last term, nothing left after this term") {
        expect(left).toBe(0);
        expect(Object.values(answers).every((a) => a.plan === "[]" && a.achievable && a.earliest === NOW)).toBe(true);
      }
      // Switching summers and back again gives the same plan as before.
      const a = (await put(u, { target: first.targets[3], summers: false, maxPerTerm: 15 })).body;
      await put(u, { target: first.targets[3], summers: true, maxPerTerm: 15 });
      const b = (await put(u, { target: first.targets[3], summers: false, maxPerTerm: 15 })).body;
      expect(b.trail).toEqual(a.trail);
      expect(checked).toBe(first.targets.length * maxes.length * 2);
    }, 60_000);
  }
});
