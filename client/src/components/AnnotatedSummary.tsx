import { useCallback, useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { getJSON, deleteJSON, postJSON, putJSON } from "../api.ts";
import { withBase } from "../base.ts";
import { useT } from "../i18n.tsx";
import { drawWithPencilKit, hasNativeInk, penAccent } from "../nativeInk.ts";
import { anchorFromMark, quoteRange, type Point, type QuoteAnchor } from "../summaryAnchors.ts";
import { AnnotationPad, type AnnotationInk } from "./AnnotationPad.tsx";
import Icon from "./Icon.tsx";

type Run = { text: string; color: string };
type Annotation = QuoteAnchor & { id: number; revision: number; native: boolean; colors: string[]; runs: Run[] };
type Editor = { key: string; anchor: QuoteAnchor; point: Point; accent: string; previous?: Annotation };
type Pending = { editor: Editor; ink: AnnotationInk };
type Highlight = { id: number; circle: boolean; rects: { left: number; top: number; width: number; height: number }[] };

export function AnnotatedSummary({
  courseCode,
  sessionNo,
  focusId,
  savedInk,
  onChanged,
  children,
}: {
  courseCode: string;
  sessionNo: number;
  focusId?: number;
  savedInk?: Set<number>;
  onChanged?: () => void;
  children: ReactNode;
}) {
  const { lang } = useT(),
    th = lang === "th";
  const path = `/api/lectures/${encodeURIComponent(courseCode)}/${sessionNo}/annotations`;
  const content = useRef<HTMLDivElement>(null),
    layer = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ pointer: number; points: Point[] } | null>(null);
  const [trace, setTrace] = useState("");
  const [pen, setPen] = useState(false);
  const [rows, setRows] = useState<Annotation[]>([]);
  const [marks, setMarks] = useState<Highlight[]>([]);
  const [error, setError] = useState(""),
    [filter, setFilter] = useState("");
  const [busy, setBusy] = useState(false),
    [editor, setEditor] = useState<Editor | null>(null);
  const [pending, setPending] = useState<Pending | null>(null);
  const [review, setReview] = useState<{ id: number; revision: number; runs: Run[] } | null>(null);
  const focusedNote = useRef<number | null>(null);
  const noteList = useRef<HTMLElement>(null);
  useEffect(() => {
    if (focusId === undefined || focusedNote.current === focusId) return;
    const note = noteList.current?.querySelector<HTMLElement>(`[data-annotation="${focusId}"]`);
    if (note) {
      focusedNote.current = focusId;
      note.scrollIntoView({ block: "center" });
      note.focus({ preventScroll: true });
    }
  }, [focusId, rows]);
  const title = th ? "โน้ตลายมือของฉัน" : "My pen notes";
  const failed = th ? "ทำรายการไม่สำเร็จ ลองใหม่อีกครั้ง" : "Couldn’t complete that change. Try again.";
  const imageUrl = (a: Annotation) => withBase(`${path}/${a.id}/image?v=${a.revision}`);
  const update = (row: Annotation) => {
    setRows((old) => [...old.filter((a) => a.id !== row.id), row].sort((a, b) => a.id - b.id));
    onChanged?.();
  };
  const failure = (e: unknown) => setError(th && typeof e === "object" && e && "error" in e ? String(e.error) : failed);
  useEffect(() => {
    let live = true;
    getJSON<{ annotations: Annotation[] }>(path)
      .then((r) => {
        if (live) setRows(r.annotations);
      })
      .catch(() => {
        if (live) setError(th ? "โหลดโน้ตลายมือไม่สำเร็จ" : "Couldn’t load your pen notes.");
      });
    return () => {
      live = false;
    };
  }, [path, th]);
  // Keep marks aligned to actual text even when a font loads, a line wraps or the summary is edited.
  useLayoutEffect(() => {
    const root = content.current!,
      wrap = layer.current!;
    const measure = () => {
      const box = wrap.getBoundingClientRect();
      setMarks(
        rows.map((a) => ({
          id: a.id,
          circle: a.mark === "circle",
          rects: Array.from(quoteRange(root, a)?.getClientRects() ?? [])
            .filter((r) => r.width > 0 && r.height > 0)
            .map((r) => ({ left: r.left - box.left, top: r.top - box.top, width: r.width, height: r.height })),
        })),
      );
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(root);
    const mo = new MutationObserver(measure);
    mo.observe(root, { childList: true, characterData: true, subtree: true });
    document.fonts?.addEventListener("loadingdone", measure);
    return () => {
      ro.disconnect();
      mo.disconnect();
      document.fonts?.removeEventListener("loadingdone", measure);
    };
  }, [rows]);

  async function save(item: Pending) {
    setBusy(true);
    setError("");
    setPending(item);
    const { editor: ed, ink } = item;
    try {
      const row = ed.previous
        ? await putJSON<Annotation>(`${path}/${ed.previous.id}/ink`, { ...ink, revision: ed.previous.revision })
        : await postJSON<Annotation>(path, { ...ink, key: ed.key, anchor: ed.anchor });
      update(row);
      setPending(null);
      setEditor(null);
      setPen(false);
    } catch (e) {
      failure(e);
    } finally {
      setBusy(false);
    }
  }

  async function open(anchor: QuoteAnchor, point: Point, previous?: Annotation) {
    if (busy || pending || editor) return;
    const accent = penAccent();
    const ed: Editor = { key: crypto.randomUUID(), anchor, point, accent, previous };
    setError("");
    if (!hasNativeInk()) {
      setEditor(ed);
      return;
    }
    setBusy(true);
    try {
      const prior = previous ? await getJSON<{ drawing: string }>(`${path}/${previous.id}/drawing`) : undefined;
      const v = window.visualViewport;
      const ink = await drawWithPencilKit(
        prior ? { drawing: prior.drawing, png: "", colors: previous!.colors } : undefined,
        {
          title,
          done: th ? "บันทึก" : "Save",
          cancel: th ? "ยกเลิก" : "Cancel",
          accent,
          anchorX: (point.x - (v?.offsetLeft ?? 0)) / (v?.width ?? innerWidth),
          anchorY: (point.y - (v?.offsetTop ?? 0)) / (v?.height ?? innerHeight),
        },
      );
      if (ink)
        await save({
          editor: ed,
          ink: { drawing: ink.drawing, png: ink.png, colors: ink.colors.length ? ink.colors : [accent] },
        });
    } catch (e) {
      failure(e);
    } finally {
      setBusy(false);
    }
  }

  function drawPoint(e: PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (g?.pointer !== e.pointerId) return;
    const p = { x: e.clientX, y: e.clientY };
    g.points.push(p);
    const box = layer.current!.getBoundingClientRect();
    setTrace(g.points.map((q) => `${q.x - box.left},${q.y - box.top}`).join(" "));
  }
  function lift(e: PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (g?.pointer !== e.pointerId) return;
    gesture.current = null;
    setTrace("");
    const point = { x: e.clientX, y: e.clientY };
    g.points.push(point);
    const a = anchorFromMark(content.current!, g.points);
    if (a) void open(a, point);
    else setError(th ? "ขีดเส้นใต้หรือวงข้อความที่ต้องการอีกครั้ง" : "Underline or circle the words you want to annotate.");
  }
  const changeText = async (row: Annotation, ai: boolean) => {
    setBusy(true);
    setError("");
    try {
      const result = ai ? await postJSON<{ revision: number; runs: Run[] }>(`${path}/${row.id}/read`, {}) : row;
      setReview({
        id: row.id,
        revision: result.revision,
        runs: result.runs.length ? result.runs : [{ text: "", color: row.colors[0] }],
      });
    } catch (e) {
      failure(e);
    } finally {
      setBusy(false);
    }
  };
  const saveReview = async () => {
    if (!review) return;
    setBusy(true);
    setError("");
    try {
      update(
        await putJSON<Annotation>(`${path}/${review.id}/text`, {
          revision: review.revision,
          runs: review.runs.filter((r) => r.text),
        }),
      );
      setReview(null);
    } catch (e) {
      failure(e);
    } finally {
      setBusy(false);
    }
  };
  const jump = useCallback((a: Annotation) => {
    const r = content.current && quoteRange(content.current, a);
    if (!r) return;
    const node = r.startContainer.parentElement;
    node?.scrollIntoView({ block: "center" });
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(r);
  }, []);
  return (
    <section>
      <button
        type="button"
        aria-pressed={pen}
        disabled={busy || !!pending}
        className="inline-flex items-center gap-1.5 min-h-11 px-2 rounded-lg text-sm font-medium"
        style={{ color: "var(--accent-text)", background: pen ? "var(--accent-light)" : undefined }}
        onClick={() => {
          setPen((v) => !v);
          setError("");
        }}
      >
        <Icon name="pen" size={16} />
        {th ? "เขียนบนสรุป" : "Annotate summary"}
      </button>
      {pen && (
        <p className="text-sm mb-2" style={{ color: "var(--text-secondary)" }}>
          {th ? "ใช้ปากกาหรือเมาส์ขีดเส้นใต้หรือวงข้อความ" : "Use a pen or mouse to underline or circle a passage."}
        </p>
      )}
      <div ref={layer} className="relative">
        <div
          ref={content}
          className="lecture-source-text"
          style={{ touchAction: pen ? "none" : undefined, userSelect: pen ? "none" : undefined }}
          onClickCapture={(e) => {
            if (pen) {
              e.stopPropagation();
              e.preventDefault();
            }
          }}
          onPointerDown={(e) => {
            if (!pen || busy || pending || gesture.current || e.pointerType === "touch" || e.button !== 0) return;
            gesture.current = { pointer: e.pointerId, points: [] };
            e.currentTarget.setPointerCapture(e.pointerId);
            e.preventDefault();
            drawPoint(e);
          }}
          onPointerMove={drawPoint}
          onPointerUp={lift}
          onLostPointerCapture={(e) => {
            if (gesture.current?.pointer === e.pointerId) {
              gesture.current = null;
              setTrace("");
            }
          }}
        >
          {children}
        </div>
        <div aria-hidden className="absolute inset-0 pointer-events-none overflow-hidden">
          {marks.flatMap((m) =>
            m.rects.map((box, i) => (
              <span
                key={`${m.id}-${i}`}
                style={{
                  position: "absolute",
                  ...box,
                  borderColor: "var(--accent)",
                  borderStyle: "solid",
                  borderWidth: m.circle ? "2px" : "0 0 2px",
                  borderRadius: m.circle ? "50%" : undefined,
                }}
              />
            )),
          )}
          {trace && (
            <svg width="100%" height="100%">
              <polyline points={trace} stroke="var(--accent)" strokeWidth="2" fill="none" />
            </svg>
          )}
        </div>
      </div>
      {editor && !pending && (
        <AnnotationPad
          point={editor.point}
          quote={editor.anchor.quote}
          accent={editor.accent}
          colors={editor.previous?.colors ?? []}
          previous={editor.previous && imageUrl(editor.previous)}
          cancel={() => setEditor(null)}
          save={(ink) => void save({ editor, ink })}
        />
      )}
      {error && (
        <p className="text-sm mt-2" role="alert">
          {error}
        </p>
      )}
      {pending && !busy && (
        <div className="flex gap-3 text-sm">
          <button onClick={() => void save(pending)}>{th ? "ลองบันทึกอีกครั้ง" : "Retry saving ink"}</button>
          <button
            onClick={() => {
              setPending(null);
              setEditor(null);
            }}
          >
            {th ? "ยกเลิก" : "Discard"}
          </button>
        </div>
      )}
      {rows.length > 0 && (
        <section ref={noteList} className="mt-4 space-y-2">
          <h3 className="font-semibold">{title}</h3>
          {rows.length > 1 && (
            <input
              type="search"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="w-full px-2 py-1 rounded border text-sm"
              aria-label={th ? "ค้นหาโน้ตลายมือ" : "Search pen notes"}
              placeholder={th ? "ค้นหาโน้ตลายมือ" : "Search pen notes"}
            />
          )}
          {rows
            .filter((a) =>
              (a.quote + " " + a.runs.map((r) => r.text).join(""))
                .toLocaleLowerCase()
                .includes(filter.trim().toLocaleLowerCase()),
            )
            .map((a) => (
              <article
                data-annotation={a.id}
                tabIndex={-1}
                key={a.id}
                className="p-2 rounded-xl border space-y-1 text-sm"
                style={{ borderColor: "var(--border)" }}
              >
                <button
                  type="button"
                  className="text-left font-medium underline"
                  style={{ color: "var(--accent-text)" }}
                  disabled={!marks.find((m) => m.id === a.id)?.rects.length}
                  onClick={() => jump(a)}
                >
                  “{a.quote}”
                </button>
                <img
                  src={imageUrl(a)}
                  alt={th ? "โน้ตลายมือ" : "Handwritten note"}
                  loading="lazy"
                  className="max-h-36 max-w-full rounded"
                />
                {!savedInk?.has(a.id) && <p className="whitespace-pre-wrap">{a.runs.map((r) => r.text).join("")}</p>}
                {review?.id === a.id ? (
                  <div className="space-y-2">
                    <label>{th ? "ตรวจข้อความจากลายมือ" : "Review handwritten text"}</label>
                    {review.runs.map((r, i) => (
                      <textarea
                        key={i}
                        value={r.text}
                        aria-label={th ? "ข้อความจากลายมือ" : "Handwritten passage"}
                        className="block w-full pl-2 border-l-4"
                        style={{ borderColor: r.color }}
                        onChange={(e) =>
                          setReview({
                            ...review,
                            runs: review.runs.map((run, n) => (n === i ? { ...run, text: e.target.value } : run)),
                          })
                        }
                      />
                    ))}
                    <button className="px-2 min-h-11" disabled={busy} onClick={() => void saveReview()}>
                      {th ? "บันทึกข้อความ" : "Save text"}
                    </button>
                    <button className="px-2 min-h-11" disabled={busy} onClick={() => setReview(null)}>
                      {th ? "ยกเลิก" : "Cancel"}
                    </button>
                  </div>
                ) : (
                  <div className="flex gap-3 flex-wrap" style={{ color: "var(--accent-text)" }}>
                    {a.native === hasNativeInk() && (
                      <button
                        type="button"
                        disabled={busy || !!pending}
                        className="min-h-11"
                        onClick={(e) => {
                          const b = e.currentTarget.getBoundingClientRect();
                          void open(a, { x: b.left, y: b.top }, a);
                        }}
                      >
                        {th ? "แก้ลายมือ" : "Edit ink"}
                      </button>
                    )}
                    <button type="button" className="min-h-11" disabled={busy} onClick={() => void changeText(a, true)}>
                      {th ? "ให้ AI อ่านลายมือ" : "Read handwriting with AI"}
                    </button>
                    <button
                      type="button"
                      className="min-h-11"
                      disabled={busy}
                      onClick={() => void changeText(a, false)}
                    >
                      {th ? "แก้ข้อความ" : "Edit text"}
                    </button>
                    <button
                      type="button"
                      className="min-h-11"
                      disabled={busy}
                      onClick={async () => {
                        if (!window.confirm(th ? "ลบโน้ตลายมือนี้?" : "Delete this pen note?")) return;
                        setBusy(true);
                        try {
                          await deleteJSON(`${path}/${a.id}?revision=${a.revision}`);
                          setRows((old) => old.filter((r) => r.id !== a.id));
                          onChanged?.();
                        } catch (e) {
                          failure(e);
                        } finally {
                          setBusy(false);
                        }
                      }}
                    >
                      {th ? "ลบ" : "Delete"}
                    </button>
                  </div>
                )}
              </article>
            ))}
        </section>
      )}
    </section>
  );
}

export default AnnotatedSummary;
