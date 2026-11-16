import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { useT } from "../i18n.tsx";
import Icon from "./Icon.tsx";
import type { Drawing } from "../noteDraft.ts";

export type HandwritingHandle = {
  png: () => string;
  colors: () => string[];
};

// Logical drawing resolution per page (exported at this size). Displayed scaled by zoom.
const CANVAS_W = 1000;
const CANVAS_H = 1400;
const MAX_PAGES = 10;

const COLORS = ["#1f2937", "#2563eb", "#dc2626", "#16a34a", "#ea580c"];
const HL_COLORS = ["#fde047", "#86efac", "#f9a8d4", "#93c5fd", "#fdba74"];
const WIDTHS: Array<{ key: "thin" | "medium" | "thick"; val: number }> = [
  { key: "thin", val: 4 },
  { key: "medium", val: 9 },
  { key: "thick", val: 16 },
];
const ERASER_WIDTH = 34;
const HL_WIDTH = 44;
const HL_ALPHA = 0.35;

type Tool = "pen" | "highlighter" | "eraser";
/** A point of a stroke. `p` is the pen's pressure (0–1), present only for a pressure-sensitive pen. */
type Point = { x: number; y: number; p?: number };

/**
 * How thick the pen line is at a point. A pressure-sensitive pen (Apple Pencil,
 * S Pen) draws thinner when it is light and thicker when it presses; a mouse,
 * a finger, the highlighter and the eraser keep one width.
 */
function widthAt(s: Stroke, point: Point): number {
  return s.tool === "pen" && point.p !== undefined ? s.width * (0.45 + 1.1 * point.p) : s.width;
}
export type Stroke = { tool: Tool; color: string; width: number; points: Point[] };

function paintStroke(ctx: CanvasRenderingContext2D, s: Stroke) {
  const col = s.tool === "eraser" ? "#ffffff" : s.color;
  ctx.save();
  if (s.tool === "highlighter") ctx.globalAlpha = HL_ALPHA;
  ctx.strokeStyle = col;
  ctx.fillStyle = col;
  ctx.lineWidth = s.width;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const pts = s.points;
  if (pts.length === 1) {
    ctx.beginPath();
    ctx.arc(pts[0].x, pts[0].y, widthAt(s, pts[0]) / 2, 0, Math.PI * 2);
    ctx.fill();
  } else if (s.tool === "pen" && pts.some((pt) => pt.p !== undefined)) {
    // Pressure changes along the line: draw it piece by piece, each at its own width.
    for (let i = 1; i < pts.length; i++) {
      ctx.lineWidth = (widthAt(s, pts[i - 1]) + widthAt(s, pts[i])) / 2;
      ctx.beginPath();
      ctx.moveTo(pts[i - 1].x, pts[i - 1].y);
      ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
    }
  } else {
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
  }
  ctx.restore();
}

type VectorDrawing = Pick<Drawing, "strokes" | "pages">;

function paintPage(ctx: CanvasRenderingContext2D, drawing: VectorDrawing, width: number, pageHeight: number, background?: HTMLImageElement) {
  const height = pageHeight * drawing.pages;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, Math.max(height, ctx.canvas.height));
  if (background) ctx.drawImage(background, 0, 0, width, height);
  ctx.strokeStyle = "#e2e8f0";
  ctx.lineWidth = 2;
  ctx.setLineDash([12, 10]);
  for (let page = 1; page < drawing.pages; page++) {
    const y = page * pageHeight;
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  for (const stroke of drawing.strokes) paintStroke(ctx, stroke);
}

/** Render a closed editor's vector draft at its original resolution for note submission. */
export async function exportHandwriting(drawing: VectorDrawing | null): Promise<Blob | null> {
  if (!drawing?.strokes.length) return null;
  const canvas = document.createElement("canvas");
  canvas.width = CANVAS_W;
  canvas.height = CANVAS_H * drawing.pages;
  paintPage(canvas.getContext("2d")!, drawing, CANVAS_W, CANVAS_H);
  try {
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob(
      blob => blob ? resolve(blob) : reject(new Error("Could not export handwriting")), "image/png",
    ));
  } finally {
    canvas.width = canvas.height = 0;
  }
}

/** Bounds use the same page coordinates as the lossless export, in the format used for PencilKit strokes. */
export function handwritingStrokeBounds(drawing: VectorDrawing): number[][] {
  const height = CANVAS_H * drawing.pages;
  const boxes: number[][] = [];
  // An eraser may have removed any part of an earlier mark. Use the actual pixels alone in that case.
  if (drawing.strokes.some(stroke => stroke.tool === "eraser")) return boxes;
  for (const stroke of drawing.strokes) {
    let left = CANVAS_W, top = height, right = 0, bottom = 0;
    for (const point of stroke.points) {
      const radius = widthAt(stroke, point) / 2;
      left = Math.min(left, point.x - radius);
      top = Math.min(top, point.y - radius);
      right = Math.max(right, point.x + radius);
      bottom = Math.max(bottom, point.y + radius);
    }
    left = Math.max(0, left);
    top = Math.max(0, top);
    right = Math.min(CANVAS_W, right);
    bottom = Math.min(height, bottom);
    if (right > left && bottom > top) {
      const box = [left / CANVAS_W, top / height, right / CANVAS_W, bottom / height];
      boxes.push(box.map(value => Math.round(value * 100000) / 100000));
    }
    if (boxes.length === 20_000) break;
  }
  return boxes;
}

export function HandwritingPreview({ drawing }: { drawing: VectorDrawing }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const scale = 0.2;
  useEffect(() => {
    const ctx = canvas.current!.getContext("2d")!;
    ctx.setTransform(scale, 0, 0, scale, 0, 0);
    paintPage(ctx, drawing, CANVAS_W, CANVAS_H);
  }, [drawing]);
  return <canvas ref={canvas} width={CANVAS_W * scale} height={CANVAS_H * drawing.pages * scale}
    className="block max-w-full max-h-full object-contain" aria-hidden="true"/>;
}

type Props = {
  compact?: boolean;
  fitAnnotationPane?: boolean;
  allowFinger?: boolean;
  accent?: string;
  background?: HTMLImageElement;
  /** Strokes and page count to start from (a restored draft). Read once, on mount. */
  initial?: VectorDrawing | null;
  /** Called after every finished stroke, undo, redo, clear or page change. */
  onChange?: (drawing: VectorDrawing) => void;
  /** Called the first time a pen (Apple Pencil, stylus) touches the pad, so the note form can show it is in use. */
  onPen?: () => void;
};

/**
 * A full drawing pad: pen + eraser, colors, stroke widths, undo/redo, clear,
 * zoom in/out, and multiple pages. Compact annotations start on the same pen.
 * Note drafts keep editable vectors and export original strokes as a PNG.
 */
export const HandwritingPad = forwardRef<HandwritingHandle, Props>(({ initial, onChange, onPen, compact = false, fitAnnotationPane = false, allowFinger = false, accent = COLORS[0], background }, ref) => {
  const { lang, t } = useT();
  // A web edit of a PencilKit annotation paints on its exact saved image, including its original aspect ratio.
  const logicalWidth = compact ? background?.naturalWidth || 680 : CANVAS_W;
  const pageHeight = compact ? background?.naturalHeight || 260 : CANVAS_H;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scroller = useRef<HTMLDivElement>(null);
  const [viewportPaperHeight, setViewportPaperHeight] = useState(0);
  useLayoutEffect(() => {
    if (compact && (!fitAnnotationPane || background)) return;
    const sc = scroller.current!;
    const measure = () => {
      if (!sc.clientWidth) return;
      const height = Math.ceil(sc.clientHeight / sc.clientWidth * logicalWidth);
      // A rotation may give the sheet more paper. Never crop ink already drawn near the bottom.
      setViewportPaperHeight(previous => fitAnnotationPane ? Math.max(previous, height) : height);
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(sc);
    return () => observer.disconnect();
  }, [compact, fitAnnotationPane, background, logicalWidth]);
  const [strokes, setStrokes] = useState<Stroke[]>(() => initial?.strokes ?? []);
  const [redoStack, setRedoStack] = useState<Stroke[]>([]);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState(accent);
  const [hlColor, setHlColor] = useState(HL_COLORS[0]);
  const [width, setWidth] = useState(WIDTHS[0].val);
  const [zoom, setZoom] = useState(1);
  const [pages, setPages] = useState(() => Math.min(MAX_PAGES, Math.max(1, initial?.pages ?? 1)));

  // On tall phones the first sheet can end above the bottom edge. Extend the active
  // writing surface, and count a new page only when its first stroke is committed.
  const logicalHeight = Math.max(pageHeight * pages, viewportPaperHeight);

  // Tell the owner about every change so it can keep a draft.
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  useEffect(() => {
    onChangeRef.current?.({ strokes, pages });
  }, [strokes, pages]);

  const drawing = useRef(false);
  const current = useRef<Stroke | null>(null);
  const last = useRef<Point | null>(null);

  function ctxOf() {
    return canvasRef.current!.getContext("2d")!;
  }

  function redraw() {
    const c = canvasRef.current!;
    paintPage(ctxOf(), { strokes, pages }, c.width, pageHeight, background);
  }

  // init + redraw whenever strokes or the page count change
  useLayoutEffect(() => {
    const c = canvasRef.current!;
    const h = logicalHeight;
    if (c.width !== logicalWidth || c.height !== h) {
      c.width = logicalWidth;
      c.height = h; // resizing clears the canvas; redraw() repaints below
    }
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strokes, pages, logicalWidth, logicalHeight, pageHeight, background]);

  function toCanvas(e: React.PointerEvent): Point {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    const point: Point = {
      x: ((e.clientX - r.left) / r.width) * c.width,
      y: ((e.clientY - r.top) / r.height) * c.height,
    };
    // Only a real pen reports pressure; a mouse always says 0.5 and a finger 0 or 1.
    if (e.pointerType === "pen" && e.pressure > 0) point.p = Math.round(e.pressure * 100) / 100;
    return point;
  }

  // Palm rejection. A resting palm arrives as separate "touch" pointers while
  // the pen is a "pen" pointer. Touch never starts a stroke, and once a stroke
  // has started only the pointer that started it may extend or end it —
  // otherwise the palm's own move/lift events drag the line to the palm or cut
  // the stroke short.
  const activePointer = useRef<number | null>(null);

  // ── Fingers ──
  // The canvas takes every touch itself (touch-action: none), because the
  // browser cannot tell a pen from a finger when it decides what scrolls. So
  // fingers are handled here: one finger scrolls the page, two fingers pinch
  // to zoom and pan. With "draw with a finger" switched on, one finger draws
  // and two fingers still zoom and pan. A palm is not a finger: a large
  // contact, or any touch while the pen is down or has just lifted, is ignored.
  const touches = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ dist: number; zoom: number } | null>(null);
  const penDown = useRef(false);
  const lastPenAt = useRef(0);
  const anchor = useRef<{ mx: number; my: number; fx: number; fy: number } | null>(null);
  const [fingerDraw, setFingerDraw] = useState(() => {
    try { return localStorage.getItem("studyos.fingerDraw") === "1"; } catch { return false; }
  });
  function toggleFingerDraw() {
    setFingerDraw((on) => {
      try { localStorage.setItem("studyos.fingerDraw", on ? "0" : "1"); } catch { /* not saved */ }
      return !on;
    });
  }
  // PEN ONLY. A browser on an iPad does not say how big a touch is, so a palm
  // looks like a finger: one landing before the pen scrolled the page, and with
  // "draw with a finger" on it drew. Once a pen has touched the pad on this
  // device, pen-only is on: a single touch does nothing at all (no line, no
  // scroll); two fingers still zoom and pan, but never while the pen is down or
  // for a second after it lifts. It can be switched off for a finger or a mouse.
  const [penOnly, setPenOnly] = useState(() => {
    try { return localStorage.getItem("studyos.penOnly") === "1"; } catch { return false; }
  });
  function savePenOnly(on: boolean) {
    setPenOnly(on);
    try { localStorage.setItem("studyos.penOnly", on ? "1" : "0"); } catch { /* not saved */ }
  }
  const penSeen = useRef(false);
  function sawPen() {
    if (penSeen.current) return;
    penSeen.current = true;
    onPen?.();
    try {
      // Turn pen-only on by itself only the first time; after that the student's own choice stands.
      if (localStorage.getItem("studyos.penOnly") === null) savePenOnly(true);
    } catch { savePenOnly(true); }
  }
  const spread = () => {
    const [a, b] = [...touches.current.values()];
    return Math.hypot(a.x - b.x, a.y - b.y);
  };
  // After a pinch changes the zoom, keep the spot between the fingers where it was.
  useLayoutEffect(() => {
    const a = anchor.current;
    const sc = scroller.current;
    if (!a || !sc) return;
    anchor.current = null;
    sc.scrollLeft = a.fx * sc.scrollWidth - a.mx;
    sc.scrollTop = a.fy * sc.scrollHeight - a.my;
  }, [zoom]);

  function touchDown(e: React.PointerEvent) {
    const palm = Math.max(e.width, e.height) > 44;
    const sincePen = Date.now() - lastPenAt.current;
    if (palm || penDown.current || sincePen < (penOnly ? 1000 : 400)) return;
    touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (compact) {
      if (allowFinger && !penOnly && touches.current.size === 1) beginStroke(e);
      return;
    }
    if (touches.current.size === 2) {
      // A second finger means zoom, not a line: drop the stroke the first finger began.
      if (activePointer.current !== null) {
        activePointer.current = null;
        drawing.current = false;
        current.current = null;
        last.current = null;
        redraw();
      }
      pinch.current = { dist: spread() || 1, zoom };
    } else if (touches.current.size === 1 && fingerDraw && !penOnly) {
      beginStroke(e);
    }
  }
  function touchMove(e: React.PointerEvent) {
    const prev = touches.current.get(e.pointerId);
    const sc = scroller.current;
    if (!prev || !sc) return;
    const dx = e.clientX - prev.x;
    const dy = e.clientY - prev.y;
    touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.current.size === 1) {
      if (penOnly && !compact) return; // a lone touch is the palm, or a finger resting: it moves nothing
      sc.scrollLeft -= dx;
      sc.scrollTop -= dy;
    } else if (touches.current.size === 2 && pinch.current) {
      // Each finger moves the midpoint by half its own movement.
      sc.scrollLeft -= dx / 2;
      sc.scrollTop -= dy / 2;
      const next = Math.min(4, Math.max(0.5, pinch.current.zoom * (spread() / pinch.current.dist)));
      if (Math.abs(next - zoom) >= 0.02) {
        const [a, b] = [...touches.current.values()];
        const box = sc.getBoundingClientRect();
        const mx = (a.x + b.x) / 2 - box.left;
        const my = (a.y + b.y) / 2 - box.top;
        anchor.current = { mx, my, fx: (sc.scrollLeft + mx) / sc.scrollWidth, fy: (sc.scrollTop + my) / sc.scrollHeight };
        setZoom(next);
      }
    }
  }
  function touchUp(e: React.PointerEvent) {
    touches.current.delete(e.pointerId);
    if (touches.current.size < 2) pinch.current = null;
  }

  function down(e: React.PointerEvent) {
    if (e.button !== 0) return;
    if (e.pointerType === "touch") return touchDown(e);
    if (e.pointerType === "pen" && (!compact || fitAnnotationPane)) {
      sawPen();
      if (fitAnnotationPane && activePointer.current !== null && touches.current.has(activePointer.current)) {
        activePointer.current = null; drawing.current = false; current.current = null; last.current = null;
        redraw();
      }
    }
    // The pen (or mouse) always wins over fingers already on the glass.
    touches.current.clear();
    pinch.current = null;
    penDown.current = true;
    beginStroke(e);
  }
  function beginStroke(e: React.PointerEvent) {
    if (activePointer.current !== null) return; // a stroke is already in progress
    activePointer.current = e.pointerId;
    drawing.current = true;
    const p = toCanvas(e);
    const w = (tool === "eraser" ? ERASER_WIDTH : tool === "highlighter" ? HL_WIDTH : width) * (compact ? logicalWidth / 680 : 1);
    const col = tool === "highlighter" ? hlColor : color;
    current.current = { tool, color: col, width: w, points: [p] };
    last.current = p;
    try {
      canvasRef.current!.setPointerCapture(e.pointerId);
    } catch { /* the pointer is already gone: draw without capture */ }
    // draw the initial dot live
    paintStroke(ctxOf(), current.current);
  }
  function move(e: React.PointerEvent) {
    if (e.pointerType === "touch" && e.pointerId !== activePointer.current) return touchMove(e);
    if (e.pointerId !== activePointer.current) return; // e.g. the palm moving
    if (!drawing.current || !current.current) return;
    const p = toCanvas(e);
    current.current.points.push(p);
    // draw just the new segment live
    const ctx = ctxOf();
    ctx.save();
    if (tool === "highlighter") ctx.globalAlpha = HL_ALPHA;
    ctx.strokeStyle = tool === "eraser" ? "#ffffff" : current.current.color;
    ctx.lineWidth = (widthAt(current.current, last.current!) + widthAt(current.current, p)) / 2;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.beginPath();
    ctx.moveTo(last.current!.x, last.current!.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    ctx.restore();
    last.current = p;
  }
  // Also handles pointercancel: iPadOS can cancel the pen when the palm lands,
  // and the stroke drawn so far should be kept, not left hanging.
  function up(e: React.PointerEvent) {
    if (e.pointerType === "touch") touchUp(e);
    else if (e.type !== "pointerleave" || e.pointerId === activePointer.current) {
      penDown.current = false;
      lastPenAt.current = Date.now();
    }
    if (e.pointerId !== activePointer.current) return; // e.g. the palm lifting
    activePointer.current = null;
    if (!drawing.current || !current.current) return;
    drawing.current = false;
    const done = current.current;
    current.current = null;
    last.current = null;
    if (!compact && logicalHeight > pages * pageHeight) {
      const bottom = done.points.reduce((y, pt) => Math.max(y, pt.y + widthAt(done, pt) / 2), 0);
      setPages(p => Math.max(p, Math.min(MAX_PAGES, Math.ceil(bottom / pageHeight))));
    }
    setStrokes((prev) => [...prev, done]);
    setRedoStack([]);
  }

  function undo() {
    if (!strokes.length) return;
    setRedoStack([...redoStack, strokes[strokes.length - 1]]);
    setStrokes(strokes.slice(0, -1));
  }
  function redo() {
    if (!redoStack.length) return;
    setStrokes([...strokes, redoStack[redoStack.length - 1]]);
    setRedoStack(redoStack.slice(0, -1));
  }
  function clearAll() {
    setStrokes([]);
    setRedoStack([]);
  }

  useImperativeHandle(ref, () => ({
    png: () => canvasRef.current!.toDataURL("image/png").split(",")[1],
    colors: () => [...new Set(strokes.filter(s => s.tool !== "eraser").map(s => s.color))],
  }));

  const toolBtn = (_active: boolean) => "px-3 min-h-11 min-w-11 rounded-md text-sm font-medium";
  const toolStyle = (active: boolean) => ({
    backgroundColor: active ? "var(--accent)" : "var(--bg-surface-hover)",
    color: active ? "#fff" : "var(--text-secondary)",
  });

  return (
    <div className={compact && !fitAnnotationPane ? "overflow-hidden rounded border" : "flex flex-col flex-1 min-h-0"} style={{ borderColor: "var(--border)" }}>
      {/* toolbar */}
      {compact && <div className="flex shrink-0 gap-1 px-1 border-b" style={{ borderColor: "var(--border)" }}>
        <button type="button" title={t("draw.pen")} aria-pressed={tool === "pen"} onClick={() => setTool("pen")} className={toolBtn(true)} style={toolStyle(tool === "pen")}><Icon name="pen" size={16}/></button>
        <button type="button" title={t("draw.eraser")} aria-pressed={tool === "eraser"} onClick={() => setTool("eraser")} className={toolBtn(true)} style={toolStyle(tool === "eraser")}>🧽</button>
        <button type="button" title={t("draw.undo")} aria-label={t("draw.undo")} disabled={!strokes.length} onClick={undo} className={toolBtn(false)}>↩︎</button>
        <button type="button" title={t("draw.redo")} aria-label={t("draw.redo")} disabled={!redoStack.length} onClick={redo} className={toolBtn(false)}>↪︎</button>
      </div>}
      {!compact && <details className="border-b shrink-0 overflow-y-auto max-h-[45dvh]" style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)" }}>
        <summary className="cursor-pointer px-3 py-2 min-h-11 content-center text-sm font-medium">{lang === "th" ? "เครื่องมือวาด" : "Drawing tools"}</summary>
        <div className="px-2 pb-2 space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <button className={toolBtn(tool === "pen")} style={toolStyle(tool === "pen")} onClick={() => setTool("pen")} title={t("draw.pen")}>
            <Icon name="pen" size={16} />
          </button>
          <button
            className={toolBtn(tool === "highlighter")} style={toolStyle(tool === "highlighter")}
            onClick={() => setTool("highlighter")}
            title={t("draw.highlighter")}
          >
            <Icon name="highlighter" size={16} />
          </button>
          <button
            className={toolBtn(tool === "eraser")} style={toolStyle(tool === "eraser")}
            onClick={() => setTool("eraser")}
            title={t("draw.eraser")}
          >
            🧽
          </button>

          <span className="w-px h-5 mx-0.5" style={{ backgroundColor: "var(--border)" }} />

          {(tool === "highlighter" ? HL_COLORS : [...new Set([accent, ...COLORS])]).map((c) => {
            const active = tool === "highlighter" ? hlColor === c : tool === "pen" && color === c;
            return (
              <button
                key={c}
                onClick={() => {
                  if (tool === "highlighter") setHlColor(c);
                  else {
                    setColor(c);
                    setTool("pen");
                  }
                }}
                title={t("draw.color")}
                className="tap-area w-8 h-8 rounded-full border-2"
                style={{ backgroundColor: c, borderColor: active ? "var(--text-primary)" : "var(--bg-surface)" }}
              />
            );
          })}

          <span className="w-px h-5 mx-0.5" style={{ backgroundColor: "var(--border)" }} />

          {WIDTHS.map((w) => (
            <button
              key={w.key}
              onClick={() => {
                setWidth(w.val);
                setTool("pen");
              }}
              title={t(`draw.${w.key}`)}
              className="w-11 h-11 rounded-md flex items-center justify-center"
              style={{ backgroundColor: width === w.val ? "var(--accent-light)" : "var(--bg-surface-hover)" }}
            >
              <span className="rounded-full" style={{ width: w.val / 2 + 2, height: w.val / 2 + 2, backgroundColor: "var(--text-secondary)" }} />
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button className={toolBtn(false)} style={toolStyle(false)} onClick={undo} disabled={strokes.length === 0} title={t("draw.undo")}>
            ↩︎
          </button>
          <button className={toolBtn(false)} style={toolStyle(false)} onClick={redo} disabled={redoStack.length === 0} title={t("draw.redo")}>
            ↪︎
          </button>
          <button className={toolBtn(false)} style={toolStyle(false)} onClick={clearAll} title={t("draw.clear")}>
            <Icon name="trash" size={16} />
          </button>

          <span className="w-px h-5 mx-0.5" style={{ backgroundColor: "var(--border)" }} />

          <button
            className={toolBtn(false)} style={toolStyle(false)}
            onClick={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.25) * 100) / 100))}
            title={t("draw.zoomOut")}
          >
            🔍−
          </button>
          <span className="text-xs w-10 text-center" style={{ color: "var(--text-tertiary)" }}>{Math.round(zoom * 100)}%</span>
          <button
            className={toolBtn(false)} style={toolStyle(false)}
            onClick={() => setZoom((z) => Math.min(4, Math.round((z + 0.25) * 100) / 100))}
            title={t("draw.zoomIn")}
          >
            🔍+
          </button>

          <button
            className={`${toolBtn(false)} ml-auto min-h-11`} style={toolStyle(false)}
            onClick={() => setPages((p) => Math.max(1, p - 1))}
            disabled={pages <= 1}
            title={t("draw.removePage")}
          >
            <Icon name="fileMinus" size={16} />
          </button>
          <button
            className={toolBtn(false)} style={toolStyle(false)}
            onClick={() => setPages((p) => Math.min(MAX_PAGES, p + 1))}
            disabled={pages >= MAX_PAGES}
            title={t("draw.addPage")}
          >
            <Icon name="filePlus" size={16} />
          </button>
        </div>
        <div className="flex items-center gap-2 text-xs" style={{ color: "var(--text-tertiary)" }}>
          <button
            className={`${toolBtn(penOnly)} inline-flex items-center gap-1.5`} style={toolStyle(penOnly)}
            onClick={() => savePenOnly(!penOnly)}
            aria-pressed={penOnly}
          >
            <Icon name="pen" size={16} />
            {t("draw.penOnly")}
          </button>
          {!penOnly && (
            <button
              className={`${toolBtn(fingerDraw)} inline-flex items-center gap-1.5`} style={toolStyle(fingerDraw)}
              onClick={toggleFingerDraw}
              aria-pressed={fingerDraw}
            >
              <Icon name="hand" size={16} />
              {t("draw.finger")}
            </button>
          )}
          <span className="flex-1 min-w-0">{t(penOnly ? "draw.penOnlyHint" : "draw.gestureHint")}</span>
          <span className="whitespace-nowrap">{t("draw.pages", { n: pages })}</span>
        </div>
        </div>
      </details>}

      {/* scrollable canvas area */}
      <div ref={scroller} className={compact && !fitAnnotationPane ? "overflow-auto overscroll-contain max-h-[45dvh]" : "flex-1 min-h-0 overflow-auto overscroll-contain bg-white"}>
        <canvas
          ref={canvasRef}
          aria-label={lang === "th" ? "พื้นที่เขียน" : "Writing pad"}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onLostPointerCapture={up}
          onPointerCancel={up}
          // A resting palm must not open the copy/selection menu or select text.
          onContextMenu={(e) => e.preventDefault()}
          className="bg-white touch-none block select-none"
          style={{
            WebkitTouchCallout: "none",
            WebkitUserSelect: "none",
            width: `${zoom * 100}%`,
            aspectRatio: `${logicalWidth} / ${logicalHeight}`,
            touchAction: "none",
          }}
        />
      </div>
    </div>
  );
});
