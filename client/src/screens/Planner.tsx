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

  async function setStatus(courseCode: string, status: string, grade: string | null) {
    try {
      await postJSON("/api/enrollments", { course_code: courseCode, status, grade });
      load();
    } catch { /* ignore */ }
  }

  if (failed && !data) return <ErrorBox onRetry={load} />;
  if (!data) return <Loading>{t("status.connecting")}</Loading>;

  const pct = Math.round((data.totalPassedCredits / data.totalPlannedCredits) * 100);

  const tabs = [
    { id: "plan" as const, label: t("plan.title") },
    { id: "whatif" as const, label: t("plan.whatIf") },
    { id: "scale" as const, label: t("plan.gradeScale") },
  ];

  return (
    <div className="wide-grid space-y-4">
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

      {tab === "plan" && <PlanTabContent data={data} pct={pct} onSetStatus={setStatus} />}
      {tab === "whatif" && <WhatIfTab gradeScale={data.gradeScale} currentGpa={data.gpa.gpa} />}
      {tab === "scale" && <GradeScaleTab scale={data.gradeScale} onSaved={load} />}
    </div>
  );
}

function PlanTabContent({
  data, pct, onSetStatus,
}: {
  data: PlanData; pct: number;
  onSetStatus: (code: string, status: string, grade: string | null) => void;
}) {
  const { t } = useT();
  return (
    <>
      <Card>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>{t("plan.gpa")}</h2>
          <span className="text-2xl font-bold" style={{ color: "var(--accent-text)" }}>
            {data.gpa.gpa != null ? data.gpa.gpa.toFixed(2) : "–"}
          </span>
        </div>
        {data.gpa.gpa == null && (
          <p className="text-sm mt-1" style={{ color: "var(--text-tertiary)" }}>{t("plan.gpaNoData")}</p>
        )}
      </Card>

      {data.pace.remainingCredits > 0 && (
        <div
          className="rounded-xl text-sm px-4 py-3"
          style={{
            backgroundColor: data.pace.status === "on_track" ? "var(--success-bg)"
              : data.pace.status === "heavy" ? "var(--warning-bg)" : "var(--danger-bg)",
            color: data.pace.status === "on_track" ? "var(--success)"
              : data.pace.status === "heavy" ? "var(--warning)" : "var(--danger)",
          }}
        >
          <div className="font-semibold">
            {t("plan.pace")}:{" "}
            {data.pace.status === "on_track" ? t("plan.paceOnTrack")
              : data.pace.status === "heavy" ? t("plan.paceHeavy") : t("plan.paceBehind")}
          </div>
          <div>{t("plan.paceRemaining", { n: data.pace.remainingCredits })}</div>
          <div>{t("plan.pacePerTerm", { n: data.pace.creditsPerTerm, terms: data.pace.futureTerms })}</div>
        </div>
      )}

      <div className="span-all">
        <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>{t("plan.title")}</h1>
        <p className="text-sm mt-1" style={{ color: "var(--text-tertiary)" }}>
          {t("plan.creditsPassed", { passed: data.totalPassedCredits, total: data.totalPlannedCredits })}
        </p>
        <div className="h-2 rounded-full overflow-hidden mt-1" style={{ backgroundColor: "var(--border-light)" }}>
          <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: "var(--accent)" }} />
        </div>
      </div>

      {(data.blocked.length > 0 || data.failed.length > 0) && (
        <div className="rounded-xl text-sm px-4 py-3 space-y-1" style={{ backgroundColor: "var(--danger-bg)", color: "var(--danger)" }}>
          {data.failed.map((f) =>
            f.retakeTerm ? (
              <div key={`f${f.course_code}`}>{t("plan.retake", { course: f.name_th, term: f.retakeTerm })}</div>
            ) : null,
          )}
          {data.blocked.length > 0 && <div className="font-semibold pt-1">{t("plan.blocked")}</div>}
          {data.blocked.map((b) => (
            <div key={`b${b.course_code}`}>
              {t("plan.blockedDueTo", { course: b.name_th ?? b.course_code, due: b.dueTo.join(", ") })}
            </div>
          ))}
        </div>
      )}

      <Card>
        <h2 className="font-semibold mb-2" style={{ color: "var(--text-primary)" }}>{t("plan.categories")}</h2>
        <div className="space-y-2">
          {data.categoryProgress.map((c) => (
            <div key={c.category}>
              <div className="flex justify-between text-xs" style={{ color: "var(--text-tertiary)" }}>
                <span>{t(`cat.${c.category}`)}</span>
                <span>{c.passed}/{c.required}</span>
              </div>
              <div className="h-1.5 rounded-full overflow-hidden mt-0.5" style={{ backgroundColor: "var(--border-light)" }}>
                <div
                  className="h-full rounded-full"
                  style={{ width: `${Math.min((c.passed / c.required) * 100, 100)}%`, backgroundColor: "var(--accent)" }}
                />
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <div className="flex justify-between items-center mb-2">
          <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>{t("plan.internship")}</h2>
          <span
            className="text-xs font-semibold rounded-full px-2 py-0.5"
            style={{
              backgroundColor: data.internship.eligible ? "var(--success-bg)" : "var(--bg-surface-hover)",
              color: data.internship.eligible ? "var(--success)" : "var(--text-tertiary)",
            }}
          >
            {data.internship.eligible ? t("plan.eligible") : t("plan.notEligible")}
          </span>
        </div>
        <ul className="space-y-1 text-sm">
          {data.internship.rules.map((r) => (
            <li key={r.id} className="flex justify-between">
              <span style={{ color: r.ok ? "var(--text-primary)" : "var(--text-tertiary)" }}>
                <span className="inline-flex items-center gap-1">{r.ok ? <Icon name="checkCircle" size={16} style={{ color: "var(--success)" }} /> : <Icon name="square" size={16} />} {t(`rule.${r.id}`)}</span>
              </span>
              <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>{r.detail}</span>
            </li>
          ))}
        </ul>
      </Card>

      {data.terms.map((term) => (
        <TermCard key={term.term_id} term={term} gradeScale={data.gradeScale} onSetStatus={onSetStatus} />
      ))}
    </>
  );
}

function TermCard({
  term, gradeScale, onSetStatus,
}: {
  term: PlanTerm; gradeScale: PlanGradeScale[];
  onSetStatus: (code: string, status: string, grade: string | null) => void;
}) {
  const { t } = useT();
  const isSummer = term.term_id.startsWith("S/");

  return (
    <Card>
      <div className="flex justify-between items-baseline mb-2">
        <h2 className="font-semibold" style={{ color: isSummer ? "var(--warning)" : "var(--accent-text)" }}>
          {term.term_id}
        </h2>
        <div className="text-right">
          <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            {t("plan.termCredits", { credits: term.credits, max: term.max_credits })} ·{" "}
            {t("plan.running", { n: term.runningTotal })}
          </span>
          {term.gpa != null && (
            <div className="text-xs font-medium" style={{ color: "var(--accent-text)" }}>
              {t("plan.termGpa", { gpa: term.gpa.toFixed(2) })}
            </div>
          )}
        </div>
      </div>
      <ul className="space-y-1.5">
        {term.items.map((it, i) => (
          <ItemRow key={i} item={it} gradeScale={gradeScale} onSetStatus={onSetStatus} />
        ))}
      </ul>
    </Card>
  );
}

function ItemRow({
  item, gradeScale, onSetStatus,
}: {
  item: PlanItem; gradeScale: PlanGradeScale[];
  onSetStatus: (code: string, status: string, grade: string | null) => void;
}) {
  const { t } = useT();

  if (!item.course_code) {
    return (
      <li className="text-sm italic px-2 py-1" style={{ color: "var(--text-tertiary)" }}>
        {item.placeholder_label} · {t("plan.placeholder")}
      </li>
    );
  }

  const showGrade = item.status === "PASSED";
  const statusBg = item.status === "PASSED"
    ? { borderLeft: "4px solid var(--success)", backgroundColor: "color-mix(in srgb, var(--success-bg) 40%, transparent)" }
    : item.status === "FAILED"
      ? { borderLeft: "4px solid var(--danger)", backgroundColor: "color-mix(in srgb, var(--danger-bg) 40%, transparent)" }
      : {};

  const selectStyle = { backgroundColor: "var(--bg-surface)", borderColor: "var(--border)", color: "var(--text-secondary)" };

  return (
    <li className="flex items-center gap-2 text-sm rounded-md px-2 py-1" style={statusBg}>
      <CourseTitle code={item.course_code} name_th={item.name_th} name_en={item.name_en} className="flex-1" />
      {showGrade && (
        <select aria-label={t("plan.gradeOf", { code: item.course_code })}
          value={item.grade ?? ""}
          onChange={(e) => onSetStatus(item.course_code!, "PASSED", e.target.value || null)}
          className="text-xs rounded border px-1 py-1 w-14 min-h-11"
          style={selectStyle}
        >
          <option value="">{t("plan.selectGrade")}</option>
          {gradeScale.map((g) => <option key={g.grade} value={g.grade}>{g.grade}</option>)}
        </select>
      )}
      <select aria-label={t("plan.statusOf", { code: item.course_code })}
        value={item.status ?? "PLANNED"}
        onChange={(e) => {
          const newStatus = e.target.value;
          const grade = newStatus === "PASSED" ? item.grade : null;
          onSetStatus(item.course_code!, newStatus, grade);
        }}
        className="text-xs rounded border px-1.5 py-1 min-h-11"
        style={selectStyle}
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
            style={{ backgroundColor: "var(--accent)", color: "var(--text-inverse)" }}
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
          <button onClick={() => setEditing(true)} className="text-xs font-medium min-h-11" style={{ color: "var(--accent-text)" }}>
            {t("plan.editScale")}
          </button>
        ) : (
          <button
            onClick={save} disabled={saving}
            className="text-xs rounded px-3 py-1 font-medium disabled:opacity-50 min-h-11"
            style={{ backgroundColor: "var(--accent)", color: "var(--text-inverse)" }}
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
