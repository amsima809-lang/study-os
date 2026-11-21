import { useEffect, useImperativeHandle, useRef, useState, type Ref } from "react";
import { useT } from "../i18n.tsx";
import { nativeInkField, penAccent, type InkFieldFrame } from "../nativeInk.ts";
import type { Drawing, NativeInk } from "../noteDraft.ts";
import { HandwritingPad, handwritingBackground } from "./HandwritingPad.tsx";

export type LectureInkHandle = { read: () => Promise<Drawing | null> };

/** Both rectangles use web viewport coordinates. The clipping rectangle can shrink independently of the paper. */
function fieldFrame(field: HTMLElement): InkFieldFrame {
  const viewport = window.visualViewport;
  const left = viewport?.offsetLeft ?? 0, top = viewport?.offsetTop ?? 0;
  const width = viewport?.width ?? innerWidth, height = viewport?.height ?? innerHeight;
  const rect = field.getBoundingClientRect();
  let x = Math.max(rect.left, left), y = Math.max(rect.top, top);
  let right = Math.min(rect.right, left + width), bottom = Math.min(rect.bottom, top + height);
  for (let parent = field.parentElement; parent; parent = parent.parentElement) {
    const style = getComputedStyle(parent), bounds = parent.getBoundingClientRect();
    if (/(auto|scroll|hidden|clip)/.test(style.overflowX)) {
      x = Math.max(x, bounds.left); right = Math.min(right, bounds.right);
    }
    if (/(auto|scroll|hidden|clip)/.test(style.overflowY)) {
      y = Math.max(y, bounds.top); bottom = Math.min(bottom, bounds.bottom);
    }
  }
  const covered = Array.from(document.querySelectorAll('dialog[open],[aria-modal="true"]')).some(modal => !modal.contains(field));
  return {
    viewportWidth: width,
    paper: [rect.left - left, rect.top - top, rect.width, rect.height],
    clip: covered || document.hidden ? [0, 0, 0, 0] : [x - left, y - top, Math.max(0, right - x), Math.max(0, bottom - y)],
  };
}

function fromNative(ink: NativeInk | { empty: true }): Drawing | null {
  if ("empty" in ink) return null;
  if (!ink.png || !ink.drawing) throw new Error("Could not read handwriting");
  return { strokes: [], pages: 1, ink };
}

/** The actual writing surface occupies the note input's space, including after a tray resize. */
export function LectureInkField({ ref, visible, drawing, onChange, onClosingInk, onPen }: {
  ref: Ref<LectureInkHandle>;
  visible: boolean;
  drawing: Drawing | null;
  onChange: (drawing: Drawing | null) => void;
  onClosingInk: (drawing: Drawing | null) => void;
  onPen: () => void;
}) {
  const { t, lang } = useT();
  const field = useRef<HTMLDivElement>(null);
  const start = useRef(drawing);
  const [plugin, setPlugin] = useState(() => drawing?.strokes.length ? undefined : nativeInkField());
  const [accent] = useState(penAccent);
  const [background, setBackground] = useState<HTMLImageElement>();
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const session = useRef<{ id: string; opened: Promise<void> } | null>(null);
  const latest = useRef({ drawing, onChange, onClosingInk, onPen });
  latest.current = { drawing, onChange, onClosingInk, onPen };
  useImperativeHandle(ref, () => ({
    async read() {
      const active = session.current;
      if (!plugin || !active) return latest.current.drawing;
      await active.opened;
      return fromNative(await plugin.readField({ sessionID: active.id }));
    },
  }), [plugin]);

  // Older app builds can display and annotate the original saved PencilKit image in the web pad.
  const priorInk = start.current?.ink;
  useEffect(() => {
    if (plugin || !priorInk) return;
    let alive = true;
    setFailed(false);
    handwritingBackground(priorInk.png).then(img => { if (alive) setBackground(img); })
      .catch(() => { if (alive) setFailed(true); });
    return () => { alive = false; };
  }, [plugin, priorInk, attempt]);

  useEffect(() => {
    if (!plugin || !field.current) return;
    const el = field.current, id = crypto.randomUUID();
    let alive = true, mounted = false, frame = 0, lastFrame = "";
    const listener = plugin.addListener("fieldChange", event => {
      if (!alive || event.sessionID !== id) return;
      const next = fromNative(event.ink);
      latest.current.drawing = next;
      latest.current.onChange(next);
      if (next) latest.current.onPen();
    });
    const layout = () => {
      if (!mounted || frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (!alive) return;
        const rect = fieldFrame(el), key = JSON.stringify(rect);
        if (lastFrame !== key) {
          lastFrame = key;
          void plugin.layoutField({ sessionID: id, ...rect }).catch(() => { lastFrame = ""; });
        }
      });
    };
    const opened = Promise.resolve().then(async () => {
      if (!alive) return;
      let pencilOnly = false;
      try { pencilOnly = localStorage.getItem("studyos.penOnly") === "1"; } catch { /* optional preference */ }
      await plugin.openField({ sessionID: id, ...fieldFrame(el), drawing: latest.current.drawing?.ink?.drawing, pencilOnly, accent });
      mounted = true;
      if (alive) layout();
    });
    session.current = { id, opened };
    void opened.catch(() => { if (alive) setPlugin(undefined); });

    const resize = new ResizeObserver(layout);
    for (let parent: HTMLElement | null = el; parent; parent = parent.parentElement) resize.observe(parent);
    const dialogs = new MutationObserver(layout);
    dialogs.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["open", "aria-modal", "class", "style"] });
    window.addEventListener("scroll", layout, true);
    window.addEventListener("resize", layout);
    window.visualViewport?.addEventListener("scroll", layout);
    window.visualViewport?.addEventListener("resize", layout);
    document.addEventListener("visibilitychange", layout);
    const close = () => {
      if (mounted) {
        mounted = false;
        void plugin.readField({ sessionID: id }).then(ink => {
          const next = fromNative(ink);
          if (alive) latest.current.onChange(next);
          latest.current.onClosingInk(next);
        }).catch(() => {});
      }
      void plugin.closeField({ sessionID: id }).catch(() => {});
    };
    const resume = (event: PageTransitionEvent) => { if (event.persisted) setAttempt(n => n + 1); };
    window.addEventListener("pagehide", close);
    window.addEventListener("pageshow", resume);
    return () => {
      alive = false; session.current = null;
      cancelAnimationFrame(frame); resize.disconnect(); dialogs.disconnect();
      window.removeEventListener("scroll", layout, true);
      window.removeEventListener("resize", layout);
      window.visualViewport?.removeEventListener("scroll", layout);
      window.visualViewport?.removeEventListener("resize", layout);
      document.removeEventListener("visibilitychange", layout);
      window.removeEventListener("pagehide", close);
      window.removeEventListener("pageshow", resume);
      void listener.remove();
      close();
    };
  }, [plugin, accent, attempt]);

  return <div ref={field} className="lecture-writing-field flex flex-col overflow-hidden rounded-lg border bg-white"
    style={{ borderColor: "var(--border)", display: visible ? undefined : "none" }}>
    {plugin ? <span className="sr-only">{lang === "th" ? "พื้นที่เขียน" : "Writing pad"}</span> :
      failed ? <button type="button" className="m-auto min-h-11" onClick={() => setAttempt(n => n + 1)}>{t("ink.failed")} {t("status.retry")}</button> :
      (!priorInk || background) && <HandwritingPad initial={start.current} accent={accent} background={background} onPen={onPen}
        onChange={next => {
          const page = priorInk ? { ...next, ink: priorInk } : next;
          latest.current.drawing = page;
          onChange(page);
        }}/>}
  </div>;
}
