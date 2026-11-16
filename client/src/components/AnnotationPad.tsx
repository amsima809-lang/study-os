import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { getJSON } from "../api.ts";
import { useT } from "../i18n.tsx";
import { closePencilKitSheet, drawInPencilKitSheet, hasNativeInkSheet } from "../nativeInk.ts";
import type { Drawing } from "../noteDraft.ts";
import type { Point } from "../summaryAnchors.ts";
import { HandwritingPad, type HandwritingHandle } from "./HandwritingPad.tsx";
import { useLectureSplitPane } from "./useLectureSplitPane.ts";

export type AnnotationInk = { png: string; drawing?: string; colors: string[] };

/** Anchor transcript popovers and annotation menus to the passage. Standalone notes fill the viewport. */
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

function InkActions({ cancel, save, disabled, saving, title, done }: {
  cancel: () => void;
  save: () => void;
  disabled?: boolean;
  saving?: boolean;
  title?: string;
  done: string;
}) {
  const { t } = useT();
  return <div className={title ? "flex items-center gap-2 px-3 py-1 border-b shrink-0" : "flex gap-2 justify-end"}
    style={{ borderColor: "var(--border)" }}>
    <button type="button" onClick={cancel} disabled={saving} className="px-3 min-h-11">{t("ink.cancel")}</button>
    {title && <h2 className="flex-1 truncate text-center font-semibold">{title}</h2>}
    <button type="button" onClick={save} disabled={saving || disabled} className="px-3 min-h-11 rounded-lg disabled:opacity-50"
      style={{ background: "var(--accent)", color: "#fff" }}>{done}</button>
  </div>;
}

function PencilKitAnnotation({ drawingURL, quote, accent, allowFinger, save, cancel, fallback, saving, saveError }: {
  drawingURL?: string;
  quote: string;
  accent: string;
  allowFinger: boolean;
  save: (ink: AnnotationInk) => void;
  cancel: () => void;
  fallback: () => void;
  saving: boolean;
  saveError?: string;
}) {
  const { t, lang } = useT();
  const doneLabel = lang === "th" ? "บันทึก" : "Save", cancelLabel = t("ink.cancel");
  const [attempt, setAttempt] = useState(0);
  const [openingFailed, setOpeningFailed] = useState(false);
  const [draft, setDraft] = useState<AnnotationInk>();
  const callbacks = useRef({ save, cancel, fallback, draft });
  callbacks.current = { save, cancel, fallback, draft };

  useEffect(() => {
    let active = true, presented = false;
    const sessionID = crypto.randomUUID();
    const close = () => { if (presented) closePencilKitSheet(sessionID); };
    window.addEventListener("pagehide", close);
    async function open() {
      await Promise.resolve(); // A StrictMode setup/cleanup should never present a second native view.
      if (!active) return;
      let drawing = callbacks.current.draft?.drawing;
      if (!drawing && drawingURL) {
        const saved = await getJSON<{ drawing: string | null }>(drawingURL);
        if (!active) return;
        if (!saved.drawing) { callbacks.current.fallback(); return; }
        drawing = saved.drawing;
      }
      presented = true;
      const ink = await drawInPencilKitSheet(sessionID, drawing, { title: quote, done: doneLabel, cancel: cancelLabel, accent }, allowFinger);
      presented = false;
      if (!active) return;
      if (!ink || ink.drawing === drawing) {
        if (!callbacks.current.draft) callbacks.current.cancel();
        return;
      }
      const next = { drawing: ink.drawing, png: ink.png, colors: ink.colors.length ? ink.colors : [accent] };
      setDraft(next);
      callbacks.current.save(next);
    }
    void open().catch((e: unknown) => {
      if (!active) return;
      if (!callbacks.current.draft && e && typeof e === "object" && "code" in e && e.code === "UNIMPLEMENTED") {
        callbacks.current.fallback();
      } else {
        setOpeningFailed(true);
      }
    });
    return () => { active = false; window.removeEventListener("pagehide", close); close(); };
  }, [attempt, drawingURL, quote, doneLabel, cancelLabel, accent, allowFinger]);

  const reopen = () => { setOpeningFailed(false); setAttempt(n => n + 1); };
  return <>
    <InkActions title={quote} cancel={cancel} saving={saving} disabled={!openingFailed && !draft}
      done={openingFailed ? t("status.retry") : saving ? t("ink.saving") : doneLabel}
      save={openingFailed ? reopen : () => { if (draft) save(draft); }}/>
    {draft && <button type="button" onClick={reopen} disabled={saving} className="min-h-0 flex-1 py-2" aria-label={t("ink.edit")}>
      <img src={`data:image/png;base64,${draft.png}`} alt="" className="w-full h-full object-contain"/>
    </button>}
    {(openingFailed || saveError) && <p role="alert" className="text-sm px-3">{openingFailed ? t("ink.failed") : saveError}</p>}
  </>;
}

export function AnnotationPad({ point, quote, previous, nativeDrawingUrl, colors, accent, save, cancel, reader, passage, getMarkRect, allowFinger = false, saving = false, saveError }: {
  reader?: HTMLElement | null;
  passage?: HTMLElement | null;
  getMarkRect?: () => DOMRectReadOnly | null | undefined;
  allowFinger?: boolean;
  saving?: boolean;
  saveError?: string;
  point: Point;
  quote: string;
  previous?: string;
  nativeDrawingUrl?: string;
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
  const [webOnly, setWebOnly] = useState(false);
  const nativeSheet = !!reader && !webOnly && (!previous || !!nativeDrawingUrl) && hasNativeInkSheet();
  useEffect(() => {
    if (!previous || nativeSheet) return;
    let live = true;
    const image = new Image();
    image.onload = () => { if (live) setBackground(image); };
    image.onerror = () => { if (live) setFailed(true); };
    image.src = previous;
    return () => { live = false; };
  }, [previous, nativeSheet]);
  const label = th ? "เขียนโน้ต" : "Write a pen note";
  const panel = useRef<HTMLElement>(null);
  useLectureSplitPane(reader, panel, root => getMarkRect?.()
    ?? root.querySelector("[data-active-mark]")?.getBoundingClientRect()
    ?? passage?.getBoundingClientRect(), "center",
    () => passage?.closest<HTMLElement>("[data-lecture-target]") ?? null,
  );
  const actions = <InkActions cancel={cancel} disabled={!hasStroke && !background} saving={saving}
    title={reader ? quote : undefined}
    done={saving ? th ? "กำลังบันทึก…" : "Saving…" : th ? "บันทึก" : "Save"}
    save={() => {
      if (!hasStroke && background) { cancel(); return; }
      if (pad.current) save({ png: pad.current.png(), colors: [...new Set([...colors, ...pad.current.colors()])] });
    }}/>;
  const writing = (!previous || background) && <HandwritingPad ref={pad} compact fitAnnotationPane={!!reader}
    allowFinger={allowFinger} accent={accent} background={background ?? undefined}
    onChange={d => setHasStroke(d.strokes.length > 0)}/>;
  const error = failed ? th ? "เปิดลายมือเดิมไม่สำเร็จ" : "Couldn’t open the saved ink." : saveError;
  if (reader) return createPortal(<section ref={panel} role="dialog" aria-label={label} aria-modal={false}
    aria-busy={saving} tabIndex={-1} className="lecture-note-tray annotation-sheet" onKeyDown={e => {
      if (e.key === "Escape") { e.stopPropagation(); if (!saving) cancel(); }
    }}>
    {nativeSheet ? <PencilKitAnnotation drawingURL={nativeDrawingUrl} quote={quote} accent={accent} save={save} allowFinger={allowFinger}
      cancel={cancel} fallback={() => setWebOnly(true)} saving={saving} saveError={saveError}/> : <>
      {actions}
      <div className="annotation-sheet-paper" inert={saving}>{writing}</div>
      {error && <p role="alert" className="text-sm px-3">{error}</p>}
    </>}
  </section>, document.body);
  return <InkDialog point={point} label={label} cancel={cancel}>
    <blockquote className="text-sm line-clamp-2 border-l-2 pl-2" style={{ borderColor: accent }}>{quote}</blockquote>
    {writing}
    {error && <p role="alert">{error}</p>}
    {actions}
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
