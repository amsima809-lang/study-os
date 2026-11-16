import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useT } from "../i18n.tsx";
import type { Point } from "../summaryAnchors.ts";

export type AnnotationInk = { png: string; drawing?: string; colors: string[] };

export function AnnotationPad({
  point,
  quote,
  previous,
  colors,
  accent,
  save,
  cancel,
}: {
  point: Point;
  quote: string;
  previous?: string;
  colors: string[];
  accent: string;
  save: (ink: AnnotationInk) => void;
  cancel: () => void;
}) {
  const { lang } = useT(),
    th = lang === "th";
  const modal = useRef<HTMLDialogElement>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const pointer = useRef<number | null>(null);
  const [ready, setReady] = useState(false),
    [failed, setFailed] = useState(false);
  const [hasInk, setHasInk] = useState(false);
  useLayoutEffect(() => {
    const dialog = modal.current!;
    dialog.showModal();
    const place = () => {
      const v = window.visualViewport;
      const x = v?.offsetLeft ?? 0,
        y = v?.offsetTop ?? 0;
      const width = v?.width ?? innerWidth,
        height = v?.height ?? innerHeight;
      dialog.style.maxWidth = `${Math.max(1, width - 16)}px`;
      dialog.style.maxHeight = `${Math.max(1, height - 16)}px`;
      const left = Math.min(point.x, x + width - dialog.offsetWidth - 8);
      const below = point.y + 12;
      const top = below + dialog.offsetHeight + 8 < y + height ? below : point.y - dialog.offsetHeight - 12;
      dialog.style.left = `${Math.max(x + 8, left)}px`;
      dialog.style.top = `${Math.max(y + 8, Math.min(y + height - dialog.offsetHeight - 8, top))}px`;
    };
    place();
    const resize = new ResizeObserver(place);
    resize.observe(dialog);
    window.addEventListener("resize", place);
    window.visualViewport?.addEventListener("resize", place);
    window.visualViewport?.addEventListener("scroll", place);
    return () => {
      resize.disconnect();
      window.removeEventListener("resize", place);
      window.visualViewport?.removeEventListener("resize", place);
      window.visualViewport?.removeEventListener("scroll", place);
      dialog.close();
    };
  }, [point]);
  useEffect(() => {
    let live = true;
    const c = canvas.current!,
      ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    if (previous) {
      const img = new Image();
      img.onload = () => {
        if (!live) return;
        ctx.drawImage(img, 0, 0, c.width, c.height);
        setHasInk(true);
        setReady(true);
      };
      img.onerror = () => {
        if (live) setFailed(true);
      };
      img.src = previous;
    } else setReady(true);
    return () => {
      live = false;
    };
  }, [previous]);
  const pointOnPad = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = e.currentTarget,
      b = c.getBoundingClientRect();
    return { x: ((e.clientX - b.x) * c.width) / b.width, y: ((e.clientY - b.y) * c.height) / b.height };
  };
  return createPortal(
    <dialog
      ref={modal}
      aria-label={th ? "เขียนโน้ต" : "Write a pen note"}
      onCancel={(e) => {
        e.preventDefault();
        cancel();
      }}
      className="fixed m-0 p-3 rounded-xl shadow-lg overflow-auto w-[22rem] space-y-2"
      style={{ background: "var(--bg-surface)", color: "var(--text-primary)", border: "1px solid var(--border)" }}
    >
      <blockquote className="text-sm line-clamp-2 border-l-2 pl-2" style={{ borderColor: accent }}>
        {quote}
      </blockquote>
      <canvas
        ref={canvas}
        width={680}
        height={260}
        className="w-full touch-none rounded border bg-white block"
        aria-label={th ? "พื้นที่เขียน" : "Writing pad"}
        onPointerDown={(e) => {
          if (!ready || pointer.current !== null || e.button !== 0 || e.pointerType === "touch") return;
          pointer.current = e.pointerId;
          e.currentTarget.setPointerCapture(e.pointerId);
          const ctx = e.currentTarget.getContext("2d")!,
            p = pointOnPad(e);
          ctx.strokeStyle = accent;
          ctx.fillStyle = accent;
          ctx.lineWidth = 4;
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.beginPath();
          ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          setHasInk(true);
        }}
        onPointerMove={(e) => {
          if (pointer.current !== e.pointerId) return;
          const p = pointOnPad(e),
            ctx = e.currentTarget.getContext("2d")!;
          ctx.lineTo(p.x, p.y);
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
        }}
        onLostPointerCapture={(e) => {
          if (pointer.current === e.pointerId) pointer.current = null;
        }}
      />
      {failed && <p role="alert">{th ? "เปิดลายมือเดิมไม่สำเร็จ" : "Couldn’t open the saved ink."}</p>}
      <div className="flex gap-2 justify-end">
        <button type="button" onClick={cancel} className="px-3 min-h-11">
          {th ? "ยกเลิก" : "Cancel"}
        </button>
        <button
          type="button"
          className="px-3 min-h-11 rounded-lg disabled:opacity-50"
          style={{ background: "var(--accent)", color: "#fff" }}
          disabled={!ready || !hasInk}
          onClick={() =>
            save({
              png: canvas.current!.toDataURL("image/png").split(",")[1],
              colors: [...new Set([...colors, accent])],
            })
          }
        >
          {th ? "บันทึก" : "Save"}
        </button>
      </div>
    </dialog>,
    document.body,
  );
}
