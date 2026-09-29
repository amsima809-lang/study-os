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

  useEffect(() => {
    getJSON<ExamsData>("/api/exams").then(setData).catch(() => setError(true));
  }, []);

  if (error) return <ErrorBox>{t("status.error")}</ErrorBox>;
  if (!data) return <Loading>{t("status.connecting")}</Loading>;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800">{t("exams.title")}</h1>

      {/* clash banner */}
      {data.clashes.length === 0 ? (
        <div className="rounded-xl bg-green-50 text-green-700 text-sm px-4 py-2">
          {t("exams.noClash")}
        </div>
      ) : (
        <div className="rounded-xl bg-red-50 text-red-700 text-sm px-4 py-2 space-y-1">
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

      {data.exams.length === 0 ? (
        <p className="text-slate-400 text-sm">{t("exams.empty")}</p>
      ) : (
        <ul className="space-y-2">
          {data.exams.map((e) => (
            <Card key={e.course_code}>
              <div className="flex justify-between items-start">
                <div>
                  <CourseTitle
                    code={e.course_code}
                    name_th={e.name_th}
                    name_en={e.name_en}
                    className="font-medium text-slate-800"
                  />
                  <div className="text-sm text-slate-500">
                    {formatDate(e.date, lang)}
                    {e.slot ? ` · ${t("exams.slot", { slot: e.slot })}` : ""}
                  </div>
                </div>
                <span className="text-indigo-600 text-sm font-semibold whitespace-nowrap">
                  {e.daysLeft === 0 ? t("today.examToday") : t("today.daysLeft", { n: e.daysLeft })}
                </span>
              </div>
            </Card>
          ))}
        </ul>
      )}
    </div>
  );
}
