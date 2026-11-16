import { expect, it } from "vitest";

type Run = { text: string; color: string | null };
const { currentCombinedReading } = await import(new URL("../../client/src/combinedLectureNotes.ts", import.meta.url).href);
const note = (id: number, text: string) => ({ kind: "mine", source: "note", id, runs: [{ text, color: null }] });
const line = (text: string) => ({ kind: "summary", text });
const stored = {
  mode: "combined", version: 1,
  blocks: [line("First"), note(1, "line B"), line("Last"), note(1, "line A"), note(2, "other")],
};
const sources = {
  notes: [
    { id: 1, raw_text: "line A\nline B", sketch_passages: [] as { runs: Run[] }[] },
    { id: 2, raw_text: "other" },
  ], annotations: [],
};
const markdown = "First\r\n\r\nLast";

it("interleaves matching personal sources at their saved summary lines, preserving blank lines and order", () => {
  const view = currentCombinedReading(markdown, stored, sources);
  expect(view.lines.get(0)).toEqual([note(1, "line B")]);
  expect(view.lines.get(2)).toEqual([note(1, "line A"), note(2, "other")]);
  expect(view.notes).toEqual(new Set([1, 2]));
  expect(view.allCurrent).toBe(true);
});

it("shows a changed note with its original instead of substituting stale passages, and keeps other live sources", () => {
  const changed = { ...sources, notes: [{ ...sources.notes[0], raw_text: "line B" }, sources.notes[1]] };
  const view = currentCombinedReading(markdown, stored, changed);
  expect(view.lines.get(0)).toEqual([]);
  expect(view.lines.get(2)).toEqual([note(2, "other")]);
  expect(view.notes).toEqual(new Set([2]));
  expect(view.allCurrent).toBe(false);
  expect(currentCombinedReading("Edited summary", stored, sources)).toBeNull();
  expect(currentCombinedReading(markdown, { ...stored, mode: "separate" }, sources)).toBeNull();
});

it("matches verified sketch text and colour, and drops placements for deleted pen notes", () => {
  const sketch = { text: "Sketch passage", color: "#456789" };
  const pen = { text: "Pen passage", color: "#234567" };
  const saved = { ...stored, blocks: [line("First"), { kind: "mine", source: "note", id: 3, runs: [sketch] },
    { kind: "mine", source: "annotation", id: 4, runs: [pen] }] };
  const live = { notes: [{ id: 3, raw_text: null, sketch_passages: [{ runs: [sketch] }] }], annotations: [{ id: 4, runs: [pen] }] };
  expect(currentCombinedReading("First", saved, live).annotations).toEqual(new Set([4]));
  expect(currentCombinedReading("First", saved, { ...live, annotations: [] }).annotations.size).toBe(0);
  live.notes[0].sketch_passages[0].runs[0] = { ...sketch, color: "#999999" };
  expect(currentCombinedReading("First", saved, live).notes.size).toBe(0);
});
