import { useEffect, useState } from "react";
import { useT } from "../i18n.tsx";
import Icon from "../components/Icon.tsx";
import {
  getJSON,
  postJSON,
  putJSON,
  type PlanData,
  type PlanItem,
  type PlanTerm,
  type PlanGradeScale,
  type WhatIfResult,
} from "../api.ts";
import { Card, ErrorBox, Loading } from "../components/ui.tsx";
import { CourseTitle } from "../components/CourseTitle.tsx";
import { navigateTo } from "../destinations.tsx";

/**
 * Grades: how each course went, term by term, the grade average, a "what if" calculator and the
 * grade scale. The plan to graduate, its verdict and the progress through the curriculum are the
 * trail's (Trail.tsx); marking a course passed here is the same record the trail reads.
 */
export default function Planner() {
  const { t } = useT();
  const [data, setData] = useState<PlanData | null>(null);
  const [tab, setTab] = useState<"plan" | "whatif" | "scale">("plan");

  const [failed, setFailed] = useState(false);
  function load() {
    setFailed(false);
    getJSON<PlanData>("/api/plan").then(setData).catch(() => setFailed(true));
  }
  useEffect(load, []);

  async function setStatus(courseCode: string, status: string, grade: string | null | undefined, termId?: string) {
    try {
      await postJSON("/api/enrollments", { course_code: courseCode, status, grade, term_id: termId });
      load();
    } catch { /* ignore */ }
  }

  if (failed && !data) return <ErrorBox onRetry={load} />;
  if (!data) return <Loading>{t("status.connecting")}</Loading>;

  const tabs = [
    { id: "plan" as const, label: t("grades.results") },
    { id: "whatif" as const, label: t("plan.whatIf") },
    { id: "scale" as const, label: t("plan.gradeScale") },
  ];

  return (
    <div className="wide-grid space-y-4">
      <h1 className="span-all text-2xl font-bold" style={{ color: "var(--text-primary)" }}>{t("grades.title")}</h1>
      <div className="span-all flex gap-1 rounded-lg p-1" style={{ backgroundColor: "var(--bg-surface-hover)" }}>
        {tabs.map((tb) => (
          <button
            key={tb.id}
            onClick={() => setTab(tb.id)}
            className="flex-1 text-sm rounded-md py-1.5 font-medium transition-colors min-h-11"
            style={{
              backgroundColor: tab === tb.id ? "var(--bg-surface)" : "transparent",
              color: tab === tb.id ? "var(--accent-text)" : "var(--text-tertiary)",
              boxShadow: tab === tb.id ? "var(--shadow-sm)" : "none",
            }}
          >
            {tb.label}
          </button>
        ))}
      </div>

      {tab === "plan" && <ResultsTab data={data} onSetStatus={setStatus} />}
      {tab === "whatif" && <WhatIfTab gradeScale={data.gradeScale} currentGpa={data.gpa.gpa} />}
      {tab === "scale" && <GradeScaleTab scale={data.gradeScale} onSaved={load} />}
    </div>
  );
}

type SetStatus = (code: string, status: string, grade: string | null | undefined, termId?: string) => void;

function ResultsTab({ data, onSetStatus }: { data: PlanData; onSetStatus: SetStatus }) {
  const { t } = useT();
  const nothing = data.terms.length === 0 && data.before.length === 0;
  return (
    <>
      <Card className="span-all">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>{t("plan.gpa")}</h2>
          <span className="text-2xl font-bold" style={{ color: "var(--accent-text)" }}>
            {data.gpa.gpa != null ? data.gpa.gpa.toFixed(2) : "–"}
          </span>
        </div>
        <p className="text-sm mt-1" style={{ color: "var(--text-tertiary)" }}>
          {data.gpa.gpa == null ? t("plan.gpaNoData") : t("grades.gpaOver", { n: data.gpa.courseCount, credits: data.gpa.totalCredits })}
        </p>
      </Card>

      {nothing && (
        <Card className="span-all">
          <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>{t("grades.empty")}</p>
          <button onClick={() => navigateTo("trail")} className="mt-2 rounded-xl border px-4 min-h-11 text-sm font-semibold inline-flex items-center gap-1.5" style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}>
            <Icon name="flag" size={15} />
            {t("grades.toTrail")}
          </button>
        </Card>
      )}

      {data.blocked.length > 0 && (
        <div className="span-all rounded-xl text-sm px-4 py-3 space-y-1" style={{ backgroundColor: "var(--danger-bg)", color: "var(--danger)" }}>
          <div className="font-semibold">{t("plan.blocked")}</div>
          {data.blocked.map((b) => (
            <div key={`b${b.course_code}`}>
              {t("plan.blockedDueTo", { course: b.name_th ?? b.course_code, due: b.dueTo.join(", ") })}
            </div>
          ))}
        </div>
      )}

      {/* Latest term first: that is the one she is filling in. */}
      {[...data.terms].reverse().map((term) => (
        <TermCard key={term.term_id} term={term} gradeScale={data.gradeScale} onSetStatus={onSetStatus} />
      ))}

      {data.before.length > 0 && (
        <Card>
          <h2 className="font-semibold mb-2" style={{ color: "var(--accent-text)" }}>{t("grades.before")}</h2>
          <ul className="space-y-1.5">
            {data.before.map((c) => (
              <li key={c.course_code} className="flex items-center gap-2 text-sm rounded-md px-2 py-1" style={{ borderLeft: "4px solid var(--success)", backgroundColor: "color-mix(in srgb, var(--success-bg) 40%, transparent)" }}>
                <CourseTitle code={c.course_code} name_th={c.name_th} name_en={c.name_en} className="flex-1" />
                <GradeSelect code={c.course_code} value={c.grade} gradeScale={data.gradeScale} onChange={(g) => onSetStatus(c.course_code, "PASSED", g)} />
              </li>
            ))}
          </ul>
        </Card>
      )}
      {!nothing && <p className="span-all text-xs" style={{ color: "var(--text-tertiary)" }}>{t("grades.hint")}</p>}
    </>
  );
}

function GradeSelect({ code, value, gradeScale, onChange }: { code: string; value: string | null; gradeScale: PlanGradeScale[]; onChange: (grade: string | null) => void }) {
  const { t } = useT();
  return (
    <select
      aria-label={t("plan.gradeOf", { code })}
      value={value ?? ""}
      onChange={(e) => onChange(e.target.value || null)}
      className="text-sm rounded border px-1 py-1 w-16 min-h-11"
      style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-primary)" }}
    >
      <option value="">{t("plan.selectGrade")}</option>
      {gradeScale.map((g) => <option key={g.grade} value={g.grade}>{g.grade}</option>)}
    </select>
  );
}

function TermCard({ term, gradeScale, onSetStatus }: { term: PlanTerm; gradeScale: PlanGradeScale[]; onSetStatus: SetStatus }) {
  const { t } = useT();
  const isSummer = term.term_id.startsWith("S/");

  return (
    <Card>
      <div className="flex justify-between items-baseline mb-2">
        <h2 className="font-semibold flex items-center gap-1.5" style={{ color: "var(--accent-text)" }}>
          {isSummer && <Icon name="sun" size={16} style={{ color: "var(--accent-2, var(--accent-text))" }} />}
          {term.term_id}
        </h2>
        <div className="text-right">
          <span className="text-sm whitespace-nowrap" style={{ color: "var(--text-tertiary)" }}>{t("trail.credits", { n: term.credits })}</span>
          {term.gpa != null && (
            <div className="text-xs font-medium" style={{ color: "var(--accent-text)" }}>
              {t("plan.termGpa", { gpa: term.gpa.toFixed(2) })}
            </div>
          )}
        </div>
      </div>
      <ul className="space-y-1.5">
        {term.items.map((it, i) => (
          <ItemRow key={i} item={it} termId={term.term_id} gradeScale={gradeScale} onSetStatus={onSetStatus} />
        ))}
      </ul>
    </Card>
  );
}

function ItemRow({ item, termId, gradeScale, onSetStatus }: { item: PlanItem; termId: string; gradeScale: PlanGradeScale[]; onSetStatus: SetStatus }) {
  const { t } = useT();

  if (!item.course_code) {
    return (
      <li className="text-sm italic px-2 py-1" style={{ color: "var(--text-tertiary)" }}>
        {item.placeholder_label} · {t("plan.placeholder")}
      </li>
    );
  }
  const code = item.course_code;
  const statusBg = item.status === "PASSED"
    ? { borderLeft: "4px solid var(--success)", backgroundColor: "color-mix(in srgb, var(--success-bg) 40%, transparent)" }
    : item.status === "FAILED"
      ? { borderLeft: "4px solid var(--danger)", backgroundColor: "color-mix(in srgb, var(--danger-bg) 40%, transparent)" }
      : {};

  return (
    <li className="flex items-center gap-2 text-sm rounded-md px-2 py-1" style={statusBg}>
      <CourseTitle code={code} name_th={item.name_th} name_en={item.name_en} className="flex-1" />
      {item.status === "PASSED" && (
        <GradeSelect code={code} value={item.grade} gradeScale={gradeScale} onChange={(g) => onSetStatus(code, "PASSED", g, termId)} />
      )}
      <select aria-label={t("plan.statusOf", { code })}
        value={item.status ?? "PLANNED"}
        // Changing the result keeps the grade already chosen (the server keeps it when none is sent).
        onChange={(e) => onSetStatus(code, e.target.value, undefined, termId)}
        className="text-sm rounded border px-1.5 py-1 min-h-11"
        style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-primary)" }}
      >
        <option value="PLANNED">{t("plan.status.PLANNED")}</option>
        <option value="PASSED">{t("plan.status.PASSED")}</option>
        <option value="FAILED">{t("plan.status.FAILED")}</option>
      </select>
    </li>
  );
}

type HypoEntry = { course_code: string; grade: string };

function WhatIfTab({ gradeScale, currentGpa }: { gradeScale: PlanGradeScale[]; currentGpa: number | null }) {
  const { t } = useT();
  const [entries, setEntries] = useState<HypoEntry[]>([{ course_code: "", grade: "" }]);
  const [result, setResult] = useState<WhatIfResult | null>(null);
  const [loading, setLoading] = useState(false);

  function updateEntry(i: number, field: keyof HypoEntry, val: string) {
    setEntries((prev) => prev.map((e, idx) => (idx === i ? { ...e, [field]: val } : e)));
  }
  function addEntry() { setEntries((prev) => [...prev, { course_code: "", grade: "" }]); }
  function removeEntry(i: number) { setEntries((prev) => prev.filter((_, idx) => idx !== i)); }

  async function calculate() {
    const valid = entries.filter((e) => e.course_code && e.grade);
    if (valid.length === 0) return;
    setLoading(true);
    try {
      const r = await postJSON<WhatIfResult>("/api/plan/what-if", { courses: valid });
      setResult(r);
    } catch { /* ignore */ } finally { setLoading(false); }
  }

  const inputStyle = { borderColor: "var(--border)", backgroundColor: "var(--bg-surface)", color: "var(--text-primary)" };

  return (
    <div className="span-all max-w-3xl space-y-4">
      <Card>
        <h2 className="font-semibold mb-1" style={{ color: "var(--text-primary)" }}>{t("plan.whatIf")}</h2>
        <p className="text-sm mb-3" style={{ color: "var(--text-tertiary)" }}>
          {t("plan.whatIfCurrent", { gpa: currentGpa != null ? currentGpa.toFixed(2) : "–" })}
        </p>
        <div className="space-y-2">
          {entries.map((entry, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input
                type="text"
                value={entry.course_code}
                onChange={(e) => updateEntry(i, "course_code", e.target.value.toUpperCase())}
                placeholder="MKT2101"
                className="flex-1 text-sm border rounded px-2 py-1.5 min-h-11"
                style={inputStyle}
              />
              <select aria-label={t("field.grade")}
                value={entry.grade}
                onChange={(e) => updateEntry(i, "grade", e.target.value)}
                className="text-sm border rounded px-2 py-1.5 w-16 min-h-11"
                style={inputStyle}
              >
                <option value="">{t("plan.grade")}</option>
                {gradeScale.map((g) => <option key={g.grade} value={g.grade}>{g.grade}</option>)}
              </select>
              {entries.length > 1 && (
                <button onClick={() => removeEntry(i)} className="text-lg leading-none min-h-11" style={{ color: "var(--text-tertiary)" }}>×</button>
              )}
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-3">
          <button
            onClick={addEntry}
            className="flex-1 text-sm border border-dashed rounded-lg py-1.5 min-h-11"
            style={{ borderColor: "var(--border)", color: "var(--text-tertiary)" }}
          >
            + {t("plan.whatIfAdd")}
          </button>
          <button
            onClick={calculate}
            disabled={loading}
            className="flex-1 text-sm rounded-lg py-1.5 font-medium disabled:opacity-50 min-h-11"
            style={{ backgroundColor: "var(--accent)", color: "#fff" }}
          >
            {t("plan.whatIfCalc")}
          </button>
        </div>
      </Card>

      {result && (
        <Card>
          <div className="flex justify-between items-center">
            <span className="text-sm" style={{ color: "var(--text-secondary)" }}>
              {t("plan.whatIfCurrent", { gpa: result.currentGpa?.toFixed(2) ?? "–" })}
            </span>
          </div>
          <div className="flex justify-between items-center mt-2">
            <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
              {t("plan.whatIfResult", {
                gpa: result.whatIfGpa?.toFixed(2) ?? "–",
                change: result.change != null ? `${result.change >= 0 ? "+" : ""}${result.change.toFixed(2)}` : "–",
              })}
            </span>
            <span
              className="text-xl font-bold"
              style={{ color: result.change != null && result.change >= 0 ? "var(--success)" : "var(--danger)" }}
            >
              {result.whatIfGpa?.toFixed(2) ?? "–"}
            </span>
          </div>
        </Card>
      )}

      {!result && (
        <p className="text-center text-sm py-4" style={{ color: "var(--text-tertiary)" }}>{t("plan.whatIfEmpty")}</p>
      )}
    </div>
  );
}

function GradeScaleTab({ scale, onSaved }: { scale: PlanGradeScale[]; onSaved: () => void }) {
  const { t } = useT();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<PlanGradeScale[]>(scale);
  const [saving, setSaving] = useState(false);

  useEffect(() => { setDraft(scale); }, [scale]);

  function updateDraft(i: number, points: number) {
    setDraft((prev) => prev.map((g, idx) => (idx === i ? { ...g, points } : g)));
  }

  async function save() {
    setSaving(true);
    try {
      await putJSON("/api/plan/grade-scale", { scale: draft });
      setEditing(false);
      onSaved();
    } catch { /* ignore */ } finally { setSaving(false); }
  }

  return (
    <Card>
      <div className="flex justify-between items-center mb-3">
        <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>{t("plan.gradeScale")}</h2>
        {!editing ? (
          <button onClick={() => setEditing(true)} className="text-sm min-h-11 px-1" style={{ color: "var(--accent-text)" }}>
            {t("plan.editScale")}
          </button>
        ) : (
          <button
            onClick={save} disabled={saving}
            className="text-sm rounded-lg px-3 py-1.5 font-medium disabled:opacity-50 min-h-11"
            style={{ backgroundColor: "var(--accent)", color: "#fff" }}
          >
            {t("plan.saveScale")}
          </button>
        )}
      </div>
      <div className="space-y-1.5">
        {draft.map((g, i) => (
          <div key={g.grade} className="flex items-center justify-between text-sm">
            <span className="font-medium w-10" style={{ color: "var(--text-primary)" }}>{g.grade}</span>
            {editing ? (
              <input aria-label={t("plan.pointsOf", { grade: g.grade })}
                type="number" step="0.5" min="0" max="4" value={g.points}
                onChange={(e) => updateDraft(i, parseFloat(e.target.value) || 0)}
                className="w-20 text-right border rounded px-2 py-1 text-sm min-h-11"
                style={{ borderColor: "var(--border)", backgroundColor: "var(--bg-surface)", color: "var(--text-primary)" }}
              />
            ) : (
              <span style={{ color: "var(--text-tertiary)" }}>{g.points.toFixed(1)} {t("plan.points")}</span>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
