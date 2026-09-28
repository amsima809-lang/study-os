import { useEffect, useState } from "react";
import { useT } from "../i18n.tsx";
import { getJSON, type TodayData } from "../api.ts";
import { formatDate, timeRange } from "../format.ts";
import { Card, ErrorBox, Loading } from "../components/ui.tsx";

export default function Today() {
  const { t, lang } = useT();
  const [data, setData] = useState<TodayData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    getJSON<TodayData>("/api/today").then(setData).catch(() => setError(true));
  }, []);

  if (error) return <ErrorBox>{t("status.error")}</ErrorBox>;
  if (!data) return <Loading>{t("status.connecting")}</Loading>;

  return (
    <div className="space-y-4">
      <header>
        <h1 className="text-2xl font-bold text-slate-800">{t("today.title")}</h1>
        <p className="text-slate-500 text-sm">
          {formatDate(data.today, lang)} · {t("today.term", { term: data.term })}
        </p>
      </header>

      {/* next exam countdown */}
      <Card>
        <h2 className="font-semibold text-slate-700 mb-1">{t("today.nextExam")}</h2>
        {data.nextExam ? (
          <div className="flex items-center justify-between">
            <div>
              <div className="font-medium text-slate-800">{data.nextExam.name_th}</div>
              <div className="text-sm text-slate-500">{formatDate(data.nextExam.date, lang)}</div>
            </div>
            <span className="text-indigo-600 font-semibold">
              {data.nextExam.daysLeft === 0
                ? t("today.examToday")
                : t("today.daysLeft", { n: data.nextExam.daysLeft })}
            </span>
          </div>
        ) : (
          <p className="text-slate-400 text-sm">{t("today.noExam")}</p>
        )}
      </Card>

      {/* today's classes */}
      <Card>
        <h2 className="font-semibold text-slate-700 mb-2">{t("today.classes")}</h2>
        {data.classes.length === 0 ? (
          <p className="text-slate-400 text-sm">{t("today.noClasses")}</p>
        ) : (
          <ul className="space-y-2">
            {data.classes.map((c) => (
              <li key={c.course_code} className="flex justify-between text-sm">
                <span className="font-medium text-slate-800">{c.name_th}</span>
                <span className="text-slate-500 text-right">
                  {timeRange(c.start_time, c.end_time)}
                  {c.room ? ` · ${c.room}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* flashcards due */}
      <Card>
        <div className="flex justify-between items-center">
          <h2 className="font-semibold text-slate-700">{t("today.review")}</h2>
          <span className="text-indigo-600 font-semibold">
            {t("today.cards", { n: data.dueFlashcards })}
          </span>
        </div>
      </Card>

      {/* study targets */}
      <Card>
        <div className="flex justify-between items-baseline mb-2">
          <h2 className="font-semibold text-slate-700">{t("today.targets")}</h2>
          <span className="text-xs text-slate-400">
            {t("today.weekTarget", { h: data.studyTargets.weeklyTarget })}
          </span>
        </div>
        <ul className="space-y-2">
          {data.studyTargets.courses.map((c) => (
            <li key={c.code} className="text-sm">
              <div className="flex justify-between">
                <span className="font-medium text-slate-800">{c.name_th}</span>
                <span className="text-slate-700">{t("today.perDay", { h: c.dailyHours })}</span>
              </div>
              <div className="flex justify-between text-xs text-slate-400">
                <span>{t(`diff.${c.difficulty}`)}</span>
                <span>{t("today.perWeek", { h: c.weeklyHours })}</span>
              </div>
            </li>
          ))}
        </ul>
      </Card>
    </div>
  );
}
