import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from "react";
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
type Point = { x: number; y: number };
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
      ctx.arc(pts[0].x, pts[0].y, s.width / 2, 0, Math.PI * 2);
      ctx.fill();
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
    return {
      x: ((e.clientX - r.left) / r.width) * c.width,
      y: ((e.clientY - r.top) / r.height) * c.height,
    };
  }

  // Palm rejection. A resting palm arrives as separate "touch" pointers while
  // the pen is a "pen" pointer. Touch never starts a stroke, and once a stroke
  // has started only the pointer that started it may extend or end it —
  // otherwise the palm's own move/lift events drag the line to the palm or cut
  // the stroke short.
  const activePointer = useRef<number | null>(null);

  function down(e: React.PointerEvent) {
    if (e.pointerType === "touch") return;
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
    if (e.pointerId !== activePointer.current) return; // e.g. the palm moving
    if (!drawing.current || !current.current) return;
    const p = toCanvas(e);
    current.current.points.push(p);
    // draw just the new segment live
    const ctx = ctxOf();
    ctx.save();
    if (tool === "highlighter") ctx.globalAlpha = HL_ALPHA;
    ctx.strokeStyle = tool === "eraser" ? "#ffffff" : current.current.color;
    ctx.lineWidth = current.current.width;
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
    `px-2.5 py-1 rounded-md text-sm font-medium ${
      active ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-600"
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
                className={`w-6 h-6 rounded-full border-2 ${active ? "border-slate-800" : "border-white"}`}
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
              className={`w-8 h-7 rounded-md flex items-center justify-center ${
                width === w.val ? "bg-indigo-100" : "bg-slate-100"
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
            className={`${toolBtn(false)} ml-auto`}
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
        <div className="text-xs text-slate-400 text-right">{t("draw.pages", { n: pages })}</div>
      </div>

      {/* scrollable canvas area */}
      <div className={`overflow-auto bg-slate-100 ${expanded ? "h-[70vh]" : "h-72"}`}>
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
