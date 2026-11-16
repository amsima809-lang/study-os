import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { putJSON, type ApiError } from "../api.ts";
import { personalNoteText, type PersonalNote } from "../combinedLectureNotes.ts";
import { useT } from "../i18n.tsx";
import { LectureNoteForm } from "../screens/Notes.tsx";
import { setUnsaved, unsavedReason } from "../unsaved.ts";
import { ConfirmDialog } from "./ui.tsx";
import { useLectureSplitPane } from "./useLectureSplitPane.ts";

type TrayProps = {
  code: string;
  sessionNo: number;
  readerRef: RefObject<HTMLDivElement | null>;
  note?: PersonalNote;
  onSaved: (noteId: number) => void;
  onCancel: () => void;
};

export function LectureNoteTray({ code, sessionNo, readerRef, note, onSaved, onCancel }: TrayProps) {
  const { t, lang } = useT(), th = lang === "th";
  const [full, setFull] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const tray = useRef<HTMLElement>(null);
  const noteId = note?.id;

  useLectureSplitPane(readerRef.current, tray,
    reader => reader.querySelector("[data-lecture-target]")?.getBoundingClientRect(), "start",
    reader => reader.querySelector<HTMLElement>(noteId ? `[data-lecture-edit-note="${noteId}"]` : "[data-lecture-add-note]"),
  );
  useLayoutEffect(() => {
    if (readerRef.current) readerRef.current.inert = full;
  }, [full, readerRef]);

  const label = note ? th ? "แก้ไขโน้ต" : "Edit note" : t("notes.newTitle");
  function close() {
    if (busy) return;
    if (dirty || unsavedReason()) setConfirmClose(true);
    else onCancel();
  }
  return createPortal(<div className="lecture-tray-host">
    <section ref={tray} role="dialog" aria-modal={full} aria-label={label} tabIndex={-1} data-full={full}
      className="lecture-note-tray" onKeyDown={e => {
        if (e.key === "Escape" && e.currentTarget.contains(e.target as Node) && !confirmClose) {
          e.stopPropagation(); close();
        }
      }}>
      <div className="lecture-tray-header">
        <h2 className="font-semibold flex-1">{label}</h2>
        <button type="button" aria-pressed={full} onClick={() => setFull(v => !v)}>
          {full ? th ? "ครึ่งหน้าจอ" : "Half screen" : th ? "เต็มหน้าจอ" : "Full screen"}
        </button>
        <button type="button" aria-label={th ? "ปิด" : "Close"} disabled={busy} onClick={close}>×</button>
      </div>
      <div className="lecture-tray-form">
        {note ? <EditNote note={note} onSaved={onSaved} onCancel={close} setBusy={setBusy} setDirty={setDirty} busy={busy}/>
          : <LectureNoteForm code={code} sessionNo={sessionNo} onSaved={onSaved} onCancel={onCancel} onBusyChange={setBusy}/>}
      </div>
      {confirmClose && <ConfirmDialog title={note ? th ? "ทิ้งการแก้ไข?" : "Discard your changes?" : t("leave.title")}
        message={t(unsavedReason() ?? "leave.noteEdit")}
        confirmLabel={t("leave.go")} cancelLabel={t("leave.stay")}
        onConfirm={onCancel} onCancel={() => setConfirmClose(false)}/>}
    </section>
  </div>, document.body);
}

function EditNote({ note, onSaved, onCancel, setBusy, setDirty, busy }: {
  note: PersonalNote; onSaved: (id: number) => void; onCancel: () => void;
  setBusy: (busy: boolean) => void; setDirty: (dirty: boolean) => void; busy: boolean;
}) {
  const { t, lang } = useT(), th = lang === "th";
  const [original, setOriginal] = useState(note);
  const [title, setTitle] = useState(note.title ?? "");
  const [text, setText] = useState(() => personalNoteText(note));
  const [conflict, setConflict] = useState<PersonalNote | null>(null);
  const [error, setError] = useState("");
  const submitting = useRef(false);
  const originalText = personalNoteText(original);
  const dirty = title !== (original.title ?? "") || text !== originalText;
  useEffect(() => {
    setDirty(dirty);
    setUnsaved("lecture-note-edit", dirty ? "leave.noteEdit" : null);
    return () => setUnsaved("lecture-note-edit", null);
  }, [dirty, setDirty]);

  async function save() {
    if (submitting.current || conflict) return;
    submitting.current = true;
    setBusy(true); setError("");
    try {
      const changedText = text !== originalText;
      await putJSON(`/api/notes/${note.id}/content`, { title: title || null,
        raw_text: changedText ? text || null : original.raw_text, replace_text: changedText,
        previous_title: original.title, previous_raw_text: original.raw_text, previous_text: originalText });
      onSaved(note.id);
    } catch (e) {
      const result = e as ApiError & { note?: PersonalNote };
      if (result.code === "NOTE_CHANGED" && result.note) setConflict(result.note);
      else setError(result.error || t("status.failed"));
    } finally {
      submitting.current = false; setBusy(false);
    }
  }
  return <form className="space-y-3" onSubmit={e => { e.preventDefault(); void save(); }}>
    <label>{t("notes.noteTitle")}
      <input value={title} onChange={e => setTitle(e.target.value)} disabled={busy}/>
    </label>
    <label>{t("notes.text")}
      <textarea rows={6} value={text} onChange={e => setText(e.target.value)} disabled={busy}/>
    </label>
    {conflict && <div role="alert" className="space-y-2">
      <p>{th ? "มีการเปลี่ยนแปลงโน้ตที่บันทึกไว้" : "The saved note changed while you were editing."}</p>
      <blockquote className="whitespace-pre-wrap border-l-2 pl-2">{conflict.title}{"\n"}{personalNoteText(conflict)}</blockquote>
      <button type="button" className="min-h-11 underline" onClick={() => {
        if (title === (original.title ?? "")) setTitle(conflict.title ?? "");
        if (text === originalText) setText(personalNoteText(conflict));
        setOriginal(conflict); setConflict(null);
      }}>{th ? "แก้ไขฉบับของฉันต่อ" : "Continue with my edit"}</button>
      <button type="button" className="min-h-11 underline px-3" onClick={() => {
        setTitle(conflict.title ?? ""); setText(personalNoteText(conflict)); setOriginal(conflict); setConflict(null);
      }}>{th ? "ใช้ฉบับที่บันทึกไว้" : "Use saved version"}</button>
    </div>}
    {error && <p role="alert">{error}</p>}
    <div className="flex items-center gap-2">
      <button type="submit" disabled={busy || !!conflict || (!text.trim() && !original.image_paths.length)}
        className="min-h-11 rounded-lg px-4 font-semibold disabled:opacity-50"
        style={{ background: "var(--accent)", color: "#fff" }}>{t("lec.save")}</button>
      <button type="button" disabled={busy} onClick={onCancel} className="min-h-11 px-3">{t("nav.cancel")}</button>
    </div>
  </form>;
}
