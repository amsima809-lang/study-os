import { describe, it, expect, beforeEach } from "vitest";
import { openDb, type DB } from "../src/db.js";
import { seedDatabase } from "../src/seed.js";
import {
  parseQuestions,
  parseGrade,
  generateQuestions,
  gradeAnswer,
  AiError,
  type ModelCall,
} from "../src/ai.js";
import { gradeMcq, addDaysISO, upsertFlashcardToBox1 } from "../src/quiz.js";

const usage = { input_tokens: 5, output_tokens: 5 };
const QUESTIONS_JSON = JSON.stringify({
  questions: [
    { topic: "บทนำ", question: "จิตวิทยาคืออะไร", type: "short", choices: [], model_answer: "การศึกษาพฤติกรรมและจิตใจ" },
    { topic: "บทนำ", question: "ข้อใดถูก", type: "mcq", choices: ["ก", "ข", "ค", "ง"], model_answer: "ก" },
  ],
});

describe("Phase 4 — quiz parsing", () => {
  it("parses a questions payload", () => {
    const q = parseQuestions(QUESTIONS_JSON);
    expect(q.questions).toHaveLength(2);
    expect(q.questions[1].type).toBe("mcq");
    expect(q.questions[1].choices).toHaveLength(4);
  });

  it("rejects a question with no model answer", () => {
    const bad = JSON.stringify({ questions: [{ question: "x", type: "short", model_answer: "" }] });
    expect(() => parseQuestions(bad)).toThrow();
  });

  it("parses a grade and rejects an out-of-range score", () => {
    expect(parseGrade(JSON.stringify({ score: 2, feedback: "ดี" })).score).toBe(2);
    expect(() => parseGrade(JSON.stringify({ score: 5, feedback: "" }))).toThrow();
  });
});

describe("Phase 4 — generate/grade retry", () => {
  it("generates questions on first valid response", async () => {
    const call: ModelCall = async () => ({ text: QUESTIONS_JSON, usage });
    const out = await generateQuestions(call);
    expect(out.questions).toHaveLength(2);
  });

  it("throws AiError when grading never returns valid JSON", async () => {
    const call: ModelCall = async () => ({ text: "nope", usage });
    await expect(gradeAnswer(call)).rejects.toBeInstanceOf(AiError);
  });
});

describe("Phase 4 — MCQ grading (deterministic)", () => {
  it("gives 2 for an exact match", () => {
    expect(gradeMcq("ก", "ก").score).toBe(2);
  });
  it("gives 0 and reveals the answer for a mismatch", () => {
    const g = gradeMcq("ก", "ข");
    expect(g.score).toBe(0);
    expect(g.feedback).toContain("ก");
  });
});

describe("Phase 4 — date + flashcard helpers", () => {
  it("adds days across month boundaries", () => {
    expect(addDaysISO("2026-11-30", 1)).toBe("2026-12-01");
    expect(addDaysISO("2026-09-28", 1)).toBe("2026-09-29");
  });

  let db: DB;
  beforeEach(() => {
    db = openDb(":memory:");
    seedDatabase(db);
    db.prepare(
      "INSERT INTO questions (id, question, model_answer, type) VALUES (1, 'q', 'a', 'short')",
    ).run();
  });

  it("creates a box-1 flashcard, then resets an existing one", () => {
    upsertFlashcardToBox1(db, 1, "2026-09-28", "legacy-user-0001");
    let cards = db.prepare("SELECT * FROM flashcards WHERE question_id = 1").all() as Array<{
      box: number;
      next_review_date: string;
    }>;
    expect(cards).toHaveLength(1);
    expect(cards[0].box).toBe(1);
    expect(cards[0].next_review_date).toBe("2026-09-29");

    // Move it up, then a wrong answer should reset it to box 1 (no duplicate).
    db.prepare("UPDATE flashcards SET box = 3 WHERE question_id = 1").run();
    upsertFlashcardToBox1(db, 1, "2026-10-01", "legacy-user-0001");
    cards = db.prepare("SELECT * FROM flashcards WHERE question_id = 1").all() as Array<{
      box: number;
      next_review_date: string;
    }>;
    expect(cards).toHaveLength(1);
    expect(cards[0].box).toBe(1);
    expect(cards[0].next_review_date).toBe("2026-10-02");
  });
});
