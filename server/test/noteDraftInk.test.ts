import { describe, it, expect } from "vitest";

// Typed here, not with `typeof import(...)`: that would pull the browser-only module into the server's type check.
type Draftish = { title: string; text: string; files: unknown[]; drawing: { strokes: unknown[]; pages: number; ink?: { drawing: string; png: string; colors: string[] } } | null };
const { isEmptyDraft } = (await import(new URL("../../client/src/noteDraft.ts", import.meta.url).href)) as { isEmptyDraft: (d: Draftish) => boolean };

describe("a note draft with handwriting from the iOS app's PencilKit page", () => {
  const base = { title: "", text: "", files: [] as unknown[] };
  it("is kept: PencilKit ink has no web strokes but is still something she wrote", () => {
    expect(isEmptyDraft({ ...base, drawing: { strokes: [], pages: 1, ink: { drawing: "ZmFrZQ==", png: "iVBO", colors: ["#2563eb"] } } })).toBe(false);
  });
  it("is empty when there is no ink and no strokes", () => {
    expect(isEmptyDraft({ ...base, drawing: { strokes: [], pages: 1 } })).toBe(true);
    expect(isEmptyDraft({ ...base, drawing: null })).toBe(true);
  });
});
