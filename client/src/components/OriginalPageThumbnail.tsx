import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useT } from "../i18n.tsx";
import "./sketchNotes.css";

/** The small preview and full-screen reader both load the student's saved original. */
export function OriginalPageThumbnail({ src, label }: { src: string; label?: string }) {
  const { lang } = useT();
  const th = lang === "th";
  const name = label ?? (th ? "เปิดลายมือต้นฉบับ" : "Open original handwriting");
  const [open, setOpen] = useState(false);
  return <>
    <button type="button" className="sketch-original" aria-haspopup="dialog" onClick={() => setOpen(true)}>
      <img src={src} alt="" loading="lazy"/>{name}
    </button>
    {open && <OriginalPageViewer src={src} label={name} onClose={() => setOpen(false)}/>}
  </>;
}

export function OriginalPageViewer({ src, label, onClose }: { src: string; label?: string; onClose: () => void }) {
  const { lang } = useT();
  const th = lang === "th";
  const [zoomed, setZoomed] = useState(false);
  const modal = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const dialog = modal.current!;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
    };
  }, []);
  return createPortal(
      <dialog ref={modal} className="sketch-viewer" aria-label={label ?? (th ? "หน้าต้นฉบับ" : "Original page")}
        onCancel={e => { e.preventDefault(); onClose(); }}>
        <div className="sketch-viewer-tools">
          <button type="button" className="sketch-button" aria-pressed={zoomed}
            onClick={() => setZoomed(!zoomed)}>{th ? "ขนาดจริง" : "Actual size"}</button>
          <button type="button" className="sketch-button" autoFocus onClick={onClose}>
            {th ? "ปิด" : "Close"}
          </button>
        </div>
        <div className="sketch-viewer-page" tabIndex={0}>
          <img src={src} alt={th ? "หน้าต้นฉบับ" : "Original page"} className={zoomed ? "actual-size" : undefined}/>
        </div>
      </dialog>, document.body);
}
