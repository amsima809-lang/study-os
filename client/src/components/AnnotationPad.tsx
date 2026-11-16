import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useT } from "../i18n.tsx";
import type { Drawing } from "../noteDraft.ts";
import type { Point } from "../summaryAnchors.ts";
import { HandwritingPad, type HandwritingHandle } from "./HandwritingPad.tsx";

export type AnnotationInk = { png: string; drawing?: string; colors: string[] };

/** The annotation editor is placed at the selected passage. A standalone note fills the viewport. */
export function InkDialog({ point, anchor, label, cancel, children }: {
  point?: Point;
  anchor?: HTMLElement;
  label: string;
  cancel: () => void;
  children: ReactNode;
}) {
  const modal = useRef<HTMLDialogElement>(null);
  const placeDialog = useRef<() => void>(null);
  useLayoutEffect(() => {
    const dialog = modal.current!;
    dialog.showModal();
    const place = () => {
      const viewport = window.visualViewport;
      const x = viewport?.offsetLeft ?? 0, y = viewport?.offsetTop ?? 0;
      const width = viewport?.width ?? innerWidth, height = viewport?.height ?? innerHeight;
      if (!point && !anchor) {
        Object.assign(dialog.style, { left: `${x}px`, top: `${y}px`, width: `${width}px`, height: `${height}px` });
        return;
      }
      dialog.style.maxWidth = `${Math.max(1, width - 16)}px`;
      dialog.style.maxHeight = `${Math.max(1, height - 16)}px`;
      const rect = anchor?.isConnected ? anchor.getBoundingClientRect() : undefined;
      const target = rect ? { x: rect.left, y: rect.bottom } : point!;
      const left = Math.min(target.x, x + width - dialog.offsetWidth - 8);
      const below = target.y + 8;
      const top = below + dialog.offsetHeight + 8 < y + height ? below : (rect?.top ?? target.y) - dialog.offsetHeight - 8;
      dialog.style.left = `${Math.max(x + 8, left)}px`;
      dialog.style.top = `${Math.max(y + 8, Math.min(y + height - dialog.offsetHeight - 8, top))}px`;
    };
    placeDialog.current = place;
    place();
    const resize = new ResizeObserver(place);
    resize.observe(dialog);
    window.addEventListener("resize", place);
    window.visualViewport?.addEventListener("resize", place);
    window.visualViewport?.addEventListener("scroll", place);
    return () => {
      placeDialog.current = null;
      resize.disconnect();
      window.removeEventListener("resize", place);
      window.visualViewport?.removeEventListener("resize", place);
      window.visualViewport?.removeEventListener("scroll", place);
      dialog.close();
    };
  }, [point, anchor]);
  useLayoutEffect(() => { placeDialog.current?.(); });
  return createPortal(<dialog ref={modal} aria-label={label}
    onCancel={e => { e.preventDefault(); cancel(); }}
    onClick={e => {
      if (!anchor || e.target !== e.currentTarget) return;
      const box = e.currentTarget.getBoundingClientRect();
      if (e.clientX < box.left || e.clientX > box.right || e.clientY < box.top || e.clientY > box.bottom) cancel();
    }}
    className={point || anchor
      ? "fixed m-0 p-3 rounded-xl border shadow-lg overflow-auto w-[22rem] space-y-2"
      : "fixed m-0 max-w-none max-h-none flex flex-col overflow-hidden overscroll-none"}
    style={{ background: "var(--bg-surface)", color: "var(--text-primary)", borderColor: "var(--border)",
      ...(!point && !anchor && { padding: "env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left)" }) }}>
    {children}
  </dialog>, document.body);
}

function InkActions({ cancel, save, disabled, title, done }: {
  cancel: () => void;
  save: () => void;
  disabled?: boolean;
  title?: string;
  done: string;
}) {
  const { t } = useT();
  return <div className={title ? "flex items-center gap-2 px-3 py-1 border-b shrink-0" : "flex gap-2 justify-end"}
    style={{ borderColor: "var(--border)" }}>
    <button type="button" onClick={cancel} className="px-3 min-h-11">{t("ink.cancel")}</button>
    {title && <h2 className="flex-1 truncate text-center font-semibold">{title}</h2>}
    <button type="button" onClick={save} disabled={disabled} className="px-3 min-h-11 rounded-lg disabled:opacity-50"
      style={{ background: "var(--accent)", color: "#fff" }}>{done}</button>
  </div>;
}

export function AnnotationPad({ point, quote, previous, colors, accent, save, cancel }: {
  point: Point;
  quote: string;
  previous?: string;
  colors: string[];
  accent: string;
  save: (ink: AnnotationInk) => void;
  cancel: () => void;
}) {
  const { lang } = useT(), th = lang === "th";
  const pad = useRef<HandwritingHandle>(null);
  const [background, setBackground] = useState<HTMLImageElement | null>(null);
  const [failed, setFailed] = useState(false);
  const [hasStroke, setHasStroke] = useState(false);
  useEffect(() => {
    if (!previous) return;
    let live = true;
    const image = new Image();
    image.onload = () => { if (live) setBackground(image); };
    image.onerror = () => { if (live) setFailed(true); };
    image.src = previous;
    return () => { live = false; };
  }, [previous]);
  return <InkDialog point={point} label={th ? "เขียนโน้ต" : "Write a pen note"} cancel={cancel}>
    <blockquote className="text-sm line-clamp-2 border-l-2 pl-2" style={{ borderColor: accent }}>{quote}</blockquote>
    {(!previous || background) && <HandwritingPad ref={pad} compact accent={accent} background={background ?? undefined}
      onChange={d => setHasStroke(d.strokes.length > 0)}/>}
    {failed && <p role="alert">{th ? "เปิดลายมือเดิมไม่สำเร็จ" : "Couldn’t open the saved ink."}</p>}
    <InkActions cancel={cancel} disabled={!hasStroke && !background} done={th ? "บันทึก" : "Save"}
      save={() => {
        if (!hasStroke && background) { cancel(); return; }
        if (pad.current) save({ png: pad.current.png(), colors: [...new Set([...colors, ...pad.current.colors()])] });
      }}/>
  </InkDialog>;
}

export function FullScreenNotePad({ initial, accent, title, onChange, onPen, onDone, onCancel }: {
  initial: Drawing | null;
  accent: string;
  title: string;
  onChange: (drawing: Drawing) => void;
  onPen?: () => void;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { t } = useT();
  return <InkDialog label={title} cancel={onCancel}>
    <InkActions cancel={onCancel} title={title} done={t("ink.done")} save={onDone}/>
    <HandwritingPad initial={initial} accent={accent} onChange={onChange} onPen={onPen}/>
  </InkDialog>;
}
