import { useEffect, useState } from "react";
import { useT } from "../i18n.tsx";
import { getJSON, postJSON, type PlanData, type PlanItem, type PlanTerm } from "../api.ts";
import { Card, Loading } from "../components/ui.tsx";

export default function Planner() {
  const { t } = useT();
  const [data, setData] = useState<PlanData | null>(null);

  function load() {
    getJSON<PlanData>("/api/plan").then(setData).catch(() => setData(null));
  }
  useEffect(load, []);

  async function setStatus(courseCode: string, status: string) {
    try {
      await postJSON("/api/enrollments", { course_code: courseCode, status });
      load();
    } catch {
      /* ignore */
    }
  }

  if (!data) return <Loading>{t("status.connecting")}</Loading>;

  const pct = Math.round((data.totalPassedCredits / data.totalPlannedCredits) * 100);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-800">{t("plan.title")}</h1>
        <p className="text-sm text-slate-500 mt-1">
          {t("plan.creditsPassed", { passed: data.totalPassedCredits, total: data.totalPlannedCredits })}
        </p>
        <div className="h-2 bg-slate-100 rounded-full overflow-hidden mt-1">
          <div className="h-full bg-indigo-500" style={{ width: `${pct}%` }} />
        </div>
      </div>

      {/* blocked / retake alerts */}
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

      {/* category progress */}
      <Card>
        <h2 className="font-semibold text-slate-700 mb-2">{t("plan.categories")}</h2>
        <div className="space-y-2">
          {data.categoryProgress.map((c) => (
            <div key={c.category}>
              <div className="flex justify-between text-xs text-slate-500">
                <span>{t(`cat.${c.category}`)}</span>
                <span>
                  {c.passed}/{c.required}
                </span>
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

      {/* internship readiness */}
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

      {/* 9-term timeline */}
      {data.terms.map((term) => (
        <TermCard key={term.term_id} term={term} onSetStatus={setStatus} />
      ))}
    </div>
  );
}

const STATUS_STYLE: Record<string, string> = {
  PASSED: "border-l-4 border-green-400 bg-green-50/40",
  FAILED: "border-l-4 border-red-400 bg-red-50/40",
};

function TermCard({
  term,
  onSetStatus,
}: {
  term: PlanTerm;
  onSetStatus: (code: string, status: string) => void;
}) {
  const { t } = useT();
  const isSummer = term.term_id.startsWith("S/");

  return (
    <Card>
      <div className="flex justify-between items-baseline mb-2">
        <h2 className={`font-semibold ${isSummer ? "text-amber-600" : "text-indigo-600"}`}>
          {term.term_id}
        </h2>
        <span className="text-xs text-slate-400">
          {t("plan.termCredits", { credits: term.credits, max: term.max_credits })} ·{" "}
          {t("plan.running", { n: term.runningTotal })}
        </span>
      </div>
      <ul className="space-y-1.5">
        {term.items.map((it, i) => (
          <ItemRow key={i} item={it} onSetStatus={onSetStatus} />
        ))}
      </ul>
    </Card>
  );
}

function ItemRow({
  item,
  onSetStatus,
}: {
  item: PlanItem;
  onSetStatus: (code: string, status: string) => void;
}) {
  const { t } = useT();

  if (!item.course_code) {
    return (
      <li className="text-sm text-slate-400 italic px-2 py-1">
        {item.placeholder_label} · {t("plan.placeholder")}
      </li>
    );
  }

  return (
    <li className={`flex items-center gap-2 text-sm rounded-md px-2 py-1 ${STATUS_STYLE[item.status ?? ""] ?? ""}`}>
      <span className="flex-1 text-slate-800">{item.name_th}</span>
      <select
        value={item.status ?? "PLANNED"}
        onChange={(e) => onSetStatus(item.course_code!, e.target.value)}
        className="text-xs rounded border border-slate-200 bg-white px-1.5 py-1 text-slate-600"
      >
        <option value="PLANNED">{t("plan.status.PLANNED")}</option>
        <option value="PASSED">{t("plan.status.PASSED")}</option>
        <option value="FAILED">{t("plan.status.FAILED")}</option>
      </select>
    </li>
  );
}
