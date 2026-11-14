import { forwardRef, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from "react";
import { useT } from "../i18n.tsx";
import Icon from "./Icon.tsx";

export type HandwritingHandle = {
  exportBlob: () => Promise<Blob | null>;
  clear: () => void;
  isEmpty: () => boolean;
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

type Props = {
  /** Strokes and page count to start from (a restored draft). Read once, on mount. */
  initial?: { strokes: Stroke[]; pages: number } | null;
  /** Called after every finished stroke, undo, redo, clear or page change. */
  onChange?: (drawing: { strokes: Stroke[]; pages: number }) => void;
};

/**
 * A full drawing pad: pen + eraser, colors, stroke widths, undo/redo, clear,
 * zoom in/out, and an expand toggle. Strokes are stored as vectors (light +
 * redo-friendly) and exported as a JPEG for the AI to read.
 */
export const HandwritingPad = forwardRef<HandwritingHandle, Props>(({ initial, onChange }, ref) => {
  const { t } = useT();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [strokes, setStrokes] = useState<Stroke[]>(() => initial?.strokes ?? []);
  const [redoStack, setRedoStack] = useState<Stroke[]>([]);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState(COLORS[0]);
  const [hlColor, setHlColor] = useState(HL_COLORS[0]);
  const [width, setWidth] = useState(WIDTHS[1].val);
  const [zoom, setZoom] = useState(1);
  const [expanded, setExpanded] = useState(false);
  const [pages, setPages] = useState(() => Math.min(MAX_PAGES, Math.max(1, initial?.pages ?? 1)));

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

  function redraw() {
    const c = canvasRef.current!;
    const ctx = ctxOf();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, c.width, c.height);
    // dashed dividers between pages
    ctx.strokeStyle = "#e2e8f0";
    ctx.lineWidth = 2;
    ctx.setLineDash([12, 10]);
    for (let i = 1; i < pages; i++) {
      const y = i * CANVAS_H;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(CANVAS_W, y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    for (const s of strokes) paintStroke(ctx, s);
  }

  // init + redraw whenever strokes or the page count change
  useEffect(() => {
    const c = canvasRef.current!;
    const h = CANVAS_H * pages;
    if (c.width !== CANVAS_W || c.height !== h) {
      c.width = CANVAS_W;
      c.height = h; // resizing clears the canvas; redraw() repaints below
    }
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strokes, pages]);

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
  const scroller = useRef<HTMLDivElement>(null);
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
    if (palm || penDown.current || Date.now() - lastPenAt.current < 400) return;
    touches.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
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
    } else if (touches.current.size === 1 && fingerDraw) {
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
    if (e.pointerType === "touch") return touchDown(e);
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
    const w = tool === "eraser" ? ERASER_WIDTH : tool === "highlighter" ? HL_WIDTH : width;
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
    setStrokes((prev) => [...prev, done]);
    setRedoStack([]);
  }

  function undo() {
    setStrokes((prev) => {
      if (prev.length === 0) return prev;
      setRedoStack((r) => [...r, prev[prev.length - 1]]);
      return prev.slice(0, -1);
    });
  }
  function redo() {
    setRedoStack((prev) => {
      if (prev.length === 0) return prev;
      setStrokes((s) => [...s, prev[prev.length - 1]]);
      return prev.slice(0, -1);
    });
  }
  function clearAll() {
    setStrokes([]);
    setRedoStack([]);
  }

  useImperativeHandle(ref, () => ({
    exportBlob: () =>
      new Promise((resolve) => {
        if (strokes.length === 0) return resolve(null);
        canvasRef.current!.toBlob((b) => resolve(b), "image/jpeg", 0.9);
      }),
    clear: clearAll,
    isEmpty: () => strokes.length === 0,
  }));

  const toolBtn = (active: boolean) =>
    `px-3 min-h-11 min-w-11 rounded-md text-sm font-medium ${
      active ? "bg-green-700 text-white" : "bg-slate-100 text-slate-600"
    }`;

  return (
    <div className="border border-slate-200 rounded-lg overflow-hidden">
      {/* toolbar */}
      <div className="bg-slate-50 border-b border-slate-200 p-2 space-y-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <button className={toolBtn(tool === "pen")} onClick={() => setTool("pen")} title={t("draw.pen")}>
            <Icon name="pen" size={16} />
          </button>
          <button
            className={toolBtn(tool === "highlighter")}
            onClick={() => setTool("highlighter")}
            title={t("draw.highlighter")}
          >
            <Icon name="highlighter" size={16} />
          </button>
          <button
            className={toolBtn(tool === "eraser")}
            onClick={() => setTool("eraser")}
            title={t("draw.eraser")}
          >
            🧽
          </button>

          <span className="w-px h-5 bg-slate-200 mx-0.5" />

          {(tool === "highlighter" ? HL_COLORS : COLORS).map((c) => {
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
                className={`tap-area w-8 h-8 rounded-full border-2 ${active ? "border-slate-800" : "border-white"}`}
                style={{ backgroundColor: c }}
              />
            );
          })}

          <span className="w-px h-5 bg-slate-200 mx-0.5" />

          {WIDTHS.map((w) => (
            <button
              key={w.key}
              onClick={() => {
                setWidth(w.val);
                setTool("pen");
              }}
              title={t(`draw.${w.key}`)}
              className={`w-11 h-11 rounded-md flex items-center justify-center ${
                width === w.val ? "bg-green-100" : "bg-slate-100"
              }`}
            >
              <span className="rounded-full bg-slate-700" style={{ width: w.val / 2 + 2, height: w.val / 2 + 2 }} />
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <button className={toolBtn(false)} onClick={undo} disabled={strokes.length === 0} title={t("draw.undo")}>
            ↩︎
          </button>
          <button className={toolBtn(false)} onClick={redo} disabled={redoStack.length === 0} title={t("draw.redo")}>
            ↪︎
          </button>
          <button className={toolBtn(false)} onClick={clearAll} title={t("draw.clear")}>
            <Icon name="trash" size={16} />
          </button>

          <span className="w-px h-5 bg-slate-200 mx-0.5" />

          <button
            className={toolBtn(false)}
            onClick={() => setZoom((z) => Math.max(0.5, Math.round((z - 0.25) * 100) / 100))}
            title={t("draw.zoomOut")}
          >
            🔍−
          </button>
          <span className="text-xs text-slate-500 w-10 text-center">{Math.round(zoom * 100)}%</span>
          <button
            className={toolBtn(false)}
            onClick={() => setZoom((z) => Math.min(4, Math.round((z + 0.25) * 100) / 100))}
            title={t("draw.zoomIn")}
          >
            🔍+
          </button>

          <button
            className={`${toolBtn(false)} ml-auto min-h-11`}
            onClick={() => setPages((p) => Math.max(1, p - 1))}
            disabled={pages <= 1}
            title={t("draw.removePage")}
          >
            <Icon name="fileMinus" size={16} />
          </button>
          <button
            className={toolBtn(false)}
            onClick={() => setPages((p) => Math.min(MAX_PAGES, p + 1))}
            disabled={pages >= MAX_PAGES}
            title={t("draw.addPage")}
          >
            <Icon name="filePlus" size={16} />
          </button>
          <button
            className={toolBtn(expanded)}
            onClick={() => setExpanded((v) => !v)}
            title={t(expanded ? "draw.collapse" : "draw.expand")}
          >
            ⤢
          </button>
        </div>
        <div className="flex items-center gap-2 text-xs text-slate-500">
          <button
            className={`${toolBtn(fingerDraw)} inline-flex items-center gap-1.5`}
            onClick={toggleFingerDraw}
            aria-pressed={fingerDraw}
          >
            <Icon name="hand" size={16} />
            {t("draw.finger")}
          </button>
          <span className="flex-1 min-w-0">{t("draw.gestureHint")}</span>
          <span className="text-slate-400 whitespace-nowrap">{t("draw.pages", { n: pages })}</span>
        </div>
      </div>

      {/* scrollable canvas area */}
      <div ref={scroller} className={`overflow-auto bg-slate-100 ${expanded ? "h-[70vh]" : "h-72"}`}>
        <canvas
          ref={canvasRef}
          onPointerDown={down}
          onPointerMove={move}
          onPointerUp={up}
          onPointerLeave={up}
          onPointerCancel={up}
          // A resting palm must not open the copy/selection menu or select text.
          onContextMenu={(e) => e.preventDefault()}
          className="bg-white touch-none block select-none"
          style={{
            WebkitTouchCallout: "none",
            WebkitUserSelect: "none",
            width: `${zoom * 100}%`,
            aspectRatio: `${CANVAS_W} / ${CANVAS_H * pages}`,
            touchAction: "none",
          }}
        />
      </div>
    </div>
  );
});
