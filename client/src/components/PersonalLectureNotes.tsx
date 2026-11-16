import { useEffect, useState, type CSSProperties } from "react";
import { getJSON } from "../api.ts";
import { withBase } from "../base.ts";
import { useT } from "../i18n.tsx";
import { readableInk } from "../theme.ts";
import { type InkRun, type PersonalPassage, type LectureSources } from "../combinedLectureNotes.ts";
import { Card, ErrorBox, Loading } from "./ui.tsx";
import { SketchNotes } from "./SketchNotes.tsx";
import { OriginalPageThumbnail } from "./OriginalPageThumbnail.tsx";
import "./createdLectureNotes.css";

export function usePersonalLectureNotes(path: string | null, revision: number) {
  const [data, setData] = useState<LectureSources | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!path) return;
    let active = true;
    setFailed(false);
    getJSON<LectureSources>(path).then(result => {
      if (active) setData(result);
    }).catch(() => {
      if (active) setFailed(true);
    });
    return () => { active = false; };
  }, [path, revision, retry]);
  return { data, failed, retry: () => setRetry(n => n + 1) };
}

export function InkText({ runs }: { runs: InkRun[] }) {
  return <p className="whitespace-pre-wrap break-words">{runs.map((run, index) => (
    <span key={index} className="lecture-ink" style={run.color ? {
      "--ink-light": readableInk(run.color, "light"),
      "--ink-dark": readableInk(run.color, "dark"),
    } as CSSProperties : undefined}>{run.text}</span>
  ))}</p>;
}

export function SavedPersonalPassage({ passage }: { passage: PersonalPassage }) {
  const { lang } = useT();
  const th = lang === "th";
  return <aside data-personal-passage="" className="border-l-2 pl-3 mt-2 text-sm" style={{ borderColor: "var(--accent)" }}>
    <small className="font-medium">{passage.source === "annotation"
      ? th ? "โน้ตลายมือของฉัน" : "My pen note"
      : th ? "โน้ตของฉัน" : "My note"}</small>
    <InkText runs={passage.runs}/>
  </aside>;
}

export function PersonalLectureNotes({ result, combined, placedNotes }: {
  result: ReturnType<typeof usePersonalLectureNotes>;
  combined: boolean;
  placedNotes?: Set<number>;
}) {
  const { t, lang } = useT();
  const th = lang === "th";
  const { data, failed, retry } = result;
  if (failed) return <ErrorBox onRetry={retry}/>;
  if (!data) return <Loading>{t("status.connecting")}</Loading>;
  // The combined reader already shows the original ink, transcription and editing tools on the summary.
  const annotations = combined ? [] : data.annotations;
  return <section id="lecture-personal-notes" tabIndex={-1} className="space-y-3">
    <h3 className="font-semibold">{t("notes.title")}</h3>
    {!data.notes.length && !annotations.length && <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
      {combined && data.annotations.length
        ? th ? "โน้ตลายมืออยู่บนสรุปด้านบน" : "Your pen notes appear on the summary above."
        : th ? "ยังไม่มีโน้ตสำหรับบทเรียนนี้" : "You haven’t added any notes to this lecture yet."}
    </p>}
    {data.notes.map(note => {
      const title = note.title || (th ? "โน้ตของฉัน" : "My note") + " #" + note.id;
      const handwritten = note.handwriting_image_index != null;
      const photos = note.image_paths.filter((_, i) => i !== note.handwriting_image_index);
      const text = <>
        {note.raw_text && <p className="whitespace-pre-wrap break-words text-sm">{note.raw_text}</p>}
        {!handwritten && note.sketch_passages?.map((p, i) => <InkText key={i} runs={p.runs}/>)}
      </>;
      return <Card key={note.id}>
        {placedNotes?.has(note.id) ? <details>
          <summary className="cursor-pointer py-1 font-medium">{th ? "โน้ตต้นฉบับ" : "Original note"} · {title}</summary>
          {text}
        </details> : <><h4 className="font-medium">{title}</h4>{text}</>}
        {handwritten && <SketchNotes noteId={note.id} imagePaths={note.image_paths} handwritingIndex={note.handwriting_image_index}
          onSourcesChanged={retry}/>}
        {!!photos.length && <div className="mt-2 grid gap-2 sm:grid-cols-2">{photos.map((src, index) =>
          <img key={index} loading="lazy" className="rounded-lg max-w-full" src={withBase(src)} alt={t("lec.noteImage", { n: index + 1 })}/>
        )}</div>}
      </Card>;
    })}
    {annotations.map(annotation => <Card key={annotation.id}>
      <h4 className="font-medium">{th ? "โน้ตลายมือของฉัน" : "My pen note"}</h4>
      <blockquote className="my-1 text-sm" style={{ color: "var(--text-secondary)" }}>“{annotation.quote}”</blockquote>
      <OriginalPageThumbnail src={withBase(annotation.image_url)}/>
      <InkText runs={annotation.runs}/>
    </Card>)}
  </section>;
}
