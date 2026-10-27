import { useEffect, useState } from "react";
import { useT } from "../i18n.tsx";
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
import { Card, Loading } from "../components/ui.tsx";
import { CourseTitle } from "../components/CourseTitle.tsx";

export default function Planner() {
  const { t } = useT();
  const [data, setData] = useState<PlanData | null>(null);
  const [tab, setTab] = useState<"plan" | "whatif" | "scale">("plan");

  function load() {
    getJSON<PlanData>("/api/plan").then(setData).catch(() => setData(null));
  }
  useEffect(load, []);

  async function setStatus(courseCode: string, status: string, grade: string | null) {
    try {
      await postJSON("/api/enrollments", { course_code: courseCode, status, grade });
      load();
    } catch {
      /* ignore */
    }
  }

  if (!data) return <Loading>{t("status.connecting")}</Loading>;

  const pct = Math.round((data.totalPassedCredits / data.totalPlannedCredits) * 100);

  const tabs = [
    { id: "plan" as const, label: t("plan.title") },
    { id: "whatif" as const, label: t("plan.whatIf") },
    { id: "scale" as const, label: t("plan.gradeScale") },
  ];

  return (
    <div className="space-y-4">
      <div className="flex gap-1 bg-slate-100 rounded-lg p-1">
        {tabs.map((tb) => (
          <button
            key={tb.id}
            onClick={() => setTab(tb.id)}
            className={`flex-1 text-sm rounded-md py-1.5 font-medium transition-colors ${
              tab === tb.id ? "bg-white text-indigo-600 shadow-sm" : "text-slate-500"
            }`}
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
  data,
  pct,
  onSetStatus,
}: {
  data: PlanData;
  pct: number;
  onSetStatus: (code: string, status: string, grade: string | null) => void;
}) {
  const { t } = useT();
  return (
    <>
      <Card>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-slate-700">{t("plan.gpa")}</h2>
          <span className="text-2xl font-bold text-indigo-600">
            {data.gpa.gpa != null ? data.gpa.gpa.toFixed(2) : "–"}
          </span>
        </div>
        {data.gpa.gpa == null && (
          <p className="text-sm text-slate-400 mt-1">{t("plan.gpaNoData")}</p>
        )}
      </Card>

      {data.pace.remainingCredits > 0 && (
        <div
          className={`rounded-xl text-sm px-4 py-3 ${
            data.pace.status === "on_track"
              ? "bg-green-50 text-green-700"
              : data.pace.status === "heavy"
                ? "bg-amber-50 text-amber-700"
                : "bg-red-50 text-red-700"
          }`}
        >
          <div className="font-semibold">
            {t("plan.pace")}:{" "}
            {data.pace.status === "on_track"
              ? t("plan.paceOnTrack")
              : data.pace.status === "heavy"
                ? t("plan.paceHeavy")
                : t("plan.paceBehind")}
          </div>
          <div>{t("plan.paceRemaining", { n: data.pace.remainingCredits })}</div>
          <div>{t("plan.pacePerTerm", { n: data.pace.creditsPerTerm, terms: data.pace.futureTerms })}</div>
        </div>
      )}

      <div>
        <h1 className="text-2xl font-bold text-slate-800">{t("plan.title")}</h1>
        <p className="text-sm text-slate-500 mt-1">
          {t("plan.creditsPassed", { passed: data.totalPassedCredits, total: data.totalPlannedCredits })}
        </p>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden mt-1">
          <div className="h-full bg-indigo-500" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {(data.blocked.length > 0 || data.failed.length > 0) && (
        <div className="rounded-xl bg-red-50 text-red-700 text-sm px-4 py-3 space-y-1">
          {data.failed.map((f) =>
            f.retakeTerm ? (
              <div key={`f${f.course_code}`}>
                {t("plan.retake", { course: f.name_th, term: f.retakeTerm })}
              </div>
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
        <h2 className="font-semibold text-slate-700 mb-2">{t("plan.categories")}</h2>
        <div className="space-y-2">
          {data.categoryProgress.map((c) => (
            <div key={c.category}>
              <div className="flex justify-between text-xs text-slate-500">
                <span>{t(`cat.${c.category}`)}</span>
                <span>{c.passed}/{c.required}</span>
              </div>
              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden mt-0.5">
                <div
                  className="h-full bg-indigo-400"
                  style={{ width: `${Math.min((c.passed / c.required) * 100, 100)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card>
        <div className="flex justify-between items-center mb-2">
          <h2 className="font-semibold text-slate-700">{t("plan.internship")}</h2>
          <span
            className={`text-xs font-semibold rounded-full px-2 py-0.5 ${
              data.internship.eligible ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"
            }`}
          >
            {data.internship.eligible ? t("plan.eligible") : t("plan.notEligible")}
          </span>
        </div>
        <ul className="space-y-1 text-sm">
          {data.internship.rules.map((r) => (
            <li key={r.id} className="flex justify-between">
              <span className={r.ok ? "text-slate-700" : "text-slate-500"}>
                {r.ok ? "✅" : "⬜"} {t(`rule.${r.id}`)}
              </span>
              <span className="text-slate-400 text-xs">{r.detail}</span>
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

const STATUS_STYLE: Record<string, string> = {
  PASSED: "border-l-4 border-green-400 bg-green-50/40",
  FAILED: "border-l-4 border-red-400 bg-red-50/40",
};

function TermCard({
  term,
  gradeScale,
  onSetStatus,
}: {
  term: PlanTerm;
  gradeScale: PlanGradeScale[];
  onSetStatus: (code: string, status: string, grade: string | null) => void;
}) {
  const { t } = useT();
  const isSummer = term.term_id.startsWith("S/");

  return (
    <Card>
      <div className="flex justify-between items-baseline mb-2">
        <h2 className={`font-semibold ${isSummer ? "text-amber-600" : "text-indigo-600"}`}>
          {term.term_id}
        </h2>
        <div className="text-right">
          <span className="text-xs text-slate-400">
            {t("plan.termCredits", { credits: term.credits, max: term.max_credits })} ·{" "}
            {t("plan.running", { n: term.runningTotal })}
          </span>
          {term.gpa != null && (
            <div className="text-xs text-indigo-500 font-medium">
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
  item,
  gradeScale,
  onSetStatus,
}: {
  item: PlanItem;
  gradeScale: PlanGradeScale[];
  onSetStatus: (code: string, status: string, grade: string | null) => void;
}) {
  const { t } = useT();

  if (!item.course_code) {
    return (
      <li className="text-sm text-slate-400 italic px-2 py-1">
        {item.placeholder_label} · {t("plan.placeholder")}
      </li>
    );
  }

  const showGrade = item.status === "PASSED";

  return (
    <li className={`flex items-center gap-2 text-sm rounded-md px-2 py-1 ${STATUS_STYLE[item.status ?? ""] ?? ""}`}>
      <CourseTitle
        code={item.course_code}
        name_th={item.name_th}
        name_en={item.name_en}
        className="flex-1 text-slate-800"
      />

      {showGrade && (
        <select
          value={item.grade ?? ""}
          onChange={(e) => onSetStatus(item.course_code!, "PASSED", e.target.value || null)}
          className="text-xs rounded border border-slate-200 bg-white px-1 py-1 text-slate-600 w-14"
        >
          <option value="">{t("plan.selectGrade")}</option>
          {gradeScale.map((g) => (
            <option key={g.grade} value={g.grade}>{g.grade}</option>
          ))}
        </select>
      )}

      <select
        value={item.status ?? "PLANNED"}
        onChange={(e) => {
          const newStatus = e.target.value;
          const grade = newStatus === "PASSED" ? item.grade : null;
          onSetStatus(item.course_code!, newStatus, grade);
        }}
        className="text-xs rounded border border-slate-200 bg-white px-1.5 py-1 text-slate-600"
      >
        <option value="PLANNED">{t("plan.status.PLANNED")}</option>
        <option value="PASSED">{t("plan.status.PASSED")}</option>
        <option value="FAILED">{t("plan.status.FAILED")}</option>
      </select>
    </li>
  );
}

type HypoEntry = { course_code: string; grade: string };

function WhatIfTab({
  gradeScale,
  currentGpa,
}: {
  gradeScale: PlanGradeScale[];
  currentGpa: number | null;
}) {
  const { t } = useT();
  const [entries, setEntries] = useState<HypoEntry[]>([{ course_code: "", grade: "" }]);
  const [result, setResult] = useState<WhatIfResult | null>(null);
  const [loading, setLoading] = useState(false);

  function updateEntry(i: number, field: keyof HypoEntry, val: string) {
    setEntries((prev) => prev.map((e, idx) => (idx === i ? { ...e, [field]: val } : e)));
  }
  function addEntry() {
    setEntries((prev) => [...prev, { course_code: "", grade: "" }]);
  }
  function removeEntry(i: number) {
    setEntries((prev) => prev.filter((_, idx) => idx !== i));
  }

  async function calculate() {
    const valid = entries.filter((e) => e.course_code && e.grade);
    if (valid.length === 0) return;
    setLoading(true);
    try {
      const r = await postJSON<WhatIfResult>("/api/plan/what-if", { courses: valid });
      setResult(r);
    } catch { /* ignore */ } finally { setLoading(false); }
  }

  return (
    <div className="space-y-4">
      <Card>
        <h2 className="font-semibold text-slate-700 mb-1">{t("plan.whatIf")}</h2>
        <p className="text-sm text-slate-500 mb-3">
          {t("plan.whatIfCurrent", { gpa: currentGpa != null ? currentGpa.toFixed(2) : "–" })}
        </p>
        <div className="space-y-2">
          {entries.map((entry, i) => (
            <div key={i} className="flex gap-2 items-center">
              <input
                type="text"
                value={entry.course_code}
                onChange={(e) => updateEntry(i, "course_code", e.target.value.toUpperCase())}
                placeholder="PSY2005"
                className="flex-1 text-sm border border-slate-200 rounded px-2 py-1.5"
              />
              <select
                value={entry.grade}
                onChange={(e) => updateEntry(i, "grade", e.target.value)}
                className="text-sm border border-slate-200 rounded px-2 py-1.5 w-16"
              >
                <option value="">{t("plan.grade")}</option>
                {gradeScale.map((g) => (
                  <option key={g.grade} value={g.grade}>{g.grade}</option>
                ))}
              </select>
              {entries.length > 1 && (
                <button onClick={() => removeEntry(i)} className="text-slate-400 hover:text-red-500 text-lg leading-none">×</button>
              )}
            </div>
          ))}
        </div>
        <div className="flex gap-2 mt-3">
          <button onClick={addEntry} className="flex-1 text-sm border border-dashed border-slate-300 rounded-lg py-1.5 text-slate-500 hover:border-indigo-300">
            + {t("plan.whatIfAdd")}
          </button>
          <button onClick={calculate} disabled={loading} className="flex-1 text-sm bg-indigo-500 text-white rounded-lg py-1.5 font-medium disabled:opacity-50">
            {t("plan.whatIfCalc")}
          </button>
        </div>
      </Card>

      {result && (
        <Card>
          <div className="flex justify-between items-center">
            <span className="text-sm text-slate-600">
              {t("plan.whatIfCurrent", { gpa: result.currentGpa?.toFixed(2) ?? "–" })}
            </span>
          </div>
          <div className="flex justify-between items-center mt-2">
            <span className="text-sm font-semibold text-slate-700">
              {t("plan.whatIfResult", {
                gpa: result.whatIfGpa?.toFixed(2) ?? "–",
                change: result.change != null ? `${result.change >= 0 ? "+" : ""}${result.change.toFixed(2)}` : "–",
              })}
            </span>
            <span className={`text-xl font-bold ${result.change != null && result.change >= 0 ? "text-green-600" : "text-red-600"}`}>
              {result.whatIfGpa?.toFixed(2) ?? "–"}
            </span>
          </div>
        </Card>
      )}

      {!result && (
        <p className="text-center text-sm text-slate-400 py-4">{t("plan.whatIfEmpty")}</p>
      )}
    </div>
  );
}

function GradeScaleTab({
  scale,
  onSaved,
}: {
  scale: PlanGradeScale[];
  onSaved: () => void;
}) {
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
        <h2 className="font-semibold text-slate-700">{t("plan.gradeScale")}</h2>
        {!editing ? (
          <button onClick={() => setEditing(true)} className="text-xs text-indigo-500 font-medium">
            {t("plan.editScale")}
          </button>
        ) : (
          <button onClick={save} disabled={saving} className="text-xs bg-indigo-500 text-white rounded px-3 py-1 font-medium disabled:opacity-50">
            {t("plan.saveScale")}
          </button>
        )}
      </div>
      <div className="space-y-1.5">
        {draft.map((g, i) => (
          <div key={g.grade} className="flex items-center justify-between text-sm">
            <span className="font-medium text-slate-700 w-10">{g.grade}</span>
            {editing ? (
              <input
                type="number" step="0.5" min="0" max="4" value={g.points}
                onChange={(e) => updateDraft(i, parseFloat(e.target.value) || 0)}
                className="w-20 text-right border border-slate-200 rounded px-2 py-1 text-sm"
              />
            ) : (
              <span className="text-slate-500">{g.points.toFixed(1)} {t("plan.points")}</span>
            )}
          </div>
        ))}
      </div>
    </Card>
  );
}
