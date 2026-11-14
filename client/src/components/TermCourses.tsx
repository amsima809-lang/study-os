/**
 * "My courses this term": the picker that tells the app which courses a
 * student is actually taking, so the timetable, exams, study plan and mock
 * exams show only those. Until a student chooses, the app shows every course
 * of their program.
 */
import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useT } from "../i18n.tsx";
import { getJSON, putJSON, type ApiError } from "../api.ts";
import { CourseChip } from "./CourseTitle.tsx";
import { REMINDERS_CHANGED } from "./Reminders.tsx";
import Icon from "./Icon.tsx";

type Option = { code: string; name_th: string; name_en: string | null; category: string; classes: string | null };
type Data = { term: string; chosen: string[]; options: Option[] };

const CATEGORIES = ["GE", "CORE", "MAJOR_REQ", "MAJOR_ELEC", "FREE"];
const DAY_KEYS = ["", "cal.mon", "cal.tue", "cal.wed", "cal.thu", "cal.fri", "cal.sat", "cal.sun"];

export default function TermCoursesPicker({ onClose }: { onClose: () => void }) {
  const { t, lang } = useT();
  const [data, setData] = useState<Data | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [onlyPicked, setOnlyPicked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    getJSON<Data>("/api/term-courses")
      .then((d) => { setData(d); setPicked(new Set(d.chosen)); })
      .catch(() => setError(t("status.error")));
  }, [t]);

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
    const known = CATEGORIES.map((c) => ({ category: c, items: list.filter((o) => o.category === c) }));
    const other = list.filter((o) => !CATEGORIES.includes(o.category));
    return [...known, { category: "OTHER", items: other }].filter((g) => g.items.length > 0);
  }, [data, query, onlyPicked, picked]);

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
          return `${t(DAY_KEYS[Number(day)] ?? "")} ${time.replace("-", "–")}`;
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
            className="flex-1 min-w-0 rounded-xl border px-3 py-2.5"
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
              <h3 className="sticky top-0 px-2 py-1.5 text-xs font-semibold" style={{ backgroundColor: "var(--bg-surface)", color: "var(--text-tertiary)" }}>
                {g.category === "OTHER" ? t("tc.other") : t(`cat.${g.category}`)} · {g.items.length}
              </h3>
              <ul>
                {g.items.map((o) => {
                  const on = picked.has(o.code);
                  return (
                    <li key={o.code}>
                      <button
                        role="checkbox"
                        aria-checked={on}
                        onClick={() => toggle(o.code)}
                        className="w-full flex items-start gap-3 rounded-xl px-2 py-2.5 text-left"
                        style={{ backgroundColor: on ? "var(--accent-light)" : "transparent" }}
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
            {picked.size === 0 ? t("tc.noneMeansAll") : t("tc.savedMeans")}
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
    </div>,
    document.body,
  );
}
