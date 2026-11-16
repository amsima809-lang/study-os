import { useEffect, useRef, useState } from "react";
import { useT } from "../i18n.tsx";
import { withBase } from "../base.ts";
import Icon from "./Icon.tsx";
import { OriginalPageThumbnail } from "./OriginalPageThumbnail.tsx";
import { SketchNotePage } from "./SketchNotes.tsx";

type GalleryPage = {
  key: string; noteId: number; index: number; src: string; title: string | null; handwritten: boolean;
};

export function LectureNoteGallery({ photos, onSourcesChanged }: {
  photos: GalleryPage[];
  onSourcesChanged: () => void;
}) {
  const { t, lang } = useT();
  const touch = useRef<{ x: number; y: number } | null>(null);
  const [selected, onSelect] = useState("");
  const latestNote = useRef(photos.at(-1)?.noteId);
  useEffect(() => {
    const latest = photos.at(-1)?.noteId;
    if (latest && latestNote.current && latest > latestNote.current) {
      const page = photos.find(p => p.noteId === latest);
      if (page) onSelect(page.key);
    }
    latestNote.current = latest;
  }, [photos]);
  const index = Math.max(0, photos.findIndex(p => p.key === selected));
  const current = photos[index];
  if (!current) return null;
  const go = (step: number) => onSelect(photos[(index + step + photos.length) % photos.length].key);
  const openLabel = current.handwritten ? undefined : lang === "th" ? "ดูรูปต้นฉบับ" : "Open original image";
  return <section id="lecture-note-gallery" tabIndex={-1} className="lecture-note-gallery space-y-3" aria-labelledby="lecture-images-title">
    <div className="flex items-center justify-between gap-2">
      <h4 id="lecture-images-title" className="font-semibold">{t("notes.images")}</h4>
      {photos.length > 1 && <div className="flex items-center">
        <button type="button" className="lecture-note-action" onClick={() => go(-1)} aria-label={t("lec.previous")}>
          <Icon name="chevronLeft" size={19}/>
        </button>
        <span className="tabular-nums text-xs" aria-live="polite">{index + 1} / {photos.length}</span>
        <button type="button" className="lecture-note-action" onClick={() => go(1)} aria-label={t("lec.next")}>
          <Icon name="chevronRight" size={19}/>
        </button>
      </div>}
    </div>
    <figure onTouchStart={e => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
      onTouchEnd={e => {
        if (!touch.current) return;
        const dx = e.changedTouches[0].clientX - touch.current.x, dy = e.changedTouches[0].clientY - touch.current.y;
        touch.current = null;
        if (photos.length > 1 && Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
      }}>
      <OriginalPageThumbnail key={current.key} src={withBase(current.src)} label={openLabel}/>
      {current.title && <figcaption className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>{current.title}</figcaption>}
    </figure>
    <SketchNotePage key={current.key} noteId={current.noteId} index={current.index} src={current.src}
      handwritten={current.handwritten} showOriginal={false} onSourcesChanged={onSourcesChanged}/>
  </section>;
}
