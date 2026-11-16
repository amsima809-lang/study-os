import { useEffect, useState } from "react";
import { getJSON, putJSON, postJSON, type ApiError } from "../api.ts";
import { useT } from "../i18n.tsx";
import type { CreatedLectureNotes } from "../combinedLectureNotes.ts";
import { SavedPersonalPassage } from "./PersonalLectureNotes.tsx";
import { Markdown } from "./Markdown.tsx";
import "./createdLectureNotes.css";

type Mode = CreatedLectureNotes["mode"];
type State = { mode: Mode; created: CreatedLectureNotes | null };

export function LectureLayout({ code, sessionNo, mode, onChange }: {
  code: string; sessionNo: number; mode: Mode; onChange: (mode: Mode) => void;
}) {
  const { t, lang } = useT();
  const th = lang === "th";
  const [pending, setPending] = useState<Mode | null>(null);
  const selected = pending ?? mode;
  const [error, setError] = useState(false);
  async function choose(next: Mode) {
    if (pending || next === mode) return;
    setPending(next);
    setError(false);
    try {
      await putJSON(`/api/lectures/${encodeURIComponent(code)}/${sessionNo}/note-preference`, { mode: next });
      onChange(next);
      window.dispatchEvent(new CustomEvent("lecture-note-mode-changed", { detail: { code, sessionNo, mode: next } }));
    } catch {
      setError(true);
    } finally {
      setPending(null);
    }
  }
  return <fieldset disabled={!!pending} className="rounded-lg border px-3 flex flex-wrap gap-x-5 text-sm" style={{ borderColor: "var(--border)" }}>
    <legend className="px-1 font-medium">{th ? "รูปแบบสำหรับบทเรียนนี้" : "Layout for this lecture"}</legend>
    <label className="min-h-11 inline-flex items-center gap-2">
      <input type="radio" name="lecture-layout" checked={selected === "separate"} onChange={() => void choose("separate")}/>
      {th ? "แยกสรุปและโน้ต" : "Keep summary and notes separate"}
    </label>
    <label className="min-h-11 inline-flex items-center gap-2">
      <input type="radio" name="lecture-layout" checked={selected === "combined"} onChange={() => void choose("combined")}/>
      {th ? "รวมสรุปกับโน้ต" : "Combine summary and notes"}
    </label>
    {error && <p role="alert" className="w-full mb-2" style={{ color: "var(--danger)" }}>{t("status.failed")}</p>}
  </fieldset>;
}

export function CreateLectureNotes({ code, sessionNo, inline, onCreated }: {
  code: string;
  sessionNo: number;
  inline: boolean;
  onCreated: (created: CreatedLectureNotes | null) => void;
}) {
  const { t, lang } = useT();
  const th = lang === "th",
    path = `/api/lectures/${encodeURIComponent(code)}/${sessionNo}/created-notes`;
  const [state, setState] = useState<State | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    getJSON<State>(path)
      .then((s) => {
        if (active) {
          setState(s);
          onCreated(s.created);
          setError("");
        }
      })
      .catch(() => {
        if (active) setError(t("status.failed"));
      });
    return () => {
      active = false;
    };
  }, [path, reload, t, onCreated]);
  async function create() {
    if (!state) return;
    setBusy(true);
    setError("");
    try {
      const created = await postJSON<CreatedLectureNotes>(path, {});
      setState({ ...state, created });
      onCreated(created);
    } catch (e) {
      setError((e as ApiError).error || t("status.failed"));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="rounded-xl border p-3 space-y-3" style={{ borderColor: "var(--border)" }}>
      <h3 className="font-semibold">{th ? "สร้างโน้ตด้วย AI" : "Create notes with AI"}</h3>
      {state && (
        <>
          <button
            type="button"
            className="rounded-lg px-4 min-h-11 text-white"
            style={{ background: "var(--accent)" }}
            disabled={busy}
            onClick={() => void create()}
          >
            {busy ? "…" : th ? "สร้างโน้ต" : "Create notes"}
          </button>
          {state.created && !inline && (
            <details key={state.created.version}>
              <summary className="cursor-pointer py-2 font-medium">
                {th ? "สำเนาที่สร้างไว้" : "Saved generated copy"} · {state.created.mode === "combined" ? t("lec.summaryAndNotes") : t("lec.notes")}
              </summary>
              <p className="text-xs my-2" style={{ color: "var(--warning)" }}>
                {t("notes.disclaimer")}
              </p>
              {!state.created.blocks.some((b) => b.kind === "mine") && (
                <p className="text-sm mb-2">
                  {th
                    ? "เพิ่มข้อความของคุณโดยเลือกบทเรียนนี้ในโน้ต หรือบันทึกข้อความจากลายมือบนสรุป แล้วกดสร้างโน้ตอีกครั้ง"
                    : "To include your words, choose this lecture on a saved note or confirm a pen note’s text. Then create notes again."}
                </p>
              )}
              <div className="space-y-2">
                {state.created.blocks.map((b, i) =>
                  b.kind === "summary" ? (
                    <div key={i}>
                      {state.created?.blocks[i - 1]?.kind !== "summary" && (
                        <small>{th ? "สรุปบทเรียน" : "Lecture summary"}</small>
                      )}
                      <Markdown source={b.text} />
                    </div>
                  ) : (
                    <SavedPersonalPassage key={i} passage={b}/>
                  ),
                )}
              </div>
            </details>
          )}
        </>
      )}
      {error && (
        <p role="alert" className="text-sm" style={{ color: "var(--danger)" }}>
          {error}
          {!state && (
            <button onClick={() => setReload((n) => n + 1)} className="ml-2 underline">
              {th ? "ลองอีกครั้ง" : "Try again"}
            </button>
          )}
        </p>
      )}
    </section>
  );
}
