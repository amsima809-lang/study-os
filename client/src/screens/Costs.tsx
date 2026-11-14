import { useEffect, useState } from "react";
import { useT } from "../i18n.tsx";
import { getJSON } from "../api.ts";
import Icon from "../components/Icon.tsx";
import { ErrorBox } from "../components/ui.tsx";

type CostEstimate = {
  campus: string;
  semester: {
    courses: number;
    credits: number;
    credit_fee: number;
    maintenance: number;
    it_fee: number;
    exam_fee: number;
    etesting_fee: number;
    retake_fee: number;
    total: number;
  };
  projection: {
    required_credits: number;
    target_years: number;
    total_terms: number;
    enrollment_fees: number;
    term_fees_total: number;
    total_estimate: number;
  };
};

function fmt(n: number): string {
  return n.toLocaleString("th-TH");
}

export default function Costs() {
  const { t } = useT();
  const [campus, setCampus] = useState<"central" | "regional">("central");
  const [courses, setCourses] = useState(7);
  const [etesting, setEtesting] = useState(0);
  const [retake, setRetake] = useState(0);
  const [creditsPerCourse, setCreditsPerCourse] = useState(3);
  const [data, setData] = useState<CostEstimate | null>(null);

  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setFailed(false);
    getJSON<CostEstimate>(
      `/api/cost-estimate?campus=${campus}&courses=${courses}&etesting=${etesting}&retake=${retake}&credits_per_course=${creditsPerCourse}`,
    ).then(setData).catch(() => setFailed(true));
  }, [campus, courses, etesting, retake, creditsPerCourse, attempt]);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
        <Icon name="coins" size={24} style={{ color: "var(--accent-text)" }} />
        {t("costs.title")}
      </h1>

      {failed && <ErrorBox onRetry={() => setAttempt((n) => n + 1)} />}

      {/* Campus toggle */}
      <div className="flex gap-2">
        {(["central", "regional"] as const).map((c) => (
          <button
            key={c}
            onClick={() => setCampus(c)}
            className="flex-1 rounded-xl py-2.5 text-sm font-medium transition-all min-h-11"
            style={{
              background: campus === c ? "var(--accent-text)" : "var(--bg-surface)",
              color: campus === c ? "#fff" : "var(--text-secondary)",
              border: `1px solid ${campus === c ? "var(--accent-text)" : "var(--border-light)"}`,
            }}
          >
            {t(`costs.${c}`)}
          </button>
        ))}
      </div>

      {/* Input sliders */}
      <div
        className="rounded-2xl border p-4 space-y-4"
        style={{ background: "var(--bg-surface)", borderColor: "var(--border-light)" }}
      >
        <SliderInput
          label={t("costs.numCourses")}
          value={courses}
          onChange={setCourses}
          min={1}
          max={12}
          suffix={t("costs.courses")}
        />
        <SliderInput
          label={t("costs.creditsPerCourse")}
          value={creditsPerCourse}
          onChange={setCreditsPerCourse}
          min={1}
          max={6}
          suffix={t("costs.credits")}
        />
        <SliderInput
          label={t("costs.numEtesting")}
          value={etesting}
          onChange={setEtesting}
          min={0}
          max={courses}
          suffix={t("costs.courses")}
        />
        <SliderInput
          label={t("costs.numRetake")}
          value={retake}
          onChange={setRetake}
          min={0}
          max={12}
          suffix={t("costs.courses")}
        />
      </div>

      {/* Semester breakdown */}
      {data && (
        <>
          <div
            className="rounded-2xl border overflow-hidden"
            style={{ background: "var(--bg-surface)", borderColor: "var(--border-light)" }}
          >
            <div
              className="px-4 py-3 flex items-center gap-2"
              style={{ borderBottom: "1px solid var(--border-light)", background: "var(--bg-surface-hover)" }}
            >
              <Icon name="calendar" size={18} style={{ color: "var(--accent-text)" }} />
              <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                {t("costs.semesterBreakdown")}
              </span>
            </div>
            <div className="px-4 py-3 space-y-2">
              <CostRow label={t("costs.creditFee")} sub={`${data.semester.credits} ${t("costs.credits")} × ฿${campus === "central" ? 25 : 50}`} amount={data.semester.credit_fee} />
              <CostRow label={t("costs.maintenance")} amount={data.semester.maintenance} />
              <CostRow label={t("costs.itFee")} amount={data.semester.it_fee} />
              {data.semester.exam_fee > 0 && (
                <CostRow label={t("costs.examFee")} sub={`${courses} ${t("costs.courses")} × ฿60`} amount={data.semester.exam_fee} />
              )}
              {data.semester.etesting_fee > 0 && (
                <CostRow label={t("costs.etestingFee")} sub={`${etesting} ${t("costs.courses")} × ฿${campus === "central" ? 200 : 300}`} amount={data.semester.etesting_fee} />
              )}
              {data.semester.retake_fee > 0 && (
                <CostRow label={t("costs.retakeFee")} sub={`${retake} ${t("costs.courses")} × ฿60`} amount={data.semester.retake_fee} />
              )}
              <div
                className="flex items-center justify-between pt-2 mt-2"
                style={{ borderTop: "1px solid var(--border-light)" }}
              >
                <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                  {t("costs.semesterTotal")}
                </span>
                <span className="text-lg font-bold" style={{ color: "var(--accent-text)" }}>
                  ฿{fmt(data.semester.total)}
                </span>
              </div>
            </div>
          </div>

          {/* Graduation projection */}
          <div
            className="rounded-2xl border overflow-hidden"
            style={{ background: "var(--bg-surface)", borderColor: "var(--border-light)" }}
          >
            <div
              className="px-4 py-3 flex items-center gap-2"
              style={{ borderBottom: "1px solid var(--border-light)", background: "var(--bg-surface-hover)" }}
            >
              <Icon name="graduationCap" size={18} style={{ color: "var(--accent-text)" }} />
              <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
                {t("costs.graduationProjection")}
              </span>
            </div>
            <div className="px-4 py-3 space-y-2">
              <CostRow label={t("costs.enrollmentFees")} amount={data.projection.enrollment_fees} />
              <CostRow
                label={t("costs.termFeesTotal")}
                sub={`${data.projection.total_terms} ${t("costs.terms")}`}
                amount={data.projection.term_fees_total}
              />
              <div
                className="flex items-center justify-between pt-2 mt-2"
                style={{ borderTop: "1px solid var(--border-light)" }}
              >
                <span className="text-sm font-bold" style={{ color: "var(--text-primary)" }}>
                  {t("costs.totalEstimate")}
                </span>
                <span className="text-lg font-bold" style={{ color: "var(--accent-text)" }}>
                  ฿{fmt(data.projection.total_estimate)}
                </span>
              </div>
              <p className="text-xs mt-1" style={{ color: "var(--text-tertiary)" }}>
                {t("costs.disclaimer")}
              </p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function SliderInput({
  label,
  value,
  onChange,
  min,
  max,
  suffix,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  suffix: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm" style={{ color: "var(--text-secondary)" }}>{label}</span>
        <span className="text-sm font-semibold" style={{ color: "var(--text-primary)" }}>
          {value} {suffix}
        </span>
      </div>
      <input aria-label={label}
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-11 accent-[var(--accent-text)]"
      />
    </div>
  );
}

function CostRow({ label, sub, amount }: { label: string; sub?: string; amount: number }) {
  return (
    <div className="flex items-center justify-between">
      <div>
        <span className="text-sm" style={{ color: "var(--text-primary)" }}>{label}</span>
        {sub && (
          <span className="text-xs ml-1" style={{ color: "var(--text-tertiary)" }}>({sub})</span>
        )}
      </div>
      <span className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
        ฿{fmt(amount)}
      </span>
    </div>
  );
}
