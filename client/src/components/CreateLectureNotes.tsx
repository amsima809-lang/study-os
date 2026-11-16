import { useEffect, useState, type CSSProperties } from "react";
import { getJSON, putJSON, postJSON, type ApiError } from "../api.ts";
import { useT } from "../i18n.tsx";
import { readableInk } from "../theme.ts";
import { Markdown } from "./Markdown.tsx";
import "./createdLectureNotes.css";

type Mode = "separate" | "combined";
type Run = { text: string; color: string | null };
type Block =
  | { kind: "summary"; text: string }
  | { kind: "mine"; id: number; source: "annotation" | "note"; runs: Run[] };
type Created = { mode: Mode; blocks: Block[]; version: number };
type State = { mode: Mode; created: Created | null };

export function CreateLectureNotes({ code, sessionNo }: { code: string; sessionNo: number }) {
  return <Composer key={code + "/" + sessionNo} code={code} sessionNo={sessionNo} />;
}

function Composer({ code, sessionNo }: { code: string; sessionNo: number }) {
  const { t, lang } = useT();
  const th = lang === "th",
    path = `/api/lectures/${encodeURIComponent(code)}/${sessionNo}/created-notes`;
  const labels = {
    separate: th ? "แยกสรุปและโน้ตของฉัน" : "Keep summary and notes separate",
    combined: th ? "รวมสรุปกับโน้ตของฉัน" : "Combine summary and notes",
  };
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
          setError("");
        }
      })
      .catch(() => {
        if (active) setError(t("status.failed"));
      });
    return () => {
      active = false;
    };
  }, [path, reload, t]);
  async function choose(mode: Mode) {
    if (!state || state.mode === mode) return;
    setBusy(true);
    setError("");
    try {
      await putJSON("/api/lecture-note-preference", { mode });
      setState({ ...state, mode });
    } catch {
      setError(t("status.failed"));
    } finally {
      setBusy(false);
    }
  }
  async function create() {
    if (!state) return;
    setBusy(true);
    setError("");
    try {
      const created = await postJSON<Created>(path, { mode: state.mode });
      setState({ ...state, created });
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
          <fieldset disabled={busy} className="flex flex-wrap gap-x-4 text-sm">
            <legend className="sr-only">{th ? "รูปแบบโน้ต" : "Note layout"}</legend>
            {(["separate", "combined"] as const).map((mode) => (
              <label key={mode} className="min-h-11 inline-flex items-center gap-2">
                <input type="radio" checked={state.mode === mode} onChange={() => void choose(mode)} />
                {labels[mode]}
              </label>
            ))}
          </fieldset>
          <button
            type="button"
            className="rounded-lg px-4 min-h-11 text-white"
            style={{ background: "var(--accent)" }}
            disabled={busy}
            onClick={() => void create()}
          >
            {busy ? "…" : th ? "สร้างโน้ต" : "Create notes"}
          </button>
          {state.created && (
            <details open key={state.created.version}>
              <summary className="cursor-pointer py-2 font-medium">
                {th ? "โน้ตที่บันทึกไว้" : "Saved notes"} · {labels[state.created.mode]}
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
                    <div key={i} className="border-l-2 pl-3" style={{ borderColor: "var(--accent)" }}>
                      <small>
                        {th ? "โน้ตของฉัน" : "My note"} ·{" "}
                        {b.source === "note" ? "#" + b.id : th ? "ลายมือ" : "Handwriting"}
                      </small>
                      <p className="whitespace-pre-wrap">
                        {b.runs.map((r, j) => (
                          <span
                            key={j}
                            className="lecture-ink"
                            style={
                              (r.color
                                ? {
                                    "--ink-light": readableInk(r.color, "light"),
                                    "--ink-dark": readableInk(r.color, "dark"),
                                  }
                                : {}) as CSSProperties
                            }
                          >
                            {r.text}
                          </span>
                        ))}
                      </p>
                    </div>
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
