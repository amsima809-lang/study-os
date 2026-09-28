import { describe, it, expect } from "vitest";
import { computeRisk, weekStartISO } from "../src/analytics.js";

describe("Phase 6 — risk flag", () => {
  it("is green when on-target, scoring well, exam far away", () => {
    const r = computeRisk({ hoursRatio: 1, quizAvg: 85, daysToExam: 120 });
    expect(r.score).toBe(0);
    expect(r.flag).toBe("green");
  });

  it("is red when far behind on hours and score, with a close exam", () => {
    const r = computeRisk({ hoursRatio: 0.2, quizAvg: 40, daysToExam: 5 });
    expect(r.score).toBe(30 + 30 + 25);
    expect(r.flag).toBe("red");
  });

  it("treats no quiz data as mild risk (not zero)", () => {
    // hoursRatio 1 (0), quizAvg null (10), exam far (0) -> 10 -> green
    expect(computeRisk({ hoursRatio: 1, quizAvg: null, daysToExam: 200 })).toEqual({
      score: 10,
      flag: "green",
    });
  });

  it("turns yellow when moderately behind", () => {
    // effort 15 (ratio 0.6) + perf 15 (avg 60) + urgency 0 = 30 -> yellow
    const r = computeRisk({ hoursRatio: 0.6, quizAvg: 60, daysToExam: 60 });
    expect(r.score).toBe(30);
    expect(r.flag).toBe("yellow");
  });

  it("caps the score at 100", () => {
    const r = computeRisk({ hoursRatio: 0, quizAvg: 0, daysToExam: 1 });
    expect(r.score).toBeLessThanOrEqual(100);
    expect(r.flag).toBe("red");
  });
});

describe("Phase 6 — week start (Monday)", () => {
  it("returns Monday for a mid-week day", () => {
    // 2026-09-28 is a Monday (weekday 1) -> same day
    expect(weekStartISO("2026-09-28", 1)).toBe("2026-09-28");
    // Wednesday 2026-09-30 (weekday 3) -> Monday 2026-09-28
    expect(weekStartISO("2026-09-30", 3)).toBe("2026-09-28");
    // Sunday (weekday 7) -> the Monday 6 days earlier
    expect(weekStartISO("2026-10-04", 7)).toBe("2026-09-28");
  });
});
