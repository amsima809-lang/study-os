/**
 * SINGLE gateway for every AI call in StudyOS.
 * All prompts, model selection, JSON validation and token logging live here so
 * we can swap models later by changing only this file.
 */
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { env } from "./env.js";
import type { DB } from "./db.js";

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

export function isAiConfigured(): boolean {
  return env.anthropicApiKey.trim().length > 0;
}

/** Thrown when the API key is missing — the UI shows a "set up your key" message. */
export class AiNotConfiguredError extends Error {
  constructor() {
    super("AI ยังไม่ได้ตั้งค่า — ใส่ ANTHROPIC_API_KEY ในไฟล์ .env ก่อนใช้งาน");
    this.name = "AiNotConfiguredError";
  }
}

/** Thrown when the model keeps returning something we cannot use. */
export class AiError extends Error {
  constructor(message = "AI ประมวลผลไม่สำเร็จ ลองใหม่อีกครั้ง") {
    super(message);
    this.name = "AiError";
  }
}

// ---------- Note learning output ----------
export const NoteLearningSchema = z.object({
  summary_md: z.string().min(1),
  key_terms: z.array(z.object({ term: z.string(), definition: z.string() })).default([]),
  mindmap_md: z.string().default(""),
  topics: z.array(z.string()).default([]),
});
export type NoteLearning = z.infer<typeof NoteLearningSchema>;

export type ImageInput = { media_type: string; data_base64: string };

type Usage = { input_tokens: number; output_tokens: number };
export type ModelCall = (extraInstruction?: string) => Promise<{ text: string; usage: Usage }>;

/** Strip ```json fences if present and parse+validate against the schema. */
export function parseNoteLearning(raw: string): NoteLearning {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  // Fall back to the first {...} block if there is extra prose around it.
  if (!text.startsWith("{")) {
    const brace = text.match(/\{[\s\S]*\}/);
    if (brace) text = brace[0];
  }
  const json = JSON.parse(text); // throws SyntaxError on bad JSON
  return NoteLearningSchema.parse(json); // throws ZodError on bad shape
}

/**
 * Orchestrates a note-learning generation: call the model, validate JSON, and
 * retry ONCE with a stricter instruction if the first response is unusable.
 * The actual model call is injected so this is easy to unit-test.
 */
export async function generateNoteLearning(call: ModelCall): Promise<NoteLearning> {
  const first = await call();
  try {
    return parseNoteLearning(first.text);
  } catch {
    const second = await call(
      "โปรดตอบกลับเป็น JSON ที่ถูกต้องเท่านั้น ตาม schema ที่กำหนด ห้ามมีข้อความอื่นนอก JSON",
    );
    try {
      return parseNoteLearning(second.text);
    } catch {
      throw new AiError();
    }
  }
}

// ---------- The prompt for turning a note into learning material ----------
const NOTE_JSON_INSTRUCTION = `จากเนื้อหาโน้ตด้านล่าง ให้สร้างสื่อช่วยเรียนภาษาไทยแบบง่าย (อธิบายเหมือนอายุ 12 ปี)
ตอบกลับเป็น JSON เท่านั้น ตาม schema นี้:
{
  "summary_md": "สรุปเป็นภาษาไทยง่าย ๆ ไม่เกิน 300 คำ (markdown ได้)",
  "key_terms": [{"term": "คำศัพท์", "definition": "นิยามสั้น 1 บรรทัด"}],
  "mindmap_md": "mind map แบบ bullet ของ markdown",
  "topics": ["แท็กหัวข้อ"]
}
ใช้เฉพาะเนื้อหาในโน้ต ถ้ามีข้อมูลนอกโน้ตให้ใส่ป้าย [นอกโน้ต — ตรวจกับตำราก่อน]`;

/** Build the low-level model call for a note (text + optional images). */
export function noteModelCall(
  db: DB,
  input: { text?: string; images?: ImageInput[]; courseCode?: string },
): ModelCall {
  const client = new Anthropic({ apiKey: env.anthropicApiKey });

  return async (extraInstruction?: string) => {
    const content: Anthropic.MessageParam["content"] = [];
    for (const img of input.images ?? []) {
      content.push({
        type: "image",
        source: { type: "base64", media_type: img.media_type as "image/jpeg", data: img.data_base64 },
      });
    }
    const noteText = input.text?.trim()
      ? `เนื้อหาโน้ต:\n${input.text.trim()}`
      : "เนื้อหาโน้ตอยู่ในรูปภาพด้านบน";
    content.push({
      type: "text",
      text: `${NOTE_JSON_INSTRUCTION}\n\n${noteText}${extraInstruction ? `\n\n${extraInstruction}` : ""}`,
    });

    const res = await client.messages.create({
      model: env.anthropicModel,
      max_tokens: 2000,
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content }],
    });

    const usage = { input_tokens: res.usage.input_tokens, output_tokens: res.usage.output_tokens };
    logUsage(db, "note_learning", usage);

    const textBlock = res.content.find((b) => b.type === "text");
    return { text: textBlock && textBlock.type === "text" ? textBlock.text : "", usage };
  };
}

/** Record token usage so we can show monthly AI cost on a settings page. */
export function logUsage(db: DB, purpose: string, usage: Usage): void {
  db.prepare(
    `INSERT INTO ai_usage (created_at, model, purpose, input_tokens, output_tokens)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(new Date().toISOString(), env.anthropicModel, purpose, usage.input_tokens, usage.output_tokens);
}
