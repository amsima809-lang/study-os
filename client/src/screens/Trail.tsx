/**
 * The trail to the degree: the student sets when they want to graduate, the app
 * says whether that is achievable and lays out what to take each term to get
 * there. The planning is done on the server (server/src/trail.ts) from the
 * curriculum and from which terms each course has been offered in before.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useT } from "../i18n.tsx";
import { getJSON, putJSON } from "../api.ts";
import { Card, ErrorBox, Loading } from "../components/ui.tsx";
import { CourseChip } from "../components/CourseTitle.tsx";
import { ChooseCoursesCard } from "../components/TermCourses.tsx";
import Icon from "../components/Icon.tsx";

type Category = "GE" | "CORE" | "MAJOR_REQ" | "MAJOR_ELEC" | "FREE";
type Item = {
  type: "course" | "choice" | "free";
  code: string | null;
  credits: number;
  category: Category;
  alternatives?: string[];
  label?: string;
  offered: number | null;
  of: number;
};
type Term = { term: string; kind: "1" | "2" | "S"; max: number; credits: number; items: Item[] };
type TrailData =
  | { available: false }
  | {
      available: true;
      currentTerm: string;
      goal: { target: string; summers: boolean; maxPerTerm: number; isDefault: boolean };
      targets: string[];
      limits: { regular: number; summer: number };
      trail: {
        achievable: boolean;
        finishTerm: string | null;
        earliestTerm: string | null;
        target: string;
        credits: { total: number; done: number; thisTerm: number; left: number };
        pace: number;
        terms: Term[];
        unplaced: { code: string | null; category: Category }[];
        recorded: Record<"1" | "2" | "S", number>;
      };
      names: { code: string; name_th: string; name_en: string | null }[];
      history: string[];
      chosenThisTerm: number;
      passedCount: number;
    };

export default function Trail() {
  const { t, lang } = useT();
  const [data, setData] = useState<TrailData | null>(null);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  const [picking, setPicking] = useState(false);

  const load = useCallback(() => {
    setError(false);
    return getJSON<TrailData>("/api/trail").then(setData).catch(() => setError(true));
  }, []);
  useEffect(() => { load(); }, [load]);

  /** "2/72" -> "Term 2/2572"; "S/71" -> "Summer 2571". */
  const termName = useCallback(
    (id: string) => {
      const [kind, yy] = id.split("/");
      return kind === "S" ? t("trail.summerOf", { year: `25${yy}` }) : t("trail.termOf", { n: kind, year: `25${yy}` });
    },
    [t],
  );
  const names = useMemo(() => new Map((data?.available ? data.names : []).map((n) => [n.code, n])), [data]);
  const nameOf = (code: string) => {
    const n = names.get(code);
    return n ? (lang === "en" && n.name_en ? n.name_en : n.name_th) : "";
  };

  if (error) return <ErrorBox onRetry={load} />;
  if (!data) return <Loading>{t("status.connecting")}</Loading>;
  if (!data.available) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>{t("trail.title")}</h1>
        <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>{t("trail.unavailable")}</p>
      </div>
    );
  }

  const { trail, goal } = data;
  async function setGoal(next: Partial<typeof goal>) {
    setSaving(true);
    try {
      await putJSON("/api/trail/goal", { target: goal.target, summers: goal.summers, maxPerTerm: goal.maxPerTerm, ...next });
      await load();
    } catch {
      setError(true);
    } finally {
      setSaving(false);
    }
  }
  const kindName = (k: "1" | "2" | "S") => t(k === "S" ? "trail.kindS" : k === "1" ? "trail.kind1" : "trail.kind2");
  const pct = (n: number) => `${Math.round((n / Math.max(1, trail.credits.total)) * 100)}%`;
  const fieldStyle = { backgroundColor: "var(--bg-base)", borderColor: "var(--border)", color: "var(--text-primary)" };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>{t("trail.title")}</h1>

      {/* The plan counts this term's courses as done: ask for them if they are not chosen. */}
      <ChooseCoursesCard onChanged={load} />

      {/* The goal */}
      <Card>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="block text-sm font-medium mb-1" style={{ color: "var(--text-secondary)" }}>{t("trail.goal")}</span>
            <select
              value={goal.target}
              disabled={saving}
              onChange={(e) => setGoal({ target: e.target.value })}
              className="w-full rounded-xl border px-3 min-h-11"
              style={fieldStyle}
            >
              {data.targets.map((id) => <option key={id} value={id}>{termName(id)}</option>)}
            </select>
          </label>
          <label className="block">
            <span className="block text-sm font-medium mb-1" style={{ color: "var(--text-secondary)" }}>{t("trail.maxPerTerm")}</span>
            <select
              value={goal.maxPerTerm}
              disabled={saving}
              onChange={(e) => setGoal({ maxPerTerm: Number(e.target.value) })}
              className="w-full rounded-xl border px-3 min-h-11"
              style={fieldStyle}
            >
              {[9, 12, 15, 18, 21, 24].filter((n) => n <= data.limits.regular).map((n) => (
                <option key={n} value={n}>{n === data.limits.regular ? t("trail.maxLimit", { n }) : t("trail.credits", { n })}</option>
              ))}
            </select>
          </label>
          <div>
            <span className="block text-sm font-medium mb-1" style={{ color: "var(--text-secondary)" }}>{t("trail.summers")}</span>
            <button
              role="switch"
              aria-checked={goal.summers}
              disabled={saving}
              onClick={() => setGoal({ summers: !goal.summers })}
              className="flex items-center gap-2 min-h-11"
              style={{ color: "var(--text-primary)" }}
            >
              <span className="relative inline-block w-11 h-6 rounded-full transition-colors" style={{ backgroundColor: goal.summers ? "var(--accent)" : "var(--border)" }}>
                <span className="absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all" style={{ left: goal.summers ? 22 : 2 }} />
              </span>
              <span className="text-sm">{t(goal.summers ? "trail.summersOn" : "trail.summersOff")}</span>
            </button>
          </div>
        </div>
      </Card>

      {/* The verdict */}
      {trail.credits.left === 0 ? (
        <div className="rounded-xl px-4 py-3" style={{ backgroundColor: "var(--success-bg)", color: "var(--success)" }}>
          <p className="font-semibold">{t("trail.finished")}</p>
        </div>
      ) : trail.achievable ? (
        <div className="rounded-xl px-4 py-3" style={{ backgroundColor: "var(--success-bg)", color: "var(--success)" }}>
          <p className="font-semibold">{t("trail.onTrack", { term: termName(trail.finishTerm!) })}</p>
          <p className="text-sm mt-0.5">
            {t("trail.pace", { n: trail.pace })}
            {trail.earliestTerm && trail.earliestTerm !== trail.finishTerm ? ` ${t("trail.couldBe", { term: termName(trail.earliestTerm) })}` : ""}
          </p>
        </div>
      ) : (
        <div className="rounded-xl px-4 py-3 space-y-2" style={{ backgroundColor: "var(--warning-bg, var(--danger-bg))", color: "var(--warning, var(--danger))" }}>
          <p className="font-semibold">{t("trail.notBy", { term: termName(goal.target) })}</p>
          {trail.earliestTerm ? (
            <>
              <p className="text-sm">{t("trail.earliest", { term: termName(trail.earliestTerm), n: Math.min(goal.maxPerTerm, data.limits.regular) })}</p>
              {data.targets.includes(trail.earliestTerm) && (
                <button
                  onClick={() => setGoal({ target: trail.earliestTerm! })}
                  disabled={saving}
                  className="rounded-xl px-4 min-h-11 text-sm font-semibold"
                  style={{ backgroundColor: "var(--accent)", color: "#fff" }}
                >
                  {t("trail.aimFor", { term: termName(trail.earliestTerm) })}
                </button>
              )}
            </>
          ) : (
            <p className="text-sm">{t("trail.cannotPlace")}</p>
          )}
        </div>
      )}
      {trail.unplaced.length > 0 && (
        <div className="rounded-xl px-4 py-3 text-sm" style={{ backgroundColor: "var(--danger-bg)", color: "var(--danger)" }}>
          <p className="font-semibold">{t("trail.unplacedTitle")}</p>
          <p className="mt-0.5">
            {trail.unplaced.map((u) => u.code ?? t(`cat.${u.category}`)).join(", ")}. {t(goal.summers ? "trail.unplacedHint" : "trail.unplacedHintSummer")}
          </p>
        </div>
      )}

      {/* Where she stands */}
      <Card>
        <div className="flex h-2.5 rounded-full overflow-hidden" style={{ backgroundColor: "var(--bg-surface-hover)" }} aria-hidden="true">
          <span style={{ width: pct(trail.credits.done), backgroundColor: "var(--success)" }} />
          <span style={{ width: pct(trail.credits.thisTerm), backgroundColor: "var(--accent)" }} />
        </div>
        <p className="text-sm mt-2" style={{ color: "var(--text-secondary)" }}>
          {t("trail.progress", { done: trail.credits.done, now: trail.credits.thisTerm, left: trail.credits.left, total: trail.credits.total })}
        </p>
        <button onClick={() => setPicking(true)} className="tap-area text-sm font-medium mt-1" style={{ color: "var(--accent-text)" }}>
          {t("trail.passedLink", { n: data.passedCount })} ›
        </button>
      </Card>

      {/* Term by term */}
      {trail.terms.map((term) => (
        <Card key={term.term}>
          <div className="flex items-baseline justify-between gap-2 mb-2">
            <h2 className="font-semibold" style={{ color: "var(--accent-text)" }}>{termName(term.term)}</h2>
            <span className="text-sm whitespace-nowrap" style={{ color: "var(--text-tertiary)" }}>{t("trail.credits", { n: term.credits })}</span>
          </div>
          <ul className="space-y-2.5">
            {term.items.map((item, i) => (
              <li key={`${item.code ?? item.category}-${i}`}>
                <div style={{ color: "var(--text-primary)" }}>
                  {item.code ? (
                    <>
                      <CourseChip code={item.code} className="mr-1.5" />
                      {nameOf(item.code)}
                    </>
                  ) : (
                    <span className="font-medium">{t("trail.freeElective")}</span>
                  )}
                </div>
                {/* Kept short: the category, whether it is hers to choose, and a warning only
                    when the course has NOT run in every recorded term of this kind. */}
                <div className="text-xs mt-0.5" style={{ color: "var(--text-tertiary)" }}>
                  {t(`cat.${item.category}`)}
                  {item.type === "choice" && ` · ${t("trail.yourChoice")}`}
                  {item.type === "free" && ` · ${t("trail.anyCourse")}`}
                  {item.code && (item.offered === null || item.offered < item.of) && (
                    <span style={{ color: "var(--warning, var(--danger))" }}>
                      {" · "}
                      {item.offered === null ? t("trail.noRecord") : t("trail.offered", { k: item.offered, n: item.of, kind: kindName(term.kind) })}
                    </span>
                  )}
                </div>
                {item.type === "choice" && (item.alternatives?.length ?? 0) > 0 && (
                  <details className="text-xs mt-0.5" style={{ color: "var(--text-secondary)" }}>
                    <summary className="tap-area cursor-pointer" style={{ color: "var(--accent-text)" }}>
                      {t("trail.alternatives", { n: item.alternatives!.length })}
                    </summary>
                    <ul className="mt-1 space-y-1">
                      {item.alternatives!.map((code) => (
                        <li key={code}><CourseChip code={code} className="mr-1.5" />{nameOf(code)}</li>
                      ))}
                    </ul>
                  </details>
                )}
              </li>
            ))}
          </ul>
        </Card>
      ))}

      {/* What it is based on, and what it cannot know */}
      <p className="text-xs flex gap-2" style={{ color: "var(--text-tertiary)" }}>
        <Icon name="info" size={14} style={{ marginTop: 2, flexShrink: 0 }} />
        <span>
          {t("trail.basis", { n: data.history.length, from: termName(data.history[0] ?? data.currentTerm), to: termName(data.history.at(-1) ?? data.currentTerm) })}
        </span>
      </p>

      {picking && <PassedPicker onClose={() => { setPicking(false); load(); }} />}
    </div>
  );
}

type PassedCourse = { code: string; name_th: string; name_en: string | null; credits: number; category: Category };
const CATEGORIES: Category[] = ["GE", "CORE", "MAJOR_REQ", "MAJOR_ELEC"];

/** Tick the courses already passed. */
function PassedPicker({ onClose }: { onClose: () => void }) {
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
        <div className="flex-1 overflow-y-auto px-3 pb-2">
          {!courses && !error && <p className="text-sm text-center py-8" style={{ color: "var(--text-tertiary)" }}>{t("status.connecting")}</p>}
          {groups.map((g) => (
            <section key={g.category} className="mb-2">
              <h3 className="sticky top-0 px-2 py-1.5 text-xs font-semibold" style={{ backgroundColor: "var(--bg-surface)", color: "var(--text-tertiary)" }}>
                {t(`cat.${g.category}`)} · {g.items.length}
              </h3>
              <ul>
                {g.items.map((c) => {
                  const on = picked.has(c.code);
                  return (
                    <li key={c.code}>
                      <button
                        role="checkbox"
                        aria-checked={on}
                        onClick={() => toggle(c.code)}
                        className="w-full flex items-start gap-3 rounded-xl px-2 py-2.5 text-left min-h-11"
                        style={{ backgroundColor: on ? "var(--accent-light)" : "transparent" }}
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
