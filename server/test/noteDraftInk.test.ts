import { describe, it, expect } from "vitest";

const { isEmptyDraft } = (await import(new URL("../../client/src/noteDraft.ts", import.meta.url).href)) as typeof import("../../client/src/noteDraft.ts");

describe("a note draft with handwriting from the iOS app's PencilKit page", () => {
  const base = { title: "", text: "", files: [] as File[] };
  it("is kept: PencilKit ink has no web strokes but is still something she wrote", () => {
    expect(isEmptyDraft({ ...base, drawing: { strokes: [], pages: 1, ink: { drawing: "ZmFrZQ==", png: "iVBO", colors: ["#2563eb"] } } })).toBe(false);
  });
  it("is empty when there is no ink and no strokes", () => {
    expect(isEmptyDraft({ ...base, drawing: { strokes: [], pages: 1 } })).toBe(true);
    expect(isEmptyDraft({ ...base, drawing: null })).toBe(true);
  });
});
