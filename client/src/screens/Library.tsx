import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "../i18n.tsx";
import Icon from "../components/Icon.tsx";
import {
  getJSON,
  postJSON,
  postForm,
  putJSON,
  deleteJSON,
  type Material,
  type MaterialPage,
  type Chapter,
  type Course,
  type ApiError,
} from "../api.ts";
import { useSubscription, handleSubscriptionError } from "../components/SubscriptionGate.tsx";
import { AddButton, Card, ConfirmDialog, ErrorBox, Loading } from "../components/ui.tsx";
import { CourseChip } from "../components/CourseTitle.tsx";
import { hasPendingUpload, takePendingUpload } from "../shareIntake.ts";
import { BASE } from "../base.ts";

import { SavedLecture, LectureShortcuts, type OpenLecture, type LectureCourse } from "../components/SavedLecture.tsx";

type View = "list" | "detail" | "pages" | "transcript";

export default function Library() {
  const { t } = useT();
  const [view, setView] = useState<View>("list");
  const [materials, setMaterials] = useState<Material[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [selected, setSelected] = useState<Material | null>(null);
  const [transcript, setTranscript] = useState<OpenLecture | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setError("");
      setLoading(true);
      const [m, c] = await Promise.all([
        getJSON<{ materials: Material[] }>("/api/materials"),
        getJSON<{ courses: Course[] }>("/api/courses"),
      ]);
      setMaterials(m.materials);
      setCourses(c.courses);
    } catch {
      setError(t("lib.loadFailed"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <Loading>{t("status.connecting")}</Loading>;

  return (
    <div className="space-y-3">
      {view !== "list" && (
        <button
          onClick={() => { setView("list"); setSelected(null); }}
          className="text-sm min-h-11"
          style={{ color: "var(--accent-text)" }}
        >
          ← {t("lib.title")}
        </button>
      )}

      {view === "list" && <LectureLinks onRead={(tr) => { setTranscript(tr); setView("transcript"); }} />}
      {view === "transcript" && transcript && (
        <SavedLecture which={transcript} onDeleted={() => { setView("list"); setTranscript(null); }} />
      )}
      {view === "list" && (
        <MaterialList
          materials={materials}
          courses={courses}
          error={error}
          onSelect={(m) => { setSelected(m); setView("detail"); }}
          onReload={load}
        />
      )}
      {view === "detail" && selected && (
        <MaterialDetail
          material={selected}
          onViewPages={() => setView("pages")}
          onReload={load}
          onBack={() => { setView("list"); setSelected(null); }}
        />
      )}
      {view === "pages" && selected && (
        <PageViewer materialId={selected.id} filename={selected.filename} />
      )}
    </div>
  );
}

/**
 * The university's recorded lectures for the student's courses.
 * - "Watch" opens the lecture on the RU site (the student signs in there).
 * - A student can import their own transcripts: the collector script
 *   (/collector/ru-vod.js) runs on the RU site in their signed-in browser and
 *   saves a .json file, which is imported here. See docs/LECTURE_TRANSCRIPTS_PLAN.md.
 */
export function LectureLinks({ onRead }: { onRead: (t: OpenLecture) => void }) {
  const { t, lang } = useT();
  const [courses, setCourses] = useState<LectureCourse[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const bookmarkRef = useRef<HTMLAnchorElement>(null);

  const load = useCallback(
    () => getJSON<{ courses: LectureCourse[] }>("/api/lectures").then((r) => setCourses(r.courses)).catch(() => {}),
    [],
  );
  useEffect(() => { load(); }, [load]);

  // React refuses javascript: links in JSX, so the bookmark's address is set here.
  useEffect(() => {
    const src = `${window.location.origin}${BASE}/collector/ru-vod.js`;
    bookmarkRef.current?.setAttribute(
      "href",
      `javascript:(function(){var s=document.createElement('script');s.src='${src}?'+Date.now();document.body.appendChild(s)})()`,
    );
  }, [showHelp]);

  async function importFile(file: File) {
    setBusy(true);
    setMessage(null);
    try {
      const bundle = JSON.parse(await file.text());
      const r = await postJSON<{ courses: string[]; saved: number }>("/api/lectures/transcripts/import", bundle);
      setMessage({ ok: true, text: t("lib.importDone", { n: r.saved, course: r.courses.join(", ") }) });
      setOpen(r.courses[0] ?? null);
      await load();
    } catch (e) {
      setMessage({ ok: false, text: (e as ApiError)?.error ?? t("lib.importBad") });
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  if (courses.length === 0) return null;

  return (
    <Card>
      <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>{t("lib.lectures")}</h2>
      <p className="text-xs mt-0.5 mb-2" style={{ color: "var(--text-tertiary)" }}>{t("lib.lecturesHint")}</p>

      <ul className="space-y-1.5">
        {courses.map((c) => {
          const isOpen = open === c.code;
          const saved = c.lectures.filter((l) => l.transcript).length;
          return (
            <li key={c.code} className="rounded-xl border" style={{ borderColor: "var(--border-light)" }}>
              <button
                onClick={() => setOpen(isOpen ? null : c.code)}
                aria-expanded={isOpen}
                className="w-full flex items-center gap-2 px-3 py-3 text-left min-h-11"
              >
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium" style={{ color: "var(--text-primary)" }}>
                    <CourseChip code={c.code} className="mr-1.5" />
                    {lang === "en" && c.name_en ? c.name_en : c.name_th}
                  </span>
                  <span className="block text-xs" style={{ color: "var(--text-tertiary)" }}>
                    {t("lib.lectureCount", { n: c.lectures.length })}
                    {saved > 0 && ` · ${t("lib.transcriptCount", { n: saved })}`}
                  </span>
                </span>
                <span aria-hidden style={{ color: "var(--text-tertiary)" }}>{isOpen ? "▾" : "▸"}</span>
              </button>
              {isOpen && (
                <ul className="px-3 pb-3 space-y-1.5">
                  {c.lectures.map((l) => (
                    <li key={l.no} className="flex flex-wrap items-center gap-2">
                      <span className="flex-1 min-w-0 text-sm" style={{ color: "var(--text-primary)" }}>
                        {t("lib.lectureNo", { n: l.no })}
                        {l.transcript && (
                          <span className="ml-2 text-xs" style={{ color: "var(--text-tertiary)" }}>
                            {t("lib.minutes", { n: l.transcript.minutes })}
                          </span>
                        )}
                      </span>
                      <LectureShortcuts code={c.code} lecture={l} onOpen={onRead}/>
                      {l.transcript && (
                        <button
                          onClick={() => onRead({ code: c.code, lecture: l, tab: "transcript" })}
                          className="rounded-lg px-3 min-h-11 text-sm font-medium"
                          style={{ backgroundColor: "var(--accent)", color: "#fff" }}
                        >
                          {t("lec.transcript")}
                        </button>
                      )}
                      <a
                        href={l.url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center rounded-lg px-3 min-h-11 text-sm font-medium"
                        style={{ backgroundColor: "var(--accent-light)", color: "var(--accent-text)" }}
                      >
                        {t("lib.watch")} ↗
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>

      {/* Import a transcript file made by the collector */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])}
        />
        <button
          onClick={() => fileRef.current?.click()}
          disabled={busy}
          className="rounded-lg border px-3 min-h-11 text-sm font-medium disabled:opacity-50"
          style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
        >
          {busy ? t("lib.importing") : t("lib.importTranscripts")}
        </button>
        <button
          onClick={() => setShowHelp((v) => !v)}
          aria-expanded={showHelp}
          className="text-sm min-h-11 px-1"
          style={{ color: "var(--accent-text)" }}
        >
          {t("lib.howToGet")}
        </button>
      </div>
      {message && (
        <p role="status" className="text-sm mt-2" style={{ color: message.ok ? "var(--success)" : "var(--danger)" }}>
          {message.text}
        </p>
      )}
      {showHelp && (
        <div className="mt-2 rounded-xl p-3 text-sm space-y-2" style={{ backgroundColor: "var(--bg-base)", color: "var(--text-secondary)" }}>
          <p>{t("lib.help.intro")}</p>
          <ol className="list-decimal pl-5 space-y-1">
            <li>
              {t("lib.help.step1")}{" "}
              <a
                ref={bookmarkRef}
                onClick={(e) => e.preventDefault()}
                className="inline-block rounded-lg px-2 py-1 font-medium cursor-grab"
                style={{ backgroundColor: "var(--accent-light)", color: "var(--accent-text)" }}
              >
                {t("app.name")}: {t("lib.help.bookmark")}
              </a>
            </li>
            <li>{t("lib.help.step2")}</li>
            <li>{t("lib.help.step3")}</li>
            <li>{t("lib.help.step4")}</li>
          </ol>
          <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>{t("lib.help.privacy")}</p>
        </div>
      )}
    </Card>
  );
}

function MaterialList({
  materials, courses, error, onSelect, onReload,
}: {
  materials: Material[];
  courses: Course[];
  error: string;
  onSelect: (m: Material) => void;
  onReload: () => void;
}) {
  const { t } = useT();
  // Opens on the upload form when a document was just shared into the app.
  const [showUpload, setShowUpload] = useState(hasPendingUpload);

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>{t("lib.title")}</h1>
        <AddButton label={t("lib.upload")} expanded={showUpload} onClick={() => { setShowUpload(!showUpload); window.scrollTo({ top: 0, behavior: "smooth" }); /* the form opens at the top */ }} />
      </div>

      {error && <ErrorBox onRetry={onReload}>{error}</ErrorBox>}
      {showUpload && <UploadForm courses={courses} onDone={() => { setShowUpload(false); onReload(); }} />}

      {materials.length === 0 ? (
        <p className="text-sm text-center py-8" style={{ color: "var(--text-tertiary)" }}>{t("lib.empty")}</p>
      ) : (
        <ul className="wide-grid space-y-2">
          {materials.map((m) => (
            <li key={m.id}>
              <button onClick={() => onSelect(m)} className="w-full text-left min-h-11">
                <Card>
                  <div className="flex items-center gap-3">
                    <Icon name={m.file_type === "pdf" ? "fileText" : m.file_type === "image" ? "image" : "edit"} size={22} style={{ color: "var(--accent-text)" }} />
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate" style={{ color: "var(--text-primary)" }}>{m.filename}</p>
                      <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                        {m.course_name ?? m.course_code} · {t(`lib.kind.${m.material_kind}`)}
                      </p>
                    </div>
                    <StatusBadge status={m.upload_status} pagesDone={m.pages_done} totalPages={m.total_pages} />
                  </div>
                </Card>
              </button>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function StatusBadge({ status, pagesDone, totalPages }: { status: string; pagesDone: number; totalPages: number | null }) {
  const { t } = useT();

  const styles: Record<string, { bg: string; text: string }> = {
    pending: { bg: "var(--bg-surface-hover)", text: "var(--text-tertiary)" },
    processing: { bg: "var(--warning-bg)", text: "var(--warning)" },
    done: { bg: "var(--success-bg)", text: "var(--success)" },
    error: { bg: "var(--danger-bg)", text: "var(--danger)" },
  };
  const s = styles[status] ?? styles.pending;

  return (
    <span
      className="text-xs font-semibold px-2 py-0.5 rounded-full"
      style={{ backgroundColor: s.bg, color: s.text }}
    >
      {status === "processing" && totalPages
        ? t("lib.pages").replace("{done}", String(pagesDone)).replace("{total}", String(totalPages))
        : t(`lib.status.${status}`)}
    </span>
  );
}

function UploadForm({ courses, onDone }: { courses: Course[]; onDone: () => void }) {
  const { t } = useT();
  const [courseCode, setCourseCode] = useState("");
  const [kind, setKind] = useState("textbook");
  const [uploading, setUploading] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // A document shared from another app: put it in the file field, ready to upload.
  const [sharedName, setSharedName] = useState("");
  useEffect(() => {
    const file = takePendingUpload();
    if (!file || !fileRef.current) return;
    const one = new DataTransfer();
    one.items.add(file);
    fileRef.current.files = one.files;
    setSharedName(file.name);
  }, []);

  async function handleUpload() {
    const file = fileRef.current?.files?.[0];
    if (!courseCode || !file) return;
    setUploading(true);
    setErr("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("course_code", courseCode);
      fd.append("material_kind", kind);
      await postForm<{ id: number }>("/api/materials/upload", fd);
      onDone();
    } catch (e) {
      setErr((e as ApiError)?.error ?? t("lib.uploadFailed"));
    } finally {
      setUploading(false);
    }
  }

  const selectStyle = { backgroundColor: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-primary)" };

  // On a computer: drop a file onto the form instead of using the file picker.
  const [dragging, setDragging] = useState(false);
  const ACCEPT = /\.(pdf|jpe?g|png|heic|heif|webp|txt)$/i;
  function onDrop(e: React.DragEvent) {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files[0];
    if (!file || !fileRef.current) return;
    if (!ACCEPT.test(file.name)) { setErr(t("lib.uploadFailed")); return; }
    const one = new DataTransfer();
    one.items.add(file);
    fileRef.current.files = one.files; // the file field now shows this file
    setErr("");
  }

  return (
    <div
      onDragOver={(e) => { if (Array.from(e.dataTransfer.types).includes("Files")) { e.preventDefault(); setDragging(true); } }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragging(false); }}
      onDrop={onDrop}
      className="relative rounded-2xl"
      style={dragging ? { outline: "2px dashed var(--accent-text)", outlineOffset: 2 } : undefined}
    >
    {dragging && (
      <div
        className="absolute inset-0 z-10 rounded-2xl flex items-center justify-center text-lg font-semibold pointer-events-none"
        style={{ backgroundColor: "color-mix(in srgb, var(--accent-light) 92%, transparent)", color: "var(--accent-text)" }}
      >
        {t("lib.dropHere")}
      </div>
    )}
    <Card>
      <div className="space-y-3">
        <h3 className="font-semibold" style={{ color: "var(--text-primary)" }}>{t("lib.upload")}</h3>
        {err && <ErrorBox>{err}</ErrorBox>}
        <select aria-label={t("field.course")}
          value={courseCode}
          onChange={(e) => setCourseCode(e.target.value)}
          className="w-full rounded-lg border p-2 text-sm min-h-11"
          style={selectStyle}
        >
          <option value="">{t("lib.selectCourse")}</option>
          {courses.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} {c.name_th}
            </option>
          ))}
        </select>
        <select aria-label={t("lib.pickKind")}
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          className="w-full rounded-lg border p-2 text-sm min-h-11"
          style={selectStyle}
        >
          {(["textbook", "past_exam", "notes", "other"] as const).map((k) => (
            <option key={k} value={k}>{t(`lib.kind.${k}`)}</option>
          ))}
        </select>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.heic,.heif,.webp,.txt"
          className="w-full text-sm min-h-11"
          style={{ color: "var(--text-secondary)" }}
        />
        {sharedName && <p role="status" className="text-sm" style={{ color: "var(--text-primary)" }}>{t("lib.sharedFile", { name: sharedName })}</p>}
        <p className="pointer-fine-only text-xs" style={{ color: "var(--text-tertiary)" }}>{t("lib.dropHint")}</p>
        <button
          onClick={handleUpload}
          disabled={!courseCode || uploading}
          className="w-full rounded-lg py-2 text-sm font-medium disabled:opacity-50 min-h-11"
          style={{ backgroundColor: "var(--accent)", color: "#fff" }}
        >
          {uploading ? t("lib.uploading") : t("lib.upload")}
        </button>
      </div>
    </Card>
    </div>
  );
}

function MaterialDetail({
  material, onViewPages, onReload, onBack,
}: {
  material: Material;
  onViewPages: () => void;
  onReload: () => void;
  onBack: () => void;
}) {
  const { t } = useT();
  const { showPaywall } = useSubscription();
  const [busy, setBusy] = useState("");
  const [err, setErr] = useState("");
  const [parsed, setParsed] = useState<number | null>(null);

  useEffect(() => {
    if (material.upload_status !== "processing") return;
    const iv = setInterval(async () => {
      try {
        const s = await getJSON<{ upload_status: string; pages_done: number }>(`/api/materials/${material.id}/status`);
        if (s.upload_status !== "processing") {
          clearInterval(iv);
          onReload();
        }
      } catch { /* ignore */ }
    }, 2000);
    return () => clearInterval(iv);
  }, [material.id, material.upload_status, onReload]);

  async function handleExtract() {
    setBusy("extract");
    setErr("");
    try {
      await postJSON(`/api/materials/${material.id}/process`, {});
      onReload();
    } catch (e) {
      setErr((e as ApiError)?.error ?? t("status.failed"));
    } finally {
      setBusy("");
    }
  }

  async function handleParseExam() {
    setBusy("parse");
    setErr("");
    try {
      const res = await postJSON<{ parsed: number }>(`/api/materials/${material.id}/parse-exam`, {});
      setParsed(res.parsed);
    } catch (e) {
      const err2 = e as ApiError;
      if (handleSubscriptionError(err2, showPaywall)) { setBusy(""); return; }
      setErr(err2?.error ?? t("status.failed"));
    } finally {
      setBusy("");
    }
  }

  const [confirmDelete, setConfirmDelete] = useState(false);
  async function handleDelete() {
    setConfirmDelete(false);
    try {
      await deleteJSON(`/api/materials/${material.id}`);
      onReload();
      onBack();
    } catch (e) {
      setErr((e as ApiError)?.error ?? t("status.failed"));
    }
  }

  const sizeKB = Math.round(material.file_size / 1024);

  return (
    <div className="space-y-3">
      <Card>
        <h2 className="font-bold text-lg truncate" style={{ color: "var(--text-primary)" }}>{material.filename}</h2>
        <div className="flex flex-wrap gap-2 text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>
          <CourseChip code={material.course_code} />
          <span>·</span>
          <span>{t(`lib.kind.${material.material_kind}`)}</span>
          <span>·</span>
          <span>{sizeKB > 1024 ? `${(sizeKB / 1024).toFixed(1)} MB` : `${sizeKB} KB`}</span>
          {material.total_pages && (
            <>
              <span>·</span>
              <span>{material.total_pages} หน้า</span>
            </>
          )}
        </div>
        <div className="mt-2">
          <StatusBadge status={material.upload_status} pagesDone={material.pages_done} totalPages={material.total_pages} />
        </div>
      </Card>

      {err && <ErrorBox>{err}</ErrorBox>}
      {parsed !== null && (
        <div
          className="rounded-xl text-sm px-4 py-3 text-center"
          style={{ backgroundColor: "var(--success-bg)", color: "var(--success)" }}
        >
          {t("lib.parsedN").replace("{n}", String(parsed))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        {material.upload_status === "pending" && (
          <button
            onClick={handleExtract}
            disabled={!!busy}
            className="rounded-lg py-2 text-sm font-medium disabled:opacity-50 min-h-11"
            style={{ backgroundColor: "var(--accent)", color: "#fff" }}
          >
            {busy === "extract" ? t("lib.extracting") : t("lib.extract")}
          </button>
        )}
        {material.upload_status === "done" && (
          <button
            onClick={onViewPages}
            className="rounded-lg py-2 text-sm font-medium min-h-11"
            style={{ backgroundColor: "var(--bg-surface-hover)", color: "var(--text-primary)" }}
          >
            {t("lib.viewPages")}
          </button>
        )}
        {material.upload_status === "done" && material.material_kind === "past_exam" && (
          <button
            onClick={handleParseExam}
            disabled={!!busy}
            className="rounded-lg py-2 text-sm font-medium disabled:opacity-50 min-h-11"
            style={{ backgroundColor: "var(--warning)", color: "var(--text-inverse)" }}
          >
            {busy === "parse" ? t("lib.parsing") : t("lib.parseExam")}
          </button>
        )}
        {confirmDelete && (
          <ConfirmDialog
            title={t("lib.deleteDocTitle")}
            message={t("lib.deleteDocMsg")}
            confirmLabel={t("confirm.delete")}
            cancelLabel={t("nav.cancel")}
            onConfirm={handleDelete}
            onCancel={() => setConfirmDelete(false)}
          />
        )}
        <button
          onClick={() => setConfirmDelete(true)}
          className="rounded-lg py-2 text-sm font-medium min-h-11"
          style={{ backgroundColor: "var(--danger-bg)", color: "var(--danger)" }}
        >
          {t("lib.delete")}
        </button>
      </div>

      {material.upload_status === "done" && (
        <ChapterManager courseCode={material.course_code} materialId={material.id} />
      )}
    </div>
  );
}

function PageViewer({ materialId, filename }: { materialId: number; filename: string }) {
  const { t } = useT();
  const [pages, setPages] = useState<MaterialPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<number | null>(null);
  const [editText, setEditText] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const res = await getJSON<{ pages: MaterialPage[] }>(`/api/materials/${materialId}/pages`);
        setPages(res.pages);
      } catch { /* ignore */ }
      setLoading(false);
    })();
  }, [materialId]);

  async function saveEdit(pageNum: number) {
    try {
      await putJSON(`/api/materials/${materialId}/pages/${pageNum}`, { text: editText });
      setPages((prev) =>
        prev.map((p) => (p.page_num === pageNum ? { ...p, extracted_text: editText, extraction_method: "manual" } : p)),
      );
      setEditing(null);
    } catch { /* ignore */ }
  }

  if (loading) return <Loading>{t("status.connecting")}</Loading>;

  const inputStyle = { borderColor: "var(--border)", backgroundColor: "var(--bg-surface)", color: "var(--text-primary)" };

  return (
    <div className="space-y-3">
      <h2 className="font-bold text-lg truncate" style={{ color: "var(--text-primary)" }}>{filename}</h2>
      {pages.map((p) => (
        <Card key={p.page_num}>
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
              {t("lib.page").replace("{n}", String(p.page_num))}
            </span>
            <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
              {p.extraction_method ? t(`lib.method.${p.extraction_method}`) : ""}
              {p.confidence ? ` (${Math.round(p.confidence * 100)}%)` : ""}
            </span>
          </div>
          {editing === p.page_num ? (
            <div className="space-y-2">
              <textarea aria-label={t("lib.pageText")}
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                rows={6}
                className="w-full border rounded-lg p-2 text-sm"
                style={inputStyle}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => saveEdit(p.page_num)}
                  className="text-sm px-3 py-1 rounded-lg min-h-11"
                  style={{ backgroundColor: "var(--accent)", color: "#fff" }}
                >
                  {t("lib.saveText")}
                </button>
                <button onClick={() => setEditing(null)} className="text-sm min-h-11" style={{ color: "var(--text-tertiary)" }}>
                  ยกเลิก
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm whitespace-pre-wrap line-clamp-6" style={{ color: "var(--text-secondary)" }}>
                {p.extracted_text || t("lib.noText")}
              </p>
              <button
                onClick={() => { setEditing(p.page_num); setEditText(p.extracted_text ?? ""); }}
                className="text-xs mt-1 min-h-11"
                style={{ color: "var(--accent-text)" }}
              >
                {t("lib.editText")}
              </button>
            </>
          )}
        </Card>
      ))}
    </div>
  );
}

function ChapterManager({ courseCode, materialId }: { courseCode: string; materialId: number }) {
  const { t } = useT();
  const { showPaywall } = useSubscription();
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [suggested, setSuggested] = useState<Array<{ name: string; start_page?: number }> | null>(null);
  const [newName, setNewName] = useState("");

  const load = useCallback(async () => {
    try {
      const res = await getJSON<{ chapters: Chapter[] }>(`/api/chapters?course_code=${courseCode}`);
      setChapters(res.chapters);
    } catch { /* ignore */ }
    setLoading(false);
  }, [courseCode]);

  useEffect(() => { load(); }, [load]);

  async function suggestChapters() {
    setBusy("suggest");
    try {
      const res = await postJSON<{ suggested: Array<{ name: string; start_page?: number }> }>("/api/chapters/suggest", {
        material_id: materialId,
      });
      setSuggested(res.suggested);
    } catch (e) {
      const err2 = e as ApiError;
      if (err2?.code) handleSubscriptionError(err2, showPaywall);
    }
    setBusy("");
  }

  async function addSuggested() {
    if (!suggested) return;
    setBusy("add");
    try {
      await postJSON("/api/chapters", { course_code: courseCode, chapters: suggested });
      setSuggested(null);
      await load();
    } catch { /* ignore */ }
    setBusy("");
  }

  async function addManual() {
    if (!newName.trim()) return;
    await postJSON("/api/chapters", { course_code: courseCode, chapters: [{ name: newName.trim() }] });
    setNewName("");
    await load();
  }

  const [removing, setRemoving] = useState<{ id: number; name: string } | null>(null);
  async function deleteChapter(id: number) {
    setRemoving(null);
    await deleteJSON(`/api/chapters/${id}`);
    await load();
  }

  if (loading) return <Loading>{t("status.connecting")}</Loading>;

  return (
    <Card>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold" style={{ color: "var(--text-primary)" }}>{t("chap.title")}</h3>
          <button
            onClick={suggestChapters}
            disabled={!!busy}
            className="text-xs px-2 py-1 rounded-lg disabled:opacity-50 min-h-11"
            style={{ backgroundColor: "var(--accent-light)", color: "var(--accent-text)" }}
          >
            {busy === "suggest" ? t("chap.suggesting") : t("chap.suggest")}
          </button>
        </div>

        {suggested && (
          <div className="space-y-1 rounded-lg p-2" style={{ backgroundColor: "var(--accent-light)" }}>
            {suggested.map((s, i) => (
              <p key={i} className="text-sm" style={{ color: "var(--accent-text)" }}>{s.name}</p>
            ))}
            <button
              onClick={addSuggested}
              disabled={busy === "add"}
              className="text-sm px-3 py-1 rounded-lg mt-1 min-h-11"
              style={{ backgroundColor: "var(--accent)", color: "#fff" }}
            >
              {t("chap.addAll")}
            </button>
          </div>
        )}

        {chapters.length === 0 && !suggested && (
          <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>{t("chap.empty")}</p>
        )}

        <ul className="space-y-1">
          {chapters.map((ch) => (
            <li key={ch.id} className="flex items-center justify-between text-sm">
              <span style={{ color: "var(--text-primary)" }}>{ch.name}</span>
              <button
                onClick={() => setRemoving({ id: ch.id, name: ch.name })}
                aria-label={`${t("confirm.delete")}: ${ch.name}`}
                className="w-11 h-11 -mr-2 flex items-center justify-center text-lg"
                style={{ color: "var(--danger)" }}
              >
                ×
              </button>
            </li>
          ))}
        </ul>
        {removing && (
          <ConfirmDialog
            title={t("lib.deleteChapterTitle", { name: removing.name })}
            message={t("confirm.cannotUndo")}
            confirmLabel={t("confirm.delete")}
            cancelLabel={t("nav.cancel")}
            onConfirm={() => deleteChapter(removing.id)}
            onCancel={() => setRemoving(null)}
          />
        )}

        <div className="flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t("chap.name")}
            className="flex-1 border rounded-lg px-2 py-1 text-sm min-h-11"
            style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-surface)", color: "var(--text-primary)" }}
            onKeyDown={(e) => e.key === "Enter" && addManual()}
          />
          <button
            onClick={addManual}
            disabled={!newName.trim()}
            className="text-sm px-3 py-1 rounded-lg disabled:opacity-50 min-h-11"
            style={{ backgroundColor: "var(--bg-surface-hover)", color: "var(--text-primary)" }}
          >
            +
          </button>
        </div>
      </div>
    </Card>
  );
}
