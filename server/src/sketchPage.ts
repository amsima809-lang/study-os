import { readFileSync } from "node:fs";
import sharp from "sharp";
import { z } from "zod";
import { applyHighlightColours, checkHighlightColours } from "./sketchColours.js";
import type { SketchCall } from "./sketchModel.js";

import {
  Reading,
  Item,
  Line,
  id,
  word,
  Box,
  type Picture,
  type SketchReading,
  type SketchCheck,
  type SketchPage,
  type Bounds,
  type Answer,
} from "./sketchSchema.js";

const prompt = readFileSync(new URL("./prompts/sketch-v4.txt", import.meta.url), "utf8");

function clampBox(box: Bounds, width: number, height: number, pad = 0): Bounds | null {
  const [l, t, r, b] = box;
  if (r <= l || b <= t) return null;
  const bounds: Bounds = [
    Math.max(0, Math.floor(l - pad)),
    Math.max(0, Math.floor(t - pad)),
    Math.min(width, Math.ceil(r + pad)),
    Math.min(height, Math.ceil(b + pad)),
  ];
  return bounds[2] > bounds[0] && bounds[3] > bounds[1] ? bounds : null;
}

function cut(image: Buffer, [l, t, r, b]: Bounds) {
  return sharp(image)
    .extract({ left: l, top: t, width: r - l, height: b - t })
    .jpeg({ quality: 92 })
    .toBuffer();
}

/** Use the actual pen extents for a PencilKit drawing once the model has located it on the page. */
export function penBox(strokes: Bounds[], approximate: Bounds, width: number, height: number): Bounds | null {
  const extents: Bounds[] = [];
  for (const [x, y, r, b] of strokes) {
    const s: Bounds = [x * width, y * height, r * width, b * height];
    const cx = (s[0] + s[2]) / 2,
      cy = (s[1] + s[3]) / 2;
    if (cx >= approximate[0] && cx <= approximate[2] && cy >= approximate[1] && cy <= approximate[3])
      extents.push(s);
  }
  if (!extents.length) return null;
  return clampBox(
    [
      Math.min(...extents.map((s) => s[0])),
      Math.min(...extents.map((s) => s[1])),
      Math.max(...extents.map((s) => s[2])),
      Math.max(...extents.map((s) => s[3])),
    ],
    width,
    height,
    3,
  );
}

// A model's image grid spans 0..1000 on each axis. Keep stored boxes in original pixels.
function imagePixels([l, t, r, b]: Bounds, width: number, height: number): Bounds {
  return [(l * width) / 1000, (t * height) / 1000, (r * width) / 1000, (b * height) / 1000];
}

function blockLabel(b: SketchReading["notes"]["blocks"][number]) {
  if (b.type === "math") return b.label || b.steps[0]?.latex;
  if (b.type === "diagram") return b.caption || b.item_ids.join(", ");
  return b.runs
    .map((r) => r.text)
    .join("")
    .slice(0, 160);
}

async function locatePictures(
  call: SketchCall,
  image: Buffer,
  reading: SketchReading,
  width: number,
  height: number,
  strokes: Bounds[],
) {
  const labels = reading.notes.blocks.map(blockLabel);
  const list = z
    .object({ pictures: z.array(z.object({ name: word, after_block: z.number().int(), box: Box })).max(40) })
    .parse(
      await call(
        "sketch_locate",
        `Locate each meaningful picture on this page. Include the full row of similar pictures (e.g. a growing pattern) as ONE picture. Skip tiny decorative doodles and plain text. Give tight boxes as [left,top,right,bottom] on a 0..1000 normalized grid. The left/top edge is 0, right/bottom edge is 1000 independent of image shape; after_block is the ZERO-based index of the most relevant block in ${JSON.stringify(labels)}. JSON: {"pictures":[{"name":"...","after_block":0,"box":[0,0,10,10]}]}.`,
        [image],
        "high",
      ),
    );
  const pictures: Picture[] = [];
  // A bounded group of refinement calls keeps a 20-drawing page responsive.
  for (let start = 0; start < list.pictures.length; start += 3) {
    await Promise.all(
      list.pictures.slice(start, start + 3).map(async (picture) => {
        const pixels = imagePixels(picture.box, width, height);
        const region = clampBox(pixels, width, height, 120);
        const first = clampBox(pixels, width, height);
        if (!region || !first) return;
        let box = strokes.length ? penBox(strokes, first, width, height) : null;
        if (!box) {
          const [x, y, r, b] = region;
          const crop = await cut(image, region);
          const refined = z
            .object({ found: z.boolean(), box: Box.nullish() })
            .parse(
              await call(
                "sketch_refine",
                `Find the drawing named ${JSON.stringify(picture.name)} inside this close-up. Include all parts of a repeated row or group and no neighbouring words. JSON {"found":true,"box":[left,top,right,bottom]} on a normalized grid from 0 to 1000 relative to this close-up. Left/top 0, right/bottom 1000. Return {"found":false} if absent.`,
                [crop],
                "high",
              ),
            );
          if (!refined.found || !refined.box) return;
          const local = clampBox(imagePixels(refined.box, r - x, b - y), r - x, b - y);
          if (!local) return;
          box = clampBox([x + local[0], y + local[1], x + local[2], y + local[3]], width, height, 4);
        }
        if (box)
          pictures.push({
            name: picture.name,
            after_block: Math.min(labels.length - 1, Math.max(0, picture.after_block)),
            box,
          });
      }),
    );
  }
  return pictures.sort((a, b) => a.after_block - b.after_block || a.box[1] - b.box[1] || a.box[0] - b.box[0]);
}

/** If a named shape and its own label were inventoried separately, its connectors belong to one node.
 * A distinct picture and a nearby label (brain / Visual Processing) keep their separate identities. */
export function joinLabelledShapes(reading: SketchReading) {
  const label = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^\p{L}\p{N} ]/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  const aliases = new Map<string, string>();
  for (const item of reading.items) {
    const clean = label(item.text).replace(
      /(?: (?:starburst|shape|figure|drawing|outline|box|circle|diagram))+$/,
      "",
    );
    if (clean === label(item.text) || !clean) continue;
    const named = reading.items.filter((o) => o.id !== item.id && label(o.text) === clean);
    if (named.length === 1) aliases.set(item.id, named[0].id);
  }
  if (!aliases.size) return reading;
  const canonical = (id: string) => aliases.get(id) ?? id;
  const members = (ids: string[]) => [...new Set(ids.map(canonical))];
  return {
    ...reading,
    items: reading.items.filter((i) => !aliases.has(i.id)),
    lines: reading.lines
      .map((l) => ({ ...l, from: canonical(l.from), to: canonical(l.to) }))
      .filter((l) => l.from !== l.to),
    groups: reading.groups.map((g) => ({ ...g, items: members(g.items) })),
    notes: {
      ...reading.notes,
      blocks: reading.notes.blocks.map((b) =>
        b.type === "diagram" ? { ...b, item_ids: members(b.item_ids) } : b,
      ),
    },
  };
}

/** Ask about fan-outs even when Flash claims confidence. A yes updates the real line records locally. */
export function sketchChecks(reading: SketchReading): SketchCheck[] {
  const names = new Map(reading.items.map((item) => [item.id, item.text]));
  const emitted = new Set<string>();
  const hubs: SketchCheck[] = [];
  for (const item of reading.items) {
    const outgoing = reading.lines.filter(
      (l) => (l.from === item.id && l.head_at_to) || (l.to === item.id && l.head_at_from),
    );
    if (outgoing.length < 2) continue;
    const edges = outgoing.filter((l) => !emitted.has(l.id));
    if (!edges.length) continue;
    const labels = edges.map((l) => names.get(l.from === item.id ? l.to : l.from));
    const phrase = `${item.text} ↔ ${labels.join(", ")}`;
    edges.forEach((l) => emitted.add(l.id));
    hubs.push({
      question: `Are all these connections two-way? ${phrase}`,
      your_reading: phrase,
      line_ids: edges.map((l) => l.id),
    });
  }
  // A single grouped confirmation can cover several smaller hubs while leaving space for unreadable text.
  if (hubs.length > 2) {
    const overflow = hubs.splice(1);
    const phrase = overflow.map((q) => q.your_reading).join(" / ");
    hubs.push({
      question: `Are all these connections two-way? ${phrase}`,
      your_reading: phrase,
      line_ids: overflow.flatMap((q) => q.line_ids!),
    });
  }
  return [...hubs, ...reading.please_check].slice(0, 3);
}

/** Focus on attachments before constructing a diagram. Speech-bubble tails are not connectors. */
async function checkAttachments(call: SketchCall, reading: SketchReading, images: Buffer[]) {
  if (!reading.notes.blocks.some((b) => b.type === "diagram")) return reading;
  const diagrams = reading.notes.blocks.flatMap((b, index) =>
    b.type === "diagram" ? [{ index, item_ids: b.item_ids }] : [],
  );
  const evidence = { items: reading.items, lines: reading.lines, groups: reading.groups, diagrams };
  const patch = z
    .object({
      add_items: z.array(Item),
      replace_or_add_lines: z.array(Line),
      remove_line_ids: z.array(id),
      diagram_members: z.array(z.object({ index: z.number().int().nonnegative(), item_ids: z.array(id) })),
    })
    .parse(
      await call(
        "sketch_arrows",
        `Check ONLY diagram attachments in the page and zooms. Look at both ends of EVERY listed line. Identify arrowheads at both tips, left/up arrows, curved lines, and the actual object each line touches. A fan that touches a drawing such as a brain must connect to the drawing, not its nearby label. Add a drawing item for an endpoint if needed. Remove speech bubble tails. Check for omitted links. A brace is a group. Preserve the existing IDs. Return a JSON patch {"add_items":[],"replace_or_add_lines":[],"remove_line_ids":[],"diagram_members":[{"index":0,"item_ids":["B1","B2"]}]} recording only changes. Supply COMPLETE item and line records using the original format. Update diagram_members to include EVERY new connected item. Source reading: ${JSON.stringify(evidence)}`,
        images,
      ),
    );
  const removed = new Set([...patch.remove_line_ids, ...patch.replace_or_add_lines.map((l) => l.id)]);
  const blocks = reading.notes.blocks.map((b, index) => {
    const members = patch.diagram_members.find((d) => d.index === index);
    return b.type === "diagram" && members ? { ...b, item_ids: members.item_ids } : b;
  });
  return Reading.parse({
    ...reading,
    items: [...reading.items, ...patch.add_items],
    lines: [...reading.lines.filter((l) => !removed.has(l.id)), ...patch.replace_or_add_lines],
    notes: { ...reading.notes, blocks },
  });
}

/** Re-read easily missed small marks in pictorial descriptions, using the actual inline cut-outs. */
export async function checkSmallMarks(
  call: SketchCall,
  reading: SketchReading,
  image: Buffer,
  pictures: Picture[],
) {
  const candidates = reading.notes.blocks.flatMap((block, index) =>
    block.type === "text"
      ? block.runs.flatMap((run, part) =>
          !run.authored && /bubble|ellips|ฟองคำพูด|กรอบคำพูด|number line|เส้นจำนวน/i.test(run.text)
            ? [{ index, part, text: run.text }]
            : [],
        )
      : [],
  );
  if (!candidates.length) return;
  const nearby = pictures
    .filter((pic) => candidates.some((c) => Math.abs(c.index - pic.after_block) <= 1))
    .slice(0, 8);
  const zooms = await Promise.all(nearby.map((p) => cut(image, p.box)));
  const evidence = candidates.map((c) => ({ ...c, context: blockLabel(reading.notes.blocks[c.index]) }));
  const response = z
    .object({
      edits: z
        .array(z.object({ index: z.number().int(), part: z.number().int(), text: word }))
        .max(candidates.length),
    })
    .parse(
      await call(
        "sketch_marks",
        `Recheck ONLY these picture descriptions for small marks that the first reader could have missed. First image is the full page; then close-ups in order: ${JSON.stringify(nearby.map((p) => p.name))}. For small bubbles distinguish empty outlines from one containing faint dots or an ellipsis; count each kind and look where the tails land. For a number line use the tick spacing to read the marked point. Keep human writing untouched. Replace a description only if you can see the evidence; preserve other details and the original language. Return JSON {"edits":[{"index":0,"part":0,"text":"corrected description"}]} with just necessary edits to these listed runs: ${JSON.stringify(evidence)}`,
        [image, ...zooms],
        "high",
      ),
    );
  for (const edit of response.edits) {
    if (!candidates.some((c) => c.index === edit.index && c.part === edit.part)) continue;
    const block = reading.notes.blocks[edit.index];
    if (block.type === "text") block.runs[edit.part].text = edit.text;
  }
}

export async function extractSketch(call: SketchCall, image: Buffer, strokes: Bounds[] = []): Promise<SketchPage> {
  const { width, height } = await sharp(image).metadata();
  if (!width || !height) throw new Error("Invalid image");
  const w = Math.ceil(width * 0.6),
    h = Math.ceil(height * 0.6);
  const zooms = await Promise.all(
    (
      [
        [0, 0, w, h],
        [width - w, 0, width, h],
        [0, height - h, w, height],
        [width - w, height - h, width, height],
      ] as Bounds[]
    ).map((box) => cut(image, box)),
  );
  const images = [image, ...zooms];
  const first = Reading.parse(await call("sketch_read", prompt, images));
  // The arrow pass changes membership and edges only; the block indexes used by crops are stable.
  const [attached, pictures, colors] = await Promise.all([
    checkAttachments(call, first, images),
    locatePictures(call, image, first, width, height, strokes),
    checkHighlightColours(call, image, width, height, first),
  ]);
  const reading = joinLabelledShapes(attached);
  applyHighlightColours(reading, colors);
  await checkSmallMarks(call, reading, image, pictures);
  return { reading, width, height, pictures, checks: sketchChecks(reading) };
}

export async function applySketchAnswers(
  call: SketchCall,
  page: SketchPage,
  answers: Answer[],
  correction = "",
): Promise<SketchPage> {
  if (answers.length !== page.checks.length || answers.some((a) => !a.yes && !a.correction?.trim()))
    throw new Error("Incomplete answers");
  let reading = structuredClone(page.reading);
  const confirmedLines = new Set(page.checks.flatMap((q, i) => (answers[i].yes ? (q.line_ids ?? []) : [])));
  for (const line of reading.lines) {
    if (confirmedLines.has(line.id)) line.head_at_from = line.head_at_to = true;
  }
  const changes = answers.flatMap((a, i) =>
    a.yes ? [] : [{ question: page.checks[i].question, correction: a.correction }],
  );
  if (correction.trim())
    changes.push({ question: "Additional correction from the student", correction: correction.trim() });
  if (changes.length) {
    reading = Reading.parse(
      await call(
        "sketch_correct",
        `Apply these student corrections to the supplied structured notes in ONE pass. Keep the block order, stable IDs, groups, colours, all unrelated wording, and already-confirmed arrowheads. No images or outside knowledge. Output the complete revised JSON in precisely the same format, with an empty please_check list. Corrections: ${JSON.stringify(changes)}. Existing notes: ${JSON.stringify(reading)}`,
      ),
    );
    if (reading.notes.blocks.length !== page.reading.notes.blocks.length)
      throw new Error("Correction moved drawing anchors");
    for (const id of confirmedLines) {
      const line = reading.lines.find((l) => l.id === id);
      if (!line) throw new Error("Correction dropped a confirmed line");
      line.head_at_from = line.head_at_to = true;
    }
  }
  reading.please_check = [];
  return { ...page, reading, checks: [] };
}
