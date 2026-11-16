/** Text and its neighbours survive line wrapping, font changes and most summary edits. */
export type QuoteAnchor = { quote: string; prefix: string; suffix: string; mark: "circle" | "underline" };
export type Point = { x: number; y: number };

/** Inserted personal passages are outside the source text in which pen marks are anchored. */
function sourceNodes(root: HTMLElement): Text[] {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode: node => node.parentElement?.closest("[data-personal-passage]")
      ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT,
  });
  const nodes: Text[] = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) nodes.push(node as Text);
  return nodes;
}

function caretAt(root: HTMLElement, x: number, y: number): number | null {
  const doc = document as Document & {
    caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null;
    caretRangeFromPoint?: (x: number, y: number) => Range | null;
  };
  const caret = doc.caretPositionFromPoint?.(x, y);
  const fallback = !caret && doc.caretRangeFromPoint?.(x, y);
  const node = caret?.offsetNode ?? (fallback && fallback.startContainer);
  if (!node || !root.contains(node) || node.parentElement?.closest("[data-personal-passage]")) return null;
  const r = document.createRange();
  r.selectNodeContents(root);
  r.setEnd(node, caret?.offset ?? (fallback ? fallback.startOffset : 0));
  const portion = r.cloneContents();
  portion.querySelectorAll("[data-personal-passage]").forEach(passage => passage.remove());
  return portion.textContent?.length ?? 0;
}

export function anchorFromMark(root: HTMLElement, points: Point[]): QuoteAnchor | null {
  if (points.length < 2) return null;
  const first = points[0],
    last = points[points.length - 1];
  let left = first.x,
    right = first.x,
    top = first.y,
    bottom = first.y;
  for (const p of points) {
    left = Math.min(left, p.x);
    right = Math.max(right, p.x);
    top = Math.min(top, p.y);
    bottom = Math.max(bottom, p.y);
  }
  if (right - left < 4) return null;
  const circle =
    bottom - top >= 10 && Math.hypot(last.x - first.x, last.y - first.y) < Math.max(14, (right - left) * 0.45);
  const lineHeight = parseFloat(getComputedStyle(root).lineHeight) || 22;
  // A pencil underline lands just below the letters. A circle can enclose more than one line.
  const middle = (top + bottom) / 2;
  const a = circle
    ? caretAt(root, left + 1, Math.min(middle, top + lineHeight / 2))
    : caretAt(root, first.x, first.y - 5);
  const b = circle
    ? caretAt(root, right - 1, Math.max(middle, bottom - lineHeight / 2))
    : caretAt(root, last.x, last.y - 5);
  if (a === null || b === null) return null;
  const text = sourceNodes(root).map(node => node.data).join("");
  const start = Math.min(a, b),
    end = Math.max(a, b);
  const quote = text.slice(start, end).trim();
  if (!quote || quote.length > 2048) return null;
  const i = text.indexOf(quote, start);
  return {
    quote,
    prefix: text.slice(Math.max(0, i - 64), i),
    suffix: text.slice(i + quote.length, i + quote.length + 64),
    mark: circle ? "circle" : "underline",
  };
}

export function locateQuote(text: string, a: QuoteAnchor): number | null {
  let best = -1,
    offset: number | null = null;
  for (let i = text.indexOf(a.quote); i !== -1 && a.quote; i = text.indexOf(a.quote, i + 1)) {
    let before = 0,
      after = 0;
    while (before < a.prefix.length && text[i - 1 - before] === a.prefix[a.prefix.length - 1 - before]) before++;
    while (after < a.suffix.length && text[i + a.quote.length + after] === a.suffix[after]) after++;
    const score = before + after;
    if (score > best) {
      best = score;
      offset = i;
    } else if (score === best) offset = null;
  }
  return offset;
}

export function quoteRange(root: HTMLElement, a: QuoteAnchor): Range | null {
  const nodes = sourceNodes(root);
  const offset = locateQuote(nodes.map(node => node.data).join(""), a);
  if (offset === null) return null;
  const end = offset + a.quote.length;
  const r = document.createRange();
  let pos = 0,
    started = false;
  for (const n of nodes) {
    const next = pos + n.length;
    if (!started && offset < next) {
      r.setStart(n, offset - pos);
      started = true;
    }
    if (started && end <= next) {
      r.setEnd(n, end - pos);
      return r;
    }
    pos = next;
  }
  return null;
}
