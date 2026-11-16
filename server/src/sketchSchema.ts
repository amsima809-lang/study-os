import { z } from "zod";

export const word = z.string().max(3000);
export const id = z.string().regex(/^[A-Za-z][A-Za-z0-9_]{0,39}$/);
const ink = z.string().regex(/^#[a-f\d]{6}$/i);
const Run = z.object({
  text: word,
  ink: ink.default("#1f1f1f"),
  highlight: ink.nullish(),
  marks: z.array(word).max(8).default([]),
  authored: z.boolean().default(false),
});
export const Item = Run.omit({ authored: true }).extend({ id, region: word.optional(), kind: word.optional() });
export const Line = z.object({
  id,
  from: id,
  to: id,
  head_at_from: z.boolean(),
  head_at_to: z.boolean(),
  style: word.default("straight"),
});
const Block = z.discriminatedUnion("type", [
  z.object({ type: z.literal("text"), runs: z.array(Run).max(100) }),
  z.object({ type: z.literal("heading"), runs: z.array(Run).max(100) }),
  z.object({ type: z.literal("diagram"), item_ids: z.array(id).max(120), caption: word.nullish() }),
  z.object({
    type: z.literal("math"),
    steps: z.array(z.object({ latex: word, op: word.nullish() })).max(80),
    label: word.nullish(),
    answer: word.nullish(),
  }),
]);
const Question = z.object({ question: word, your_reading: word });
export const Reading = z
  .object({
    items: z.array(Item).max(400),
    lines: z.array(Line).max(600),
    groups: z
      .array(z.object({ label: word, items: z.array(id).max(120) }))
      .max(100)
      .default([]),
    graphs: z
      .array(
        z.object({
          x_axis: word,
          y_axis: word,
          points: z
            .array(
              z.object({ x: z.union([word, z.number()]), y: z.union([word, z.number()]), label: word.nullish() }),
            )
            .max(100),
          description: word,
        }),
      )
      .max(40)
      .default([]),
    notes: z.object({ title: word, blocks: z.array(Block).min(1).max(250) }),
    please_check: z.array(Question).max(8).default([]),
  })
  .superRefine((v, ctx) => {
    const ids = new Set(v.items.map((item) => item.id));
    if (
      ids.size !== v.items.length ||
      new Set(v.lines.map((l) => l.id)).size !== v.lines.length ||
      v.lines.some((l) => !ids.has(l.from) || !ids.has(l.to)) ||
      v.notes.blocks.some((b) => b.type === "diagram" && b.item_ids.some((n) => !ids.has(n)))
    ) {
      ctx.addIssue({ code: "custom", message: "Unknown or duplicate diagram item or line" });
    }
  });
export type SketchReading = z.infer<typeof Reading>;
export const Box = z.tuple([z.number(), z.number(), z.number(), z.number()]);
export type Bounds = z.infer<typeof Box>;
export type Picture = { name: string; after_block: number; box: Bounds };
export type SketchCheck = z.infer<typeof Question> & { line_ids?: string[] };
export type SketchPage = {
  reading: SketchReading;
  pictures: Picture[];
  width: number;
  height: number;
  checks: SketchCheck[];
};
export type SketchState = {
  document: SketchPage | null;
  revision: number;
  verified: boolean;
  included?: boolean;
  busy: boolean;
  failed: boolean;
};
export type Answer = { yes: boolean; correction?: string };
