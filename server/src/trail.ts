/**
 * The trail planner: from where a student is now to their degree, term by term.
 *
 * It answers two questions. Can I graduate by the term I want? And what would I
 * take each term to get there? It works from official records only:
 *   - what the major requires, and the order the faculty recommends (migrations 033, 035);
 *   - which terms each course has actually been offered in (migration 034);
 *   - the university's limit on credits per term.
 * The past does not bind the future: a course placed in a "first term" because it
 * has always run in first terms may not run next year. Every placed course
 * therefore carries how often it has been offered in that kind of term, and the
 * plan should be looked at again when each new course list is published.
 *
 * This file is the engine: a pure function with no database in it (see
 * trailRoutes.ts for the routes), so it can be tested with made-up curricula.
 */

export type TermKind = "1" | "2" | "S";
export type Category = "GE" | "CORE" | "MAJOR_REQ" | "MAJOR_ELEC" | "FREE";

/** "2/69" -> second term of academic year 2569; "S/69" is the summer term after it. */
export function parseTerm(id: string): { kind: TermKind; year: number } {
  const m = /^([12S])\/(\d{2})$/.exec(id);
  if (!m) throw new Error(`not a term: ${id}`);
  return { kind: m[1] as TermKind, year: +m[2] };
}
const ORDER: Record<TermKind, number> = { "1": 0, "2": 1, S: 2 };
/** A number that grows with time, for comparing terms. */
export const termIndex = (id: string) => { const t = parseTerm(id); return t.year * 3 + ORDER[t.kind]; };
export function nextTerm(id: string, summers: boolean): string {
  const t = parseTerm(id);
  if (t.kind === "1") return `2/${t.year}`;
  if (t.kind === "2") return summers ? `S/${t.year}` : `1/${t.year + 1}`;
  return `1/${t.year + 1}`;
}

/**
 * The university's limit on credits a student may register for in one term
 * (Ramkhamhaeng's admission guide: 24 in a regular term, 12 in a summer term).
 * A student in their final term may ask the faculty for more; that is not assumed.
 */
export const CREDIT_LIMITS = { regular: 24, summer: 12 } as const;

export type TrailCourse = {
  code: string;
  credits: number;
  category: Exclude<Category, "FREE">;
  /** Where the faculty's four-year plan puts it (1..4, 1..2); null for electives. */
  planYear: number | null;
  planSem: number | null;
  /** General education: the "choose N of these" group it belongs to, if any. */
  group: string | null;
  /** For matching an elective place that names a kind of elective. */
  name_en?: string | null;
};
export type TrailSlot = { kind: "MAJOR_ELEC" | "FREE"; planYear: number; planSem: number; label: string };

export type TrailInput = {
  required: Record<Category, number>;
  courses: TrailCourse[];
  slots: TrailSlot[];
  /** How many courses must be taken from each choose-group. */
  groups: Record<string, number>;
  /** Terms each course has been offered in, from the registrar's past lists. */
  history: Record<string, string[]>;
  /** Every term those lists cover (so "never offered" can be told from "no record"). */
  historyTerms: string[];
  /** Courses already passed, and those being taken this term (counted as done). */
  passed: string[];
  current: string[];
  /** Credits of passed or current courses that are outside the major's lists (they count as free electives). */
  otherCredits: number;
  currentTerm: string;
  targetTerm: string;
  summers: boolean;
  /** The student's own ceiling per regular term, if lower than the university's. */
  maxPerTerm?: number;
};

export type TrailItem = {
  /** A course the major names, or a place for an elective of the student's choice. */
  type: "course" | "choice" | "free";
  code: string | null;
  credits: number;
  category: Category;
  /** For a choice: the other courses that would fill the same requirement. */
  alternatives?: string[];
  /** For an elective place: the label the faculty's plan prints. */
  label?: string;
  /** Out of `of` recorded terms of this kind, how many offered the course. Null when there is no record at all. */
  offered: number | null;
  of: number;
};
export type TrailTerm = { term: string; kind: TermKind; max: number; credits: number; items: TrailItem[] };
export type Trail = {
  achievable: boolean;
  /** The term the plan below finishes in. */
  finishTerm: string | null;
  /** The earliest finish possible at the full credit limit every term. */
  earliestTerm: string | null;
  target: string;
  credits: { total: number; done: number; thisTerm: number; left: number };
  /** Credits per regular term the plan is paced at. */
  pace: number;
  terms: TrailTerm[];
  /** Requirements that could not be placed in any term (the records show no term they run in). */
  unplaced: Array<{ code: string | null; category: Category; reason: "NEVER_IN_THESE_TERMS" }>;
  /** Kinds of term the past lists cover, e.g. { "1": 3, "2": 2, "S": 2 }. */
  recorded: Record<TermKind, number>;
};

type Unit = {
  type: TrailItem["type"];
  category: Category;
  credits: number;
  rank: number;
  /** Courses that would satisfy it (one for a required course; several for a choice; none for a free elective). */
  candidates: string[];
  label?: string;
};

const HORIZON = 24; // terms to look ahead when working out the earliest finish

export function buildTrail(input: TrailInput): Trail {
  const done = new Set([...input.passed, ...input.current]);
  const byCode = new Map(input.courses.map((c) => [c.code, c]));
  const recorded: Record<TermKind, number> = { "1": 0, "2": 0, S: 0 };
  for (const t of input.historyTerms) recorded[parseTerm(t).kind]++;
  const offeredIn = (code: string, kind: TermKind) => (input.history[code] ?? []).filter((t) => parseTerm(t).kind === kind).length;
  const everOffered = (code: string) => (input.history[code] ?? []).length > 0;
  const rankOf = (y: number | null, s: number | null, code?: string) =>
    // No place in the faculty's plan (an elective): the first digit of a course number is its year.
    (y ?? Math.min(4, Math.max(1, +(code?.[3] ?? "4")))) * 10 + (s ?? 2);

  // ---------- what is still to do ----------
  const units: Unit[] = [];
  const credit = (codes: Iterable<string>, cat: Category) =>
    [...codes].reduce((n, c) => n + (byCode.get(c)?.category === cat ? byCode.get(c)!.credits : 0), 0);

  for (const c of input.courses) {
    if ((c.category === "CORE" || c.category === "MAJOR_REQ") && !done.has(c.code)) {
      units.push({ type: "course", category: c.category, credits: c.credits, rank: rankOf(c.planYear, c.planSem, c.code), candidates: [c.code] });
    }
  }
  // General education: so many from each group; a course outside every group is simply required.
  const ge = input.courses.filter((c) => c.category === "GE");
  const groups = new Map<string, TrailCourse[]>();
  for (const c of ge) {
    if (!c.group) { if (!done.has(c.code)) units.push({ type: "course", category: "GE", credits: c.credits, rank: rankOf(c.planYear, c.planSem, c.code), candidates: [c.code] }); continue; }
    (groups.get(c.group) ?? groups.set(c.group, []).get(c.group)!).push(c);
  }
  for (const [id, members] of groups) {
    const need = (input.groups[id] ?? 1) - members.filter((m) => done.has(m.code)).length;
    const open = members.filter((m) => !done.has(m.code));
    for (let i = 0; i < Math.max(0, need) && open.length > 0; i++) {
      const single = open.length === 1 && need === 1;
      units.push({
        type: single ? "course" : "choice", category: "GE", credits: open[0].credits,
        rank: Math.min(...open.map((m) => rankOf(m.planYear, m.planSem, m.code))), candidates: open.map((m) => m.code),
      });
    }
  }
  // Major electives: enough places to make up the credits required; each offers the courses still open.
  const electives = input.courses.filter((c) => c.category === "MAJOR_ELEC");
  const electiveLeft = Math.max(0, input.required.MAJOR_ELEC - credit(done, "MAJOR_ELEC"));
  const electiveSlots = input.slots.filter((s) => s.kind === "MAJOR_ELEC").sort((a, b) => a.planYear - b.planYear || a.planSem - b.planSem);
  const electivePlaces = Math.ceil(electiveLeft / 3);
  // The places already "used" by electives passed are the earliest ones in the plan.
  const firstOpen = Math.max(0, electiveSlots.length - electivePlaces);
  for (let i = 0; i < electivePlaces; i++) {
    const slot = electiveSlots[firstOpen + i];
    // A place that names a kind of elective ("… in Foreign Language") takes only that kind.
    const language = (c: TrailCourse) => /language|english/i.test(c.name_en ?? "");
    const wantsLanguage = slot ? /Foreign Language/i.test(slot.label) : null;
    const pool = electives.filter((c) => !done.has(c.code) && (wantsLanguage === null || !electiveSlots.some((s) => /Foreign Language/i.test(s.label)) || language(c) === wantsLanguage));
    units.push({
      type: "choice", category: "MAJOR_ELEC", credits: 3, label: slot?.label,
      rank: slot ? rankOf(slot.planYear, slot.planSem) : 42, candidates: pool.map((c) => c.code),
    });
  }
  // Free electives: any course of the university. Courses taken outside the major's lists count.
  const freeLeft = Math.max(0, input.required.FREE - input.otherCredits);
  const freeSlots = input.slots.filter((s) => s.kind === "FREE").sort((a, b) => a.planYear - b.planYear || a.planSem - b.planSem);
  const freePlaces = Math.ceil(freeLeft / 3);
  for (let i = 0; i < freePlaces; i++) {
    const slot = freeSlots[Math.max(0, freeSlots.length - freePlaces) + i];
    units.push({ type: "free", category: "FREE", credits: 3, label: slot?.label, rank: slot ? rankOf(slot.planYear, slot.planSem) : 42, candidates: [] });
  }
  units.sort((a, b) => a.rank - b.rank || (a.candidates[0] ?? "~").localeCompare(b.candidates[0] ?? "~"));

  const total = Object.values(input.required).reduce((a, b) => a + b, 0);
  const left = units.reduce((n, u) => n + u.credits, 0);
  const thisTerm = input.current.reduce((n, c) => n + (byCode.get(c)?.credits ?? 3), 0);

  // ---------- placing it, term by term ----------
  const regularLimit = Math.min(CREDIT_LIMITS.regular, Math.max(3, input.maxPerTerm ?? CREDIT_LIMITS.regular));
  // How many kinds of term a requirement can go in (a free elective: any). Used to place the
  // hard-to-place first when that is what it takes to finish in time.
  const kindsInUse: TermKind[] = input.summers ? ["1", "2", "S"] : ["1", "2"];
  const freedom = (u: Unit) =>
    u.type === "free" ? 3 : kindsInUse.filter((k) => u.candidates.some((c) => offeredIn(c, k) > 0 || (!everOffered(c) && k !== "S"))).length;
  /**
   * Fill terms in order, never more than `cap` credits in a regular term. "order" takes
   * things strictly in the faculty's order. "tight" takes first, in each term, what can go in
   * the fewest kinds of term (so a summer is left for the courses that do run in summer).
   */
  const fill = (cap: number, strategy: "order" | "tight" = "order"): { terms: TrailTerm[]; unplaced: Unit[] } => {
    let remaining = strategy === "order" ? [...units] : [...units].sort((a, b) => freedom(a) - freedom(b) || a.rank - b.rank);
    const used = new Set<string>();
    const terms: TrailTerm[] = [];
    let term = input.currentTerm;
    for (let n = 0; n < HORIZON && remaining.length > 0; n++) {
      term = nextTerm(term, input.summers);
      const kind = parseTerm(term).kind;
      const max = kind === "S" ? Math.min(cap, CREDIT_LIMITS.summer) : cap;
      const items: TrailItem[] = [];
      let load = 0;
      const later: Unit[] = [];
      for (const u of remaining) {
        if (load + u.credits > max) { later.push(u); continue; }
        let item: TrailItem | null = null;
        if (u.type === "free") {
          item = { type: "free", code: null, credits: u.credits, category: "FREE", label: u.label, offered: null, of: recorded[kind] };
        } else {
          // A course goes in a kind of term it has run in before. With no record at all (a new
          // course), a regular term is assumed and the plan says so.
          const open = u.candidates.filter((c) => !used.has(c));
          const fits = open
            .filter((c) => offeredIn(c, kind) > 0 || (!everOffered(c) && kind !== "S"))
            .sort((a, b) => offeredIn(b, kind) - offeredIn(a, kind) || a.localeCompare(b));
          if (fits.length > 0) {
            const code = fits[0];
            used.add(code);
            item = {
              type: u.type, code, credits: byCode.get(code)?.credits ?? u.credits, category: u.category, label: u.label,
              ...(u.type === "choice" ? { alternatives: open.filter((c) => c !== code) } : {}),
              offered: everOffered(code) ? offeredIn(code, kind) : null, of: recorded[kind],
            };
          }
        }
        if (item) { items.push(item); load += item.credits; } else later.push(u);
      }
      remaining = later;
      if (items.length > 0) terms.push({ term, kind, max, credits: load, items });
    }
    return { terms, unplaced: remaining };
  };

  // The fastest it can be done, then the gentlest pace that still meets the target.
  const finishOf = (r: { terms: TrailTerm[] }) => r.terms.at(-1)?.term ?? null;
  /** The faculty's order where it gets there as soon; otherwise the tighter packing. */
  const best = (cap: number) => {
    const a = fill(cap, "order"), b = fill(cap, "tight");
    const score = (r: { terms: TrailTerm[]; unplaced: Unit[] }) => r.unplaced.length * 1000 + (r.terms.length ? termIndex(finishOf(r)!) : 0);
    return score(b) < score(a) ? b : a;
  };
  const fastest = best(regularLimit);
  const earliestTerm = left === 0 ? input.currentTerm : fastest.unplaced.length === 0 ? finishOf(fastest) : null;
  const meets = (r: { terms: TrailTerm[]; unplaced: Unit[] }) =>
    r.unplaced.length === 0 && (r.terms.length === 0 || termIndex(finishOf(r)!) <= termIndex(input.targetTerm));
  let chosen = fastest, pace = regularLimit;
  if (meets(fastest)) {
    for (let cap = 9; cap <= regularLimit; cap += 3) {
      const r = best(cap);
      if (meets(r)) { chosen = r; pace = cap; break; }
    }
  }
  const finishTerm = left === 0 ? input.currentTerm : chosen.unplaced.length === 0 ? finishOf(chosen) : null;
  return {
    achievable: meets(chosen),
    finishTerm,
    earliestTerm,
    target: input.targetTerm,
    credits: { total, done: total - left - thisTerm, thisTerm, left },
    pace,
    terms: chosen.terms,
    unplaced: chosen.unplaced.map((u) => ({ code: u.candidates.length === 1 ? u.candidates[0] : null, category: u.category, reason: "NEVER_IN_THESE_TERMS" as const })),
    recorded,
  };
}
