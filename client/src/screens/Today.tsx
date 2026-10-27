import { useEffect, useState } from "react";
import { useT } from "../i18n.tsx";
import { getJSON, type TodayData } from "../api.ts";
import { formatDate, timeRange } from "../format.ts";
import { Card, ErrorBox, Loading } from "../components/ui.tsx";
import { CourseTitle } from "../components/CourseTitle.tsx";
import Calendar from "../components/Calendar.tsx";

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
        <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>{t("today.title")}</h1>
        <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>
          {formatDate(data.today, lang)} · {t("today.term", { term: data.term })}
        </p>
      </header>

      <Calendar />

      <Card>
        <h2 className="font-semibold mb-1" style={{ color: "var(--text-primary)" }}>{t("today.nextExam")}</h2>
        {data.nextExam ? (
          <div className="flex items-center justify-between">
            <div>
              <CourseTitle
                code={data.nextExam.course_code}
                name_th={data.nextExam.name_th}
                name_en={data.nextExam.name_en}
                className="font-medium"
              />
              <div className="text-sm" style={{ color: "var(--text-tertiary)" }}>{formatDate(data.nextExam.date, lang)}</div>
            </div>
            <span className="font-semibold" style={{ color: "var(--accent-text)" }}>
              {data.nextExam.daysLeft === 0
                ? t("today.examToday")
                : t("today.daysLeft", { n: data.nextExam.daysLeft })}
            </span>
          </div>
        ) : (
          <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>{t("today.noExam")}</p>
        )}
      </Card>

      <Card>
        <h2 className="font-semibold mb-2" style={{ color: "var(--text-primary)" }}>{t("today.classes")}</h2>
        {data.classes.length === 0 ? (
          <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>{t("today.noClasses")}</p>
        ) : (
          <ul className="space-y-2">
            {data.classes.map((c) => (
              <li key={c.course_code} className="flex justify-between text-sm gap-2">
                <CourseTitle
                  code={c.course_code}
                  name_th={c.name_th}
                  name_en={c.name_en}
                  className="font-medium"
                />
                <span className="text-right whitespace-nowrap" style={{ color: "var(--text-tertiary)" }}>
                  {timeRange(c.start_time, c.end_time)}
                  {c.room ? ` · ${c.room}` : ""}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card>
        <div className="flex justify-between items-center">
          <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>{t("today.review")}</h2>
          <span className="font-semibold" style={{ color: "var(--accent-text)" }}>
            {t("today.cards", { n: data.dueFlashcards })}
          </span>
        </div>
      </Card>

      <Card>
        <div className="flex justify-between items-baseline mb-2">
          <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>{t("today.targets")}</h2>
          <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
            {t("today.weekTarget", { h: data.studyTargets.weeklyTarget })}
          </span>
        </div>
        <ul className="space-y-2">
          {data.studyTargets.courses.map((c) => (
            <li key={c.code} className="text-sm">
              <div className="flex justify-between gap-2">
                <CourseTitle
                  code={c.code}
                  name_th={c.name_th}
                  name_en={c.name_en}
                  className="font-medium"
                />
                <span className="whitespace-nowrap" style={{ color: "var(--text-primary)" }}>{t("today.perDay", { h: c.dailyHours })}</span>
              </div>
              <div className="flex justify-between text-xs" style={{ color: "var(--text-tertiary)" }}>
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
