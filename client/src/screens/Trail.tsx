/**
 * The trail to the degree: the student sets when they want to graduate, the app
 * says whether that is achievable and lays out what to take each term to get
 * there. The planning is done on the server (server/src/trail.ts) from the
 * curriculum and from which terms each course has been offered in before.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useT } from "../i18n.tsx";
import { getJSON, putJSON } from "../api.ts";
import { formatDate, timeRange, weekdayName } from "../format.ts";
import { Card, ErrorBox, Loading } from "../components/ui.tsx";
import { CourseChip } from "../components/CourseTitle.tsx";
import TermCoursesPicker, { ChooseCoursesCard, EditCoursesButton } from "../components/TermCourses.tsx";
import { REMINDERS_CHANGED } from "../components/Reminders.tsx";
import Icon from "../components/Icon.tsx";
import PassedPicker from "../components/PassedPicker.tsx";

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
      limits: { regular: number; summer: number; regularMin: number };
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
      /** This term: what she registered for, and what the trail would have her take. */
      thisTerm: { term: string; courses: { code: string; name_th: string; name_en: string | null; credits: number; category: string | null; registered: boolean; suggested: boolean }[] };
      categories: { category: string; required: number; passed: number }[];
      /** The same plan with summer terms switched the other way. */
      otherSummers: { summers: boolean; achievable: boolean; earliestTerm: string | null };
      /** For courses in a summer term of the plan: how each ran in the latest past summer. */
      lastSummer: Record<string, LastRun>;
    };
type LastRun = {
  term: string;
  classes: { days: number[]; start: string | null; end: string | null; room: string; kind: string; text: string }[];
  exam_date: string | null;
  exam_slot: string | null;
  exam_note: string | null;
};

export default function Trail() {
  const { t, lang } = useT();
  const [data, setData] = useState<TrailData | null>(null);
  const [error, setError] = useState(false);
  const [saving, setSaving] = useState(false);
  // A goal change shows at once (the switch moves, the menu shows the new choice) while the plan
  // is worked out again; a save that fails is said in the goal card and the old goal comes back.
  const [pendingGoal, setPendingGoal] = useState<Partial<{ target: string; summers: boolean; maxPerTerm: number }> | null>(null);
  const [goalFailed, setGoalFailed] = useState(false);
  const [picking, setPicking] = useState(false);
  // This term's courses: the full list ("Edit courses"), and a tick being saved.
  const [editing, setEditing] = useState(false);
  const [ticking, setTicking] = useState<string | null>(null);
  // A tick shows at once; the plan below catches up when the save comes back.
  const [ticked, setTicked] = useState<Record<string, boolean>>({});
  // Courses unticked during this visit. One the trail does not suggest would otherwise drop out
  // of the list once unticked, and a slip could not be undone on the card.
  type NowCourse = { code: string; name_th: string; name_en: string | null; credits: number; category: string | null; registered: boolean; suggested: boolean };
  const [dropped, setDropped] = useState<Record<string, NowCourse>>({});
  // A save that failed: said inside the card, not by blanking the whole screen.
  const [tickFailed, setTickFailed] = useState(false);

  // Every request for the plan takes a number; only the latest one's answer is shown, so a slow
  // answer can never put an older plan back on screen after a newer one. `inflight` is the newest
  // request: a save waits for it (not just its own), so the screen is never unlocked on old data.
  const latest = useRef(0);
  const inflight = useRef<Promise<unknown>>(Promise.resolve());
  /** Ask for the plan. `inline`: a failure is reported by the caller (inside its card), not by blanking the screen. */
  const load = useCallback((inline = false): Promise<boolean> => {
    const n = ++latest.current;
    if (!inline) setError(false);
    const p = getJSON<TrailData>("/api/trail").then(
      (d) => { if (n === latest.current) setData(d); return true; },
      () => { if (n === latest.current && !inline) setError(true); return false; },
    );
    inflight.current = p;
    return p;
  }, []);
  /** Wait until the newest request for the plan, whichever started it, has answered. */
  const settled = async () => { let p; do { p = inflight.current; await p; } while (p !== inflight.current); };
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

  if (error) return <ErrorBox onRetry={() => load()} />;
  if (!data) return <Loading>{t("status.connecting")}</Loading>;
  if (!data.available) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>{t("trail.title")}</h1>
        <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>{t("trail.unavailable")}</p>
      </div>
    );
  }

  const { trail } = data;
  // What the controls show: the saved goal, with a change being saved on top.
  const goal = { ...data.goal, ...pendingGoal };
  async function setGoal(next: Partial<{ target: string; summers: boolean; maxPerTerm: number }>) {
    if (!data || !data.available || saving || ticking) return;
    const n = ++latest.current;
    const wanted = { target: goal.target, summers: goal.summers, maxPerTerm: goal.maxPerTerm, ...next };
    setPendingGoal(next);
    setGoalFailed(false);
    setSaving(true);
    try {
      // The answer IS the new plan: shown straight from it, not from a second request.
      const fresh = await putJSON<TrailData & { ok: true }>("/api/trail/goal", wanted);
      // Shown unless another request for the plan started meanwhile: then ask again, after both.
      if (fresh && fresh.available && n === latest.current) setData(fresh);
      else if (!(await load(true))) setGoalFailed(true);
    } catch {
      setGoalFailed(true);
      // It may have been saved before the answer was lost, and an earlier request's answer was
      // set aside for this one: show what the server holds now.
      await load(true);
    } finally {
      await settled();
      setPendingGoal(null);
      setSaving(false);
    }
  }
  /** Tick or untick one of this term's courses: saved at once, and the plan re-made around it. */
  async function toggleThisTerm(code: string) {
    if (!data || !data.available || ticking || saving) return;
    const mine = new Set(nowCourses.filter((c) => c.on).map((c) => c.code));
    const row = nowCourses.find((c) => c.code === code);
    const on = !mine.has(code);
    if (on) mine.add(code); else mine.delete(code);
    setTicked((m) => ({ ...m, [code]: on }));
    setTicking(code);
    setTickFailed(false);
    try {
      await putJSON("/api/term-courses", { codes: [...mine] });
      // Today, the timetable and the exams listen for this and reload.
      window.dispatchEvent(new Event(REMINDERS_CHANGED));
      if (row) setDropped((d) => { const n = { ...d }; if (on) delete n[code]; else n[code] = { ...row, registered: false }; return n; });
      if (!(await load(true))) setTickFailed(true);
      await settled();
      setTicked({});
    } catch {
      setTicked((m) => { const n = { ...m }; delete n[code]; return n; });
      setTickFailed(true);
    } finally {
      setTicking(null);
    }
  }
  // A goal change and a tick are never saved at the same time: each waits for the other.
  const busy = saving || !!ticking;
  const listed = new Set(data.thisTerm.courses.map((c) => c.code));
  const nowCourses = [...data.thisTerm.courses, ...Object.values(dropped).filter((c) => !listed.has(c.code))]
    .sort((a, b) => a.code.localeCompare(b.code))
    .map((c) => ({ ...c, on: ticked[c.code] ?? c.registered }));
  const anyOn = nowCourses.some((c) => c.on);
  const nowCredits = nowCourses.filter((c) => c.on).reduce((n, c) => n + c.credits, 0);
  const suggestedCredits = nowCourses.filter((c) => c.suggested).reduce((n, c) => n + c.credits, 0);
  // With nothing registered, the plan's first term IS this term: its course places are in the
  // card above, so the card below would repeat them. Its elective places (no course) stay.
  const planNow = trail.terms.find((x) => x.term === data.currentTerm);
  const placesNow = planNow ? planNow.items.filter((i) => !i.code) : [];
  const laterTerms = trail.terms.filter((x) => x.term !== data.currentTerm);
  /** The later term the plan now puts a course in, if any. */
  const plannedFor = (code: string) => laterTerms.find((x) => x.items.some((i) => i.code === code))?.term ?? null;

  /** Order of terms: 2/69 < S/69 < 1/70. */
  const ord = (id: string) => { const [k, yy] = id.split("/"); return +yy * 10 + (k === "1" ? 1 : k === "2" ? 2 : 3); };
  // "Aim for": the earliest finish, or (a summer is not a graduation target here) the first target after it.
  const aimTerm = trail.earliestTerm ? data.targets.find((x) => ord(x) >= ord(trail.earliestTerm!)) ?? null : null;
  const other = data.otherSummers;
  const summerLine = !other.earliestTerm
    ? null
    : !trail.earliestTerm
      ? t(other.summers ? "trail.withSummers" : "trail.withoutSummers", { term: termName(other.earliestTerm) })
      : other.earliestTerm === trail.earliestTerm
      ? t("trail.summersSame")
      : t(other.summers ? "trail.withSummers" : "trail.withoutSummers", { term: termName(other.earliestTerm) });
  // Multiples of 3 from the university's minimum, and its limit itself (22).
  const maxChoices = [...new Set([...Array.from({ length: 8 }, (_, i) => data.limits.regularMin + i * 3).filter((n) => n < data.limits.regular), data.limits.regular])];
  /** "Mon, Wed, Fri 08:30–10:20 · KTB 301" for a class as it ran in a past summer. */
  const classLine = (c: LastRun["classes"][number]) =>
    c.days.length > 0 && c.start && c.end
      ? `${c.days.map((d) => weekdayName(d, lang).slice(0, lang === "en" ? 3 : undefined)).join(lang === "en" ? ", " : " ")} ${timeRange(c.start, c.end)}${c.kind ? ` (${c.kind.replace(/\.$/, "")})` : ""}${c.room ? ` · ${c.room}` : ""}`
      : c.text;
  const kindName = (k: "1" | "2" | "S") => t(k === "S" ? "trail.kindS" : k === "1" ? "trail.kind1" : "trail.kind2");
  const pct = (n: number) => `${Math.round((n / Math.max(1, trail.credits.total)) * 100)}%`;
  const fieldStyle = { backgroundColor: "var(--bg-base)", borderColor: "var(--border)", color: "var(--text-primary)" };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>{t("trail.title")}</h1>

      {/* The plan counts this term's courses as done: ask for them if they are not chosen. */}
      <ChooseCoursesCard onChanged={() => load()} onTrail />

      {/* The goal */}
      <Card>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block">
            <span className="block text-sm font-medium mb-1" style={{ color: "var(--text-secondary)" }}>{t("trail.goal")}</span>
            <select
              value={goal.target}
              disabled={busy}
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
              disabled={busy}
              onChange={(e) => setGoal({ maxPerTerm: Number(e.target.value) })}
              className="w-full rounded-xl border px-3 min-h-11"
              style={fieldStyle}
            >
              {maxChoices.map((n) => (
                <option key={n} value={n}>{n === data.limits.regular ? t("trail.maxLimit", { n }) : t("trail.credits", { n })}</option>
              ))}
            </select>
          </label>
          <div>
            <span className="block text-sm font-medium mb-1" style={{ color: "var(--text-secondary)" }}>{t("trail.summers")}</span>
            <button
              role="switch"
              aria-checked={goal.summers}
              disabled={busy}
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
        {/* Said while the plan is worked out again, and if the change could not be saved. */}
        <p className="text-sm mt-2 min-h-5" aria-live="polite" style={{ color: goalFailed ? "var(--danger)" : "var(--text-tertiary)" }}>
          {saving ? t("trail.replanning") : goalFailed ? t("trail.goalFailed") : ""}
        </p>
      </Card>

      <div className="space-y-4 transition-opacity" style={{ opacity: saving ? 0.55 : 1 }} aria-busy={saving}>

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
          <p className="font-semibold">{t("trail.notBy", { term: termName(trail.target) })}</p>
          {trail.earliestTerm ? (
            <>
              <p className="text-sm">{t("trail.earliest", { term: termName(trail.earliestTerm), n: Math.min(data.goal.maxPerTerm, data.limits.regular) })}</p>
              {aimTerm && (
                <button
                  onClick={() => setGoal({ target: aimTerm })}
                  disabled={busy}
                  className="rounded-xl px-4 min-h-11 text-sm font-semibold"
                  style={{ backgroundColor: "var(--accent)", color: "#fff" }}
                >
                  {t("trail.aimFor", { term: termName(aimTerm) })}
                </button>
              )}
            </>
          ) : (
            <p className="text-sm">{t("trail.cannotPlace")}</p>
          )}
        </div>
      )}
      {/* What summer terms change, both ways, so switching them always shows its effect. */}
      {trail.credits.left > 0 && summerLine && (
        <p className="text-sm flex gap-2" style={{ color: "var(--text-secondary)" }}>
          <Icon name="sun" size={16} style={{ marginTop: 2, flexShrink: 0, color: "var(--accent-2, var(--accent-text))" }} />
          <span>{summerLine}</span>
        </p>
      )}
      {trail.unplaced.length > 0 && (
        <div className="rounded-xl px-4 py-3 text-sm" style={{ backgroundColor: "var(--danger-bg)", color: "var(--danger)" }}>
          <p className="font-semibold">{t("trail.unplacedTitle")}</p>
          <p className="mt-0.5">
            {trail.unplaced.map((u) => u.code ?? t(`cat.${u.category}`)).join(", ")}. {t(data.goal.summers ? "trail.unplacedHint" : "trail.unplacedHintSummer")}
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
        <button onClick={() => setPicking(true)} disabled={busy} className="tap-area text-sm font-medium mt-1 disabled:opacity-50" style={{ color: "var(--accent-text)" }}>
          {t("trail.passedLink", { n: data.passedCount })} ›
        </button>
        {/* Passed credits in each part of the curriculum */}
        <div className="mt-4 space-y-2">
          {data.categories.map((c) => (
            <div key={c.category}>
              <div className="flex justify-between text-xs" style={{ color: "var(--text-tertiary)" }}>
                <span>{t(`cat.${c.category}`)}</span>
                <span>{c.passed}/{c.required}</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden mt-0.5" style={{ backgroundColor: "var(--border-light)" }}>
                <div className="h-full rounded-full" style={{ width: `${Math.min((c.passed / c.required) * 100, 100)}%`, backgroundColor: "var(--success)" }} />
              </div>
            </div>
          ))}
        </div>
      </Card>

      {/* This term: registered courses ticked and marked, the trail's suggestions not. Ticking
          or unticking saves at once, and every term below is planned again around the result. */}
      <Card>
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: "var(--accent-2, var(--accent-text))" }}>{t("trail.nowLabel")}</p>
            <h2 className="font-semibold" style={{ color: "var(--accent-text)" }}>{termName(data.currentTerm)}</h2>
          </div>
          <span className="text-sm whitespace-nowrap mt-4" style={{ color: "var(--text-tertiary)" }} aria-live="polite">
            {ticking ? t("trail.replanning") : anyOn ? t("trail.credits", { n: nowCredits }) : t("trail.nowPlanCredits", { n: suggestedCredits })}
          </span>
        </div>
        <p className="text-xs mt-1 mb-3" style={{ color: "var(--text-tertiary)" }}>
          {nowCourses.length === 0 ? t("trail.nowHintEmpty") : anyOn ? t("trail.nowHint") : t("trail.nowHintNone")}
        </p>
        {tickFailed && (
          <p role="alert" className="text-sm mb-3" style={{ color: "var(--danger)" }}>{t("trail.tickFailed")}</p>
        )}
        {nowCourses.length > 0 && (
          <ul className="pick-list" aria-busy={!!ticking}>
            {nowCourses.map((c) => (
              <li key={c.code}>
                <button role="checkbox" aria-checked={c.on} disabled={busy} onClick={() => toggleThisTerm(c.code)} className="pick-row disabled:opacity-70">
                  <span
                    className="mt-0.5 w-6 h-6 shrink-0 rounded-md flex items-center justify-center"
                    style={{ border: `2px solid ${c.on ? "var(--accent)" : "var(--text-tertiary)"}`, backgroundColor: c.on ? "var(--accent)" : "transparent", color: "#fff" }}
                  >
                    {c.on && <Icon name="check" size={14} />}
                  </span>
                  <span className="flex-1 min-w-0">
                    <span className="block" style={{ color: "var(--text-primary)" }}>
                      <CourseChip code={c.code} className="mr-1.5" />
                      {lang === "en" && c.name_en ? c.name_en : c.name_th}
                    </span>
                    <span className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>
                      {/* What it is now, in words as well as the tick. Registered; or, before
                          anything is registered, what the trail suggests; or not registered,
                          with the later term the plan has moved it to. */}
                      {c.on ? (
                        <span className="rounded-full px-2 py-0.5 font-semibold" style={{ backgroundColor: "var(--success-bg)", color: "var(--success)" }}>{t("trail.registered")}</span>
                      ) : !anyOn && c.suggested ? (
                        <span className="rounded-full px-2 py-0.5 font-semibold" style={{ backgroundColor: "color-mix(in srgb, var(--accent-2, var(--accent)) 16%, transparent)", color: "var(--accent-2, var(--accent-text))" }}>{t("trail.suggestedTag")}</span>
                      ) : (
                        <span className="rounded-full px-2 py-0.5 font-semibold" style={{ backgroundColor: "var(--bg-surface-hover)", color: "var(--text-secondary)" }}>
                          {plannedFor(c.code) ? t("trail.notRegisteredFor", { term: termName(plannedFor(c.code)!) }) : t("trail.notRegistered")}
                        </span>
                      )}
                      <span>{t("trail.credits", { n: c.credits })}</span>
                      {c.category && <span>· {t(`cat.${c.category}`)}</span>}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {placesNow.length > 0 && (
          <ul className="mt-3 space-y-1.5 text-sm" style={{ color: "var(--text-secondary)" }}>
            {placesNow.map((p, i) => (
              <li key={i}>+ {t("trail.freeElective")} · {t(`cat.${p.category}`)} · {t("trail.credits", { n: p.credits })}</li>
            ))}
          </ul>
        )}
        <div className="mt-3 flex justify-end">
          <EditCoursesButton count={nowCourses.filter((c) => c.on).length} onClick={() => setEditing(true)} disabled={busy} />
        </div>
      </Card>

      {/* The terms after this one */}
      {laterTerms.map((term) => (
        <Card key={term.term}>
          <div className="flex items-baseline justify-between gap-2 mb-2">
            <h2 className="font-semibold flex items-center gap-1.5" style={{ color: "var(--accent-text)" }}>
              {term.kind === "S" && <Icon name="sun" size={16} style={{ color: "var(--accent-2, var(--accent-text))" }} />}
              {termName(term.term)}
            </h2>
            <span className="text-sm whitespace-nowrap" style={{ color: "var(--text-tertiary)" }}>{t("trail.credits", { n: term.credits })}</span>
          </div>
          {/* A summer, as the university's regulation sets it (server/src/trail.ts, CREDIT_LIMITS). */}
          {term.kind === "S" && (
            <p className="text-xs -mt-1 mb-2.5" style={{ color: "var(--text-tertiary)" }}>{t("trail.summerFacts", { n: data.limits.summer })}</p>
          )}
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
                {/* In a summer: how it ran last summer, for a guide to days and times (that summer's own list is not out yet). */}
                {term.kind === "S" && item.code && data.lastSummer[item.code] && (() => {
                  const run = data.lastSummer[item.code];
                  return (
                    <div className="text-xs mt-1 rounded-lg px-2.5 py-1.5" style={{ backgroundColor: "var(--bg-surface-hover)", color: "var(--text-secondary)" }}>
                      <span className="font-medium">{t("trail.lastSummer", { term: termName(run.term) })}</span>{" "}
                      {run.classes.map(classLine).join(" · ")}
                      {run.exam_date
                        ? ` · ${t("trail.lastSummerExam", { date: formatDate(run.exam_date, lang), slot: run.exam_slot ?? "" })}`
                        : run.exam_note ? ` · ${run.exam_note === "คณะจัดสอบเอง" ? t("exams.facultyTitle") : run.exam_note}` : ""}
                    </div>
                  );
                })()}
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
      </div>

      {/* What it is based on, and what it cannot know */}
      <p className="text-xs flex gap-2" style={{ color: "var(--text-tertiary)" }}>
        <Icon name="info" size={14} style={{ marginTop: 2, flexShrink: 0 }} />
        <span>
          {t("trail.basis", { n: data.history.length, from: termName(data.history[0] ?? data.currentTerm), to: termName(data.history.at(-1) ?? data.currentTerm) })}
        </span>
      </p>

      {picking && <PassedPicker onClose={() => { setPicking(false); load(); }} />}
      {editing && <TermCoursesPicker onClose={() => { setEditing(false); load(); }} />}
    </div>
  );
}
