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
  "You are a study coach for a Thai university Marketing (B.B.A.) student at Ramkhamhaeng University.",
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

/** Thrown when user doesn't have an active premium subscription. */
export class AiSubscriptionRequired extends Error {
  constructor() {
    super("ฟีเจอร์ AI ต้องสมัครสมาชิก Premium (฿99/เดือน)");
    this.name = "AiSubscriptionRequired";
  }
}

export function hasAiSubscription(db: DB, userId: string): boolean {
  const user = db.prepare("SELECT plan FROM users WHERE id = ?").get(userId) as { plan: string } | undefined;
  if (user?.plan === "premium") return true;
  const sub = db.prepare(
    "SELECT id FROM subscriptions WHERE user_id = ? AND status = 'active' AND expires_at > datetime('now') LIMIT 1",
  ).get(userId);
  return !!sub;
}

export function checkAiSubscription(db: DB, userId: string): void {
  if (!hasAiSubscription(db, userId)) throw new AiSubscriptionRequired();
}

/** Thrown when the model keeps returning something we cannot use. */
export class AiError extends Error {
  constructor(message = "AI ประมวลผลไม่สำเร็จ ลองใหม่อีกครั้ง") {
    super(message);
    this.name = "AiError";
  }
}

// ---------- low-level model plumbing ----------
type Usage = { input_tokens: number; output_tokens: number };
type Content = Anthropic.MessageParam["content"];
export type ImageInput = { media_type: string; data_base64: string };

/** A single model call; may take a stricter retry instruction. */
export type ModelCall = (extraInstruction?: string) => Promise<{ text: string; usage: Usage }>;

/** Record token usage so we can show monthly AI cost on a settings page. */
export function logUsage(db: DB, purpose: string, usage: Usage): void {
  db.prepare(
    `INSERT INTO ai_usage (created_at, model, purpose, input_tokens, output_tokens)
     VALUES (?, ?, ?, ?, ?)`,
  ).run(new Date().toISOString(), env.anthropicModel, purpose, usage.input_tokens, usage.output_tokens);
}

/** Run one Anthropic message call, log usage, and return the text block. */
async function callAnthropic(
  db: DB,
  purpose: string,
  content: Content,
  maxTokens: number,
): Promise<{ text: string; usage: Usage }> {
  const client = new Anthropic({
    apiKey: env.anthropicApiKey,
    ...(env.anthropicWorkspaceId && {
      defaultHeaders: { "anthropic-workspace-id": env.anthropicWorkspaceId },
    }),
  });
  const res = await client.messages.create({
    model: env.anthropicModel,
    max_tokens: maxTokens,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content }],
  });
  const usage = { input_tokens: res.usage.input_tokens, output_tokens: res.usage.output_tokens };
  logUsage(db, purpose, usage);
  const textBlock = res.content.find((b) => b.type === "text");
  return { text: textBlock && textBlock.type === "text" ? textBlock.text : "", usage };
}

/** Extract a JSON object from a model response (strips ``` fences / prose). */
function extractJson(raw: string): unknown {
  let text = raw.trim();
  const fence = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) text = fence[1].trim();
  if (!text.startsWith("{")) {
    const brace = text.match(/\{[\s\S]*\}/);
    if (brace) text = brace[0];
  }
  return JSON.parse(text); // throws SyntaxError on bad JSON
}

/**
 * Call the model, validate against `schema`, and retry ONCE with a stricter
 * instruction if the first response is unusable. Injecting `call` makes this
 * easy to unit-test without hitting the API.
 */
export async function generateValidated<T>(
  call: ModelCall,
  schema: z.ZodType<T>,
): Promise<T> {
  const first = await call();
  try {
    return schema.parse(extractJson(first.text));
  } catch {
    const second = await call(
      "โปรดตอบกลับเป็น JSON ที่ถูกต้องเท่านั้น ตาม schema ที่กำหนด ห้ามมีข้อความอื่นนอก JSON",
    );
    try {
      return schema.parse(extractJson(second.text));
    } catch {
      throw new AiError();
    }
  }
}

// ============================================================
// Note learning (Phase 3)
// ============================================================
export const NoteLearningSchema = z.object({
  summary_md: z.string().min(1),
  key_terms: z.array(z.object({ term: z.string(), definition: z.string() })).default([]),
  mindmap_md: z.string().default(""),
  topics: z.array(z.string()).default([]),
});
export type NoteLearning = z.infer<typeof NoteLearningSchema>;

/** Kept for direct unit tests of the parser. */
export function parseNoteLearning(raw: string): NoteLearning {
  return NoteLearningSchema.parse(extractJson(raw));
}

export function generateNoteLearning(call: ModelCall): Promise<NoteLearning> {
  return generateValidated(call, NoteLearningSchema);
}

const NOTE_JSON_INSTRUCTION = `จากเนื้อหาโน้ตด้านล่าง ให้สร้างสื่อช่วยเรียนภาษาไทยแบบง่าย (อธิบายเหมือนอายุ 12 ปี)
ตอบกลับเป็น JSON เท่านั้น ตาม schema นี้:
{
  "summary_md": "สรุปเป็นภาษาไทยง่าย ๆ ไม่เกิน 300 คำ (markdown ได้)",
  "key_terms": [{"term": "คำศัพท์", "definition": "นิยามสั้น 1 บรรทัด"}],
  "mindmap_md": "mind map แบบ bullet ของ markdown",
  "topics": ["แท็กหัวข้อ"]
}
ใช้เฉพาะเนื้อหาในโน้ต ถ้ามีข้อมูลนอกโน้ตให้ใส่ป้าย [นอกโน้ต — ตรวจกับตำราก่อน]`;

export function noteModelCall(db: DB, input: { text?: string; images?: ImageInput[] }): ModelCall {
  return async (extra?: string) => {
    const content: Content = [];
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
      text: `${NOTE_JSON_INSTRUCTION}\n\n${noteText}${extra ? `\n\n${extra}` : ""}`,
    });
    return callAnthropic(db, "note_learning", content, 2000);
  };
}

// ============================================================
// Course-wide summary (all notes in one course)
// ============================================================
export const CourseSummarySchema = z.object({
  summary_md: z.string().min(1),
  key_terms: z.array(z.object({ term: z.string(), definition: z.string() })).default([]),
  topics_covered: z.array(z.string()).default([]),
});
export type CourseSummary = z.infer<typeof CourseSummarySchema>;

export function generateCourseSummary(call: ModelCall): Promise<CourseSummary> {
  return generateValidated(call, CourseSummarySchema);
}

const COURSE_SUMMARY_INSTRUCTION = `จากโน้ตทั้งหมดของวิชานี้ ให้สรุปเนื้อหารวมเป็นภาพรวมภาษาไทยง่าย ๆ (อธิบายเหมือนอายุ 12 ปี)
ตอบกลับเป็น JSON เท่านั้น ตาม schema นี้:
{
  "summary_md": "สรุปรวมเนื้อหาทั้งหมดของวิชา (markdown ได้ ไม่เกิน 600 คำ) แบ่งหัวข้อชัดเจน",
  "key_terms": [{"term": "คำศัพท์สำคัญ", "definition": "นิยามสั้น"}],
  "topics_covered": ["หัวข้อที่ครอบคลุม"]
}
ใช้เฉพาะเนื้อหาในโน้ต ถ้ามีข้อมูลนอกโน้ตให้ใส่ป้าย [นอกโน้ต — ตรวจกับตำราก่อน]`;

export function courseSummaryModelCall(db: DB, notesText: string): ModelCall {
  return async (extra?: string) => {
    const content: Content = [
      {
        type: "text",
        text: `${COURSE_SUMMARY_INSTRUCTION}\n\n${notesText}${extra ? `\n\n${extra}` : ""}`,
      },
    ];
    return callAnthropic(db, "course_summary", content, 4000);
  };
}

// ============================================================
// Quiz generation (Phase 4)
// ============================================================
export const GeneratedQuestionSchema = z.object({
  topic: z.string().default(""),
  question: z.string().min(1),
  type: z.enum(["short", "mcq"]),
  choices: z.array(z.string()).default([]),
  model_answer: z.string().min(1),
});
export const QuestionsSchema = z.object({
  questions: z.array(GeneratedQuestionSchema).min(1),
});
export type GeneratedQuestion = z.infer<typeof GeneratedQuestionSchema>;

export function parseQuestions(raw: string) {
  return QuestionsSchema.parse(extractJson(raw));
}

export function generateQuestions(call: ModelCall) {
  return generateValidated(call, QuestionsSchema);
}

export function quizModelCall(db: DB, input: { sourceText: string; count: number }): ModelCall {
  const instruction = `สร้างชุดคำถามทบทวน ${input.count} ข้อ จากเนื้อหาด้านล่าง
ผสมแบบอัตนัยสั้น (type "short") และปรนัย 4 ตัวเลือก (type "mcq")
ตอบกลับเป็น JSON เท่านั้น:
{ "questions": [
  {"topic":"หัวข้อ","question":"คำถาม","type":"short","choices":[],"model_answer":"คำตอบที่ถูก"},
  {"topic":"หัวข้อ","question":"คำถาม","type":"mcq","choices":["ตัวเลือก1","ตัวเลือก2","ตัวเลือก3","ตัวเลือก4"],"model_answer":"ข้อความตัวเลือกที่ถูก (ต้องตรงกับใน choices ข้อใดข้อหนึ่ง)"}
]}
ใช้เฉพาะเนื้อหาที่ให้ ถ้าออกนอกเนื้อหาให้ใส่ [นอกโน้ต — ตรวจกับตำราก่อน]`;
  return async (extra?: string) => {
    const content: Content = [
      { type: "text", text: `${instruction}\n\nเนื้อหา:\n${input.sourceText}${extra ? `\n\n${extra}` : ""}` },
    ];
    return callAnthropic(db, "quiz_gen", content, 3000);
  };
}

// ============================================================
// Answer grading (Phase 4)
// ============================================================
export const GradeSchema = z.object({
  score: z.number().int().min(0).max(2),
  feedback: z.string().default(""),
});
export type Grade = z.infer<typeof GradeSchema>;

export function parseGrade(raw: string): Grade {
  return GradeSchema.parse(extractJson(raw));
}

export function gradeAnswer(call: ModelCall): Promise<Grade> {
  return generateValidated(call, GradeSchema);
}

export function gradeModelCall(
  db: DB,
  input: { question: string; modelAnswer: string; myAnswer: string; topic?: string },
): ModelCall {
  const instruction = `ตรวจคำตอบของนักศึกษาแล้วให้คะแนน 0, 1 หรือ 2
(0 = ผิดหรือไม่ตอบ, 1 = ถูกบางส่วน, 2 = ถูกครบถ้วน)
พร้อม feedback ภาษาไทยสั้น ๆ บอกจุดที่ขาดหรือควรเสริม โดยอ้างอิงเฉลย
ตอบกลับเป็น JSON เท่านั้น: {"score": 0, "feedback": "..."}`;
  return async (extra?: string) => {
    const content: Content = [
      {
        type: "text",
        text: `${instruction}

คำถาม: ${input.question}
เฉลย: ${input.modelAnswer}
คำตอบของนักศึกษา: ${input.myAnswer || "(ไม่ได้ตอบ)"}${extra ? `\n\n${extra}` : ""}`,
      },
    ];
    return callAnthropic(db, "grade", content, 600);
  };
}
