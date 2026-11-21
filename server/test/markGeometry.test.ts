import { expect, it } from "vitest";

// Use captured line-box sizes in CSS pixels. The browser supplies these same boxes for real glyphs.
const { markedGlyphRange } = await import(new URL("../../client/src/summaryAnchors.ts", import.meta.url).href);
type Point = { x: number; y: number };
const glyph = (start: number, end: number, x: number, y: number, width = 8) => ({
  start, end, rect: { left: x, right: x + width, top: y, bottom: y + 20, width, height: 20 },
});
function mark(glyphs: ReturnType<typeof glyph>[], ...points: Point[]) {
  const xs = points.map(p => p.x), ys = points.map(p => p.y);
  return markedGlyphRange(points, {
    left: Math.min(...xs), right: Math.max(...xs), top: Math.min(...ys), bottom: Math.max(...ys),
  }, glyphs);
}

it("keeps a low underline on its original row, including a reverse stroke ending beside a control", () => {
  const glyphs = [glyph(0, 1, 0, 0), glyph(1, 2, 8, 0), glyph(2, 3, 16, 0),
    ...Array.from({ length: 9 }, (_, i) => glyph(i + 3, i + 4, 8 * i, 27))];
  const left = { x: 8, y: 32 }, margin = { x: 62, y: 32 };
  expect(mark(glyphs, left, margin)).toEqual({ start: 1, end: 3, mark: "underline" });
  expect(mark(glyphs, margin, left)).toEqual({ start: 1, end: 3, mark: "underline" });
  expect(mark(glyphs, { x: 80, y: 22 }, { x: 90, y: 22 })).toBeNull();
});

it("uses the graphemes inside a hand-drawn loop and preserves their complete text offsets", () => {
  const glyphs = [glyph(0, 1, 0, 0), glyph(1, 5, 8, 0), glyph(5, 10, 16, 0), glyph(10, 11, 24, 0)];
  const loop = Array.from({ length: 25 }, (_, i) => ({
    x: 16 + 9 * Math.cos(i * Math.PI / 12), y: 10 + 13 * Math.sin(i * Math.PI / 12),
  }));
  expect(mark(glyphs, ...loop)).toEqual({ start: 1, end: 10, mark: "circle" });
});

it("retains both ends of an underline spanning consecutive lines", () => {
  const glyphs = [glyph(0, 1, 0, 0), glyph(1, 2, 8, 0), glyph(2, 3, 0, 30), glyph(3, 4, 8, 30)];
  expect(mark(glyphs, { x: 8, y: 22 }, { x: 17, y: 53 })).toEqual({ start: 1, end: 4, mark: "underline" });
});
