import { describe, it, expect } from "vitest";
import { SYSTEM_PROMPT, AI_DISCLAIMER } from "../src/ai.js";

// A tiny "smoke" test just to prove the test runner works end-to-end.
// Real tests (credit totals, prerequisite ordering) arrive in Phase 1.
describe("phase 0 smoke test", () => {
  it("exposes the shared AI system prompt", () => {
    expect(SYSTEM_PROMPT).toContain("study coach");
    expect(AI_DISCLAIMER).toContain("ยึดตำรารามฯ");
  });
});
