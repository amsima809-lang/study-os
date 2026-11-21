import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { getJSON, postJSON } from "../api.ts";
import { useT } from "../i18n.tsx";
import { withBase } from "../base.ts";
import { Loading } from "./ui.tsx";
import { OriginalPageThumbnail } from "./OriginalPageThumbnail.tsx";
import type { Answer, SketchState } from "../../../server/src/sketchSchema.js";
import "./sketchNotes.css";

const PageView = lazy(() => import("./SketchPageView.tsx"));

export function SketchNotePage({ noteId, index, src, handwritten, showOriginal = true, onSourcesChanged }: {
  noteId: number; index: number; src: string; handwritten: boolean; showOriginal?: boolean; onSourcesChanged?: () => void;
}) {
  const { lang } = useT();
  const tr = (en: string, th: string) => (lang === "th" ? th : en);
  const base = `/api/notes/${noteId}/sketch/${index}`;
  const [state, setState] = useState<SketchState | null>(null);
  const previous = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!state) return;
    const signature = [base, state.revision, state.verified].join("/");
    if (previous.current && previous.current !== signature) onSourcesChanged?.();
    previous.current = signature;
  }, [base, state, onSourcesChanged]);
  const [error, setError] = useState("");
  const [posting, setPosting] = useState(false);
  const [reload, setReload] = useState(0);
  const [correction, setCorrection] = useState("");
  useEffect(() => {
    setAnswers({});
    setCorrection("");
  }, [state?.revision]);
  const [answers, setAnswers] = useState<Record<number, Answer>>({});
  useEffect(() => {
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    async function refresh() {
      try {
        const s = await getJSON<SketchState>(base);
        if (!live) return;
        setState(s);
        setError("");
        if (s.busy) timer = setTimeout(refresh, 2500);
      } catch {
        if (live) setError(lang === "th" ? "โหลดโน้ตไม่สำเร็จ" : "Could not load this page.");
      }
    }
    void refresh();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [base, reload, lang]);
  async function post(action = "", body: unknown = {}) {
    setPosting(true);
    setError("");
    try {
      const s = await postJSON<SketchState>(base + action, body);
      setState(s);
      setReload((x) => x + 1);
      if (s.busy) onSourcesChanged?.();
    } catch {
      setError(action
        ? tr("Could not save this change. Refresh and try again.", "บันทึกการแก้ไขไม่สำเร็จ โหลดใหม่แล้วลองอีกครั้ง")
        : tr("Could not start the reading. Your original is saved. Try again when ready.", "เริ่มอ่านไม่สำเร็จ ต้นฉบับยังอยู่ ลองอีกครั้งได้"));
    } finally {
      setPosting(false);
    }
  }
  const checks = state?.document?.checks ?? [];
  const disabled = posting || state?.busy;
  const page = state?.document && <Suspense fallback={<Loading>{tr("Loading…", "กำลังโหลด…")}</Loading>}>
    <PageView page={state.document} original={src} />
  </Suspense>;
  return (
    <div className="space-y-3">
      {showOriginal && (handwritten || state?.document) && <OriginalPageThumbnail src={withBase(src)}
        label={handwritten ? undefined : tr("Open the original page", "ดูหน้าต้นฉบับ")}/>}
      {error && (
        <p role="alert">
          {error}{" "}
          <button className="sketch-button" onClick={() => setReload((x) => x + 1)}>
            {tr("Refresh", "โหลดใหม่")}
          </button>
        </p>
      )}
      {!error && !state && <Loading>{tr("Loading…", "กำลังโหลด…")}</Loading>}
      {state?.failed && (
        <p role="alert">
          {tr(
            "This reading could not finish. Your page is saved. You can try again.",
            "AI อ่านไม่สำเร็จ หน้าต้นฉบับยังอยู่ ลองอีกครั้งได้",
          )}
        </p>
      )}
      {state?.busy && (
        <p role="status">{tr("Reading the page. You can return here later.", "กำลังอ่านหน้านี้ กลับมาดูภายหลังได้")}</p>
      )}
      {state && !state.document && !state.busy && (
        <button className="sketch-button" disabled={posting} onClick={() => void post()}>
          {handwritten ? tr("Generate notes from handwriting", "สร้างโน้ตจากลายมือด้วย AI") : tr("Turn this page into notes", "สร้างโน้ตจากภาพหน้านี้")}
        </button>
      )}
      {state?.document && (
        <>
          {showOriginal || !state.included ? page : <details>
            <summary className="min-h-11 cursor-pointer">{tr("View page reading", "ดูผลการอ่านหน้านี้")}</summary>
            {page}
          </details>}
          <fieldset disabled={disabled} className="space-y-3">
            {checks.length > 0 && <legend className="font-semibold">{tr("Please check", "ช่วยตรวจสอบ")}</legend>}
            {checks.map((q, i) => (
              <div key={q.question}>
                <p>
                  {q.line_ids?.length && lang === "th"
                    ? "เส้นเชื่อมเหล่านี้มีลูกศรทั้งสองทิศทางหรือไม่? " + q.your_reading
                    : q.question}
                </p>
                <div className="flex gap-2 my-1">
                  {[true, false].map((yes) => (
                    <button
                      key={String(yes)}
                      className="sketch-button"
                      aria-pressed={answers[i]?.yes === yes}
                      onClick={() =>
                        setAnswers((a) => ({ ...a, [i]: { yes, correction: a[i]?.correction ?? "" } }))
                      }
                    >
                      {yes ? tr("Yes", "ใช่") : tr("No", "ไม่ใช่")}
                    </button>
                  ))}
                </div>
                {answers[i]?.yes === false && (
                  <label className="block">
                    {tr("What should it say?", "แก้เป็นอะไร?")}
                    <input
                      className="w-full border rounded p-2"
                      maxLength={500}
                      value={answers[i]?.correction ?? ""}
                      onChange={(e) =>
                        setAnswers((a) => ({ ...a, [i]: { yes: false, correction: e.target.value } }))
                      }
                    />
                  </label>
                )}
              </div>
            ))}
            <details>
              <summary className="cursor-pointer">{tr("Correct another detail", "แก้ไขรายละเอียดอื่น")}</summary>
              <textarea
                aria-label={tr("Your correction", "ข้อความที่ต้องการแก้ไข")}
                className="w-full rounded border p-2"
                rows={2}
                maxLength={2000}
                value={correction}
                onChange={(e) => setCorrection(e.target.value)}
              />
            </details>
            {(checks.length > 0 || !!correction.trim()) && (
              <button
                className="sketch-button"
                disabled={!checks.every((_, i) => answers[i]?.yes || answers[i]?.correction?.trim())}
                onClick={() =>
                  void post("/answers", {
                    revision: state.revision,
                    answers: checks.map((_, i) => answers[i]),
                    correction,
                    save: true,
                  })
                }
              >
                {tr("Save", "บันทึก")}
              </button>
            )}
          </fieldset>
          {!checks.length &&
            (state.included ? (
              <p>{state.verified ? tr("Transcription checked by you", "คุณตรวจข้อความแล้ว") : tr("Added to lecture notes", "เพิ่มในโน้ตเลกเชอร์แล้ว")}</p>
            ) : (
              <button
                className="sketch-button"
                disabled={disabled || !!correction.trim()}
                onClick={() => void post("/verify", { revision: state.revision })}
              >
                {tr(
                  "Save checked transcription",
                  "บันทึกข้อความที่ตรวจแล้ว",
                )}
              </button>
            ))}
        </>
      )}
    </div>
  );
}

export function SketchNotes({ noteId, imagePaths, handwritingIndex, onSourcesChanged }: {
  noteId: number; imagePaths: string[]; handwritingIndex?: number | null; onSourcesChanged?: () => void;
}) {
  const { lang } = useT();
  const [index, setIndex] = useState(handwritingIndex ?? 0);
  if (!imagePaths.length) return null;
  const active = Math.min(index, imagePaths.length - 1);
  return (
    <section className="space-y-3">
        <h3 className="font-semibold">{handwritingIndex != null
          ? lang === "th" ? "โน้ตจากลายมือ" : "Notes from handwriting"
          : lang === "th" ? "ภาพวาดเป็นโน้ต" : "Notes from drawings"}</h3>
        {imagePaths.length > 1 && (
          <label>
            {lang === "th" ? "หน้า " : "Page "}
            <select className="rounded p-2" value={active} onChange={(e) => setIndex(Number(e.target.value))}>
              {imagePaths.map((_, i) => (
                <option key={i} value={i}>
                  {i + 1} / {imagePaths.length}
                </option>
              ))}
            </select>
          </label>
        )}
        <SketchNotePage key={noteId + "/" + active} noteId={noteId} index={active} src={imagePaths[active]}
          handwritten={active === handwritingIndex} onSourcesChanged={onSourcesChanged}/>
    </section>
  );
}
