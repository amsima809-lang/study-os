import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { deleteJSON, getJSON } from "../api.ts";
import { useT } from "../i18n.tsx";
import { readableInk } from "../theme.ts";
import { currentCombinedReading, type CreatedLectureNotes, type InkRun, type PersonalNote, type LectureSources } from "../combinedLectureNotes.ts";
import { ConfirmDialog, ErrorBox, Loading } from "./ui.tsx";
import Icon from "./Icon.tsx";
import { LectureNoteGallery } from "./LectureNoteGallery.tsx";
import type { AnnotationSource } from "../summaryAnchors.ts";
import "./createdLectureNotes.css";

export function usePersonalLectureNotes(path: string | null, revision: number) {
  const [data, setData] = useState<LectureSources | null>(null);
  const [failed, setFailed] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (!path) return;
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    setFailed(false);
    const load = () => getJSON<LectureSources>(path).then(result => {
      if (!active) return;
      setData(result);
      if (result.reading_images) timer = setTimeout(load, 2200);
    }).catch(() => {
      if (active) setFailed(true);
    });
    void load();
    return () => { active = false; clearTimeout(timer); };
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

export function PersonalLectureNotes({ result, created, summaryMarkdown, onAdd, onEdit, onChanged, onShowAnnotation, onShowSummaryLine }: {
  result: ReturnType<typeof usePersonalLectureNotes>;
  created: CreatedLectureNotes | null;
  summaryMarkdown: string;
  onAdd: () => void;
  onEdit: (note: PersonalNote) => void;
  onChanged: () => void;
  onShowAnnotation: (source: AnnotationSource, id: number) => void;
  onShowSummaryLine: (index: number) => void;
}) {
  const { t, lang } = useT();
  const th = lang === "th";
  const { data, failed, retry } = result;
  const [deleting, setDeleting] = useState<PersonalNote | null>(null);
  const [busy, setBusy] = useState(false);
  const [deleteFailed, setDeleteFailed] = useState(false);
  const date = useMemo(() => new Intl.DateTimeFormat(th ? "th-TH" : "en-GB", {
    dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Bangkok",
  }), [th]);
  function savedDate(value: string) {
    const time = Date.parse(value);
    return Number.isNaN(time) ? value : date.format(time);
  }
  const summaryLinks = useMemo(() => {
    const links = new Map<number, { line: number; label: string }[]>();
    const reading = data && currentCombinedReading(summaryMarkdown, created, data);
    if (!reading) return links;
    const lines = summaryMarkdown.split(/\r?\n/);
    for (const [line, passages] of reading.lines) {
      const label = lines[line].trim().replace(/^(?:#{1,6}|[-*])\s+/, "").replace(/\*\*/g, "");
      const noteIds = new Set(passages.filter(p => p.source === "note").map(p => p.id));
      for (const id of noteIds) {
        const group = links.get(id) ?? [];
        group.push({ line, label });
        links.set(id, group);
      }
    }
    return links;
  }, [summaryMarkdown, created, data]);
  const photos = useMemo(() => (data?.notes ?? []).flatMap(note => note.image_paths.map((src, index) => ({
    key: note.id + "/" + index, noteId: note.id, index, src, title: note.title, handwritten: index === note.handwriting_image_index,
  }))), [data]);
  async function remove() {
    if (!deleting || busy) return;
    setBusy(true);
    try {
      await deleteJSON("/api/notes/" + deleting.id);
      onChanged();
    } catch { setDeleteFailed(true); }
    finally { setDeleting(null); setBusy(false); }
  }

  return <section id="lecture-personal-notes" tabIndex={-1} aria-labelledby="lecture-personal-notes-title"
    className="lecture-my-notes space-y-3">
    <h3 id="lecture-personal-notes-title" className="font-semibold">{th ? t("notes.title") : "My Notes"}</h3>
    {failed ? <ErrorBox onRetry={retry}/> : !data && <Loading>{t("status.connecting")}</Loading>}
    {data && <>
      {!data.notes.length && !data.annotations.length && <p className="text-sm" style={{ color: "var(--text-secondary)" }}>
        {th ? "ยังไม่มีโน้ตสำหรับบทเรียนนี้" : "You haven’t added any notes to this lecture yet."}
      </p>}
      {(["summary", "transcript"] as const).map(source => {
        const first = data.annotations.find(a => (a.source ?? "summary") === source);
        if (!first) return null;
        return <button key={source} type="button" className="block min-h-11 text-sm underline"
          style={{ color: "var(--accent-text)" }} onClick={() => onShowAnnotation(source, first.id)}>
          {source === "summary"
            ? th ? "ดูโน้ตที่จดบนสรุป" : "View annotations in the summary"
            : th ? "ดูโน้ตที่จดบนคำบรรยาย" : "View annotations in the transcript"}
        </button>;
      })}
      {data.notes.length > 0 && <ol className="lecture-note-entries">
        {data.notes.map(note => <li key={note.id} data-lecture-note-id={note.id} tabIndex={-1} className="lecture-note-entry">
          <div className="min-w-0 space-y-1">
            {note.title && <h4 className="font-medium break-words">{note.title}</h4>}
            {note.raw_text && <p className="whitespace-pre-wrap break-words">{note.raw_text}</p>}
            {note.sketch_passages?.map((p, i) => <InkText key={i} runs={p.runs}/>)}
            {!note.title && !note.raw_text?.trim() && !note.sketch_passages?.length ? <p>
              {note.handwriting_image_index != null
                ? th ? "ลายมือ" : "Handwriting"
                : th ? "รูปภาพ" : "Photo note"}
              {" · "}<time dateTime={note.created_at}>{savedDate(note.created_at)}</time>
            </p> : null}
            {summaryLinks.get(note.id)?.map(({line, label}) => <button type="button" key={line} className="lecture-summary-link"
              aria-label={(th ? "ไปยังข้อความในสรุป " : "Go to summary passage ") + label} onClick={() => onShowSummaryLine(line)}>
              <span aria-hidden>↗</span><span className="truncate">{label}</span>
            </button>)}
          </div>
          <div className="flex items-start">
            <button type="button" data-lecture-edit-note={note.id} className="lecture-note-action"
              aria-label={th ? "แก้ไขโน้ต" : "Edit note"} title={th ? "แก้ไขโน้ต" : "Edit note"} onClick={() => onEdit(note)}>
              <Icon name="edit" size={18}/>
            </button>
            <button type="button" className="lecture-note-action" aria-label={t("notes.delete")} title={t("notes.delete")}
              onClick={() => { setDeleteFailed(false); setDeleting(note); }}><Icon name="trash" size={18}/></button>
          </div>
        </li>)}
      </ol>}
    </>}
    {deleteFailed && <p role="alert" className="text-sm" style={{color:"var(--danger)"}}>{t("status.failed")}</p>}
    <button type="button" data-lecture-add-note className="lecture-add-note" onClick={onAdd}>
      <Icon name="plus" size={18}/>{t("notes.addShort")}
    </button>
    {photos.length > 0 && <LectureNoteGallery photos={photos} onSourcesChanged={onChanged}/>}
    {deleting && <ConfirmDialog title={t("notes.deleteTitle")} message={deleting.title ?? t("confirm.cannotUndo")}
      confirmLabel={t("confirm.delete")} cancelLabel={t("nav.cancel")} busy={busy}
      onCancel={() => { if (!busy) setDeleting(null); }} onConfirm={() => void remove()}/>}
  </section>;
}
