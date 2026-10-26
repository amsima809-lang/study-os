/**
 * PDF text extraction + OCR helper.
 * Uses pdfjs-dist for native text, falls back to Claude vision for scanned pages.
 */
import { createCanvas } from "canvas";
import { readFile } from "node:fs/promises";
import type { DB } from "./db.js";
import {
  isAiConfigured,
  AiNotConfiguredError,
  type ImageInput,
} from "./ai.js";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "./env.js";

// pdfjs-dist legacy build for Node.js (no DOM required for text extraction).
let pdfjsLib: typeof import("pdfjs-dist");

async function getPdfjs() {
  if (!pdfjsLib) {
    pdfjsLib = await import("pdfjs-dist/legacy/build/pdf.mjs" as string);
  }
  return pdfjsLib;
}

export type PageResult = {
  pageNum: number;
  text: string;
  method: "pdf_text" | "ai_ocr";
  confidence: number;
  imagePath?: string;
};

/** Check if Thai text extraction looks garbled. */
export function isThaiTextGarbled(text: string): boolean {
  if (!text || text.trim().length < 10) return true;
  const thaiChars = text.match(/[ก-๛]/g)?.length ?? 0;
  const totalChars = text.replace(/\s/g, "").length;
  if (totalChars === 0) return true;
  const thaiRatio = thaiChars / totalChars;
  // Thai textbooks should have significant Thai content
  if (thaiRatio < 0.15) return true;
  // Check for common garbled patterns: excessive replacement chars, mojibake
  const replacements = (text.match(/[�￾￿]/g)?.length ?? 0);
  if (replacements > totalChars * 0.05) return true;
  // Check for missing vowels/tone marks (common OCR issue)
  const vowelsTones = text.match(/[ัิ-ฺ็-๎]/g)?.length ?? 0;
  if (thaiChars > 20 && vowelsTones / thaiChars < 0.05) return true;
  return false;
}

/** Extract text from all pages of a PDF using pdfjs-dist. */
export async function extractPdfText(
  pdfBuffer: Buffer,
): Promise<Array<{ pageNum: number; text: string }>> {
  const pdfjs = await getPdfjs();
  const data = new Uint8Array(pdfBuffer);
  const doc = await pdfjs.getDocument({
    data,
    useSystemFonts: true,
  }).promise;

  const pages: Array<{ pageNum: number; text: string }> = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    const content = await page.getTextContent();
    const items = content.items as Array<{ str: string }>;
    const text = items.map((it) => it.str).join(" ");
    pages.push({ pageNum: i, text });
    page.cleanup();
  }
  doc.destroy();
  return pages;
}

/** Render a PDF page to a JPEG buffer (for OCR). */
export async function renderPdfPage(
  pdfBuffer: Buffer,
  pageNum: number,
  scale = 2,
): Promise<Buffer> {
  const pdfjs = await getPdfjs();
  const data = new Uint8Array(pdfBuffer);
  const doc = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
  const page = await doc.getPage(pageNum);
  const viewport = page.getViewport({ scale });

  const canvas = createCanvas(viewport.width, viewport.height);
  const ctx = canvas.getContext("2d") as any;
  await page.render({ canvasContext: ctx, viewport } as any).promise;

  const jpegBuffer = canvas.toBuffer("image/jpeg", { quality: 0.85 });
  page.cleanup();
  doc.destroy();
  return Buffer.from(jpegBuffer);
}

/** OCR a single page image using Claude vision. */
export async function ocrWithClaude(
  db: DB,
  imageBuffer: Buffer,
  mediaType = "image/jpeg",
): Promise<{ text: string; confidence: number }> {
  if (!isAiConfigured()) throw new AiNotConfiguredError();

  const client = new Anthropic({
    apiKey: env.anthropicApiKey,
    ...(env.anthropicWorkspaceId && {
      defaultHeaders: { "anthropic-workspace-id": env.anthropicWorkspaceId },
    }),
  });

  const res = await client.messages.create({
    model: env.anthropicModel,
    max_tokens: 4000,
    system: "You are an OCR assistant. Extract ALL text from the image exactly as it appears. Preserve the original language (Thai/English). Output ONLY the extracted text, nothing else.",
    messages: [
      {
        role: "user",
        content: [
          {
            type: "image",
            source: {
              type: "base64",
              media_type: mediaType as "image/jpeg",
              data: imageBuffer.toString("base64"),
            },
          },
          { type: "text", text: "Extract all text from this page image. Output the text only." },
        ],
      },
    ],
  });

  const usage = { input_tokens: res.usage.input_tokens, output_tokens: res.usage.output_tokens };
  db.prepare(
    "INSERT INTO ai_usage (created_at, model, purpose, input_tokens, output_tokens) VALUES (?, ?, ?, ?, ?)",
  ).run(new Date().toISOString(), env.anthropicModel, "ocr", usage.input_tokens, usage.output_tokens);

  const textBlock = res.content.find((b) => b.type === "text");
  const text = textBlock && textBlock.type === "text" ? textBlock.text : "";
  const confidence = text.trim().length > 10 ? 0.85 : 0.5;
  return { text, confidence };
}

/** Get total page count of a PDF without extracting. */
export async function getPdfPageCount(pdfBuffer: Buffer): Promise<number> {
  const pdfjs = await getPdfjs();
  const data = new Uint8Array(pdfBuffer);
  const doc = await pdfjs.getDocument({ data }).promise;
  const count = doc.numPages;
  doc.destroy();
  return count;
}
