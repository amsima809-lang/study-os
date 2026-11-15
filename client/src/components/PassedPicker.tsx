/**
 * "Courses passed": the student ticks every course of their major they have already passed.
 * The trail planner (and the suggestions in the course picker) leave those out.
 */
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useT } from "../i18n.tsx";
import { getJSON, putJSON } from "../api.ts";
import { CourseChip } from "./CourseTitle.tsx";
import Icon from "./Icon.tsx";

type PassedCourse = { code: string; name_th: string; name_en: string | null; credits: number; category: "GE" | "CORE" | "MAJOR_REQ" | "MAJOR_ELEC" | "FREE"; /** The year of the faculty's plan it sits in; null for electives. */ planYear: number | null; /** A "choose one of" group: only one of them is taken. */ group: string | null; /** Needed by everyone in the major (not one choice among several). */ required: boolean };
const CATEGORIES: PassedCourse["category"][] = ["GE", "CORE", "MAJOR_REQ", "MAJOR_ELEC"];

/** Tick the courses already passed. */
export default function PassedPicker({ onClose }: { onClose: () => void }) {
  const { t, lang } = useT();
  const [courses, setCourses] = useState<PassedCourse[] | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getJSON<{ courses: PassedCourse[]; passed: string[] }>("/api/trail/passed")
      .then((d) => { setCourses(d.courses); setPicked(new Set(d.passed)); })
      .catch(() => setError(t("status.error")));
  }, [t]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = (courses ?? []).filter((c) => !q || c.code.toLowerCase().includes(q) || c.name_th.toLowerCase().includes(q) || (c.name_en ?? "").toLowerCase().includes(q));
    return CATEGORIES.map((category) => ({ category, items: list.filter((c) => c.category === category) })).filter((g) => g.items.length > 0);
  }, [courses, query]);

  async function save() {
    setBusy(true);
    setError("");
    try {
      await putJSON("/api/trail/passed", { codes: [...picked] });
      onClose();
    } catch {
      setError(t("status.error"));
      setBusy(false);
    }
  }
  // A student who started years ago has passed most of the first years: one tap per plan year.
  const years = useMemo(() => [...new Set((courses ?? []).filter((c) => c.required).map((c) => c.planYear).filter((y): y is number => !!y))].sort(), [courses]);
  // Courses that are one choice among several are left out: she took one of them, ticked by hand.
  const yearCodes = (y: number) => (courses ?? []).filter((c) => c.planYear === y && c.required).map((c) => c.code);
  const yearAll = (y: number) => yearCodes(y).every((c) => picked.has(c));
  const toggleYear = (y: number) => {
    const all = yearAll(y);
    setPicked((p) => { const next = new Set(p); for (const c of yearCodes(y)) { if (all) next.delete(c); else next.add(c); } return next; });
  };
  const toggle = (code: string) =>
    setPicked((p) => { const next = new Set(p); if (next.has(code)) next.delete(code); else next.add(code); return next; });

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center" style={{ background: "rgba(0,0,0,0.5)" }} onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("trail.passedTitle")}
        onClick={(e) => e.stopPropagation()}
        className="w-full md:max-w-lg flex flex-col rounded-t-3xl md:rounded-3xl border animate-slide-up"
        style={{ height: "min(92dvh, 760px)", backgroundColor: "var(--bg-surface)", borderColor: "var(--border-light)" }}
      >
        <div className="flex items-start justify-between gap-3 px-5 pt-5">
          <div>
            <h2 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>{t("trail.passedTitle")}</h2>
            <p className="text-sm mt-0.5" style={{ color: "var(--text-secondary)" }}>{t("trail.passedHint")}</p>
          </div>
          <button onClick={onClose} aria-label={t("uni.close")} className="w-11 h-11 -mr-2 -mt-2 shrink-0 flex items-center justify-center rounded-full" style={{ color: "var(--text-secondary)" }}>
            <Icon name="x" size={20} />
          </button>
        </div>
        <div className="px-5 pt-3 pb-2">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("tc.search")}
            aria-label={t("tc.search")}
            className="w-full rounded-xl border px-3 py-2.5 min-h-11"
            style={{ backgroundColor: "var(--bg-base)", borderColor: "var(--border)", color: "var(--text-primary)" }}
          />
        </div>
        {years.length > 0 && !query && (
          <div className="px-5 pb-2 flex flex-wrap gap-2">
            {years.map((y) => (
              <button key={y} onClick={() => toggleYear(y)} aria-pressed={yearAll(y)}
                className="rounded-full border px-3 min-h-11 text-sm inline-flex items-center gap-1"
                style={{ borderColor: yearAll(y) ? "var(--accent)" : "var(--border)", color: yearAll(y) ? "var(--accent-text)" : "var(--text-secondary)" }}>
                {yearAll(y) && <Icon name="check" size={14} />}
                {t("trail.passedYear", { n: y })}
              </button>
            ))}
          </div>
        )}
        <div className="flex-1 overflow-y-auto px-3 pb-2">
          {!courses && !error && <p className="text-sm text-center py-8" style={{ color: "var(--text-tertiary)" }}>{t("status.connecting")}</p>}
          {groups.map((g) => (
            <section key={g.category} className="mb-2">
              <h3 className="sticky top-0 px-2 py-1.5 text-xs font-semibold" style={{ backgroundColor: "var(--bg-surface)", color: "var(--text-tertiary)" }}>
                {t(`cat.${g.category}`)} · {g.items.length}
              </h3>
              <ul className="pick-list">
                {g.items.map((c) => {
                  const on = picked.has(c.code);
                  return (
                    <li key={c.code}>
                      <button
                        role="checkbox"
                        aria-checked={on}
                        onClick={() => toggle(c.code)}
                        className="pick-row"
                      >
                        <span
                          className="mt-0.5 w-6 h-6 shrink-0 rounded-md flex items-center justify-center"
                          style={{ border: `2px solid ${on ? "var(--accent)" : "var(--text-tertiary)"}`, backgroundColor: on ? "var(--accent)" : "transparent", color: "#fff" }}
                        >
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
            </section>
          ))}
        </div>
        <div className="px-5 py-3 border-t" style={{ borderColor: "var(--border-light)", paddingBottom: "calc(0.75rem + env(safe-area-inset-bottom))" }}>
          {error && <p role="alert" className="text-sm mb-2" style={{ color: "var(--danger)" }}>{error}</p>}
          <button onClick={save} disabled={busy || !courses} className="w-full rounded-xl min-h-11 font-semibold disabled:opacity-40" style={{ backgroundColor: "var(--accent)", color: "#fff" }}>
            {t("trail.passedSave", { n: picked.size })}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
