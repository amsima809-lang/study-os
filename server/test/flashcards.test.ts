import { describe, it, expect } from "vitest";
import { reviewCard, LEITNER_DAYS } from "../src/flashcards.js";

describe("Phase 5 — Leitner review scheduling", () => {
  it("moves up one box on a correct answer", () => {
    expect(reviewCard(1, true, "2026-09-28").box).toBe(2);
    expect(reviewCard(3, true, "2026-09-28").box).toBe(4);
  });

  it("caps at box 5", () => {
    expect(reviewCard(5, true, "2026-09-28").box).toBe(5);
  });

  it("drops back to box 1 on a wrong answer", () => {
    expect(reviewCard(4, false, "2026-09-28").box).toBe(1);
    expect(reviewCard(1, false, "2026-09-28").box).toBe(1);
  });

  it("schedules the next review by the new box's interval", () => {
    // box 1 -> 2, interval 3 days
    expect(reviewCard(1, true, "2026-09-28").next_review_date).toBe("2026-10-01");
    // wrong -> box 1, interval 1 day
    expect(reviewCard(3, false, "2026-09-28").next_review_date).toBe("2026-09-29");
    // box 4 -> 5, interval 30 days
    expect(reviewCard(4, true, "2026-09-28").next_review_date).toBe("2026-10-28");
  });

  it("has the expected Leitner intervals", () => {
    expect(LEITNER_DAYS).toEqual({ 1: 1, 2: 3, 3: 7, 4: 14, 5: 30 });
  });
});
