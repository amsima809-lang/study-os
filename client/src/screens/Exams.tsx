import { useEffect, useState } from "react";
import { useT } from "../i18n.tsx";
import { getJSON, type ExamsData } from "../api.ts";
import { formatDate } from "../format.ts";
import { Card, ErrorBox, Loading } from "../components/ui.tsx";
import { CourseTitle } from "../components/CourseTitle.tsx";

export default function Exams() {
  const { t, lang } = useT();
  const [data, setData] = useState<ExamsData | null>(null);
  const [error, setError] = useState(false);

  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setError(false);
    getJSON<ExamsData>("/api/exams").then(setData).catch(() => setError(true));
  }, [attempt]);

  if (error) return <ErrorBox onRetry={() => setAttempt((n) => n + 1)} />;
  if (!data) return <Loading>{t("status.connecting")}</Loading>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>{t("exams.title")}</h1>

      {data.chosen === false ? (
        <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>{t("exams.chooseFirst")}</p>
      ) : data.clashes.length === 0 ? (
        <div className="rounded-xl text-sm px-4 py-2" style={{ backgroundColor: "var(--success-bg)", color: "var(--success)" }}>
          {t("exams.noClash")}
        </div>
      ) : (
        <div className="rounded-xl text-sm px-4 py-2 space-y-1" style={{ backgroundColor: "var(--danger-bg)", color: "var(--danger)" }}>
          <div className="font-semibold">{t("exams.clash")}</div>
          {data.clashes.map((c, i) => (
            <div key={i}>
              {t("exams.clashDetail", {
                date: formatDate(c.date, lang),
                courses: c.courses.join(", "),
              })}
            </div>
          ))}
        </div>
      )}

      {data.chosen === false || (data.exams.length === 0 && (data.facultyArranged?.length ?? 0) > 0) ? null : data.exams.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>{t("exams.empty")}</p>
      ) : (
        <ul className="wide-grid space-y-2">
          {data.exams.map((e, i) => (
            <Card key={`${e.course_code}-${i}`}>
              <div className="flex justify-between items-start">
                <div>
                  <CourseTitle
                    code={e.course_code}
                    name_th={e.name_th}
                    name_en={e.name_en}
                    className="font-medium"
                  />
                  <div className="text-sm" style={{ color: "var(--text-tertiary)" }}>
                    {formatDate(e.date, lang)}
                    {e.slot ? ` · ${t("exams.slot", { slot: e.slot })}` : ""}
                  </div>
                </div>
                <span className="text-sm font-semibold whitespace-nowrap" style={{ color: "var(--accent-text)" }}>
                  {e.daysLeft === 0 ? t("today.examToday") : t("today.daysLeft", { n: e.daysLeft })}
                </span>
              </div>
            </Card>
          ))}
        </ul>
      )}

      {(data.facultyArranged?.length ?? 0) > 0 && (
        <section className="space-y-2">
          <h2 className="text-base font-semibold pt-2" style={{ color: "var(--text-primary)" }}>{t("exams.facultyTitle")}</h2>
          <p className="text-sm" style={{ color: "var(--text-secondary)" }}>{t("exams.facultyHint")}</p>
          <ul className="wide-grid space-y-2">
            {data.facultyArranged!.map((e) => (
              <Card key={e.course_code}>
                <CourseTitle code={e.course_code} name_th={e.name_th} name_en={e.name_en} className="font-medium" />
                <div className="text-sm" style={{ color: "var(--text-tertiary)" }}>{e.note}</div>
              </Card>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
