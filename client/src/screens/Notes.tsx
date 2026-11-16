import { useEffect, useRef, useState } from "react";
import { useT } from "../i18n.tsx";
import {
  getJSON,
  putJSON,
  postForm,
  postJSON,
  deleteJSON,
  type Course,
  type NoteHit,
  type NoteListItem,
  type NoteDetail,
  type NoteLearning,
  type ApiError,
} from "../api.ts";
import { setUnsaved } from "../unsaved.ts";
import { consumeNoteFormRequest } from "../shareIntake.ts";
import { formatDate, formatTime } from "../format.ts";
import { AddButton, Card, ConfirmDialog, ErrorBox, Loading } from "../components/ui.tsx";
import { DRAFT_CHANGED, clearNoteDraft, isEmptyDraft, loadNoteDraft, saveNoteDraft, type Drawing, type NoteDraft } from "../noteDraft.ts";
import { Markdown } from "../components/Markdown.tsx";
import Icon from "../components/Icon.tsx";
import { CourseChip, CourseTitle } from "../components/CourseTitle.tsx";
import { HandwritingPad, type HandwritingHandle } from "../components/HandwritingPad.tsx";
import { NoteInputBar, type NoteMode } from "../components/NoteInputBar.tsx";
import { drawWithPencilKit, hasNativeInk, inkBlob } from "../nativeInk.ts";
import { useSubscription, handleSubscriptionError } from "../components/SubscriptionGate.tsx";
import { withBase } from "../base.ts";

import { LectureLinks } from "./Library.tsx";
import { SavedLecture, LecturePicker, LectureShortcuts, useLectureCourses, type OpenLecture } from "../components/SavedLecture.tsx";

type CourseGroup = {
  code: string | null;
  name_th: string | null;
  name_en: string | null;
  notes: NoteListItem[];
};

type View =
  | { screen: "courses" }
  | { screen: "course-notes"; group: CourseGroup }
  | { screen: "view"; noteId: number; group?: CourseGroup }
  | { screen: "add" };

export default function Notes() {
  const { t } = useT();
  // Opens straight on the form when something was just shared into the app.
  const [view, setView] = useState<View>(() => (consumeNoteFormRequest() ? { screen: "add" } : { screen: "courses" }));
  const [result, setResult] = useState<NoteLearning | null>(null);
  const [openLecture, setOpenLecture] = useState<OpenLecture | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [query, setQuery] = useState(""); // kept here so it survives opening a result and coming back
  // An unfinished note waiting in this browser (see noteDraft.ts).
  const [draft, setDraft] = useState<NoteDraft | null>(null);
  useEffect(() => {
    const check = () => { void loadNoteDraft().then(setDraft); };
    check();
    window.addEventListener(DRAFT_CHANGED, check);
    return () => window.removeEventListener(DRAFT_CHANGED, check);
  }, []);

  function goBack() {
    if (view.screen === "view" && view.group) {
      setView({ screen: "course-notes", group: view.group });
    } else {
      setView({ screen: "courses" });
      setResult(null);
    }
  }

  if (openLecture) return <div className="space-y-3">
    <button className="min-h-11" onClick={() => setOpenLecture(null)}>← {t("notes.title")}</button>
    <SavedLecture which={openLecture} onDeleted={() => setOpenLecture(null)}/>
  </div>;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>{t("notes.title")}</h1>
        {view.screen !== "add" && (
          <AddButton
            label={t("notes.addShort")}
            onClick={() => {
              setResult(null);
              setView({ screen: "add" });
            }}
          />
        )}
      </div>

      {draft && view.screen !== "add" && (
        <button
          onClick={() => { setResult(null); setView({ screen: "add" }); }}
          className="w-full flex items-center gap-3 rounded-2xl border px-4 py-3 text-left min-h-11"
          style={{ backgroundColor: "var(--accent-light)", borderColor: "var(--accent-text)", color: "var(--text-primary)" }}
        >
          <span className="flex-1 min-w-0">
            <span className="block font-semibold">{t("notes.draftWaiting")}</span>
            <span className="block text-sm truncate" style={{ color: "var(--text-secondary)" }}>
              {draft.title.trim() || draft.text.trim().slice(0, 60) || t(draft.drawing?.strokes.length ? "notes.draftDrawing" : "notes.draftPhotos")}
            </span>
          </span>
          <span className="shrink-0 font-semibold" style={{ color: "var(--accent-text)" }}>{t("notes.draftContinue")}</span>
        </button>
      )}

      {view.screen === "courses" && (
        <>
          {!query.trim() && <LectureLinks onRead={setOpenLecture}/>}
          <NoteSearch query={query} onQuery={setQuery} onOpen={(id) => setView({ screen: "view", noteId: id })} />
          {!query.trim() && (
            <CourseList
              key={refreshKey}
              onSelectGroup={(g) => setView({ screen: "course-notes", group: g })}
            />
          )}
        </>
      )}

      {view.screen === "course-notes" && (
        <CourseNotes
          group={view.group}
          onOpenLecture={setOpenLecture}
          onBack={() => setView({ screen: "courses" })}
          onSelectNote={(id) => setView({ screen: "view", noteId: id, group: view.group })}
        />
      )}

      {view.screen === "view" && (
        <NoteView
          noteId={view.noteId}
          onOpenLecture={setOpenLecture}
          onBack={goBack}
          onDeleted={() => {
            setRefreshKey((k) => k + 1);
            setView({ screen: "courses" });
          }}
        />
      )}

      {view.screen === "add" &&
        (result ? (
          <ResultView
            result={result}
            onDone={() => {
              setRefreshKey((k) => k + 1);
              setView({ screen: "courses" });
              setResult(null);
            }}
          />
        ) : (
          <AddNote
            onCreated={setResult}
            onCancel={() => setView({ screen: "courses" })}
          />
        ))}
    </div>
  );
}

/** Search across all of the student's notes: title, typed text and AI summary. */
function NoteSearch({ query, onQuery, onOpen }: { query: string; onQuery: (q: string) => void; onOpen: (id: number) => void }) {
  const { t, lang } = useT();
  const [hits, setHits] = useState<NoteHit[] | null>(null);
  const [failed, setFailed] = useState(false);
  const q = query.trim();

  useEffect(() => {
    if (!q) { setHits(null); setFailed(false); return; }
    let alive = true;
    // Wait for a pause in typing before asking the server.
    const timer = setTimeout(() => {
      getJSON<{ notes: NoteHit[] }>(`/api/notes/search?q=${encodeURIComponent(q)}`)
        .then((r) => { if (alive) { setHits(r.notes); setFailed(false); } })
        .catch(() => { if (alive) setFailed(true); });
    }, 250);
    return () => { alive = false; clearTimeout(timer); };
  }, [q]);

  return (
    <div className="space-y-2">
      <div className="relative">
        <Icon name="search" size={18} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: "var(--text-tertiary)" }} />
        <input
          type="search"
          value={query}
          onChange={(e) => onQuery(e.target.value)}
          placeholder={t("notes.search")}
          aria-label={t("notes.search")}
          className="w-full rounded-xl border pl-10 pr-3 min-h-11"
          style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-primary)" }}
        />
      </div>
      {q && failed && <ErrorBox />}
      {q && !failed && hits === null && <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>{t("status.connecting")}</p>}
      {q && !failed && hits && (
        <>
          <p role="status" className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            {hits.length === 0 ? t("notes.searchNone", { q }) : t("notes.searchCount", { n: hits.length })}
          </p>
          <ul className="wide-grid space-y-2">
            {hits.map((n) => (
              <li key={n.id}>
                <button
                  onClick={() => onOpen(n.id)}
                  className="w-full text-left rounded-2xl border px-4 py-3 min-h-11"
                  style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border-light)" }}
                >
                  <span className="flex items-center gap-2 flex-wrap">
                    {n.course_code && <CourseChip code={n.course_code} />}
                    <span className="font-medium" style={{ color: "var(--text-primary)" }}>{n.title || `#${n.id}`}</span>
                    <span className="ml-auto text-xs" style={{ color: "var(--text-tertiary)" }}>{formatDate(n.created_at.slice(0, 10), lang)}</span>
                  </span>
                  {n.snippet && <span className="block text-sm mt-1" style={{ color: "var(--text-secondary)" }}>{n.snippet}</span>}
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function CourseList({ onSelectGroup }: { onSelectGroup: (g: CourseGroup) => void }) {
  const { t } = useT();
  const [groups, setGroups] = useState<CourseGroup[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setFailed(false);
    getJSON<{ notes: NoteListItem[] }>("/api/notes")
      .then((d) => {
        const map = new Map<string, CourseGroup>();
        for (const n of d.notes) {
          const key = n.course_code ?? "__none__";
          if (!map.has(key)) {
            map.set(key, {
              code: n.course_code,
              name_th: n.course_name,
              name_en: n.course_name_en,
              notes: [],
            });
          }
          map.get(key)!.notes.push(n);
        }
        setGroups(Array.from(map.values()));
      })
      .catch(() => setFailed(true)); // not "no notes yet": the list could not be read
  }, [attempt]);

  if (failed) return <ErrorBox onRetry={() => setAttempt((n) => n + 1)} />;
  if (!groups) return <Loading>{t("status.connecting")}</Loading>;
  if (groups.length === 0) return <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>{t("notes.empty")}</p>;

  return (
    <ul className="wide-grid space-y-2">
      {groups.map((g) => (
        <li key={g.code ?? "__none__"}>
          <button
            onClick={() => onSelectGroup(g)}
            className="w-full flex items-center gap-3 rounded-xl px-4 py-3 text-left min-h-11"
            style={{ backgroundColor: "var(--bg-surface)", boxShadow: "var(--shadow-sm)" }}
          >
            <Icon name="notebook" size={26} style={{ color: "var(--accent-text)" }} />
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate" style={{ color: "var(--text-primary)" }}>
                {g.code ? (
                  <CourseTitle inline code={g.code} name_th={g.name_th!} name_en={g.name_en} />
                ) : (
                  t("notes.uncategorized")
                )}
              </div>
              <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                {t("notes.noteCount", { n: g.notes.length })}
              </div>
            </div>
            <span style={{ color: "var(--text-tertiary)" }}>›</span>
          </button>
        </li>
      ))}
    </ul>
  );
}

type CourseSummaryResult = {
  summary_md: string;
  key_terms: { term: string; definition: string }[];
  topics_covered: string[];
};

function CourseNotes({
  group,
  onBack,
  onSelectNote,
  onOpenLecture,
}: {
  group: CourseGroup;
  onBack: () => void;
  onSelectNote: (id: number) => void;
  onOpenLecture: (l: OpenLecture) => void;
}) {
  const { t, lang } = useT();
  const { showPaywall } = useSubscription();
  const lectureCourse = useLectureCourses().find((c) => c.code === group.code);
  const [summaryBusy, setSummaryBusy] = useState(false);
  const [summary, setSummary] = useState<CourseSummaryResult | null>(null);
  const [summaryError, setSummaryError] = useState<string | null>(null);

  async function handleSummarize() {
    if (!group.code) return;
    setSummaryBusy(true);
    setSummaryError(null);
    try {
      const r = await postJSON<CourseSummaryResult>("/api/notes/summarize-course", {
        course_code: group.code,
      });
      setSummary(r);
    } catch (e) {
      const err = e as ApiError;
      if (handleSubscriptionError(err, showPaywall)) return;
      setSummaryError(err.code === "AI_NOT_CONFIGURED" ? t("notes.aiNotConfigured") : err.error);
    } finally {
      setSummaryBusy(false);
    }
  }

  if (summaryBusy) return <Loading>{t("notes.summarizing")}</Loading>;

  if (summary) {
    return (
      <div className="space-y-4">
        <button onClick={() => setSummary(null)} className="text-sm min-h-11" style={{ color: "var(--accent-text)" }}>
          {t("notes.backToCourse")}
        </button>

        <h2 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>{t("notes.courseSummary")}</h2>

        <div className="rounded-lg text-xs px-3 py-2" style={{ backgroundColor: "var(--warning-bg)", color: "var(--warning)" }}>
          <Icon name="alertTriangle" size={14} className="inline -mt-0.5" /> {t("notes.disclaimer")}
        </div>

        <Card>
          <Markdown source={summary.summary_md} />
        </Card>

        {summary.key_terms.length > 0 && (
          <Card>
            <h3 className="font-semibold mb-2" style={{ color: "var(--text-primary)" }}>{t("notes.result.terms")}</h3>
            <dl className="space-y-1 text-sm">
              {summary.key_terms.map((k, i) => (
                <div key={i}>
                  <dt className="font-medium inline" style={{ color: "var(--text-primary)" }}>{k.term}: </dt>
                  <dd className="inline" style={{ color: "var(--text-secondary)" }}>{k.definition}</dd>
                </div>
              ))}
            </dl>
          </Card>
        )}

        {summary.topics_covered.length > 0 && (
          <Card>
            <h3 className="font-semibold mb-2" style={{ color: "var(--text-primary)" }}>{t("notes.topicsCovered")}</h3>
            <div className="flex flex-wrap gap-2">
              {summary.topics_covered.map((tag, i) => (
                <span
                  key={i}
                  className="text-xs rounded-full px-2 py-1"
                  style={{ backgroundColor: "var(--accent-light)", color: "var(--accent-text)" }}
                >
                  {tag}
                </span>
              ))}
            </div>
          </Card>
        )}

        <button
          onClick={() => setSummary(null)}
          className="w-full rounded-lg py-2 font-medium min-h-11"
          style={{ backgroundColor: "var(--bg-surface-hover)", color: "var(--text-secondary)" }}
        >
          {t("notes.closeSummary")}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <button onClick={onBack} className="text-sm min-h-11" style={{ color: "var(--accent-text)" }}>
        {t("notes.backToCourse")}
      </button>
      <h2 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>
        {group.code ? (
          <CourseTitle inline code={group.code} name_th={group.name_th!} name_en={group.name_en} />
        ) : (
          t("notes.uncategorized")
        )}
      </h2>
      <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>{t("notes.noteCount", { n: group.notes.length })}</p>

      {group.code && group.notes.length >= 2 && (
        <button
          onClick={handleSummarize}
          className="w-full font-medium rounded-lg py-2.5 min-h-11"
          style={{ backgroundColor: "var(--accent)", color: "#fff" }}
        >
          {t("notes.summarizeAll")}
        </button>
      )}

      {summaryError && <ErrorBox>{summaryError}</ErrorBox>}

      <ul className="space-y-2">
        {group.notes.map((n) => {
          const lecture = lectureCourse?.lectures.find((l) => l.no === n.lecture_no);
          return (
          <li key={n.id}>
            <button
              onClick={() => onSelectNote(n.id)}
              className="w-full text-left rounded-xl px-4 py-3 min-h-11"
              style={{ backgroundColor: "var(--bg-surface)", boxShadow: "var(--shadow-sm)" }}
            >
              <div className="font-medium" style={{ color: "var(--text-primary)" }}>
                {n.title || `#${n.id}`}
              </div>
              <div className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                {formatDate(n.created_at.slice(0, 10), lang)}
              </div>
            </button>
            {lecture && group.code && <LectureShortcuts code={group.code} lecture={lecture} onOpen={onOpenLecture}/>}
          </li>
        ); })}
      </ul>
    </div>
  );
}

function NoteView({ noteId, onBack, onDeleted, onOpenLecture }: { onOpenLecture: (l: OpenLecture) => void; noteId: number; onBack: () => void; onDeleted: () => void }) {
  const { t, lang } = useT();
  const [note, setNote] = useState<NoteDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkError, setLinkError] = useState("");
  const lectureCourse = useLectureCourses().find((c) => c.code === note?.course_code);
  const linked = lectureCourse?.lectures.find((l) => l.no === note?.lecture_no);

  useEffect(() => {
    setLoading(true);
    getJSON<NoteDetail>(`/api/notes/${noteId}`)
      .then(setNote)
      .catch(() => setNote(null))
      .finally(() => setLoading(false));
  }, [noteId]);

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  async function handleDelete() {
    setDeleting(true);
    setDeleteError("");
    try {
      await deleteJSON(`/api/notes/${noteId}`);
      onDeleted();
    } catch (e) {
      setDeleteError((e as ApiError)?.error ?? t("status.failed"));
      setConfirmDelete(false);
      setDeleting(false);
    }
  }

  const { showPaywall } = useSubscription();
  const [aiBusy, setAiBusy] = useState(false);
  const [aiError, setAiError] = useState("");
  /** Summarise this saved note now (one saved while AI was off): same fields as a new note gets. */
  async function summarizeNote() {
    setAiBusy(true);
    setAiError("");
    try {
      setNote(await postJSON<NoteDetail>(`/api/notes/${noteId}/summarize`, {}));
    } catch (e) {
      const err = e as ApiError;
      if (handleSubscriptionError(err, showPaywall)) return;
      setAiError(err.code === "AI_NOT_CONFIGURED" ? t("notes.aiNotConfigured") : err.error ?? t("status.failed"));
    } finally {
      setAiBusy(false);
    }
  }

  if (loading) return <Loading>{t("status.connecting")}</Loading>;
  if (!note) return <ErrorBox>{t("notes.notFound")}</ErrorBox>;

  const hasAi = note.ai_summary_md || note.key_terms.length > 0 || note.ai_mindmap_md;

  /** The note as a Markdown file: the student's own text first, AI parts clearly marked. */
  function downloadText() {
    const parts = [
      `# ${note!.title || `#${note!.id}`}`,
      [note!.course_code, note!.created_at.slice(0, 10)].filter(Boolean).join(" · "),
      note!.raw_text ? `## ${t("notes.text")}\n\n${note!.raw_text}` : "",
      note!.ai_summary_md ? `## ${t("notes.result.summary")} (AI)\n\n> ${t("notes.disclaimer")}\n\n${note!.ai_summary_md}` : "",
      note!.key_terms.length ? `## ${t("notes.result.terms")} (AI)\n\n${note!.key_terms.map((k) => `- **${k.term}**: ${k.definition}`).join("\n")}` : "",
      note!.ai_mindmap_md ? `## ${t("notes.result.mindmap")} (AI)\n\n${note!.ai_mindmap_md}` : "",
    ].filter(Boolean);
    const url = URL.createObjectURL(new Blob([parts.join("\n\n") + "\n"], { type: "text/markdown;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${(note!.title || `note-${note!.id}`).replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 60)}.md`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return (
    <div className="print-area space-y-4">
      <div className="no-print flex items-center gap-2 flex-wrap">
        <button onClick={onBack} className="text-sm min-h-11 mr-auto" style={{ color: "var(--accent-text)" }}>
          {t("notes.backToCourse")}
        </button>
        {/* Export: the browser's print dialog also saves as PDF; the text file opens anywhere. */}
        <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-xl border px-3 min-h-11 text-sm font-medium" style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}>
          <Icon name="printer" size={16} /> {t("notes.exportPdf")}
        </button>
        <button onClick={downloadText} className="inline-flex items-center gap-1.5 rounded-xl border px-3 min-h-11 text-sm font-medium" style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}>
          <Icon name="download" size={16} /> {t("notes.exportText")}
        </button>
      </div>

      <div>
        <h2 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>
          {note.title || `#${note.id}`}
        </h2>
        <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
          {formatDate(note.created_at.slice(0, 10), lang)}
        </p>
      </div>

      <LecturePicker lectures={lectureCourse?.lectures} value={String(note.lecture_no ?? "")} disabled={linkBusy}
        onChange={async (value) => {
          setLinkBusy(true); setLinkError("");
          try { setNote(await putJSON<NoteDetail>(`/api/notes/${noteId}/lecture`, { lecture_no: value ? Number(value) : null })); }
          catch (e) { setLinkError((e as ApiError).error || t("status.failed")); }
          finally { setLinkBusy(false); }
        }}/>
      {linkError && <ErrorBox>{linkError}</ErrorBox>}
      {linked && note.course_code && <LectureShortcuts code={note.course_code} lecture={{ ...linked, image_count: Math.max(linked.image_count, note.image_paths.length) }} onOpen={onOpenLecture}/>}
      <Card>
        <h3 className="font-semibold mb-2 flex items-center gap-1.5" style={{ color: "var(--text-primary)" }}><Icon name="edit" size={16} /> {t("notes.text")}</h3>
        {note.raw_text ? (
          <p className="text-sm whitespace-pre-wrap" style={{ color: "var(--text-secondary)" }}>{note.raw_text}</p>
        ) : (
          <p className="text-sm italic" style={{ color: "var(--text-tertiary)" }}>{t("notes.noContent")}</p>
        )}
      </Card>

      {note.image_paths.length > 0 && (
        <Card>
          <h3 className="font-semibold mb-2 flex items-center gap-1.5" style={{ color: "var(--text-primary)" }}><Icon name="image" size={16} /> {t("notes.images")}</h3>
          <div className="grid grid-cols-2 gap-2">
            {note.image_paths.map((src, i) => (
              <img
                key={i}
                src={withBase(src)}
                alt={`Note image ${i + 1}`}
                className="rounded-lg w-full"
                style={{ border: "1px solid var(--border-light)" }}
              />
            ))}
          </div>
        </Card>
      )}

      {hasAi ? (
        <>
          <div className="rounded-lg text-xs px-3 py-2 flex items-center gap-1" style={{ backgroundColor: "var(--warning-bg)", color: "var(--warning)" }}>
            <Icon name="alertTriangle" size={14} /> {t("notes.disclaimer")}
          </div>

          {note.ai_summary_md && (
            <Card>
              <h3 className="font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
                {t("notes.result.summary")}
              </h3>
              <Markdown source={note.ai_summary_md} />
            </Card>
          )}

          {note.key_terms.length > 0 && (
            <Card>
              <h3 className="font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
                {t("notes.result.terms")}
              </h3>
              <dl className="space-y-1 text-sm">
                {note.key_terms.map((k, i) => (
                  <div key={i}>
                    <dt className="font-medium inline" style={{ color: "var(--text-primary)" }}>{k.term}: </dt>
                    <dd className="inline" style={{ color: "var(--text-secondary)" }}>{k.definition}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          )}

          {note.ai_mindmap_md && note.ai_mindmap_md.trim() && (
            <Card>
              <h3 className="font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
                {t("notes.result.mindmap")}
              </h3>
              <Markdown source={note.ai_mindmap_md} />
            </Card>
          )}

          {note.topics.length > 0 && (
            <Card>
              <h3 className="font-semibold mb-2" style={{ color: "var(--text-primary)" }}>
                {t("notes.result.topics")}
              </h3>
              <div className="flex flex-wrap gap-2">
                {note.topics.map((tag, i) => (
                  <span
                    key={i}
                    className="text-xs rounded-full px-2 py-1"
                    style={{ backgroundColor: "var(--accent-light)", color: "var(--accent-text)" }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            </Card>
          )}
        </>
      ) : (
        <Card>
          <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>{t("notes.noAi")}</p>
          <button
            onClick={summarizeNote}
            disabled={aiBusy}
            className="no-print mt-3 w-full font-medium rounded-lg py-2.5 min-h-11 flex items-center justify-center gap-1.5 disabled:opacity-60"
            style={{ backgroundColor: "var(--accent)", color: "#fff" }}
          >
            <Icon name="sparkles" size={16} /> {aiBusy ? t("notes.summarizingNote") : t("notes.summarizeNote")}
          </button>
          {aiError && <div className="mt-2"><ErrorBox>{aiError}</ErrorBox></div>}
        </Card>
      )}

      {deleteError && <ErrorBox>{deleteError}</ErrorBox>}
      <button
        onClick={() => setConfirmDelete(true)}
        disabled={deleting}
        className="no-print w-full text-sm font-medium py-3 rounded-lg border disabled:opacity-50 min-h-11"
        style={{ color: "var(--danger)", borderColor: "var(--danger-bg)" }}
      >
        {t("notes.delete")}
      </button>
      {/* (the delete button above is hidden when printing) */}
      {confirmDelete && (
        <ConfirmDialog
          title={t("notes.deleteTitle")}
          message={t("confirm.cannotUndo")}
          confirmLabel={t("confirm.delete")}
          cancelLabel={t("nav.cancel")}
          busy={deleting}
          onConfirm={handleDelete}
          onCancel={() => setConfirmDelete(false)}
        />
      )}
    </div>
  );
}

function AddNote({
  onCreated,
  onCancel,
}: {
  onCreated: (r: NoteLearning) => void;
  onCancel: () => void;
}) {
  const { t } = useT();
  const [courses, setCourses] = useState<Course[]>([]);
  const [courseCode, setCourseCode] = useState("");
  const [lectureNo, setLectureNo] = useState("");
  const lectureCourses = useLectureCourses();
  const lectureCourse = lectureCourses.find((c) => c.code === courseCode);
  const noteCourses = [...courses, ...lectureCourses.filter((l) => !courses.some((c) => c.code === l.code))];
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"type" | "draw">("type");
  const [penUsed, setPenUsed] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);
  // In the iOS app, handwriting is Apple's PencilKit page (nativeInk.ts); in a browser, the web pad.
  const native = hasNativeInk();
  async function openInk() {
    try {
      const ink = await drawWithPencilKit(drawing?.ink, { title: title || t("notes.modeDraw"), done: t("ink.done"), cancel: t("ink.cancel") });
      if (ink === undefined) return; // cancelled: keep what was there
      setDrawing(ink ? { strokes: [], pages: 1, ink } : null);
      if (ink) setPenUsed(true);
    } catch {
      setError(t("ink.failed"));
    }
  }
  function chooseMode(m: NoteMode) {
    setMode(m);
    if (m === "draw" && native) void openInk();
  }
  const [files, setFiles] = useState<File[]>([]);
  const [drawing, setDrawing] = useState<Drawing | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Draft handling: `ready` once any saved draft has been read back; `restoredAt`
  // when what is on screen came from a draft; `padKey` remounts the drawing pad.
  const [ready, setReady] = useState(false);
  const [restoredAt, setRestoredAt] = useState<number | null>(null);
  const [padKey, setPadKey] = useState(0);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [draftState, setDraftState] = useState<"saved" | "partial" | "failed">("saved");
  const saved = useRef(false);
  const padRef = useRef<HandwritingHandle>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getJSON<{ courses: Course[] }>("/api/courses")
      .then((d) => setCourses(d.courses))
      .catch(() => setCourses([]));
  }, []);

  // Bring back an unfinished note (after a tab switch, refresh, lock or sign-out).
  useEffect(() => {
    let alive = true;
    loadNoteDraft().then((d) => {
      if (!alive) return;
      if (d) {
        setCourseCode(d.courseCode);
        setLectureNo(d.lectureNo ?? "");
        setTitle(d.title);
        setText(d.text);
        setMode(d.mode);
        setDrawing(d.drawing);
        setFiles(d.files ?? []);
        setRestoredAt(d.savedAt);
      }
      setReady(true);
    });
    return () => { alive = false; };
  }, []);

  // Keep the draft up to date: shortly after each change, and at once when the
  // form goes away (another tab, the session ending) or the page is hidden.
  const latest = useRef({ courseCode, lectureNo, title, text, mode, drawing, files });
  latest.current = { courseCode, lectureNo, title, text, mode, drawing, files };
  useEffect(() => {
    if (!ready) return;
    const timer = setTimeout(() => {
      if (saved.current) return;
      // If the draft cannot be kept on this device, leaving would lose the note: say so before it happens.
      void saveNoteDraft(latest.current).then((outcome) => {
        setDraftState(outcome);
        if (!saved.current) setUnsaved("note", outcome === "failed" ? "leave.note" : outcome === "partial" ? "leave.notePhotos" : null);
      });
    }, 400);
    return () => clearTimeout(timer);
  }, [ready, courseCode, lectureNo, title, text, mode, drawing, files]);
  useEffect(() => {
    if (!ready) return;
    const flush = () => { if (!saved.current) void saveNoteDraft(latest.current); };
    const onHide = () => document.visibilityState === "hidden" && flush();
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
      flush();
      setUnsaved("note", null); // the form is gone: nothing left to warn about
    };
  }, [ready]);

  const hasContent = !isEmptyDraft({ title, text, drawing, files });

  /** Throw the draft away. The form closes right after, so stop any further saving. */
  function discard() {
    saved.current = true;
    setTitle("");
    setText("");
    setFiles([]);
    setDrawing(null);
    setPadKey((k) => k + 1);
    setRestoredAt(null);
    setConfirmDiscard(false);
    void clearNoteDraft();
  }

  function addFiles(list: FileList | File[] | null) {
    // Photos only: this is the same limit as the camera and gallery buttons.
    const images = Array.from(list ?? []).filter((f) => f.type.startsWith("image/"));
    if (images.length) setFiles((prev) => [...prev, ...images]);
  }

  // On a computer: drop photos onto the form, or paste one (a screenshot, a copied image).
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const images = Array.from(e.clipboardData?.files ?? []).filter((f) => f.type.startsWith("image/"));
      if (images.length === 0) return; // ordinary text paste: leave it to the field
      e.preventDefault();
      addFiles(images);
    };
    window.addEventListener("paste", onPaste);
    return () => window.removeEventListener("paste", onPaste);
  }, []);
  const dropHandlers = {
    onDragOver: (e: React.DragEvent) => {
      if (!Array.from(e.dataTransfer.types).includes("Files")) return;
      e.preventDefault();
      setDragging(true);
    },
    onDragLeave: (e: React.DragEvent) => {
      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false);
    },
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      addFiles(e.dataTransfer.files);
    },
  };

  async function submit() {
    setError(null);
    const handwriting =
      mode !== "draw" ? null : native ? (drawing?.ink ? inkBlob(drawing.ink) : null) : await padRef.current?.exportBlob();
    const hasText = mode === "type" && text.trim().length > 0;
    if (!hasText && files.length === 0 && !handwriting) {
      setError(t("notes.needInput"));
      return;
    }
    const form = new FormData();
    if (courseCode) form.append("course_code", courseCode);
    if (lectureNo) form.append("lecture_no", lectureNo);
    if (title) form.append("title", title);
    if (hasText) form.append("raw_text", text);
    for (const f of files) form.append("images", f);
    if (handwriting) form.append("images", handwriting, native ? "handwriting.png" : "handwriting.jpg");

    setBusy(true);
    try {
      const r = await postForm<NoteLearning>("/api/notes", form);
      saved.current = true; // the note is on the server: the draft is no longer needed
      await clearNoteDraft();
      onCreated(r);
    } catch (e) {
      const err = e as ApiError;
      setError(err.code === "AI_NOT_CONFIGURED" ? t("notes.aiNotConfigured") : err.error);
    } finally {
      setBusy(false);
    }
  }

  if (busy) return <Loading>{t("notes.processing")}</Loading>;
  if (!ready) return <Loading>{t("status.connecting")}</Loading>;

  const selectStyle = { backgroundColor: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-primary)" };
  const inputStyle = { borderColor: "var(--border)", backgroundColor: "var(--bg-surface)", color: "var(--text-primary)" };

  return (
    <div {...dropHandlers} className="relative rounded-2xl" style={dragging ? { outline: "2px dashed var(--accent-text)", outlineOffset: 2 } : undefined}>
    {dragging && (
      <div
        className="absolute inset-0 z-10 rounded-2xl flex items-center justify-center text-lg font-semibold pointer-events-none"
        style={{ backgroundColor: "color-mix(in srgb, var(--accent-light) 92%, transparent)", color: "var(--accent-text)" }}
      >
        {t("notes.dropHere")}
      </div>
    )}
    <Card>
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <button onClick={onCancel} className="text-sm min-h-11" style={{ color: "var(--accent-text)" }}>
            {t("notes.backToCourse")}
          </button>
          <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>{t("notes.newTitle")}</h2>
        </div>

        {restoredAt && (
          <div
            role="status"
            className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm"
            style={{ backgroundColor: "var(--accent-light)", color: "var(--text-primary)" }}
          >
            <span className="flex-1">
              {t("notes.draftRestored", { time: formatTime(new Date(restoredAt).toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })) })}
            </span>
            <button onClick={() => setConfirmDiscard(true)} className="shrink-0 min-h-11 px-2 font-medium" style={{ color: "var(--danger)" }}>
              {t("notes.draftDiscard")}
            </button>
          </div>
        )}

        <label className="block text-xs">
          <span style={{ color: "var(--text-tertiary)" }}>{t("notes.course")}</span>
          <select
            value={courseCode}
            onChange={(e) => { setCourseCode(e.target.value); setLectureNo(""); }}
            className="mt-1 w-full rounded-lg border px-3 py-2 min-h-11"
            style={selectStyle}
          >
            <option value="">{t("notes.selectCourse")}</option>
            {noteCourses.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} {c.name_th}
              </option>
            ))}
          </select>
        </label>

        <LecturePicker lectures={lectureCourse?.lectures} value={lectureNo} onChange={setLectureNo}/>

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("notes.noteTitle")}
          className="w-full rounded-lg border px-3 py-2 text-sm min-h-11"
          style={inputStyle}
        />

        <NoteInputBar
          mode={mode}
          onMode={chooseMode}
          textRef={textRef}
          penUsed={penUsed}
          onDictated={(words) => setText((prev) => (prev && !/\s$/.test(prev) ? `${prev} ${words}` : prev + words))}
        />

        {mode === "type" ? (
          <textarea
            ref={textRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            // A pen writing in the box (iPad Scribble turns it into text) lights up the Pen icon.
            onPointerDown={(e) => { if (e.pointerType === "pen") setPenUsed(true); }}
            placeholder={t("notes.textPlaceholder")}
            aria-label={t("notes.textPlaceholder")}
            rows={5}
            className="note-text w-full rounded-lg border px-3 py-2 text-sm"
            style={inputStyle}
          />
        ) : (
          <div>
            {!native && <p className="text-xs mb-1" style={{ color: "var(--text-tertiary)" }}>{t("notes.drawHint")}</p>}
            {native ? (
              <button
                type="button"
                onClick={() => void openInk()}
                className="w-full rounded-lg border overflow-hidden flex flex-col items-center justify-center gap-1 min-h-32"
                style={{ borderColor: "var(--border)", backgroundColor: drawing?.ink ? "#fff" : "var(--bg-surface-hover)" }}
                aria-label={t(drawing?.ink ? "ink.edit" : "ink.open")}
              >
                {drawing?.ink ? (
                  <img src={`data:image/png;base64,${drawing.ink.png}`} alt="" className="w-full max-h-80 object-contain object-top" />
                ) : (
                  <>
                    <Icon name="pen" size={28} style={{ color: "var(--accent-text)" }} />
                    <span className="text-sm font-medium" style={{ color: "var(--text-primary)" }}>{t("ink.open")}</span>
                  </>
                )}
              </button>
            ) : (
              <HandwritingPad key={padKey} ref={padRef} initial={drawing} onChange={setDrawing} onPen={() => setPenUsed(true)} />
            )}
            {native && drawing?.ink && <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>{t("ink.tapToEdit")}</p>}
          </div>
        )}

        <div className="flex gap-2">
          <input
            ref={cameraRef}
            type="file"
            accept="image/*"
            capture="environment"
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <input
            ref={galleryRef}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              addFiles(e.target.files);
              e.target.value = "";
            }}
          />
          <button
            onClick={() => cameraRef.current?.click()}
            className="flex-1 rounded-lg py-2 text-sm font-medium min-h-11"
            style={{ backgroundColor: "var(--bg-surface-hover)", color: "var(--text-primary)" }}
          >
            {t("notes.camera")}
          </button>
          <button
            onClick={() => galleryRef.current?.click()}
            className="flex-1 rounded-lg py-2 text-sm font-medium min-h-11"
            style={{ backgroundColor: "var(--bg-surface-hover)", color: "var(--text-primary)" }}
          >
            {t("notes.gallery")}
          </button>
        </div>

        {/* Only where there is a mouse: phones have the two buttons above. */}
        <p className="pointer-fine-only text-xs" style={{ color: "var(--text-tertiary)" }}>{t("notes.dropHint")}</p>

        {files.length > 0 && (
          <div>
            <p className="text-xs mb-1" style={{ color: "var(--text-tertiary)" }}>{t("notes.photoCount", { n: files.length })}</p>
            <div className="flex flex-wrap gap-2">
              {files.map((f, i) => (
                <div key={i} className="relative">
                  <img
                    src={URL.createObjectURL(f)}
                    alt=""
                    className="w-16 h-16 object-cover rounded-lg"
                    style={{ border: "1px solid var(--border-light)" }}
                  />
                  <button
                    onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                    className="tap-area absolute -top-2 -right-2 rounded-full w-6 h-6 text-sm leading-none"
                    style={{ backgroundColor: "var(--danger)", color: "var(--text-inverse)" }}
                    aria-label={t("notes.removeImage")}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {error && <ErrorBox>{error}</ErrorBox>}

        <div className="flex gap-2 pt-1">
          <button
            onClick={submit}
            className="flex-1 font-medium rounded-lg py-2 min-h-11"
            style={{ backgroundColor: "var(--accent)", color: "#fff" }}
          >
            {t("notes.submit")}
          </button>
          <button
            onClick={() => (hasContent ? setConfirmDiscard(true) : onCancel())}
            className="px-4 min-h-11"
            style={{ color: "var(--text-tertiary)" }}
          >
            {t("notes.cancel")}
          </button>
        </div>
        <p className="text-xs text-center" style={{ color: "var(--text-tertiary)" }}>{t("notes.saveHint")}</p>
        {hasContent && draftState === "saved" && <p className="text-xs text-center" style={{ color: "var(--text-tertiary)" }}>{t("notes.draftKept")}</p>}
        {hasContent && draftState !== "saved" && (
          <p role="alert" className="text-xs text-center font-medium" style={{ color: "var(--danger)" }}>
            {t(draftState === "failed" ? "leave.note" : "leave.notePhotos")}
          </p>
        )}
        {confirmDiscard && (
          <ConfirmDialog
            title={t("notes.draftDiscardTitle")}
            message={t("notes.draftDiscardMsg")}
            confirmLabel={t("notes.draftDiscard")}
            cancelLabel={t("notes.draftKeep")}
            onConfirm={() => { discard(); onCancel(); }}
            onCancel={() => setConfirmDiscard(false)}
          />
        )}
      </div>
    </Card>
    </div>
  );
}

function ResultView({ result, onDone }: { result: NoteLearning; onDone: () => void }) {
  const { t } = useT();

  if (result.ai_skipped) {
    return (
      <div className="space-y-4">
        <div className="rounded-lg text-sm px-3 py-2 flex items-center gap-1" style={{ backgroundColor: "var(--success-bg)", color: "var(--success)" }}>
          <Icon name="checkCircle" size={16} /> {t("notes.saved")}
        </div>
        <div className="rounded-lg text-xs px-3 py-2 flex items-center gap-1" style={{ backgroundColor: "var(--warning-bg)", color: "var(--warning)" }}>
          <Icon name="lightbulb" size={14} /> {t("notes.aiNotConfigured")}
        </div>
        <button
          onClick={onDone}
          className="w-full rounded-lg py-2 font-medium min-h-11"
          style={{ backgroundColor: "var(--bg-surface-hover)", color: "var(--text-secondary)" }}
        >
          {t("notes.back")}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg text-sm px-3 py-2 flex items-center gap-1" style={{ backgroundColor: "var(--success-bg)", color: "var(--success)" }}>
        <Icon name="checkCircle" size={16} /> {t("notes.saved")}
      </div>
      <div className="rounded-lg text-xs px-3 py-2 flex items-center gap-1" style={{ backgroundColor: "var(--warning-bg)", color: "var(--warning)" }}>
        <Icon name="alertTriangle" size={14} /> {t("notes.disclaimer")}
      </div>

      {result.summary_md && (
        <Card>
          <h2 className="font-semibold mb-2" style={{ color: "var(--text-primary)" }}>{t("notes.result.summary")}</h2>
          <Markdown source={result.summary_md} />
        </Card>
      )}

      {result.key_terms.length > 0 && (
        <Card>
          <h2 className="font-semibold mb-2" style={{ color: "var(--text-primary)" }}>{t("notes.result.terms")}</h2>
          <dl className="space-y-1 text-sm">
            {result.key_terms.map((k, i) => (
              <div key={i}>
                <dt className="font-medium inline" style={{ color: "var(--text-primary)" }}>{k.term}: </dt>
                <dd className="inline" style={{ color: "var(--text-secondary)" }}>{k.definition}</dd>
              </div>
            ))}
          </dl>
        </Card>
      )}

      {result.mindmap_md.trim() && (
        <Card>
          <h2 className="font-semibold mb-2" style={{ color: "var(--text-primary)" }}>{t("notes.result.mindmap")}</h2>
          <Markdown source={result.mindmap_md} />
        </Card>
      )}

      {result.topics.length > 0 && (
        <Card>
          <h2 className="font-semibold mb-2" style={{ color: "var(--text-primary)" }}>{t("notes.result.topics")}</h2>
          <div className="flex flex-wrap gap-2">
            {result.topics.map((tag, i) => (
              <span
                key={i}
                className="text-xs rounded-full px-2 py-1"
                style={{ backgroundColor: "var(--accent-light)", color: "var(--accent-text)" }}
              >
                {tag}
              </span>
            ))}
          </div>
        </Card>
      )}

      <button
        onClick={onDone}
        className="w-full rounded-lg py-2 font-medium min-h-11"
        style={{ backgroundColor: "var(--bg-surface-hover)", color: "var(--text-secondary)" }}
      >
        {t("notes.back")}
      </button>
    </div>
  );
}
