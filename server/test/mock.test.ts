import { describe, it, expect } from "vitest";
import { isMockAvailable, selectMockQuestions, MOCK_TARGET } from "../src/mock.js";

describe("Phase 8 — mock availability window", () => {
  it("opens within 21 days before the exam", () => {
    expect(isMockAvailable(21)).toBe(true);
    expect(isMockAvailable(1)).toBe(true);
    expect(isMockAvailable(0)).toBe(true);
  });
  it("is closed too early or after the exam", () => {
    expect(isMockAvailable(22)).toBe(false);
    expect(isMockAvailable(162)).toBe(false);
    expect(isMockAvailable(-1)).toBe(false);
    expect(isMockAvailable(null)).toBe(false);
  });
});

describe("Phase 8 — weighted question selection", () => {
  const pool = [
    { id: 1, topic: "A", question: "", type: "short", choices_json: null },
    { id: 2, topic: "B", question: "", type: "short", choices_json: null },
    { id: 3, topic: "A", question: "", type: "short", choices_json: null },
    { id: 4, topic: "C", question: "", type: "short", choices_json: null },
  ];

  it("prioritises low-box flashcards, then weak topics", () => {
    const ids = selectMockQuestions(pool, {
      weakTopics: new Set(["A"]),
      lowBoxIds: new Set([4]),
      target: 4,
    });
    // id4: 1+3=4 (low box) first; ids 1 & 3: 1+2=3 (weak topic A); id2: 1 last
    expect(ids[0]).toBe(4);
    expect(ids.slice(1, 3).sort()).toEqual([1, 3]);
    expect(ids[3]).toBe(2);
  });

  it("caps at the target count", () => {
    const big = Array.from({ length: 60 }, (_, i) => ({
      id: i + 1,
      topic: null,
      question: "",
      type: "short",
      choices_json: null,
    }));
    expect(selectMockQuestions(big, { weakTopics: new Set(), lowBoxIds: new Set(), target: MOCK_TARGET })).toHaveLength(
      MOCK_TARGET,
    );
  });

  it("is stable for equal weights (keeps original order)", () => {
    const ids = selectMockQuestions(pool, { weakTopics: new Set(), lowBoxIds: new Set(), target: 4 });
    expect(ids).toEqual([1, 2, 3, 4]);
  });
});
