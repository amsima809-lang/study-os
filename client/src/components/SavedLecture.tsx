import { useEffect, useMemo, useRef, useState } from "react";
import { getJSON, putJSON, deleteJSON, type ApiError } from "../api.ts";
import { useT } from "../i18n.tsx";
import { withBase } from "../base.ts";
import { LectureNoteForm } from "../screens/Notes.tsx";
import { AnnotatedSummary } from "./AnnotatedSummary.tsx";
import { CreateLectureNotes, LectureLayout } from "./CreateLectureNotes.tsx";
import { PersonalLectureNotes, SavedPersonalPassage, usePersonalLectureNotes } from "./PersonalLectureNotes.tsx";
import { currentCombinedReading, type CreatedLectureNotes } from "../combinedLectureNotes.ts";
import Icon from "./Icon.tsx";
import { Markdown } from "./Markdown.tsx";
import { Card, ConfirmDialog, ErrorBox, Loading } from "./ui.tsx";
import { CourseChip } from "./CourseTitle.tsx";
import { nearestCue, stampPattern, summaryCitations, type Cue } from "../lectureCitations.ts";

export type LectureNoteMode = "separate" | "combined";
export type Lecture = { no: number; url: string; has_summary: boolean; image_count: number; transcript: { cues: number; minutes: number } | null; note_mode: LectureNoteMode };
export type LectureCourse = { code: string; name_th: string; name_en: string | null; lectures: Lecture[] };

export async function loadLectureCourses(): Promise<LectureCourse[]> {
  const { courses } = await getJSON<{ courses: LectureCourse[] }>("/api/lectures");
  return courses;
}
type Tab = "summary" | "notes" | "combined" | "transcript" | "images";
export type OpenLecture = { code: string; lecture: Lecture; tab: Tab; annotationId?: number };
type Summary = { summary_md: string; edited: boolean };
type Transcript = { cues: Cue[]; source_url: string | null; shared: boolean };
type Photo = { note_id: number; title: string | null; path: string };
type Target = { tab: "summary" | "transcript"; idx: number };
const chip = "rounded-lg px-2 py-1 text-xs font-medium";
const chipStyle = { background: "var(--accent-light)", color: "var(--accent-text)" };
const clock = (ms: number) => {
  const s = Math.floor(ms / 1000), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60);
  return (h ? `${h}:${String(m).padStart(2, "0")}` : String(m)) + ":" + String(s % 60).padStart(2, "0");
};

export function LectureShortcuts({ code, lecture, onOpen }: { code: string; lecture: Lecture; onOpen: (v: OpenLecture) => void }) {
  const { t } = useT();
  const combined = lecture.has_summary && lecture.note_mode === "combined";
  return <>
    {lecture.has_summary && (
      <button type="button" className="inline-flex items-center gap-1.5 text-sm font-medium px-3 min-h-11 rounded-lg"
        style={{ background: "var(--accent)", color: "#fff" }}
        onClick={() => onOpen({ code, lecture, tab: combined ? "combined" : "summary" })}>
        <Icon name="fileText" size={16} />{t(combined ? "lec.summaryAndNotes" : "lec.summary")}
      </button>
    )}
    {!combined && (
      <button type="button" className="rounded-lg px-3 min-h-11 text-sm font-medium" style={chipStyle}
        onClick={() => onOpen({ code, lecture, tab: "notes" })}>{t("lec.notes")}</button>
    )}
    {lecture.image_count > 0 && <button className="text-sm px-2 min-h-11" style={{ color: "var(--accent-text)" }} onClick={() => onOpen({ code, lecture, tab: "images" })}>{t("lec.imageCount", { n: lecture.image_count })}</button>}
  </>;
}

function PhotoGallery({ path }: { path: string }) {
  const { t } = useT();
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [idx, setIdx] = useState(0);
  const [error, setError] = useState(false);
  const touch = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => {
    let alive = true;
    getJSON<{ images: Photo[] }>(path).then((r) => { if (alive) setPhotos(r.images); }).catch(() => { if (alive) setError(true); });
    return () => { alive = false; };
  }, [path]);
  if (error) return <ErrorBox/>;
  if (!photos) return <Loading>{t("status.connecting")}</Loading>;
  if (!photos.length) return <p>{t("lec.noImages")}</p>;
  const photo = photos[idx];
  const move = (d: number) => setIdx((n) => (n + d + photos.length) % photos.length);
  return <Card>
    <figure onTouchStart={(e) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
      onTouchEnd={(e) => {
        if (!touch.current) return;
        const dx = e.changedTouches[0].clientX - touch.current.x, dy = e.changedTouches[0].clientY - touch.current.y;
        if (Math.abs(dx) > 45 && Math.abs(dx) > Math.abs(dy)) move(dx < 0 ? 1 : -1);
        touch.current = null;
      }}>
      <img className="w-full object-contain max-h-[65vh] rounded-lg" src={withBase(photo.path)} alt={photo.title || t("lec.noteImage", { n: idx + 1 })}/>
      <figcaption className="flex items-center justify-between text-sm mt-2 gap-2" aria-live="polite">
        {photos.length > 1 && <button className="min-w-11 min-h-11" aria-label={t("lec.previous")} onClick={() => move(-1)}>←</button>}
        <span>{photo.title} {idx + 1} / {photos.length}</span>
        {photos.length > 1 && <button className="min-w-11 min-h-11" aria-label={t("lec.next")} onClick={() => move(1)}>→</button>}
      </figcaption>
    </figure>
  </Card>;
}

export function SavedLecture({ which, onDeleted }: { which: OpenLecture; onDeleted: () => void }) {
  return <LectureReader key={which.code + "/" + which.lecture.no} which={which} onDeleted={onDeleted}/>;
}

function LectureReader({ which, onDeleted }: { which: OpenLecture; onDeleted: () => void }) {
  const { t } = useT();
  const { code, lecture } = which;
  const [mode, setMode] = useState(lecture.note_mode);
  const [tab, setTab] = useState<Tab>(which.tab === "summary" && lecture.note_mode === "combined" ? "combined" : which.tab);
  const [adding, setAdding] = useState(false);
  const [notesRevision, setNotesRevision] = useState(0);
  const [created, setCreated] = useState<CreatedLectureNotes | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [transcript, setTranscript] = useState<Transcript | null>(null);
  const [query, setQuery] = useState("");
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<"restore" | "delete" | null>(null);
  const [error, setError] = useState("");
  const [focus, setFocus] = useState<Target | null>(null);
  const [back, setBack] = useState<Target | null>(null);
  const container = useRef<HTMLDivElement>(null);
  const suffix = `${code}/${lecture.no}`;
  const summaryPath = `/api/lectures/summaries/${suffix}`;
  const trPath = `/api/lectures/transcripts/${suffix}`;
  const summaryTab = lecture.has_summary && mode === "combined" ? "combined" : "summary";
  const readingSummary = tab === "summary" || tab === "combined";
  const readingNotes = tab === "notes" || tab === "combined";
  const readingText = readingSummary || tab === "transcript";
  const personal = usePersonalLectureNotes(readingNotes ? `/api/lectures/${suffix}/personal-notes` : null, notesRevision);
  const reading = useMemo(() => tab === "combined" && summary && personal.data && !personal.failed
    ? currentCombinedReading(summary.summary_md, created, personal.data) : null, [tab, summary, created, personal.data, personal.failed]);
  function switchTab(v: Tab) {
    setTab(v); setFocus(null); setBack(null); setAdding(false); setError("");
  }
  function changeMode(next: LectureNoteMode) {
    setMode(next);
    switchTab(next === "combined" ? "combined" : "summary");
  }

  useEffect(() => {
    if (!readingText) return;
    let alive = true;
    if (lecture.transcript) getJSON<Transcript>(trPath).then((r) => { if (alive) setTranscript(r); }).catch(() => { if (alive) setError(t("lib.transcriptMissing")); });
    if (lecture.has_summary) getJSON<Summary>(summaryPath).then((r) => { if (alive) setSummary(r); }).catch(() => { if (alive) setError(t("lib.loadFailed")); });
    return () => { alive = false; };
  }, [readingText, trPath, summaryPath, lecture.has_summary, lecture.transcript, t]);

  // Opening a long lecture from a scrolled course list should show its heading and tabs.
  // Timestamp links and pen-note search handle their own scroll destinations.
  useEffect(() => {
    if (!focus && !which.annotationId) window.scrollTo({ top: 0, behavior: "instant" });
  }, [code, lecture.no, tab, focus, which.annotationId]);

  const refs = useMemo(() => summaryCitations(summary?.summary_md ?? "", transcript?.cues ?? [], (n) => t("lec.point", { n })), [summary, transcript, t]);
  useEffect(() => {
    if (!focus || focus.tab !== (tab === "combined" ? "summary" : tab)) return;
    const target = container.current?.querySelector<HTMLElement>(`[data-lecture-target="${focus.tab}-${focus.idx}"]`);
    if (target) { target.scrollIntoView({ block: "center" }); target.focus({ preventScroll: true }); }
  }, [focus, tab, transcript, summary]);
  function go(target: Target, from: Target | null) {
    if (target.tab === "summary") setDraft(null);
    setTab(target.tab === "summary" ? summaryTab : "transcript"); setBack(from); setFocus(target); setQuery("");
  }
  async function save(restore: boolean) {
    setBusy(true); setError("");
    try {
      const updated = restore ? await deleteJSON<Summary>(summaryPath) :
        await putJSON<Summary>(summaryPath, { summary_md: draft, previous_md: summary?.summary_md });
      setSummary(updated); setDraft(null); setConfirm(null);
    } catch (e) { setError((e as ApiError).error || t("status.failed")); }
    finally { setBusy(false); }
  }
  const mark = (pane: Tab, idx: number) => focus?.tab === pane && focus.idx === idx ? { background: "var(--accent-light)" } : undefined;
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
  const shown = (transcript?.cues ?? []).map((c, idx) => ({ c, idx })).filter(({ c }) => !q || c.text.toLowerCase().includes(q));
  return <div ref={container} className="space-y-3">
    <h2 className="text-lg font-bold"><CourseChip code={code} className="mr-2"/>{t("lib.lectureNo", { n: lecture.no })}</h2>
    <div className="flex flex-wrap items-center gap-2">
      {(["summary", "notes", "combined", "transcript", "images"] as const).filter(v => {
        if (v === "summary" || v === "combined") return lecture.has_summary && v === summaryTab;
        if (v === "notes") return summaryTab !== "combined";
        return v === "transcript" ? !!lecture.transcript : lecture.image_count > 0;
      }).map(v =>
        <button key={v} aria-pressed={tab === v} onClick={() => switchTab(v)}
          className="rounded-lg min-h-11 px-3 text-sm" style={tab === v ? chipStyle : undefined}>
          {t(v === "summary" ? "lec.summary" : v === "combined" ? "lec.summaryAndNotes" : v === "notes" ? "lec.notes"
            : v === "transcript" ? "lec.transcript" : "lec.imageCount", { n: lecture.image_count })}
        </button>)}
      <a href={lecture.url} target="_blank" rel="noreferrer" className="min-h-11 inline-flex items-center px-2 text-sm" style={{ color: "var(--accent-text)" }}>{t("lib.watch")} ↗</a>
    </div>
    {lecture.has_summary && (readingSummary || readingNotes) && !adding && <LectureLayout code={code} sessionNo={lecture.no} mode={mode} onChange={changeMode}/>}
    {error && <ErrorBox>{error}</ErrorBox>}
    {tab === "images" && <PhotoGallery path={`/api/lectures/images/${suffix}`}/>}
    {readingNotes && !adding && <div className="flex gap-4 items-center">
      <button type="button" className="rounded-lg px-3 min-h-11 font-medium text-sm" style={chipStyle}
        onClick={() => setAdding(true)}>{t("notes.addShort")}</button>
      {tab === "combined" && personal.data && <button type="button" className="min-h-11 text-sm underline"
        onClick={() => {
          const section = document.getElementById("lecture-personal-notes");
          section?.scrollIntoView({ block: "start" }); section?.focus({ preventScroll: true });
        }}>{t("notes.title")} ↓</button>}
    </div>}
    {adding && <LectureNoteForm code={code} sessionNo={lecture.no} onCancel={() => setAdding(false)}
        onSaved={() => { setNotesRevision(n => n + 1); setAdding(false); }}/>}
    {!adding && readingSummary && (summary ? <>
      <p className="rounded-lg px-3 py-2 text-sm" style={{ background: "var(--warning-bg)", color: "var(--warning)" }}>{t("lec.disclaimer")}</p>
      <div className="flex items-center flex-wrap gap-3 text-sm">
        {summary.edited && <span>{t("lec.edited")}</span>}
        {draft === null ? <>
          <button className="min-h-11" style={ { color: "var(--accent-text)" } } onClick={() => setDraft(summary.summary_md)}>{t("lec.edit")}</button>
          {summary.edited && <button className="min-h-11" onClick={() => setConfirm("restore")}>{t("lec.restore")}</button>}
        </> : <>
          <button className="min-h-11" disabled={busy || !draft.trim()} onClick={() => void save(false)}>{t("lec.save")}</button>
          <button className="min-h-11" disabled={busy} onClick={() => setDraft(null)}>{t("nav.cancel")}</button>
        </>}
      </div>
      {draft !== null ? <textarea className="w-full rounded-lg p-3" rows={18} style={{ background: "var(--bg-surface)" }}
        aria-label={t("lec.edit")} maxLength={120000} value={draft} onChange={(e) => setDraft(e.target.value)}/> :
        <Card><AnnotatedSummary key={suffix} courseCode={code} sessionNo={lecture.no} focusId={which.annotationId}
          savedInk={reading?.annotations} onChanged={() => setNotesRevision(n => n + 1)}><div className="space-y-2">
          {summary.summary_md.split("\n").map((line, i) => line.trim() && (
            <div key={i} tabIndex={-1} data-lecture-target={`summary-${i}`} style={mark("summary", i)}>
              <Markdown source={line} renderText={(part) => renderSummaryPart(part, i)}/>
              {focus?.tab === "summary" && focus.idx === i && backButton}
              {reading?.lines.get(i)?.map((p, index) => <SavedPersonalPassage key={index} passage={p}/>)}
            </div>
          ))}
        </div></AnnotatedSummary></Card>}
    </> : !error && <Loading>{t("status.connecting")}</Loading>)}
    {!adding && readingNotes && <PersonalLectureNotes result={personal} combined={tab === "combined" && !!summary && draft === null} placedNotes={draft === null ? reading?.notes : undefined}/>}
    {!adding && readingSummary && summary && draft === null && <CreateLectureNotes code={code} sessionNo={lecture.no}
      inline={!!reading?.allCurrent} onCreated={setCreated}/>}
    {tab === "transcript" && (transcript ? <>
      {summary && <section className="rounded-xl border px-4 py-3 space-y-1" style={{ background: "var(--bg-surface)", borderColor: "var(--border-light)" }}>
        <h3 className="font-semibold">{t("lec.aiSummary")}</h3>
        <div className="line-clamp-3"><Markdown source={summary.summary_md.trim().split(/\n\s*\n/, 1)[0]} /></div>
        <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>{t("lec.disclaimer")}</p>
        <button type="button" className="min-h-11 font-semibold text-sm" style={{ color: "var(--accent-text)" }}
          onClick={() => switchTab(summaryTab)}>{t(summaryTab === "combined" ? "lec.summaryAndNotes" : "lec.readSummary")} →</button>
      </section>}
      <input type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("lib.searchTranscript")}
        aria-label={t("lib.searchTranscript")} className="w-full rounded-xl border px-4 py-3 min-h-11" style={{ background: "var(--bg-surface)", borderColor: "var(--border-light)" }} />
      <p className="text-xs">{q ? t("lib.matches", { n: shown.length }) : t("lib.transcriptNote")}</p>
      <Card><ul className="space-y-3">{shown.map(({ c, idx }) => (
        <li key={idx} tabIndex={-1} data-lecture-target={`transcript-${idx}`} style={mark("transcript", idx)} className="flex gap-3">
          <span className="shrink-0 w-14 text-xs pt-1 tabular-nums">{clock(c.startMs)}</span>
          <div><span>{c.text}</span> {(refs.get(idx) ?? []).map((ref) => <button key={ref.line} className={chip} style={chipStyle}
            onClick={() => go({ tab: "summary", idx: ref.line }, { tab: "transcript", idx })}>{ref.label}</button>)} {focus?.tab === "transcript" && focus.idx === idx && backButton}</div>
        </li>))}
        {!shown.length && <li>{t("lib.noMatches")}</li>}
      </ul></Card>
      {!transcript.shared && <button className="min-h-11" style={{ color: "var(--danger)" }} onClick={() => setConfirm("delete")}>{t("lib.deleteTranscript")}</button>}
    </> : !error && <Loading>{t("status.connecting")}</Loading>)}
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
    function refresh() {
      void loadLectureCourses().then((courses) => { if (alive) setCourses(courses); }).catch(() => {});
    }
    refresh();
    window.addEventListener("lecture-note-mode-changed", refresh);
    return () => { alive = false; window.removeEventListener("lecture-note-mode-changed", refresh); };
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
