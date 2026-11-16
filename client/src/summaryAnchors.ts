export type AnnotationSource = "summary" | "transcript";

/** A passage is identified by its words and neighbours. The block key disambiguates repeated sentences. */
export type QuoteAnchor = { quote: string; prefix: string; suffix: string; mark: "circle" | "underline"; block_key?: string | null };
export type Point = { x: number; y: number };
type Piece = { node: Text; start: number; end: number; block: HTMLElement | null };

export function indexSource(root: HTMLElement, legacy = false) {
  const marked = !!root.querySelector("[data-annotation-text]");
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const pieces: Piece[] = [];
  let text = "";
  for (let n = walker.nextNode(); n; n = walker.nextNode()) {
    const node = n as Text, parent = node.parentElement;
    if (!parent || !node.length || parent.closest("[data-personal-passage], [data-annotation-ignore], input, textarea")) continue;
    if (marked && !parent.closest("[data-annotation-text]")) continue;
    if (parent.closest("button") && !legacy) continue;
    pieces.push({ node, start: text.length, end: text.length + node.length, block: parent.closest("[data-annotation-block]") });
    text += node.data;
  }
  return { text, pieces };
}
type Index = ReturnType<typeof indexSource>;

type Glyph = { start: number; end: number; rect: DOMRect };
type Bounds = { left: number; right: number; top: number; bottom: number };
const graphemes = typeof Intl.Segmenter === "function" ? new Intl.Segmenter(undefined, { granularity: "grapheme" }) : null;

/** Measure only chunks near the stroke, even when a long transcript cue occupies many lines. */
function glyphsNear(index: Index, stroke: Bounds): Glyph[] {
  const glyphs: Glyph[] = [];
  const range = document.createRange();
  const near = (r: DOMRect) => r.width > 0 && r.height > 0 &&
    r.right > stroke.left && r.left < stroke.right &&
    r.top <= stroke.bottom + 2 && r.bottom + Math.max(14, r.height * .85) >= stroke.top;
  for (const { node, start } of index.pieces) {
    range.selectNodeContents(node);
    if (!near(range.getBoundingClientRect())) continue;
    // A Thai base and tone marks, or a joined emoji, is one selectable character.
    const offsets = graphemes
      ? Array.from(graphemes.segment(node.data), g => g.index)
      : Array.from(node.data.matchAll(/\P{M}\p{M}*(?:\u200d\P{M}\p{M}*)*|\p{M}+/gu), m => m.index!);
    offsets.push(node.length);
    for (let i = 0; i < offsets.length - 1; i += 64) {
      const end = Math.min(i + 64, offsets.length - 1);
      range.setStart(node, offsets[i]); range.setEnd(node, offsets[end]);
      if (!near(range.getBoundingClientRect())) continue;
      for (let j = i; j < end; j++) {
        range.setStart(node, offsets[j]); range.setEnd(node, offsets[j + 1]);
        const rect = range.getBoundingClientRect();
        if (near(rect)) glyphs.push({ start: start + offsets[j], end: start + offsets[j + 1], rect });
      }
    }
  }
  return glyphs;
}

function insideLoop(points: Point[], x: number, y: number) {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i], b = points[j];
    if ((a.y > y) !== (b.y > y) && x < (b.x - a.x) * (y - a.y) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

/** Distance from ink to the bottom of a printed row, allowing normal space below an underline. */
function underlineGap(rect: DOMRect, y: number) {
  const dy = y - rect.bottom;
  if (dy < -rect.height * .75 || dy > Math.max(14, rect.height * .85)) return Infinity;
  // In a gap between rows, an underline usually belongs to the text above the ink.
  return Math.abs(dy * (dy > 0 ? .7 : 1.1));
}

function underlineOffset(glyphs: Glyph[], point: Point) {
  let best = Infinity, offset: number | null = null;
  for (const g of glyphs) {
    const r = g.rect;
    const dx = Math.max(r.left - point.x, point.x - r.right, 0);
    const distance = Math.hypot(dx * .65, underlineGap(r, point.y));
    if (distance < best) {
      best = distance;
      offset = point.x < (r.left + r.right) / 2 ? g.start : g.end;
    }
  }
  return offset;
}

/** A nearly level stroke selects from one visual row, even if one end extends into its margin. */
function underlinedRow(glyphs: Glyph[], y: number, left: number, right: number) {
  let best = Infinity, row: DOMRect | null = null;
  for (const { rect } of glyphs) {
    const distance = underlineGap(rect, y);
    if (distance < best) { best = distance; row = rect; }
  }
  if (!row) return [];
  return glyphs.filter(({ rect: r }) => {
    const overlap = Math.min(row.bottom, r.bottom) - Math.max(row.top, r.top);
    const center = (r.left + r.right) / 2;
    return overlap > Math.min(row.height, r.height) / 2 && left <= center && center <= right;
  });
}

/** The geometry is in viewport coordinates; glyphs stay in document order across visual lines. */
export function markedGlyphRange(points: Point[], bounds: Bounds, glyphs: Glyph[]): { start: number; end: number; mark: QuoteAnchor["mark"] } | null {
  if (!glyphs.length || points.length < 2) return null;
  const { left, right, top, bottom } = bounds, width = right - left, height = bottom - top;
  const first = points[0], last = points[points.length - 1];
  let twiceArea = 0, previous = last;
  for (const p of points) {
    twiceArea += previous.x * p.y - p.x * previous.y;
    previous = p;
  }
  const circle = height >= 8 && Math.hypot(last.x - first.x, last.y - first.y) < Math.max(14, width * .5)
    && Math.abs(twiceArea) > .4 * width * height;
  let start: number, end: number;
  if (!circle && height > glyphs[0].rect.height * .65) {
    // A stroke across wrapped lines or transcript cues keeps its distinct endpoints.
    const a = underlineOffset(glyphs, first), b = underlineOffset(glyphs, last);
    if (a === null || b === null || a === b) return null;
    start = Math.min(a, b); end = Math.max(a, b);
  } else {
    // The median keeps a small hook or lift at the end from changing the selected row.
    const selected = circle
      ? glyphs.filter(({ rect: r }) => insideLoop(points, (r.left + r.right) / 2, (r.top + r.bottom) / 2))
      : underlinedRow(glyphs, points.map(p => p.y).sort((a, b) => a - b)[Math.floor(points.length / 2)], left, right);
    if (!selected.length) return null;
    start = selected[0].start; end = selected[selected.length - 1].end;
  }
  return { start, end, mark: circle ? "circle" : "underline" };
}

export function anchorFromMark(root: HTMLElement, points: Point[], oneCue = false): QuoteAnchor | null {
  if (points.length < 2) return null;
  const first = points[0];
  const bounds = { left: first.x, right: first.x, top: first.y, bottom: first.y };
  for (const p of points) {
    bounds.left = Math.min(bounds.left, p.x); bounds.right = Math.max(bounds.right, p.x);
    bounds.top = Math.min(bounds.top, p.y); bounds.bottom = Math.max(bounds.bottom, p.y);
  }
  if (bounds.right - bounds.left < 4) return null;
  const index = indexSource(root);
  const hit = markedGlyphRange(points, bounds, glyphsNear(index, bounds));
  if (!hit) return null;
  const { start, mark } = hit;
  let end = hit.end;
  if (oneCue) {
    const first = index.pieces.find(p => p.start <= start && p.end > start);
    const cue = first?.node.parentElement?.closest("[data-lecture-target]");
    if (cue) {
      for (const piece of index.pieces) {
        if (piece.start > start && !cue.contains(piece.node)) {
          end = Math.min(end, piece.start);
          break;
        }
      }
    }
  }
  const quote = index.text.slice(start, end).trim();
  if (!quote || quote.length > 2048) return null;
  const i = index.text.indexOf(quote, start);
  const block = index.pieces.find(p => p.start <= i && p.end > i)?.block;
  return {
    quote, prefix: index.text.slice(Math.max(0, i - 64), i), suffix: index.text.slice(i + quote.length, i + quote.length + 64),
    mark, block_key: block?.dataset.annotationBlock,
  };
}

export function locateQuote(text: string, a: QuoteAnchor, preferred?: { start: number; end: number }, onlyPreferred = false): number | null {
  let best = -1, offset: number | null = null;
  for (let i = text.indexOf(a.quote); i !== -1 && a.quote; i = text.indexOf(a.quote, i + 1)) {
    const inBlock = preferred && i >= preferred.start && i < preferred.end;
    if (onlyPreferred && !inBlock) continue;
    let before = 0, after = 0;
    while (before < a.prefix.length && text[i - 1 - before] === a.prefix[a.prefix.length - 1 - before]) before++;
    while (after < a.suffix.length && text[i + a.quote.length + after] === a.suffix[after]) after++;
    const score = (before + after) * 2 + (inBlock ? 1 : 0);
    if (score > best) { best = score; offset = i; }
    else if (score === best) offset = null;
  }
  return offset;
}

/** Measure only source text. A cross-line quote may contain embedded note buttons and other annotations. */
export function locateMark(index: Index, a: QuoteAnchor, filtered: boolean) {
  const blockPieces = a.block_key ? index.pieces.filter(p => p.block?.dataset.annotationBlock === a.block_key) : [];
  const preferred = blockPieces.length ? { start: blockPieces[0].start, end: blockPieces[blockPieces.length - 1].end } : undefined;
  const offset = locateQuote(index.text, a, preferred, filtered);
  if (offset === null) return null;
  const end = offset + a.quote.length;
  let block: HTMLElement | null = null;
  const rects: DOMRect[] = [];
  const range = document.createRange();
  for (const piece of index.pieces) {
    if (piece.start >= end) break;
    if (piece.end <= offset) continue;
    block = piece.block;
    range.setStart(piece.node, Math.max(0, offset - piece.start));
    range.setEnd(piece.node, Math.min(piece.node.length, end - piece.start));
    for (const r of range.getClientRects()) {
      if (!r.width || !r.height) continue;
      const prev = rects[rects.length - 1];
      if (prev && Math.abs(r.top - prev.top) < 2 && Math.abs(r.left - prev.right) < 3) {
        rects[rects.length - 1] = new DOMRect(prev.left, Math.min(prev.top, r.top), r.right - prev.left, Math.max(prev.height, r.height));
      } else rects.push(r);
    }
  }
  const slot = block?.querySelector<HTMLElement>("[data-annotation-slot]");
  return slot ? { rects, slot } : null;
}
