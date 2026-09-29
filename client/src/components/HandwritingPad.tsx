import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";

export type HandwritingHandle = {
  exportBlob: () => Promise<Blob | null>;
  clear: () => void;
  isEmpty: () => boolean;
};

/**
 * A canvas you can write on with a stylus/finger during class.
 * On submit the drawing is exported as a JPEG image and sent to the AI as a
 * note photo (so it reads your handwriting).
 */
export const HandwritingPad = forwardRef<HandwritingHandle>((_props, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const dirty = useRef(false);
  const last = useRef<{ x: number; y: number } | null>(null);

  function ctxOf() {
    return canvasRef.current!.getContext("2d")!;
  }

  function paintBackground() {
    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    const ctx = ctxOf();
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, rect.width, rect.height);
    ctx.strokeStyle = "#1f2937";
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
  }

  useEffect(() => {
    const c = canvasRef.current!;
    const rect = c.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    c.width = rect.width * dpr;
    c.height = rect.height * dpr;
    ctxOf().scale(dpr, dpr);
    paintBackground();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function pos(e: React.PointerEvent) {
    const r = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }
  function down(e: React.PointerEvent) {
    drawing.current = true;
    last.current = pos(e);
    canvasRef.current!.setPointerCapture(e.pointerId);
  }
  function move(e: React.PointerEvent) {
    if (!drawing.current) return;
    const ctx = ctxOf();
    const p = pos(e);
    ctx.beginPath();
    ctx.moveTo(last.current!.x, last.current!.y);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    last.current = p;
    dirty.current = true;
  }
  function up() {
    drawing.current = false;
    last.current = null;
  }

  useImperativeHandle(ref, () => ({
    exportBlob: () =>
      new Promise((resolve) => {
        if (!dirty.current) return resolve(null);
        canvasRef.current!.toBlob((b) => resolve(b), "image/jpeg", 0.9);
      }),
    clear: () => {
      paintBackground();
      dirty.current = false;
    },
    isEmpty: () => !dirty.current,
  }));

  return (
    <canvas
      ref={canvasRef}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerLeave={up}
      className="w-full h-64 border border-slate-200 rounded-lg bg-white"
      style={{ touchAction: "none" }}
    />
  );
});
