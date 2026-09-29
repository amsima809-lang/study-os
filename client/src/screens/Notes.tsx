import { useEffect, useRef, useState } from "react";
import { useT } from "../i18n.tsx";
import {
  getJSON,
  postForm,
  type Course,
  type NoteListItem,
  type NoteLearning,
  type ApiError,
} from "../api.ts";
import { formatDate } from "../format.ts";
import { Card, ErrorBox, Loading } from "../components/ui.tsx";
import { Markdown } from "../components/Markdown.tsx";
import { CourseTitle } from "../components/CourseTitle.tsx";
import { HandwritingPad, type HandwritingHandle } from "../components/HandwritingPad.tsx";

type Mode = "list" | "add";

export default function Notes() {
  const { t } = useT();
  const [mode, setMode] = useState<Mode>("list");
  const [result, setResult] = useState<NoteLearning | null>(null);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold text-slate-800">{t("notes.title")}</h1>
        {mode === "list" && (
          <button
            onClick={() => {
              setResult(null);
              setMode("add");
            }}
            className="bg-indigo-600 text-white text-sm font-medium rounded-full px-4 py-1.5"
          >
            {t("notes.add")}
          </button>
        )}
      </div>

      {mode === "list" && <NotesList />}
      {mode === "add" &&
        (result ? (
          <ResultView result={result} onDone={() => setMode("list")} />
        ) : (
          <AddNote onCreated={setResult} onCancel={() => setMode("list")} />
        ))}
    </div>
  );
}

function NotesList() {
  const { t, lang } = useT();
  const [notes, setNotes] = useState<NoteListItem[] | null>(null);

  useEffect(() => {
    getJSON<{ notes: NoteListItem[] }>("/api/notes")
      .then((d) => setNotes(d.notes))
      .catch(() => setNotes([]));
  }, []);

  if (!notes) return <Loading>{t("status.connecting")}</Loading>;
  if (notes.length === 0) return <p className="text-slate-400 text-sm">{t("notes.empty")}</p>;

  return (
    <ul className="space-y-2">
      {notes.map((n) => (
        <Card key={n.id}>
          <div className="font-medium text-slate-800">
            {n.title ? (
              n.title
            ) : n.course_name ? (
              <CourseTitle inline code={n.course_code} name_th={n.course_name} name_en={n.course_name_en} />
            ) : (
              `#${n.id}`
            )}
          </div>
          <div className="text-xs text-slate-400 flex gap-1 flex-wrap">
            {n.title && n.course_name && (
              <CourseTitle
                inline
                code={n.course_code}
                name_th={n.course_name}
                name_en={n.course_name_en}
                className="text-slate-400"
              />
            )}
            {(n.title && n.course_name ? "· " : "") + formatDate(n.created_at.slice(0, 10), lang)}
          </div>
        </Card>
      ))}
    </ul>
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
  const [title, setTitle] = useState("");
  const [text, setText] = useState("");
  const [mode, setMode] = useState<"type" | "draw">("type");
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const padRef = useRef<HandwritingHandle>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const galleryRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    getJSON<{ courses: Course[] }>("/api/courses")
      .then((d) => setCourses(d.courses))
      .catch(() => setCourses([]));
  }, []);

  function addFiles(list: FileList | null) {
    if (list) setFiles((prev) => [...prev, ...Array.from(list)]);
  }

  async function submit() {
    setError(null);
    const handwriting = mode === "draw" ? await padRef.current?.exportBlob() : null;
    const hasText = mode === "type" && text.trim().length > 0;
    if (!hasText && files.length === 0 && !handwriting) {
      setError(t("notes.needInput"));
      return;
    }
    const form = new FormData();
    if (courseCode) form.append("course_code", courseCode);
    if (title) form.append("title", title);
    if (hasText) form.append("raw_text", text);
    for (const f of files) form.append("images", f);
    if (handwriting) form.append("images", handwriting, "handwriting.jpg");

    setBusy(true);
    try {
      const r = await postForm<NoteLearning>("/api/notes", form);
      onCreated(r);
    } catch (e) {
      const err = e as ApiError;
      setError(err.code === "AI_NOT_CONFIGURED" ? t("notes.aiNotConfigured") : err.error);
    } finally {
      setBusy(false);
    }
  }

  if (busy) return <Loading>{t("notes.processing")}</Loading>;

  return (
    <Card>
      <div className="space-y-3">
        <h2 className="font-semibold text-slate-700">{t("notes.newTitle")}</h2>

        <label className="block text-sm">
          <span className="text-slate-500">{t("notes.course")}</span>
          <select
            value={courseCode}
            onChange={(e) => setCourseCode(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 bg-white"
          >
            <option value="">{t("notes.selectCourse")}</option>
            {courses.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} {c.name_th}
              </option>
            ))}
          </select>
        </label>

        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("notes.noteTitle")}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
        />

        {/* input mode: type or handwrite */}
        <div className="flex gap-2">
          {(["type", "draw"] as const).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`flex-1 rounded-lg py-2 text-sm font-medium ${
                mode === m ? "bg-indigo-600 text-white" : "bg-slate-100 text-slate-500"
              }`}
            >
              {t(m === "type" ? "notes.modeType" : "notes.modeDraw")}
            </button>
          ))}
        </div>

        {mode === "type" ? (
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={t("notes.textPlaceholder")}
            rows={5}
            className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
          />
        ) : (
          <div>
            <p className="text-xs text-slate-400 mb-1">{t("notes.drawHint")}</p>
            <HandwritingPad ref={padRef} />
          </div>
        )}

        {/* photo buttons — camera + gallery */}
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
            className="flex-1 bg-slate-100 text-slate-700 rounded-lg py-2 text-sm font-medium"
          >
            {t("notes.camera")}
          </button>
          <button
            onClick={() => galleryRef.current?.click()}
            className="flex-1 bg-slate-100 text-slate-700 rounded-lg py-2 text-sm font-medium"
          >
            {t("notes.gallery")}
          </button>
        </div>

        {/* image thumbnails */}
        {files.length > 0 && (
          <div>
            <p className="text-xs text-slate-400 mb-1">{t("notes.photoCount", { n: files.length })}</p>
            <div className="flex flex-wrap gap-2">
              {files.map((f, i) => (
                <div key={i} className="relative">
                  <img
                    src={URL.createObjectURL(f)}
                    alt=""
                    className="w-16 h-16 object-cover rounded-lg border border-slate-200"
                  />
                  <button
                    onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}
                    className="absolute -top-1.5 -right-1.5 bg-red-500 text-white rounded-full w-5 h-5 text-xs leading-none"
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
            className="flex-1 bg-indigo-600 text-white font-medium rounded-lg py-2"
          >
            {t("notes.submit")}
          </button>
          <button onClick={onCancel} className="px-4 text-slate-500">
            {t("notes.cancel")}
          </button>
        </div>
      </div>
    </Card>
  );
}

function ResultView({ result, onDone }: { result: NoteLearning; onDone: () => void }) {
  const { t } = useT();
  return (
    <div className="space-y-4">
      <div className="rounded-lg bg-amber-50 text-amber-700 text-xs px-3 py-2">
        ⚠️ {t("notes.disclaimer")}
      </div>

      <Card>
        <h2 className="font-semibold text-slate-700 mb-2">{t("notes.result.summary")}</h2>
        <Markdown source={result.summary_md} />
      </Card>

      {result.key_terms.length > 0 && (
        <Card>
          <h2 className="font-semibold text-slate-700 mb-2">{t("notes.result.terms")}</h2>
          <dl className="space-y-1 text-sm">
            {result.key_terms.map((k, i) => (
              <div key={i}>
                <dt className="font-medium text-slate-800 inline">{k.term}: </dt>
                <dd className="text-slate-600 inline">{k.definition}</dd>
              </div>
            ))}
          </dl>
        </Card>
      )}

      {result.mindmap_md.trim() && (
        <Card>
          <h2 className="font-semibold text-slate-700 mb-2">{t("notes.result.mindmap")}</h2>
          <Markdown source={result.mindmap_md} />
        </Card>
      )}

      {result.topics.length > 0 && (
        <Card>
          <h2 className="font-semibold text-slate-700 mb-2">{t("notes.result.topics")}</h2>
          <div className="flex flex-wrap gap-2">
            {result.topics.map((tag, i) => (
              <span key={i} className="bg-indigo-50 text-indigo-600 text-xs rounded-full px-2 py-1">
                {tag}
              </span>
            ))}
          </div>
        </Card>
      )}

      <button onClick={onDone} className="w-full bg-slate-100 text-slate-600 rounded-lg py-2">
        {t("notes.back")}
      </button>
    </div>
  );
}
