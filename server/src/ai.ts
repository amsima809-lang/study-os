/**
 * SINGLE gateway for every AI call in StudyOS.
 * All prompts, model selection, JSON validation and token logging will live
 * here so we can swap models later by changing only this file.
 *
 * Phase 0: just the shared system prompt + a stub. Real calls arrive in Phase 3.
 */
import { env } from "./env.js";

/** The strict coaching rules sent with every AI request. */
export const SYSTEM_PROMPT = [
  "You are a study coach for a Thai university psychology student.",
  "Use simple Thai.",
  "Use ONLY the provided note content.",
  "If you add anything not in the note, label it [นอกโน้ต — ตรวจกับตำราก่อน].",
  "Never reveal answers before the student attempts.",
  "Be concise.",
].join(" ");

export const AI_DISCLAIMER = "AI อาจผิดได้ — ยึดตำรารามฯ เป็นหลัก";

export function getModel(): string {
  return env.anthropicModel;
}

// TODO (Phase 3): implement callAI() with the Anthropic SDK,
// zod validation, one retry on invalid JSON, and token-usage logging.
