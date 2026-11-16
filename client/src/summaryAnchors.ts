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

function caretAt(index: Index, x: number, y: number) {
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  const caret = doc.caretPositionFromPoint?.(x, y);
  const fallback = !caret && doc.caretRangeFromPoint?.(x, y);
  const node = caret?.offsetNode ?? (fallback && fallback.startContainer);
  const piece = index.pieces.find(p => p.node === node);
  return piece ? piece.start + (caret?.offset ?? (fallback ? fallback.startOffset : 0)) : null;
}

export function anchorFromMark(root: HTMLElement, points: Point[], oneCue = false): QuoteAnchor | null {
  if (points.length < 2) return null;
  const first = points[0], last = points[points.length - 1];
  let left = first.x, right = first.x, top = first.y, bottom = first.y;
  for (const p of points) {
    left = Math.min(left, p.x); right = Math.max(right, p.x);
    top = Math.min(top, p.y); bottom = Math.max(bottom, p.y);
  }
  if (right - left < 4) return null;
  const circle = bottom - top >= 10 && Math.hypot(last.x - first.x, last.y - first.y) < Math.max(14, (right - left) * 0.45);
  const lineHeight = parseFloat(getComputedStyle(root).lineHeight) || 22;
  const middle = (top + bottom) / 2;
  const index = indexSource(root);
  const a = circle ? caretAt(index, left + 1, Math.min(middle, top + lineHeight / 2)) : caretAt(index, first.x, first.y - 5);
  const b = circle ? caretAt(index, right - 1, Math.max(middle, bottom - lineHeight / 2)) : caretAt(index, last.x, last.y - 5);
  if (a === null || b === null) return null;
  const start = Math.min(a,b);
  let end = Math.max(a,b);
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
    mark: circle ? "circle" : "underline", block_key: block?.dataset.annotationBlock,
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
