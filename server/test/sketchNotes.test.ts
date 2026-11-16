import express from "express";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { mkdtemp, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import sharp from "sharp";
import { applySketchAnswers, extractSketch, penBox, joinLabelledShapes, sketchChecks } from "../src/sketchPage.js";
import type { SketchCall } from "../src/sketchModel.js";
import type { SketchState } from "../src/sketchSchema.js";

// Ground-truth details from the two owner-reviewed pages; no original page or lecture text.
const textRun = (text: string, ink = "#1f1f1f", authored = true) => ({
  text,
  ink,
  highlight: null,
  marks: [],
  authored,
});
const item = (id: string, text: string) => ({ id, ...textRun(text) });
const edge = (id: string, from: string, to: string, head_at_from = false) => ({
  id,
  from,
  to,
  head_at_from,
  head_at_to: true,
  style: "straight",
});
const pageReading = {
  items: [
    item("B1", "PRIOR KNOWLEDGE"),
    item("B2", "NEW LEARNING"),
    item("B3", "CULTURAL"),
    item("B4", "brain"),
    item("B5", "memory"),
    item("B6", "control"),
    item("B7", "detection"),
    item("B8", "Math"),
    item("B9", "Sensory motor memories"),
  ],
  lines: [
    edge("C1", "B1", "B2", true),
    edge("C2", "B2", "B3"),
    edge("C3", "B4", "B5"),
    edge("C4", "B4", "B6"),
    edge("C5", "B4", "B7"),
    edge("C6", "B8", "B9"),
  ],
  groups: [{ label: "brain systems", items: ["B5", "B6", "B7"] }],
  notes: {
    title: "Worked page",
    blocks: [
      { type: "heading", runs: [textRun("Heading", "#d32f2f")] },
      {
        type: "text",
        runs: [
          { ...textRun("1–3", "#8b38b3"), highlight: "#ffdd33" },
          textRun(" exactly ", "#453211"),
          textRun("Three bubbles: one empty and two ellipses. Graph point (1, 2).", "#8a8a8a", false),
        ],
      },
      { type: "diagram", item_ids: ["B1", "B2", "B3", "B4", "B5", "B6", "B7", "B8", "B9"] },
      { type: "math", steps: [{ latex: "5x=5", op: "\\div 5" }, { latex: "x=1" }], answer: "x=1" },
    ],
  },
  please_check: [{ question: "Is this x?", your_reading: "x" }],
};
let photo: Buffer;
const emptyPatch = { add_items: [], replace_or_add_lines: [], remove_line_ids: [], diagram_members: [] };
function fake(): SketchCall {
  return async (purpose, _prompt, images = []) => {
    if (purpose === "sketch_read" || purpose === "sketch_arrows") {
      expect(images).toHaveLength(5);
      expect(await sharp(images[1]).metadata()).toMatchObject({ width: 180, height: 120 });
      return purpose === "sketch_read" ? structuredClone(pageReading) : emptyPatch;
    }
    if (purpose === "sketch_marks") return { edits: [] };
    if (purpose === "sketch_locate")
      return { pictures: [{ name: "dot pattern", after_block: 1, box: [367, 325, 600, 575] }] };
    if (purpose === "sketch_refine") {
      expect(await sharp(images[0]).metadata()).toMatchObject({ width: 300, height: 200 });
      return { found: true, box: [280, 200, 670, 600] };
    }
    throw new Error("unexpected model call");
  };
}
beforeAll(async () => {
  photo = await sharp({ create: { width: 300, height: 200, channels: 3, background: "white" } })
    .jpeg()
    .toBuffer();
});

describe("reading and correcting hand-drawn pages", () => {
  it("uses the page and overlapping zooms, refines a row together, and confirms hub arrows without another AI call", async () => {
    const doc = await extractSketch(fake(), photo);
    expect(doc.pictures).toEqual([{ name: "dot pattern", after_block: 1, box: [80, 36, 205, 124] }]);
    expect(doc.checks).toHaveLength(3);
    const noCall = vi.fn<SketchCall>();
    const fixed = await applySketchAnswers(
      noCall,
      doc,
      doc.checks.map(() => ({ yes: true })),
    );
    expect(noCall).not.toHaveBeenCalled();
    expect(fixed.reading.lines.map((l) => l.head_at_from)).toEqual([true, true, true, true, true, false]);
    expect(fixed.reading.lines[5]).toMatchObject({ from: "B8", to: "B9", head_at_to: true });
    expect(fixed.reading.groups).toEqual(pageReading.groups);
    expect(fixed.reading.notes.blocks).toEqual(pageReading.notes.blocks);
  });

  it("submits every correction in one text-only call and keeps previously confirmed edges", async () => {
    const doc = await extractSketch(fake(), photo);
    const call = vi.fn<SketchCall>(async (_purpose, prompt, images) => {
      expect(images).toBeUndefined();
      expect(prompt).toContain("left arrow");
      expect(prompt).toContain("x, then y");
      return pageReading;
    });
    const fixed = await applySketchAnswers(call, doc, [
      { yes: true },
      { yes: false, correction: "left arrow" },
      { yes: false, correction: "x, then y" },
    ]);
    expect(call).toHaveBeenCalledTimes(1);
    expect(fixed.reading.lines[1].head_at_from).toBe(true);
    expect(fixed.checks).toEqual([]);
  });

  it("recognizes the labelled starburst as the same node and asks about its second arrow", async () => {
    const page = await extractSketch(fake(), photo);
    page.reading.items.push({ ...page.reading.items[1], id: "B10", text: "new learning starburst figure" });
    page.reading.lines[1].from = "B10";
    const reading = joinLabelledShapes(page.reading);
    expect(reading.lines[1].from).toBe("B2");
    expect(sketchChecks(reading).some((q) => q.line_ids?.includes("C2"))).toBe(true);
  });

  it("can correct an unasked detail after all questions were answered", async () => {
    const page = await extractSketch(fake(), photo);
    page.checks = [];
    const model = vi.fn<SketchCall>(async (_, prompt, images) => {
      expect(images).toBeUndefined();
      expect(prompt).toContain("Change the third caption");
      return pageReading;
    });
    await applySketchAnswers(model, page, [], "Change the third caption");
    expect(model).toHaveBeenCalledTimes(1);
  });

  it("samples dark purple ink next to its yellow marker, ignoring adjacent red writing", async () => {
    const { sampleColour } = await import("../src/sketchColours.js");
    const page = Buffer.from(
      '<svg width="200" height="200"><rect width="200" height="200" fill="white"/><rect x="70" y="60" width="60" height="70" fill="#ffd54f"/><rect x="92" y="70" width="8" height="48" fill="#6416b8"/><rect x="45" y="30" width="100" height="24" fill="#ef0808"/></svg>',
    );
    const result = await sampleColour(page, [300, 200, 650, 600], 200, 200, "#ffd54f");
    expect(result).toBe("#6416b8");
  });

  it("uses exported PencilKit extents and ignores unrelated strokes", () => {
    expect(
      penBox(
        [
          [0.25, 0.2, 0.35, 0.4],
          [0.8, 0.8, 1, 1],
        ],
        [40, 30, 80, 90],
        200,
        200,
      ),
    ).toEqual([47, 37, 73, 83]);
  });
});

describe("private sketch routes", () => {
  let server: Server,
    dir: string,
    base: string,
    student: string,
    db: ReturnType<typeof import("../src/db.js").openDb>,
    noteId: number;
  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), "sketch-test-"));
    const { env } = await import("../src/env.js");
    vi.spyOn(env, "uploadDir", "get").mockReturnValue(dir);
    const { openDb } = await import("../src/db.js");
    const { createSketchRouter } = await import("../src/sketchRoutes.js");
    const { findOrCreateUser } = await import("../src/auth.js");
    db = openDb(":memory:");
    student = findOrCreateUser(db, { email: "first@example.com", name: "First", avatar: "" });
    noteId = Number(
      db
        .prepare("INSERT INTO notes(user_id,created_at,image_paths) VALUES (?,datetime('now'),?)")
        .run(student, JSON.stringify(["/api/uploads/page.jpg"])).lastInsertRowid,
    );
    await writeFile(join(dir, "page.jpg"), photo);
    const app = express();
    app.use(express.json());
    app.use((req, _res, next) => {
      req.user = { id: student } as Express.User;
      next();
    });
    app.use(
      "/api",
      createSketchRouter(db, fake(), () => true),
    );
    server = app.listen(0, "127.0.0.1");
    await new Promise((resolve) => server.once("listening", resolve));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/notes/${noteId}/sketch/0`;
  });
  afterAll(async () => {
    server?.close();
    db?.close();
    if (dir) await rm(dir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });
  async function post(suffix = "", body: unknown = {}) {
    return fetch(base + suffix, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
  }
  async function settled() {
    let last: SketchState | null = null;
    await vi.waitFor(
      async () => {
        last = (await (await fetch(base)).json()) as SketchState;
        expect(last.busy).toBe(false);
      },
      { timeout: 4000 },
    );
    return last! as SketchState;
  }
  it("persists the page, rejects stale answers, and exposes only checked handwritten text to its owner", async () => {
    const { sketchSources } = await import("../src/sketchRoutes.js");
    expect((await post()).status).toBe(202);
    const state = await settled();
    expect(state.document?.pictures).toHaveLength(1);
    const answers = state.document!.checks.map(() => ({ yes: true }));
    expect((await post("/verify", { revision: 1 })).status).toBe(409);
    expect((await post("/answers", { answers, revision: 99 })).status).toBe(409);
    expect((await post("/answers", { answers, revision: 1 })).status).toBe(202);
    expect((await settled()).revision).toBe(2);
    expect(sketchSources(db, student, noteId)).toEqual([]);
    expect((await post("/verify", { revision: 2 })).status).toBe(200);
    expect(sketchSources(db, student, noteId)).toEqual([
      { runs: [{ text: "Heading", color: "#d32f2f" }] },
      {
        runs: [
          { text: "1–3", color: "#8b38b3" },
          { text: " exactly ", color: "#453211" },
        ],
      },
    ]);
    // A free-form correction remains available after verification with zero remaining questions.
    expect((await post("/answers", { revision: 2, answers: [], correction: "Change the caption" })).status).toBe(
      202,
    );
    await settled();
    student = "someone-else";
    expect((await fetch(base)).status).toBe(404);
    expect((await post()).status).toBe(404);
    expect(sketchSources(db, student, noteId)).toEqual([]);
  });
});

describe("DeepSeek drawing stream", () => {
  it("recovers a full reasoning budget with the same images and reads only answer deltas", async () => {
    const { env } = await import("../src/env.js");
    vi.spyOn(env, "aiProvider", "get").mockReturnValue("deepseek");
    vi.spyOn(env, "aiApiKey", "get").mockReturnValue("test");
    vi.spyOn(env, "aiBaseUrl", "get").mockReturnValue("https://test.invalid/anthropic");
    const { openDb } = await import("../src/db.js");
    const { sketchModel } = await import("../src/sketchModel.js");
    const db = openDb(":memory:");
    const calls: { reasoning_effort: string; messages: unknown }[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (_url, init: RequestInit) => {
        calls.push(JSON.parse(init.body as string));
        const chunks =
          calls.length === 1
            ? [{ choices: [{ delta: { reasoning_content: "initial reasoning" }, finish_reason: "length" }] }]
            : [
                { choices: [{ delta: { reasoning_content: "not part of the answer" } }] },
                { choices: [{ delta: { content: '{"text":' } }] },
                {
                  choices: [{ delta: { content: '"ทดสอบ"}' }, finish_reason: "stop" }],
                  usage: { prompt_tokens: 20, completion_tokens: 30 },
                },
              ];
        return new Response(
          chunks.map((c) => "data: " + JSON.stringify(c) + "\n\n").join("") + "data: [DONE]\n\n",
        );
      }),
    );
    try {
      const png = await sharp(photo).png().toBuffer();
      expect(await sketchModel(db)("sketch_read", "Read in JSON", [png, photo])).toEqual({ text: "ทดสอบ" });
      expect(JSON.stringify(calls[0].messages)).toContain("data:image/png;base64," + png.toString("base64"));
      expect(JSON.stringify(calls[0].messages)).toContain("data:image/jpeg;base64," + photo.toString("base64"));
      expect(calls.map((c) => c.reasoning_effort)).toEqual(["max", "high"]);
      expect(calls[0].messages).toEqual(calls[1].messages);
      expect(db.prepare("SELECT purpose, input_tokens, output_tokens FROM ai_usage").get()).toEqual({
        purpose: "sketch_read",
        input_tokens: 20,
        output_tokens: 30,
      });
    } finally {
      vi.unstubAllGlobals();
      vi.restoreAllMocks();
      db.close();
    }
  });
});
