import { describe, it, expect } from "vitest";
import {
  parseNoteLearning,
  generateNoteLearning,
  AiError,
  type ModelCall,
} from "../src/ai.js";

const GOOD_JSON = JSON.stringify({
  summary_md: "จิตวิทยาคือการศึกษาพฤติกรรมและจิตใจ",
  key_terms: [{ term: "พฤติกรรม", definition: "สิ่งที่คนแสดงออก" }],
  mindmap_md: "- จิตวิทยา\n  - พฤติกรรม",
  topics: ["บทนำ"],
});

// A fake usage payload so we can build ModelCall results.
const usage = { input_tokens: 10, output_tokens: 20 };

describe("Phase 3 — parseNoteLearning", () => {
  it("parses clean JSON", () => {
    const out = parseNoteLearning(GOOD_JSON);
    expect(out.summary_md).toContain("จิตวิทยา");
    expect(out.key_terms[0].term).toBe("พฤติกรรม");
  });

  it("strips ```json code fences", () => {
    const out = parseNoteLearning("```json\n" + GOOD_JSON + "\n```");
    expect(out.topics).toEqual(["บทนำ"]);
  });

  it("fills defaults for missing optional arrays", () => {
    const out = parseNoteLearning(JSON.stringify({ summary_md: "สรุป" }));
    expect(out.key_terms).toEqual([]);
    expect(out.topics).toEqual([]);
  });

  it("throws on invalid JSON", () => {
    expect(() => parseNoteLearning("not json at all")).toThrow();
  });

  it("throws when summary is missing", () => {
    expect(() => parseNoteLearning(JSON.stringify({ key_terms: [] }))).toThrow();
  });
});

describe("Phase 3 — generateNoteLearning retry logic", () => {
  it("returns on first valid response", async () => {
    let calls = 0;
    const call: ModelCall = async () => {
      calls++;
      return { text: GOOD_JSON, usage };
    };
    const out = await generateNoteLearning(call);
    expect(calls).toBe(1);
    expect(out.summary_md).toContain("จิตวิทยา");
  });

  it("retries once when the first response is broken, then succeeds", async () => {
    let calls = 0;
    const call: ModelCall = async () => {
      calls++;
      return { text: calls === 1 ? "sorry, here is text" : GOOD_JSON, usage };
    };
    const out = await generateNoteLearning(call);
    expect(calls).toBe(2);
    expect(out.topics).toEqual(["บทนำ"]);
  });

  it("throws AiError after two bad responses", async () => {
    let calls = 0;
    const call: ModelCall = async () => {
      calls++;
      return { text: "still not json", usage };
    };
    await expect(generateNoteLearning(call)).rejects.toBeInstanceOf(AiError);
    expect(calls).toBe(2);
  });
});
