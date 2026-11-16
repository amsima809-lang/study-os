import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { getJSON, deleteJSON, postJSON, putJSON } from "../api.ts";
import { withBase } from "../base.ts";
import { useT } from "../i18n.tsx";
import { drawWithPencilKit, hasNativeInk, penAccent } from "../nativeInk.ts";
import { anchorFromMark, indexSource, locateMark, type Point, type QuoteAnchor, type AnnotationSource } from "../summaryAnchors.ts";
import { readableInk } from "../theme.ts";
import { AnnotationPad, InkDialog, type AnnotationInk } from "./AnnotationPad.tsx";
import Icon from "./Icon.tsx";
import { OriginalPageThumbnail } from "./OriginalPageThumbnail.tsx";
import "./lectureAnnotations.css";

type Run = { text: string; color: string };
type Annotation = QuoteAnchor & {
  id: number; revision: number; native: boolean; colors: string[]; runs: Run[];
  ocr_status: "pending" | "ready" | "failed";
};
type Editor = { key: string; anchor: QuoteAnchor; point: Point; accent: string; previous?: Annotation; allowFinger: boolean };
type Pending = { editor: Editor; ink: AnnotationInk };
type Rect = { left: number; top: number; width: number; height: number };
type Placement = { id: number; slot: HTMLElement | null; rects: Rect[] };
type Menu = { id: number; anchor: HTMLElement; point: Point };

function InlineNote({ row, open, retry, working, retryFailed }: {
  row: Annotation;
  open: (row: Annotation, button: HTMLElement) => void;
  retry: (row: Annotation) => void;
  working: boolean;
  retryFailed: boolean;
}) {
  const { lang } = useT(), th = lang === "th";
  const reading = row.ocr_status === "pending", failed = row.ocr_status === "failed";
  return <span role="listitem" className="lecture-inline-note">
    <button type="button" className="lecture-note-button" aria-haspopup="dialog" data-annotation={row.id}
      onClick={e => open(row, e.currentTarget)}>
      <span aria-hidden="true">•</span><span>
        <span className="sr-only">{th ? "โน้ตของฉัน " : "My note "}</span>
        {row.runs.length ? row.runs.map((run, i) =>
          <span key={i} style={{ color: `color-mix(in srgb, ${readableInk(run.color, "light")} 85%, #181400)` }}>{run.text}</span>
        ) : <span role="status">
          {reading ? th ? "กำลังอ่านข้อความจากลายมือ…" : "Reading handwriting…"
            : failed ? th ? "อ่านลายมือไม่สำเร็จ" : "Couldn’t read the handwriting"
            : th ? "โน้ตลายมือ" : "Handwritten note"}
        </span>}
      </span>
    </button>
    {failed && <button type="button" className="underline min-h-11 text-xs" disabled={working} onClick={() => retry(row)}>
      {th ? "ลองอ่านอีกครั้ง" : "Retry reading"}
    </button>}
    {retryFailed && <span role="alert">{th ? "ส่งคำขออ่านอีกครั้งไม่สำเร็จ" : "Couldn’t request another reading."}</span>}
  </span>;
}

export function AnnotatedSummary({ courseCode, sessionNo, source = "summary", filtered = false, focusId, onChanged,
  readOnly = false, onWritingChange, children }: {
  courseCode: string;
  sessionNo: number;
  source?: AnnotationSource;
  filtered?: boolean;
  focusId?: number;
  onChanged?: () => void;
  readOnly?: boolean;
  onWritingChange?: (open: boolean) => void;
  children: ReactNode;
}) {
  const { lang } = useT(), th = lang === "th";
  const base = `/api/lectures/${encodeURIComponent(courseCode)}/${sessionNo}/annotations`;
  const url = (suffix = "", extra = "") => `${base}${suffix}?source=${source}${extra}`;
  const listURL = url();
  const imageURL = (a: Annotation) => withBase(url(`/${a.id}/image`, `&v=${a.revision}`));
  const section = useRef<HTMLElement>(null), content = useRef<HTMLDivElement>(null), layer = useRef<HTMLDivElement>(null);
  const gesture = useRef<{ pointer: number; type: string; points: Point[]; path: string } | null>(null);
  const trace = useRef<SVGPolylineElement>(null);
  const lastPen = useRef(-Infinity);
  const lastTool = useRef("");
  const suppressClick = useRef(false);
  const [pen, setPen] = useState(false);
  const [rows, setRows] = useState<Annotation[]>([]);
  const currentRows = useRef<Annotation[]>([]);
  const changed = useRef(onChanged);
  changed.current = onChanged;
  const [placements, setPlacements] = useState<Placement[]>([]);
  const [reload, setReload] = useState(0), [loadFailed, setLoadFailed] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false), [workingId, setWorkingId] = useState<number | null>(null);
  const [editor, setEditor] = useState<Editor | null>(null), [pending, setPending] = useState<Pending | null>(null);
  const [menu, setMenu] = useState<Menu | null>(null);
  const [review, setReview] = useState<{ revision: number; runs: Run[] } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false), [actionError, setActionError] = useState("");
  const focusNext = useRef(focusId);
  const [retryFailed, setRetryFailed] = useState<number | null>(null);
  const summary = source === "summary";
  const activeEditor = !!editor && summary;
  const draftMark = summary && editor && !editor.previous ? editor.anchor : undefined;
  useLayoutEffect(() => {
    if (!activeEditor) return;
    onWritingChange?.(true);
    return () => onWritingChange?.(false);
  }, [activeEditor, onWritingChange]);
  const title = th ? "โน้ตลายมือของฉัน" : "My pen note";
  const failed = th ? "ทำรายการไม่สำเร็จ ลองใหม่อีกครั้ง" : "Couldn’t complete that change. Try again.";
  const reloadList = () => setReload(n => n + 1);
  const version = useRef(0);
  function writeRows(next: Annotation[]) {
    currentRows.current = next;
    setRows(next);
  }
  function update(row: Annotation) {
    version.current++;
    writeRows([...currentRows.current.filter(a => a.id !== row.id), row].sort((a,b) => a.id-b.id));
    changed.current?.();
    reloadList();
  }

  // Ink is saved before transcription starts. Poll only while this visible source has pending ink.
  useEffect(() => {
    let active = true, timer: ReturnType<typeof setTimeout>;
    async function load() {
      const generation = version.current;
      let again = false;
      try {
        const { annotations } = await getJSON<{ annotations: Annotation[] }>(listURL);
        if (!active || generation !== version.current) return;
        const prior = currentRows.current;
        const finished = prior.some(a => a.ocr_status === "pending" &&
          annotations.some(next => next.id === a.id && next.ocr_status !== "pending"));
        writeRows(annotations);
        setLoadFailed(false);
        if (finished) changed.current?.();
        again = annotations.some(a => a.ocr_status === "pending");
      } catch {
        if (!active) return;
        setLoadFailed(true);
        again = currentRows.current.some(a => a.ocr_status === "pending");
      }
      if (again && active) timer = setTimeout(() => void load(), 1700);
    }
    void load();
    return () => { active = false; clearTimeout(timer); };
  }, [listURL, reload]);

  useLayoutEffect(() => {
    if (!rows.length && !draftMark) { setPlacements(current => current.length ? [] : current); return; }
    const root = content.current!, wrap = layer.current!;
    let frame = 0;
    const measure = () => {
      const index = indexSource(root);
      const box = wrap.getBoundingClientRect();
      let legacy: ReturnType<typeof indexSource> | undefined;
      const marks = draftMark ? [...rows, { ...draftMark, id: 0 }] : rows;
      setPlacements(marks.map(row => {
        let mark = locateMark(index, row, filtered || (source === "transcript" && !!row.block_key));
        // Earlier summary marks could include the text of an intervening timestamp button.
        if (!mark && !row.block_key && source === "summary" && !filtered) {
          legacy ??= indexSource(root, true);
          mark = locateMark(legacy, row, false);
        }
        return { id: row.id, slot: mark?.slot ?? null, rects: (mark?.rects ?? []).map(r => ({
          left: r.left - box.left, top: r.top - box.top, width: r.width, height: r.height,
        })) };
      }));
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(measure); };
    measure();
    const ro = new ResizeObserver(schedule);
    ro.observe(root);
    const mo = new MutationObserver(schedule);
    mo.observe(root, { childList: true, characterData: true, subtree: true });
    document.fonts?.addEventListener("loadingdone", schedule);
    return () => { ro.disconnect(); mo.disconnect(); cancelAnimationFrame(frame); document.fonts?.removeEventListener("loadingdone", schedule); };
  }, [rows, filtered, source, draftMark]);

  useEffect(() => { focusNext.current = focusId; }, [focusId]);
  useEffect(() => {
    if (focusNext.current === undefined) return;
    const target = section.current?.querySelector<HTMLElement>(`button[data-annotation="${focusNext.current}"]`);
    if (!target) return;
    const details = target.closest("details");
    if (details) details.open = true;
    target.scrollIntoView({ block: "center" });
    target.focus({ preventScroll: true });
    focusNext.current = undefined;
  }, [focusId, placements]);

  async function save(item: Pending) {
    setBusy(true); setError(""); setPending(item);
    const { editor: ed, ink } = item;
    try {
      const row = ed.previous
        ? await putJSON<Annotation>(url(`/${ed.previous.id}/ink`), { ...ink, revision: ed.previous.revision })
        : await postJSON<Annotation>(listURL, { ...ink, key: ed.key, anchor: ed.anchor });
      focusNext.current = row.id;
      update(row);
      setPending(null); setEditor(null); setPen(false);
    } catch {
      setError(failed);
    } finally { setBusy(false); }
  }

  async function openInk(anchor: QuoteAnchor, point: Point, previous?: Annotation) {
    if (readOnly || busy || pending || editor) return;
    const accent = penAccent();
    const ed: Editor = { key: crypto.randomUUID(), anchor, point, accent, previous, allowFinger: lastTool.current === "touch" };
    setMenu(null); setError("");
    // Old web ink reopens in its own editor, including when viewed in the native app.
    if (summary || !hasNativeInk() || (previous && !previous.native)) {
      setEditor(ed); return;
    }
    setBusy(true);
    try {
      const prior = previous ? await getJSON<{ drawing: string }>(url(`/${previous.id}/drawing`)) : undefined;
      const view = window.visualViewport;
      const ink = await drawWithPencilKit(prior ? { drawing: prior.drawing, png: "", colors: previous!.colors } : undefined, {
        title, done: th ? "บันทึก" : "Save", cancel: th ? "ยกเลิก" : "Cancel", accent,
        anchorX: (point.x - (view?.offsetLeft ?? 0)) / (view?.width ?? innerWidth),
        anchorY: (point.y - (view?.offsetTop ?? 0)) / (view?.height ?? innerHeight),
      });
      if (ink) await save({ editor: ed, ink: { drawing: ink.drawing, png: ink.png, colors: ink.colors.length ? ink.colors : [accent] } });
    } catch { setError(failed); } finally { setBusy(false); }
  }
  function stopStroke() {
    gesture.current = null;
    trace.current?.removeAttribute("points");
  }

  function sample(e: PointerEvent<HTMLDivElement>, coalesced = false) {
    const g = gesture.current;
    if (!g || g.pointer !== e.pointerId) return;
    const box = layer.current!.getBoundingClientRect();
    const add = (x: number, y: number) => {
      const last = g.points.at(-1);
      if (last?.x === x && last.y === y) return;
      g.points.push({ x, y });
      g.path += ` ${x - box.left},${y - box.top}`;
    };
    if (coalesced) {
      for (const event of e.nativeEvent.getCoalescedEvents?.() ?? []) add(event.clientX, event.clientY);
    }
    add(e.clientX, e.clientY);
    trace.current?.setAttribute("points", g.path);
  }

  // Safari can take a vertical Pencil stroke for page panning. Cancel only the
  // stylus touch's native action, leaving fingers free to scroll and pinch.
  useEffect(() => {
    const root = content.current;
    if (!summary || readOnly || activeEditor || !root) return;
    const protectPencilStroke = (event: TouchEvent) => {
      if (event.cancelable && Array.from(event.changedTouches).some(t =>
        (t as Touch & { touchType?: string }).touchType === "stylus") &&
        !(event.target as Element).closest("button,a,[data-personal-passage]")) event.preventDefault();
    };
    root.addEventListener("touchstart", protectPencilStroke, { passive: false });
    return () => root.removeEventListener("touchstart", protectPencilStroke);
  }, [summary, readOnly, activeEditor]);

  function beginStroke(e: PointerEvent<HTMLDivElement>) {
    if (readOnly || busy || pending || editor || menu || e.button !== 0) return;
    const target = e.target as Element;
    const control = target.closest("button, a");
    if (target.closest("[data-personal-passage]") || (control && !control.closest("[data-annotation-text]"))) return;
    const type = e.pointerType;
    if (type === "pen") {
      lastPen.current = performance.now();
      if (gesture.current?.type === "touch") stopStroke();
    } else if (type === "touch") {
      if (!summary || performance.now() - lastPen.current < 800) return;
      if (!e.isPrimary || Math.max(e.width, e.height) > 48) {
        if (gesture.current?.type === "touch") stopStroke();
        return;
      }
      try { if (localStorage.getItem("studyos.penOnly") === "1") return; } catch { /* Storage may be unavailable. */ }
    } else if (type !== "mouse" || (!summary && !pen)) return;
    if (gesture.current) return;
    suppressClick.current = false;
    gesture.current = { pointer: e.pointerId, type, points: [], path: "" };
    // A plain tap on a timestamp must still reach that button.
    if (!control) {
      e.currentTarget.setPointerCapture(e.pointerId);
      if (type !== "touch") e.preventDefault();
    }
    sample(e);
  }

  function lift(e: PointerEvent<HTMLDivElement>) {
    const g = gesture.current;
    if (!g || g.pointer !== e.pointerId) return;
    sample(e, true);
    stopStroke();
    const point = g.points[g.points.length - 1];
    const threshold = g.type === "touch" ? 9 : 4;
    if (!g.points.some(p => Math.hypot(point.x - p.x, point.y - p.y) >= threshold)) return;
    if (g.type === "touch") {
      const first = g.points[0];
      if (Math.abs(point.y - first.y) > Math.abs(point.x - first.x) * 1.5 + 8) return;
    }
    if (g.type === "pen") lastPen.current = performance.now();
    lastTool.current = g.type;
    suppressClick.current = true;
    const anchor = anchorFromMark(content.current!, g.points, source === "transcript" && filtered);
    if (anchor) void openInk(anchor, point);
    else setError(th ? "ขีดเส้นใต้หรือวงข้อความที่ต้องการอีกครั้ง" : "Underline or circle the words you want to annotate.");
  }

  const openMenu = (row: Annotation, button: HTMLElement) => {
    if (readOnly || editor || pending) return;
    const rect = button.getBoundingClientRect();
    setReview(null); setActionError(""); setConfirmDelete(false);
    setMenu({ id: row.id, anchor: button, point: { x: rect.left, y: rect.bottom } });
  };
  const menuRow = menu && rows.find(r => r.id === menu.id);
  async function retry(row: Annotation) {
    setWorkingId(row.id); setActionError(""); setRetryFailed(null);
    try { update(await postJSON<Annotation>(url(`/${row.id}/retry`), { revision: row.revision })); }
    catch { if (menu) setActionError(failed); else setRetryFailed(row.id); reloadList(); }
    finally { setWorkingId(null); }
  }
  async function saveText(row: Annotation) {
    if (!review) return;
    setWorkingId(row.id); setActionError("");
    try {
      update(await putJSON<Annotation>(url(`/${row.id}/text`), { revision: review.revision, runs: review.runs.filter(r => r.text.trim()) }));
      setMenu(null);
    } catch {
      setActionError(th ? "บันทึกข้อความไม่สำเร็จ ตรวจข้อความล่าสุดแล้วลองอีกครั้ง" : "Couldn’t save the text. Check the latest note and try again.");
      reloadList();
    } finally { setWorkingId(null); }
  }
  async function remove(row: Annotation) {
    setWorkingId(row.id); setActionError("");
    try {
      await deleteJSON(url(`/${row.id}`, `&revision=${row.revision}`));
      version.current++;
      writeRows(currentRows.current.filter(a => a.id !== row.id));
      changed.current?.(); setMenu(null); reloadList();
    } catch { setActionError(failed); reloadList(); }
    finally { setWorkingId(null); }
  }

  const bySlot = new Map<HTMLElement, Annotation[]>(), unplaced: Annotation[] = [];
  const byId = new Map(rows.map(row => [row.id, row]));
  for (const p of placements) {
    const row = byId.get(p.id);
    if (!row) continue;
    if (!p.slot) { if (!filtered) unplaced.push(row); continue; }
    const group = bySlot.get(p.slot) ?? [];
    group.push(row); bySlot.set(p.slot, group);
  }
  const note = (a: Annotation) => <InlineNote key={a.id} row={a} open={openMenu} retry={retry} working={workingId === a.id} retryFailed={retryFailed === a.id}/>;
  const activeId = editor?.previous?.id ?? (draftMark ? 0 : undefined);
  const markRect = () => editor && content.current
    ? locateMark(indexSource(content.current), editor.anchor, false)?.rects[0] : undefined;
  const passage = editor?.anchor.block_key && content.current
    ? content.current.querySelector<HTMLElement>(`[data-annotation-block="${CSS.escape(editor.anchor.block_key)}"]`)
    : null;
  return <section ref={section} onPointerDownCapture={e => { lastTool.current = e.pointerType; suppressClick.current = false; }}>
    {!summary && <>
      <button type="button" aria-pressed={pen} disabled={readOnly || busy || !!pending}
        className="inline-flex items-center gap-1.5 min-h-11 px-2 rounded-lg text-sm font-medium"
        style={{ color: "var(--accent-text)", background: pen ? "var(--accent-light)" : undefined }}
        onClick={() => { setPen(v => !v); setError(""); }}>
        <Icon name="pen" size={16}/>{th ? "เขียนบนคำบรรยาย" : "Annotate transcript"}
      </button>
      {pen && <p className="text-sm mb-2">{th ? "ใช้ปากกาหรือเมาส์ขีดเส้นใต้หรือวงข้อความ" : "Use a pen or mouse to underline or circle a passage."}</p>}
    </>}
    {error && !pending && <p role="alert" className="text-sm">{error}</p>}
    {loadFailed && <p role="alert" className="text-sm">{th ? "โหลดโน้ตลายมือไม่สำเร็จ" : "Couldn’t load your pen notes."} <button type="button" onClick={reloadList} className="min-h-11 underline">{th ? "ลองอีกครั้ง" : "Try again"}</button></p>}
    {unplaced.length > 0 && <details className="my-2 text-sm"><summary className="cursor-pointer min-h-11 py-2">
      {th ? "โน้ตที่หาข้อความเดิมไม่พบ" : "Notes whose original passage changed"} ({unplaced.length})
    </summary>{unplaced.map(a => <div key={a.id}><q>{a.quote}</q><span role="list" className="lecture-inline-notes">{note(a)}</span></div>)}</details>}
    <div ref={layer} className="relative">
      <div ref={content} className="lecture-source-text" data-annotation-surface={source} style={{
        touchAction: readOnly || editor ? undefined : summary ? "pan-y pinch-zoom" : pen ? "none" : undefined,
        userSelect: !readOnly && !editor && (summary || pen) ? "none" : undefined,
      }}
        onClickCapture={e => {
          if (suppressClick.current) { suppressClick.current = false; e.stopPropagation(); e.preventDefault(); return; }
          if (readOnly || editor || (e.target as Element).closest("[data-personal-passage], button, a")) return;
          const box = layer.current!.getBoundingClientRect(), x=e.clientX-box.left, y=e.clientY-box.top;
          const hit = placements.find(p => p.rects.some(r => x>=r.left && x<=r.left+r.width && y>=r.top && y<=r.top+r.height+4));
          const row = hit && byId.get(hit.id);
          const button = hit?.slot?.querySelector<HTMLElement>(`button[data-annotation="${hit.id}"]`);
          if (row && button) { e.stopPropagation(); openMenu(row, button); }
        }}
        onPointerDown={beginStroke} onPointerMove={e => sample(e, true)} onPointerUp={lift}
        onPointerCancel={e => { if (gesture.current?.pointer === e.pointerId) stopStroke(); }}
        onLostPointerCapture={e => {
          if (e.target === e.currentTarget && gesture.current?.pointer === e.pointerId) stopStroke();
        }}>
        {children}
      </div>
      <div aria-hidden className="absolute inset-0 pointer-events-none overflow-hidden">
        {placements.flatMap(m => {
          const kind = m.id === 0 ? draftMark?.mark : byId.get(m.id)?.mark;
          if (!kind) return [];
          return m.rects.map((box, i) => <span key={`${m.id}-${i}`} data-annotation-mark={kind}
            data-active-mark={m.id === activeId ? "" : undefined} className="lecture-passage-mark" style={box}/>);
        })}
        <svg width="100%" height="100%"><polyline ref={trace} stroke="var(--accent)" strokeWidth="2" fill="none"/></svg>
      </div>
    </div>
    {Array.from(bySlot, ([slot, annotations]) => createPortal(
      <span role="list" aria-label={th ? "โน้ตสำหรับข้อความนี้" : "Notes on this passage"} className="lecture-inline-notes">{annotations.map(note)}</span>,
      slot, String(annotations[0].id),
    ))}
    {editor && (summary || !pending) && <AnnotationPad point={editor.point}
      reader={summary ? section.current?.closest<HTMLElement>("[data-lecture-reader]") ?? undefined : undefined}
      passage={passage ?? undefined} getMarkRect={markRect} allowFinger={editor.allowFinger}
      saving={busy} saveError={pending ? error : undefined} quote={editor.anchor.quote} accent={editor.accent}
      colors={editor.previous?.colors ?? []} previous={editor.previous && imageURL(editor.previous)}
      cancel={() => { if (!busy) { setEditor(null); setPending(null); setError(""); } }} save={ink => void save({ editor, ink })}/>}
    {pending && !busy && (!summary || !editor) && <InkDialog point={pending.editor.point} label={title} cancel={() => { setPending(null); setEditor(null); }}>
      <p role="alert">{error}</p>
      <button type="button" className="min-h-11 px-2" onClick={() => void save(pending)}>{th ? "ลองบันทึกอีกครั้ง" : "Retry saving ink"}</button>
      <button type="button" className="min-h-11 px-2" onClick={() => { setPending(null); setEditor(null); }}>{th ? "ทิ้ง" : "Discard"}</button>
    </InkDialog>}
    {menu && menuRow && <InkDialog point={menu.point} anchor={menu.anchor} label={title} cancel={() => setMenu(null)}>
      <div className="flex items-start gap-2"><q className="text-sm line-clamp-2 flex-1">{menuRow.quote}</q>
        <button type="button" aria-label={th ? "ปิด" : "Close"} className="shrink-0 px-2" onClick={() => setMenu(null)}>×</button></div>
      <OriginalPageThumbnail src={imageURL(menuRow)}/>
      {review ? <div className="space-y-2">
        {review.runs.map((r, i) => <label key={i} className="block text-sm">
          {th ? "ข้อความจากลายมือ" : "Handwritten passage"}{review.runs.length > 1 && ` ${i + 1}`}
          <textarea value={r.text} maxLength={4000} className="w-full px-2 py-1 border-l-4" style={{ borderColor: r.color }}
            onChange={e => setReview({ ...review, runs: review.runs.map((v,k) => k === i ? { ...v, text: e.target.value } : v) })}/>
        </label>)}
        {review.revision !== menuRow.revision &&
          <p role="status" className="text-sm">{th ? "โน้ตนี้มีข้อความใหม่" : "The note has changed."} <button type="button" className="underline"
            onClick={() => setReview({ ...review, revision: menuRow.revision })}>{th ? "ใช้ข้อความที่ฉันเขียน" : "Use my rewrite"}</button></p>}
        <button type="button" className="min-h-11 px-2" disabled={workingId === menuRow.id || review.revision !== menuRow.revision}
          onClick={() => void saveText(menuRow)}>{th ? "บันทึกข้อความ" : "Save text"}</button>
        <button type="button" className="min-h-11 px-2" onClick={() => setReview(null)}>{th ? "ยกเลิก" : "Cancel"}</button>
      </div> : confirmDelete ? <div className="text-sm">
        <p>{th ? "ลบโน้ตลายมือนี้?" : "Delete this pen note?"}</p>
        <button type="button" className="min-h-11 px-2" disabled={workingId === menuRow.id} onClick={() => void remove(menuRow)}>{th ? "ลบ" : "Delete"}</button>
        <button type="button" className="min-h-11 px-2" onClick={() => setConfirmDelete(false)}>{th ? "ยกเลิก" : "Cancel"}</button>
      </div> : <>
        <div className="lecture-note-tools">
          <button type="button" onClick={() => void openInk(menuRow, menu.point, menuRow)}>
            <Icon name="pen" size={19}/>{th ? "แก้ลายมือ" : "Edit ink"}</button>
          <button type="button" onClick={() => { setActionError(""); setReview({ revision: menuRow.revision,
            runs: menuRow.runs.length ? menuRow.runs : [{ text: "", color: menuRow.colors[0] }] }); }}>
            <Icon name="fileEdit" size={19}/>{th ? "แก้ข้อความ" : "Rewrite text"}</button>
          <button type="button" onClick={() => { setActionError(""); setConfirmDelete(true); }} style={{ color: "var(--danger)" }}>
            <Icon name="trash" size={19}/>{th ? "ลบ" : "Delete"}</button>
        </div>
        {menuRow.ocr_status === "failed" && <button type="button" className="min-h-11 underline text-sm" disabled={workingId === menuRow.id}
          onClick={() => void retry(menuRow)}>{th ? "ลองอ่านอีกครั้ง" : "Retry reading"}</button>}
      </>}
      {actionError && <p className="text-sm" role="alert">{actionError}</p>}
    </InkDialog>}
  </section>;
}

export default AnnotatedSummary;
