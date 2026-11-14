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
import { Card, ErrorBox, Loading } from "../components/ui.tsx";

type View = "list" | "detail" | "pages";

export default function Library() {
  const { t } = useT();
  const [view, setView] = useState<View>("list");
  const [materials, setMaterials] = useState<Material[]>([]);
  const [courses, setCourses] = useState<Course[]>([]);
  const [selected, setSelected] = useState<Material | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      setLoading(true);
      const [m, c] = await Promise.all([
        getJSON<{ materials: Material[] }>("/api/materials"),
        getJSON<{ courses: Course[] }>("/api/courses"),
      ]);
      setMaterials(m.materials);
      setCourses(c.courses);
    } catch {
      setError("โหลดข้อมูลไม่สำเร็จ");
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
          className="text-sm"
          style={{ color: "var(--accent-text)" }}
        >
          ← {t("lib.title")}
        </button>
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
  const [showUpload, setShowUpload] = useState(false);

  return (
    <>
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>{t("lib.title")}</h1>
        <button
          onClick={() => setShowUpload(!showUpload)}
          className="w-10 h-10 rounded-full text-xl flex items-center justify-center"
          style={{ backgroundColor: "var(--accent)", color: "var(--text-inverse)" }}
        >
          +
        </button>
      </div>

      {error && <ErrorBox>{error}</ErrorBox>}
      {showUpload && <UploadForm courses={courses} onDone={() => { setShowUpload(false); onReload(); }} />}

      {materials.length === 0 ? (
        <p className="text-sm text-center py-8" style={{ color: "var(--text-tertiary)" }}>{t("lib.empty")}</p>
      ) : (
        <ul className="space-y-2">
          {materials.map((m) => (
            <li key={m.id}>
              <button onClick={() => onSelect(m)} className="w-full text-left">
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
      className="text-xs px-2 py-0.5 rounded-full"
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
      setErr((e as ApiError)?.error ?? "อัปโหลดไม่สำเร็จ");
    } finally {
      setUploading(false);
    }
  }

  const selectStyle = { backgroundColor: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-primary)" };

  return (
    <Card>
      <div className="space-y-3">
        <h3 className="font-medium" style={{ color: "var(--text-primary)" }}>{t("lib.upload")}</h3>
        {err && <ErrorBox>{err}</ErrorBox>}
        <select
          value={courseCode}
          onChange={(e) => setCourseCode(e.target.value)}
          className="w-full rounded-lg border p-2 text-sm"
          style={selectStyle}
        >
          <option value="">{t("lib.selectCourse")}</option>
          {courses.map((c) => (
            <option key={c.code} value={c.code}>
              {c.code} {c.name_th}
            </option>
          ))}
        </select>
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          className="w-full rounded-lg border p-2 text-sm"
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
          className="w-full text-sm"
          style={{ color: "var(--text-secondary)" }}
        />
        <button
          onClick={handleUpload}
          disabled={!courseCode || uploading}
          className="w-full rounded-lg py-2 text-sm font-medium disabled:opacity-50"
          style={{ backgroundColor: "var(--accent)", color: "var(--text-inverse)" }}
        >
          {uploading ? "กำลังอัปโหลด…" : t("lib.upload")}
        </button>
      </div>
    </Card>
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
      setErr((e as ApiError)?.error ?? "ผิดพลาด");
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
      setErr(err2?.error ?? "ผิดพลาด");
    } finally {
      setBusy("");
    }
  }

  async function handleDelete() {
    if (!confirm("ลบเอกสารนี้?")) return;
    try {
      await deleteJSON(`/api/materials/${material.id}`);
      onReload();
      onBack();
    } catch (e) {
      setErr((e as ApiError)?.error ?? "ลบไม่สำเร็จ");
    }
  }

  const sizeKB = Math.round(material.file_size / 1024);

  return (
    <div className="space-y-3">
      <Card>
        <h2 className="font-bold text-lg truncate" style={{ color: "var(--text-primary)" }}>{material.filename}</h2>
        <div className="flex flex-wrap gap-2 text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>
          <span>{material.course_code}</span>
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
            className="rounded-lg py-2 text-sm font-medium disabled:opacity-50"
            style={{ backgroundColor: "var(--accent)", color: "var(--text-inverse)" }}
          >
            {busy === "extract" ? t("lib.extracting") : t("lib.extract")}
          </button>
        )}
        {material.upload_status === "done" && (
          <button
            onClick={onViewPages}
            className="rounded-lg py-2 text-sm font-medium"
            style={{ backgroundColor: "var(--bg-surface-hover)", color: "var(--text-primary)" }}
          >
            {t("lib.viewPages")}
          </button>
        )}
        {material.upload_status === "done" && material.material_kind === "past_exam" && (
          <button
            onClick={handleParseExam}
            disabled={!!busy}
            className="rounded-lg py-2 text-sm font-medium disabled:opacity-50"
            style={{ backgroundColor: "var(--warning)", color: "var(--text-inverse)" }}
          >
            {busy === "parse" ? t("lib.parsing") : t("lib.parseExam")}
          </button>
        )}
        <button
          onClick={handleDelete}
          className="rounded-lg py-2 text-sm font-medium"
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
      <h2 className="font-bold" style={{ color: "var(--text-primary)" }}>{filename}</h2>
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
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                rows={6}
                className="w-full border rounded-lg p-2 text-sm"
                style={inputStyle}
              />
              <div className="flex gap-2">
                <button
                  onClick={() => saveEdit(p.page_num)}
                  className="text-sm px-3 py-1 rounded-lg"
                  style={{ backgroundColor: "var(--accent)", color: "var(--text-inverse)" }}
                >
                  {t("lib.saveText")}
                </button>
                <button onClick={() => setEditing(null)} className="text-sm" style={{ color: "var(--text-tertiary)" }}>
                  ยกเลิก
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="text-sm whitespace-pre-wrap line-clamp-6" style={{ color: "var(--text-secondary)" }}>
                {p.extracted_text || "(ไม่มีข้อความ)"}
              </p>
              <button
                onClick={() => { setEditing(p.page_num); setEditText(p.extracted_text ?? ""); }}
                className="text-xs mt-1"
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

  async function deleteChapter(id: number) {
    await deleteJSON(`/api/chapters/${id}`);
    await load();
  }

  if (loading) return <Loading>{t("status.connecting")}</Loading>;

  return (
    <Card>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-medium" style={{ color: "var(--text-primary)" }}>{t("chap.title")}</h3>
          <button
            onClick={suggestChapters}
            disabled={!!busy}
            className="text-xs px-2 py-1 rounded-lg disabled:opacity-50"
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
              className="text-sm px-3 py-1 rounded-lg mt-1"
              style={{ backgroundColor: "var(--accent)", color: "var(--text-inverse)" }}
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
              <button onClick={() => deleteChapter(ch.id)} className="text-xs" style={{ color: "var(--danger)" }}>
                ×
              </button>
            </li>
          ))}
        </ul>

        <div className="flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder={t("chap.name")}
            className="flex-1 border rounded-lg px-2 py-1 text-sm"
            style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-surface)", color: "var(--text-primary)" }}
            onKeyDown={(e) => e.key === "Enter" && addManual()}
          />
          <button
            onClick={addManual}
            disabled={!newName.trim()}
            className="text-sm px-3 py-1 rounded-lg disabled:opacity-50"
            style={{ backgroundColor: "var(--bg-surface-hover)", color: "var(--text-primary)" }}
          >
            +
          </button>
        </div>
      </div>
    </Card>
  );
}
