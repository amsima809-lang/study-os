/**
 * "My courses this term": the picker that tells the app which courses a
 * student is actually taking. The timetable, exams, study plan and mock exams
 * show those and nothing else; until a student chooses, they are empty and
 * each shows `ChooseCoursesCard` instead.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useT } from "../i18n.tsx";
import { getJSON, postJSON, putJSON, type ApiError } from "../api.ts";
import { CourseChip } from "./CourseTitle.tsx";
import { REMINDERS_CHANGED } from "./Reminders.tsx";
import Icon from "./Icon.tsx";
import { Card } from "./ui.tsx";
import PassedPicker from "./PassedPicker.tsx";

/** Open the trail planner. (The event the app shell listens for; destinations.tsx imports this file, so its helper cannot be imported here.) */
const openTrail = () => window.dispatchEvent(new CustomEvent("studyos:navigate", { detail: "trail" }));
type TermCheck = { term: string; due: boolean; courses: { term_id: string; code: string; name_th: string; name_en: string | null }[] };
import { timeRange } from "../format.ts";

type Option = { code: string; name_th: string; name_en: string | null; category: string; classes: string | null; note?: string | null };
type Data = { term: string; chosen: string[]; options: Option[] };

const CATEGORIES = ["GE", "CORE", "MAJOR_REQ", "MAJOR_ELEC", "FREE"];

/**
 * Most courses carry the same one-line note: "for students with ID 65 onwards". The
 * lists in the app ARE that curriculum, so on its own the line says nothing and, repeated
 * on every row, hides the notes that matter. Any other note is shown as printed.
 */
const worthShowing = (note?: string | null): note is string =>
  !!note && !/^สำหรับนักศึกษา\s*รหัส\s*65[\s.]*เป็นต้นไป\s*ลงทะเบียนเรียน$/.test(note.trim());
const DAY_KEYS = ["", "cal.mon", "cal.tue", "cal.wed", "cal.thu", "cal.fri", "cal.sat", "cal.sun"];

/** Set by the app when onboarding has just finished: the picker then opens by itself, once. */
export const JUST_ONBOARDED = "studyos.justOnboarded";
/** The term for which this device has already opened the picker by itself. */
const PROMPTED = "studyos.coursesPrompted";

/**
 * The call to choose courses. It asks the server itself, and shows:
 * nothing if the student cannot choose (no catalogue for their university);
 * a card with one button while nothing is chosen; and after that, with
 * `showLink`, a small "N courses this term" link to change the choice.
 * `onChanged` runs after the picker closes, so the screen can reload.
 */
/**
 * The button that opens this term's course list again, to add or take away courses.
 * It used to be a quiet "8 courses this term ›" link, which the owner did not find.
 */
export function EditCoursesButton({ count, onClick }: { count: number; onClick: () => void }) {
  const { t } = useT();
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-1.5 rounded-full border px-3 min-h-11 text-sm font-semibold"
      style={{ borderColor: "var(--accent-text)", color: "var(--accent-text)" }}
    >
      <Icon name="edit" size={15} />
      {t("tc.edit", { n: count })}
    </button>
  );
}

export function ChooseCoursesCard({ onChanged, showLink = false, onTrail = false }: { onChanged?: () => void; showLink?: boolean; /** On the trail screen itself: no prompt or button, since the screen has its own "this term" card; only the new-term question. */ onTrail?: boolean }) {
  const { t, lang } = useT();
  const [state, setState] = useState<{ chosen: number; options: number } | null>(null);
  const [choosing, setChoosing] = useState(false);
  // A new term has started: first ask which of last term's courses were passed.
  const [check, setCheck] = useState<TermCheck | null>(null);
  const [kept, setKept] = useState<Set<string>>(new Set());
  const load = useCallback(
    async () => {
      const c = await getJSON<TermCheck>("/api/trail/term-check").catch(() => null);
      if (c?.due) { setCheck(c); setKept(new Set(c.courses.map((x) => x.code))); return; }
      setCheck(null);
      return getJSON<Data>("/api/term-courses")
        .then((d) => {
          setState({ chosen: d.chosen.length, options: d.options.length });
          // Nobody should have to find the button: with nothing chosen, the picker opens by
          // itself straight after onboarding, and once per term on a device that has not
          // shown it yet (a student who onboarded before this existed). After that, the card.
          // Not on the trail screen, which shows no picker of its own here: there the flags are
          // left for the next screen that does.
          if (onTrail) return;
          let fresh = false, shown = true;
          try {
            fresh = sessionStorage.getItem(JUST_ONBOARDED) === "1";
            sessionStorage.removeItem(JUST_ONBOARDED);
            shown = localStorage.getItem(PROMPTED) === d.term;
          } catch { /* ok */ }
          if (d.chosen.length === 0 && d.options.length > 0 && (fresh || !shown)) {
            setChoosing(true);
            try { localStorage.setItem(PROMPTED, d.term); } catch { /* ok */ }
          }
        })
        .catch(() => setState(null));
    },
    [onTrail],
  );
  useEffect(() => { load(); }, [load]);

  if (check) {
    const answer = async () => {
      await postJSON("/api/trail/term-check", { codes: [...kept] }).catch(() => {});
      await load();
      onChanged?.();
    };
    return createPortal(
      <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" style={{ background: "rgba(0,0,0,0.5)" }}>
        <div role="dialog" aria-modal="true" aria-label={t("tc.newTermTitle", { term: check.term })} className="w-full md:max-w-lg flex flex-col rounded-t-3xl md:rounded-3xl border animate-slide-up" style={{ maxHeight: "92dvh", backgroundColor: "var(--bg-surface)", borderColor: "var(--border-light)" }}>
          <div className="px-5 pt-5">
            <h2 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>{t("tc.newTermTitle", { term: check.term })}</h2>
            <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>{t("tc.newTermHint")}</p>
          </div>
          <ul className="pick-list flex-1 overflow-y-auto px-3 py-2">
            {check.courses.map((c) => {
              const on = kept.has(c.code);
              return (
                <li key={c.code}>
                  <button
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => setKept((k) => { const n = new Set(k); if (n.has(c.code)) n.delete(c.code); else n.add(c.code); return n; })}
                    className="pick-row"
                  >
                    <span className="mt-0.5 w-6 h-6 shrink-0 rounded-md flex items-center justify-center" style={{ border: `2px solid ${on ? "var(--accent)" : "var(--text-tertiary)"}`, backgroundColor: on ? "var(--accent)" : "transparent", color: "#fff" }}>
                      {on && <Icon name="check" size={14} />}
                    </span>
                    <span className="flex-1 min-w-0" style={{ color: "var(--text-primary)" }}>
                      <CourseChip code={c.code} className="mr-1.5" />
                      {lang === "en" && c.name_en ? c.name_en : c.name_th}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="px-5 py-3 border-t" style={{ borderColor: "var(--border-light)", paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}>
            <button onClick={answer} className="w-full rounded-xl min-h-11 font-semibold" style={{ backgroundColor: "var(--accent)", color: "#fff" }}>
              {t("tc.newTermSave", { n: kept.size })}
            </button>
          </div>
        </div>
      </div>,
      document.body,
    );
  }
  if (!state || state.options === 0 || onTrail) return null;
  return (
    <>
      {state.chosen === 0 ? (
        <Card>
          <div className="flex items-start gap-3">
            <Icon name="graduationCap" size={22} style={{ color: "var(--accent-2, var(--accent-text))", marginTop: 2 }} />
            <div className="flex-1 min-w-0 space-y-2">
              <p className="font-semibold" style={{ color: "var(--text-primary)" }}>{t("tc.promptTitle")}</p>
              <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{t("tc.prompt")}</p>
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setChoosing(true)}
                  className="rounded-xl px-4 min-h-11 text-sm font-semibold"
                  style={{ backgroundColor: "var(--accent)", color: "#fff" }}
                >
                  {t("tc.choose")}
                </button>
                {!onTrail && (
                  <button
                    onClick={openTrail}
                    className="rounded-xl border px-4 min-h-11 text-sm font-semibold inline-flex items-center gap-1.5"
                    style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
                  >
                    <Icon name="flag" size={15} />
                    {t("tc.trail")}
                  </button>
                )}
              </div>
            </div>
          </div>
        </Card>
      ) : showLink ? (
        <div className="flex justify-end">
          <EditCoursesButton count={state.chosen} onClick={() => setChoosing(true)} />
        </div>
      ) : null}
      {choosing && (
        <TermCoursesPicker
          onClose={() => {
            setChoosing(false);
            load();
            onChanged?.();
          }}
        />
      )}
    </>
  );
}

export default function TermCoursesPicker({ onClose }: { onClose: () => void }) {
  const { t, lang } = useT();
  const [data, setData] = useState<Data | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [onlyPicked, setOnlyPicked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // What the trail planner would take this term. Shown first, and already ticked when
  // nothing is chosen yet, so choosing can be one tap on Save.
  const [suggested, setSuggested] = useState<string[]>([]);
  const [markingPassed, setMarkingPassed] = useState(false);

  const load = useCallback(() => {
    Promise.all([
      getJSON<Data>("/api/term-courses"),
      getJSON<{ codes: string[] }>("/api/trail/suggested").catch(() => ({ codes: [] as string[] })),
    ])
      .then(([d, s]) => {
        const offered = new Set(d.options.map((o) => o.code));
        const mine = s.codes.filter((c) => offered.has(c));
        setData(d);
        setSuggested(mine);
        setPicked(new Set(d.chosen.length > 0 ? d.chosen : mine));
      })
      .catch(() => setError(t("status.error")));
  }, [t]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (data?.options ?? []).filter(
      (o) =>
        (!onlyPicked || picked.has(o.code)) &&
        (!q || o.code.toLowerCase().includes(q) || o.name_th.toLowerCase().includes(q) || (o.name_en ?? "").toLowerCase().includes(q)),
    );
    // The trail's courses come first, as their own group, and are not repeated below.
    const fromTrail = list.filter((o) => suggested.includes(o.code));
    const rest = list.filter((o) => !suggested.includes(o.code));
    const known = CATEGORIES.map((c) => ({ category: c, items: rest.filter((o) => o.category === c) }));
    const other = rest.filter((o) => !CATEGORIES.includes(o.category));
    return [{ category: "TRAIL", items: fromTrail }, ...known, { category: "OTHER", items: other }].filter((g) => g.items.length > 0);
  }, [data, query, onlyPicked, picked, suggested]);

  function toggle(code: string) {
    setPicked((p) => {
      const next = new Set(p);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  }

  /** "1 08:30-11:00;3 13:00-15:00" -> "Mon 08:30–11:00, Wed 13:00–15:00" */
  const when = (classes: string | null) =>
    classes
      ? classes.split(";").map((c) => {
          const [day, time] = c.split(" ");
          const [start, end] = time.split("-");
          return `${t(DAY_KEYS[Number(day)] ?? "")} ${timeRange(start, end)}`;
        }).join(", ")
      : t("tc.examOnly");

  async function save() {
    setBusy(true);
    setError("");
    try {
      await putJSON("/api/term-courses", { codes: [...picked] });
      // Today and the calendar listen for this and reload.
      window.dispatchEvent(new Event(REMINDERS_CHANGED));
      onClose();
    } catch (e) {
      setError((e as ApiError)?.error ?? t("status.error"));
      setBusy(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" style={{ background: "rgba(0,0,0,0.5)" }} onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("tc.title")}
        onClick={(e) => e.stopPropagation()}
        className="w-full md:max-w-lg flex flex-col rounded-t-3xl md:rounded-3xl border animate-slide-up"
        style={{ height: "min(92dvh, 760px)", backgroundColor: "var(--bg-surface)", borderColor: "var(--border-light)" }}
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5">
          <div>
            <h2 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>{t("tc.title")}</h2>
            <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>{t("tc.hint", { term: data?.term ?? "" })}</p>
          </div>
          <button onClick={onClose} aria-label={t("uni.close")} className="w-11 h-11 -mr-2 -mt-2 shrink-0 flex items-center justify-center rounded-full" style={{ color: "var(--text-secondary)" }}>
            <Icon name="x" size={20} />
          </button>
        </div>

        <div className="px-5 pt-3 pb-2 flex gap-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("tc.search")}
            aria-label={t("tc.search")}
            className="flex-1 min-w-0 rounded-xl border px-3 py-2.5 min-h-11"
            style={{ backgroundColor: "var(--bg-base)", borderColor: "var(--border)", color: "var(--text-primary)" }}
          />
          <button
            onClick={() => setOnlyPicked((v) => !v)}
            aria-pressed={onlyPicked}
            className="shrink-0 rounded-xl border px-3 min-h-11 text-sm font-medium"
            style={{
              borderColor: onlyPicked ? "var(--accent-text)" : "var(--border)",
              backgroundColor: onlyPicked ? "var(--accent-light)" : "transparent",
              color: "var(--text-primary)",
            }}
          >
            {t("tc.picked", { n: picked.size })}
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-3 pb-2">
          {!data && !error && <p className="text-sm text-center py-8" style={{ color: "var(--text-tertiary)" }}>{t("status.connecting")}</p>}
          {data && groups.length === 0 && <p className="text-sm text-center py-8" style={{ color: "var(--text-tertiary)" }}>{t("tc.none")}</p>}
          {groups.map((g) => (
            <section key={g.category} className="mb-2">
              {g.category === "TRAIL" ? (
                <div className="sticky top-0 z-10 px-2 py-1.5 flex items-center gap-2 flex-wrap" style={{ backgroundColor: "var(--bg-surface)" }}>
                  <h3 className="text-xs font-semibold flex items-center gap-1.5" style={{ color: "var(--accent-text)" }}>
                    <Icon name="flag" size={13} />
                    {t("tc.fromTrail")} · {g.items.length}
                  </h3>
                  <button onClick={() => { openTrail(); onClose(); }} className="tap-area text-xs underline" style={{ color: "var(--text-tertiary)" }}>
                    {t("tc.whatsThis")}
                  </button>
                  <button
                    onClick={() => setPicked((p) => new Set([...p, ...g.items.map((o) => o.code)]))}
                    disabled={g.items.every((o) => picked.has(o.code))}
                    className="ml-auto rounded-lg border px-2.5 min-h-9 text-xs font-semibold disabled:opacity-40"
                    style={{ borderColor: "var(--accent-text)", color: "var(--accent-text)" }}
                  >
                    {t("tc.selectAll")}
                  </button>
                </div>
              ) : (
                <h3 className="sticky top-0 px-2 py-1.5 text-xs font-semibold" style={{ backgroundColor: "var(--bg-surface)", color: "var(--text-tertiary)" }}>
                  {g.category === "OTHER" ? t("tc.other") : t(`cat.${g.category}`)} · {g.items.length}
                </h3>
              )}
              <ul className="pick-list">
                {g.items.map((o) => {
                  const on = picked.has(o.code);
                  return (
                    <li key={o.code}>
                      <button
                        role="checkbox"
                        aria-checked={on}
                        onClick={() => toggle(o.code)}
                        className="pick-row"
                      >
                        <span
                          className="mt-0.5 w-6 h-6 shrink-0 rounded-md flex items-center justify-center"
                          style={{
                            border: `2px solid ${on ? "var(--accent)" : "var(--text-tertiary)"}`,
                            backgroundColor: on ? "var(--accent)" : "transparent",
                            color: "#fff",
                          }}
                        >
                          {on && <Icon name="check" size={14} />}
                        </span>
                        <span className="flex-1 min-w-0">
                          <span className="block" style={{ color: "var(--text-primary)" }}>
                            <CourseChip code={o.code} className="mr-1.5" />
                            {lang === "en" && o.name_en ? o.name_en : o.name_th}
                          </span>
                          <span className="block text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>{when(o.classes)}</span>
                          {/* The registrar's own note on who may register, as printed. */}
                          {worthShowing(o.note) && <span className="block text-xs mt-0.5 whitespace-pre-line" style={{ color: "var(--text-secondary)" }}>{o.note}</span>}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>

        <div className="px-5 py-3 border-t" style={{ borderColor: "var(--border-light)", paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}>
          {error && <p role="alert" className="text-sm mb-2" style={{ color: "var(--danger)" }}>{error}</p>}
          <p className="text-xs mb-2" style={{ color: "var(--text-tertiary)" }}>
            {picked.size === 0 ? t("tc.noneMeansEmpty") : t("tc.savedMeans")}{" "}
            {/* Suggestions are only right if the app knows what she has already passed. */}
            <button onClick={() => setMarkingPassed(true)} className="tap-area underline" style={{ color: "var(--accent-text)" }}>{t("tc.markPassed")}</button>
          </p>
          <div className="flex gap-2">
            <button onClick={save} disabled={busy || !data} className="flex-1 rounded-xl min-h-11 font-semibold disabled:opacity-40" style={{ backgroundColor: "var(--accent)", color: "#fff" }}>
              {t("tc.save", { n: picked.size })}
            </button>
            {picked.size > 0 && (
              <button onClick={() => setPicked(new Set())} className="px-3 min-h-11 text-sm" style={{ color: "var(--text-secondary)" }}>
                {t("tc.clear")}
              </button>
            )}
          </div>
        </div>
      </div>
      {markingPassed && <PassedPicker onClose={() => { setMarkingPassed(false); load(); }} />}
    </div>,
    document.body,
  );
}
