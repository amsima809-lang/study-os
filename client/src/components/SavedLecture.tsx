import { useEffect, useMemo, useRef, useState } from "react";
import { getJSON, putJSON, deleteJSON, type ApiError } from "../api.ts";
import { useT } from "../i18n.tsx";
import { LectureNoteTray } from "./LectureNoteTray.tsx";
import { AnnotatedSummary } from "./AnnotatedSummary.tsx";
import type { AnnotationSource } from "../summaryAnchors.ts";
import { LectureSentences } from "./LectureSentences.tsx";
import { PersonalLectureNotes, usePersonalLectureNotes } from "./PersonalLectureNotes.tsx";
import type { PersonalNote } from "../combinedLectureNotes.ts";
import Icon from "./Icon.tsx";
import { Markdown } from "./Markdown.tsx";
import { Card, ConfirmDialog, ErrorBox, Loading } from "./ui.tsx";
import { CourseChip } from "./CourseTitle.tsx";
import { nearestCue, stampPattern, summaryCitations, type Cue } from "../lectureCitations.ts";

export type Lecture = { no: number; url: string; has_summary: boolean; transcript: { cues: number; minutes: number } | null };
export type LectureCourse = { code: string; name_th: string; name_en: string | null; mine?: boolean; lectures: Lecture[] };
export type UnrecordedCourse = { code: string; name_th: string; name_en: string | null };

/** Her term's courses first (`mine`), then the rest; plus her courses with no recording at all. */
export async function loadLectureList(): Promise<{ courses: LectureCourse[]; unrecorded: UnrecordedCourse[] }> {
  const r = await getJSON<{ courses: LectureCourse[]; unrecorded?: UnrecordedCourse[] }>("/api/lectures");
  return { courses: r.courses, unrecorded: r.unrecorded ?? [] };
}

export async function loadLectureCourses(): Promise<LectureCourse[]> {
  return (await loadLectureList()).courses;
}
type Tab = "notes" | "transcript";
export type OpenLecture = { code: string; lecture: Lecture; tab: Tab; annotationId?: number; atMs?: number };
type Summary = { summary_md: string; edited: boolean };
type Transcript = { cues: Cue[]; source_url: string | null; shared: boolean };
type Target = { tab: "summary" | "transcript"; idx: number };
const chip = "rounded-lg px-2 py-1 text-xs font-medium";
const chipStyle = { background: "var(--accent-light)", color: "var(--accent-text)" };
const clock = (ms: number) => {
  const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60);
  return (h ? `${h}:${String(m).padStart(2, "0")}` : String(m)) + ":" + String(s % 60).padStart(2, "0");
};

function transcriptText(text: string, search: RegExp | null, focused: boolean) {
  if (focused) return <mark className="lecture-highlight">{text}</mark>;
  if (!search) return text;
  return text.split(search).map((part, i) => i % 2
    ? <mark key={i} className="lecture-highlight">{part}</mark>
    : part);
}

export function LectureShortcuts({ code, lecture, onOpen }: {
  code: string; lecture: Lecture; onOpen: (v: OpenLecture) => void;
}) {
  const { t } = useT();
  return <button type="button" className="inline-flex items-center gap-1.5 text-sm font-medium px-3 min-h-11 rounded-lg"
    style={{ background: "var(--accent)", color: "#fff" }}
    onClick={() => onOpen({ code, lecture, tab: "notes" })}>
    <Icon name="fileText" size={16}/>{t("lec.notes")}
  </button>;
}

export function SavedLecture({ which, onDeleted }: { which: OpenLecture; onDeleted: () => void }) {
  return <LectureReader key={which.code + "/" + which.lecture.no} which={which} onDeleted={onDeleted}/>;
}

function LectureReader({ which, onDeleted }: { which: OpenLecture; onDeleted: () => void }) {
  const { t } = useT();
  const { code, lecture } = which;
  const [tab, setTab] = useState<Tab>(which.tab);
  const [annotationTarget, setAnnotationTarget] = useState<{ source: AnnotationSource; id: number } | null>(() =>
    which.annotationId ? { source: which.tab === "transcript" ? "transcript" : "summary", id: which.annotationId } : null);
  const [editor, setEditor] = useState<{ note?: PersonalNote } | null>(null);
  const [writingAnnotation, setWritingAnnotation] = useState(false);
  const [savedNoteId, setSavedNoteId] = useState<number | null>(null);
  const [notesRevision, setNotesRevision] = useState(0);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const initialTime = useRef(which.atMs);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<"restore" | "delete" | null>(null);
  // Pen notes attached to words this edit removes: she is told before saving (they are kept, under "passage changed").
  const [detaching, setDetaching] = useState(0);
  const [error, setError] = useState("");
  const [focus, setFocus] = useState<Target | null>(null);
  const [back, setBack] = useState<Target | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const suffix = `${code}/${lecture.no}`;
  const summaryPath = `/api/lectures/summaries/${suffix}`;
  const trPath = `/api/lectures/transcripts/${suffix}`;
  const readingSummary = tab === "notes" && lecture.has_summary;
  const personal = usePersonalLectureNotes(`/api/lectures/${suffix}/personal-notes`, notesRevision);
  useEffect(() => {
    if (editor || savedNoteId === null || !personal.data?.notes.some(note => note.id === savedNoteId)) return;
    const frame = requestAnimationFrame(() => {
      const row = container.current?.querySelector<HTMLElement>(`[data-lecture-note-id="${savedNoteId}"]`);
      row?.focus({ preventScroll: true });
      row?.scrollIntoView({ block: "center" });
      setSavedNoteId(null);
    });
    return () => cancelAnimationFrame(frame);
  }, [editor, personal.data, savedNoteId]);
  function openEditor(note?: PersonalNote) {
    setFocus(null);
    setBack(null);
    setAnnotationTarget(null);
    setTab(lecture.has_summary || !lecture.transcript ? "notes" : "transcript");
    setEditor({ note });
  }
  function switchTab(v: Tab) {
    setTab(v); setFocus(null); setBack(null); setError(""); setAnnotationTarget(null);
  }

  useEffect(() => {
    let alive = true;
    if (lecture.transcript) getJSON<Transcript>(trPath).then((r) => { if (alive) setTranscript(r); }).catch(() => { if (alive) setError(t("lib.transcriptMissing")); });
    if (lecture.has_summary) getJSON<Summary>(summaryPath).then((r) => { if (alive) setSummary(r); }).catch(() => { if (alive) setError(t("lib.loadFailed")); });
    return () => { alive = false; };
  }, [trPath, summaryPath, lecture.has_summary, lecture.transcript, t]);

  useEffect(() => {
    const at = initialTime.current;
    if (!transcript || at === undefined) return;
    initialTime.current = undefined;
    const exact = transcript.cues.findIndex(c => c.startMs === at);
    const idx = exact >= 0 ? exact : nearestCue(transcript.cues, clock(at));
    if (idx >= 0) setFocus({ tab: "transcript", idx });
  }, [transcript]);

  // Opening a long lecture from a scrolled course list should show its heading and tabs.
  // Timestamp links and pen-note search handle their own scroll destinations.
  useEffect(() => {
    if (!focus && !annotationTarget) window.scrollTo({ top: 0, behavior: "instant" });
  }, [code, lecture.no, tab, focus, annotationTarget]);

  const refs = useMemo(() => summaryCitations(summary?.summary_md ?? "", transcript?.cues ?? [], (n) => t("lec.point", { n })), [summary, transcript, t]);
  useEffect(() => {
    if (!focus || focus.tab !== (readingSummary ? "summary" : tab)) return;
    const target = container.current?.querySelector<HTMLElement>(`[data-lecture-target="${focus.tab}-${focus.idx}"]`);
    if (target) { target.scrollIntoView({ block: "center" }); target.focus({ preventScroll: true }); }
  }, [focus, tab, readingSummary, transcript, summary]);
  function go(target: Target, from: Target | null) {
    setAnnotationTarget(null);
    if (target.tab === "summary") setDraft(null);
    setTab(target.tab === "summary" ? "notes" : "transcript"); setBack(from); setFocus(target); setQuery("");
  }
  /** How many of her summary pen notes are attached to words the edited text no longer contains. */
  async function notesDetachedBy(text: string) {
    try {
      const { annotations } = await getJSON<{ annotations: { quote: string }[] }>(
        `/api/lectures/${encodeURIComponent(code)}/${lecture.no}/annotations?source=summary`);
      // Compare as the reader shows it: no markdown marks, timestamps as plain times, spaces ignored.
      const plain = (v: string) => v.replace(/\[(\d{1,2}:\d{2}(?::\d{2})?)\]/g, "$1").replace(/^\s*(?:#{1,6}|[-*]|\d+\.)\s+/gm, "")
        .replace(/[*_`>]/g, "").replace(/\s+/g, "");
      const shown = plain(text);
      return annotations.filter(a => !shown.includes(plain(a.quote))).length;
    } catch { return 0; } // the server still keeps every note; the warning is only a courtesy
  }
  async function saveEdit() {
    if (!draft) return;
    const n = await notesDetachedBy(draft);
    if (n > 0) setDetaching(n); else await save(false);
  }
  async function save(restore: boolean) {
    setBusy(true); setError("");
    try {
      const updated = restore ? await deleteJSON<Summary>(summaryPath) :
        await putJSON<Summary>(summaryPath, { summary_md: draft, previous_md: summary?.summary_md });
      setSummary(updated); setDraft(null); setConfirm(null); setNotesRevision(n => n + 1);
    } catch (e) { setError((e as ApiError).error || t("status.failed")); }
    finally { setBusy(false); }
  }
  const mark = (pane: Target["tab"], idx: number) => focus?.tab === pane && focus.idx === idx ? { background: "var(--accent-light)" } : undefined;
  const backButton = back && <button className={chip} style={chipStyle} onClick={() => go(back, null)}>← {t("lec.back")}</button>;
  function renderSummaryPart(part: string, line: number) {
    return part.split(stampPattern).map((s, i) => {
      if (i % 2 === 0) return s;
      const cue = nearestCue(transcript?.cues ?? [], s);
      if (cue < 0) return `[${s}]`;
      return <button key={i} className={chip} style={chipStyle}
        onClick={() => go({ tab: "transcript", idx: cue }, { tab: "summary", idx: line })}>{s}</button>;
    });
  }
  const q = query.trim().toLowerCase();
  const search = useMemo(() => {
    const term = query.trim();
    return term ? new RegExp("(" + term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + ")", "iu") : null;
  }, [query]);
  const shown = (transcript?.cues ?? []).map((c, idx) => ({ c, idx })).filter(({ c }) => !q || c.text.toLowerCase().includes(q));
  const summaryHeading = <div className="flex items-baseline gap-2">
    <h3 className="shrink-0 font-semibold">{t("lec.aiSummary")}</h3>
    <p className="min-w-0 text-xs" style={{ color: "var(--text-secondary)" }}>{t("lec.disclaimer")}</p>
  </div>;
  return <div ref={container} data-lecture-reader="">
    <fieldset disabled={writingAnnotation || !!editor} className="min-w-0 border-0 p-0 space-y-3">
    <h2 className="text-lg font-bold"><CourseChip code={code} className="mr-2"/>{t("lib.lectureNo", { n: lecture.no })}</h2>
    <div className="flex flex-wrap items-center gap-2">
      {(["notes", "transcript"] as const).filter(v => v === "notes" || lecture.transcript).map(v =>
        <button key={v} aria-pressed={tab === v} onClick={() => switchTab(v)} aria-label={v === "transcript" ? t("lec.transcript") : undefined}
          className="inline-flex items-center gap-1.5 rounded-lg min-h-11 min-w-11 justify-center px-3 text-sm" style={tab === v ? chipStyle : undefined}>
          {v === "notes" ? t("lec.notes") : <><Icon name="transcript" size={18}/><span className="hidden sm:inline" aria-hidden>{t("lec.transcript")}</span></>}
        </button>)}
      <a href={lecture.url} target="_blank" rel="noreferrer" aria-label={t("lib.watchExternal")} title={t("lib.watchExternal")}
        className="min-h-11 min-w-11 justify-center inline-flex items-center gap-1.5 px-2 text-sm" style={{ color: "var(--accent-text)" }}>
        <Icon name="watch" size={18}/><span className="hidden sm:inline" aria-hidden>{t("lib.watch")} ↗</span></a>
    </div>
    {error && <ErrorBox>{error}</ErrorBox>}
    {readingSummary && (summary ? <>
      {summaryHeading}
      <div className="flex items-center flex-wrap gap-3 text-sm">
        {summary.edited && <span>{t("lec.edited")}</span>}
        {draft === null ? <>
          <button className="min-h-11" style={ { color: "var(--accent-text)" } } onClick={() => setDraft(summary.summary_md)}>{t("lec.edit")}</button>
          <span style={{ color: "var(--text-secondary)" }}>{t("lec.markToAnnotate")}</span>
          {summary.edited && <button className="min-h-11" onClick={() => setConfirm("restore")}>{t("lec.restore")}</button>}
        </> : <>
          <button className="min-h-11" disabled={busy || !draft.trim()} onClick={() => void saveEdit()}>{t("lec.save")}</button>
          <button className="min-h-11" disabled={busy} onClick={() => setDraft(null)}>{t("nav.cancel")}</button>
        </>}
      </div>
      {draft !== null ? <textarea className="w-full rounded-lg p-3" rows={18} style={{ background: "var(--bg-surface)" }}
        aria-label={t("lec.edit")} maxLength={120000} value={draft} onChange={(e) => setDraft(e.target.value)}/> :
        <Card><AnnotatedSummary key={suffix} courseCode={code} sessionNo={lecture.no} readOnly={!!editor}
          onWritingChange={setWritingAnnotation}
          focusId={annotationTarget?.source === "summary" ? annotationTarget.id : undefined}
          onChanged={() => setNotesRevision(n => n + 1)}><div className="space-y-2">
          {summary.summary_md.split("\n").map((line, i) => line.trim() && (
            <div key={i} tabIndex={-1} data-lecture-target={`summary-${i}`} style={mark("summary", i)}>
              <Markdown source={line} annotationKey={`s:${i}`} renderText={(part) => renderSummaryPart(part, i)}/>
              {focus?.tab === "summary" && focus.idx === i && backButton}
            </div>
          ))}
        </div></AnnotatedSummary></Card>}
    </> : !error && <Loading>{t("status.connecting")}</Loading>)}
    {tab === "transcript" && (transcript ? <>
      {summary && <section className="rounded-xl border px-4 py-3 space-y-1" style={{ background: "var(--bg-surface)", borderColor: "var(--border-light)" }}>
        {summaryHeading}
        <div className="line-clamp-3"><Markdown source={summary.summary_md.trim().split(/\n\s*\n/, 1)[0]} /></div>
        <button type="button" className="min-h-11 font-semibold text-sm" style={{ color: "var(--accent-text)" }}
          onClick={() => switchTab("notes")}>{t("lec.readSummary")} →</button>
      </section>}
      <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("lib.searchTranscript")}
        aria-label={t("lib.searchTranscript")} className="w-full rounded-xl border px-4 py-3 min-h-11" style={{ background: "var(--bg-surface)", borderColor: "var(--border-light)" }} />
      <p className="text-xs">{q ? t("lib.matches", { n: shown.length }) : t("lib.transcriptNote")}</p>
      <Card><AnnotatedSummary key={`transcript/${suffix}`} courseCode={code} sessionNo={lecture.no} source="transcript" filtered={!!q} readOnly={!!editor}
        focusId={annotationTarget?.source === "transcript" ? annotationTarget.id : undefined} onChanged={() => setNotesRevision(n => n + 1)}>
        <ul className="space-y-3">{shown.map(({ c, idx }) => (
        <li key={idx} tabIndex={-1} data-lecture-target={`transcript-${idx}`} className="flex gap-3">
          <span className="shrink-0 w-14 text-xs pt-1 tabular-nums">{clock(c.startMs)}</span>
          <div><LectureSentences text={c.text} blockKey={`t:${c.startMs}:${idx}`} renderText={part => transcriptText(part, search, focus?.tab === "transcript" && focus.idx === idx)}/> {(refs.get(idx) ?? []).map((ref) => <button key={ref.line} className={chip} style={chipStyle}
            onClick={() => go({ tab: "summary", idx: ref.line }, { tab: "transcript", idx })}>{ref.label}</button>)} {focus?.tab === "transcript" && focus.idx === idx && backButton}</div>
        </li>))}
        {!shown.length && <li>{t("lib.noMatches")}</li>}
      </ul></AnnotatedSummary></Card>
      {!transcript.shared && <button className="min-h-11" style={{ color: "var(--danger)" }} onClick={() => setConfirm("delete")}>{t("lib.deleteTranscript")}</button>}
    </> : !error && <Loading>{t("status.connecting")}</Loading>)}
    <fieldset className="min-w-0 border-0 p-0" disabled={readingSummary && draft !== null}>
      <PersonalLectureNotes result={personal} summaryMarkdown={summary?.summary_md ?? ""}
        combinedPath={lecture.has_summary ? `/api/lectures/${suffix}/combined-notes` : undefined}
        onAdd={() => openEditor()} onEdit={openEditor} onChanged={() => setNotesRevision(n => n + 1)}
        onShowSummaryLine={idx => go({ tab: "summary", idx }, null)}
        onShowAnnotation={(source, id) => {
          switchTab(source === "transcript" ? "transcript" : "notes");
          setQuery(""); setAnnotationTarget({ source, id });
        }}/>
    </fieldset>
    </fieldset>
    {editor && <LectureNoteTray key={editor.note?.id ?? "add"} code={code} sessionNo={lecture.no}
      readerRef={container} note={editor.note} onCancel={() => setEditor(null)}
      onSaved={id => { setSavedNoteId(id); setNotesRevision(n => n + 1); setEditor(null); }}/>}
    {detaching > 0 && <ConfirmDialog title={t("lec.detachTitle", { n: detaching })} message={t("lec.detachMessage")}
      cancelLabel={t("lec.keepEditing")} confirmLabel={t("lec.save")} busy={busy}
      onCancel={() => { if (!busy) setDetaching(0); }} onConfirm={async () => { await save(false); setDetaching(0); }}/>}
    {confirm && <ConfirmDialog title={t(confirm === "restore" ? "lec.restore" : "lib.deleteTranscriptTitle")} message={t("confirm.cannotUndo")}
      cancelLabel={t("nav.cancel")} confirmLabel={t(confirm === "restore" ? "lec.restore" : "confirm.delete")} busy={busy}
      onCancel={() => setConfirm(null)} onConfirm={async () => {
        if (confirm === "restore") { await save(true); return; }
        setBusy(true);
        try { await deleteJSON(trPath); onDeleted(); } catch (e) { setConfirm(null); setError((e as ApiError).error || t("status.failed")); }
        finally { setBusy(false); }
      }}/>}
  </div>;
}

export function useLectureCourses() {
  const [courses, setCourses] = useState<LectureCourse[]>([]);
  useEffect(() => {
    let alive = true;
    void loadLectureCourses().then(result => { if (alive) setCourses(result); }).catch(() => {});
    return () => { alive = false; };
  }, []);
  return courses;
}

export function LecturePicker({ lectures, value, onChange, disabled }: {
  lectures?: Lecture[]; value: string; onChange: (v: string) => void; disabled?: boolean;
}) {
  const { t } = useT();
  if (!lectures?.length) return null;
  return <label className="block text-xs">
    {t("lec.associate")}
    <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg border px-3 py-2 mt-1 min-h-11" style={{ background: "var(--bg-surface)", borderColor: "var(--border)" }}>
      <option value="">{t("lec.unspecified")}</option>
      {lectures.map((l) => <option key={l.no} value={l.no}>{t("lib.lectureNo", { n: l.no })}</option>)}
    </select>
  </label>;
}
