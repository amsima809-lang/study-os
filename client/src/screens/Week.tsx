import { useEffect, useState } from "react";
import { useT } from "../i18n.tsx";
import { getJSON, type WeekData, type ClassSession } from "../api.ts";
import { weekdayName, timeRange } from "../format.ts";
import { Card, ErrorBox, Loading } from "../components/ui.tsx";

export default function Week() {
  const { t, lang } = useT();
  const [data, setData] = useState<WeekData | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    getJSON<WeekData>("/api/schedule/week").then(setData).catch(() => setError(true));
  }, []);

  if (error) return <ErrorBox>{t("status.error")}</ErrorBox>;
  if (!data) return <Loading>{t("status.connecting")}</Loading>;

  // group classes by weekday (1..7)
  const byDay = new Map<number, ClassSession[]>();
  for (const c of data.classes) {
    const list = byDay.get(c.weekday) ?? [];
    list.push(c);
    byDay.set(c.weekday, list);
  }
  const days = [...byDay.keys()].sort((a, b) => a - b);

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-slate-800">{t("week.title")}</h1>

      {days.length === 0 ? (
        <p className="text-slate-400 text-sm">{t("week.empty")}</p>
      ) : (
        days.map((wd) => (
          <Card key={wd}>
            <h2 className="font-semibold text-indigo-600 mb-2">{weekdayName(wd, lang)}</h2>
            <ul className="space-y-2">
              {byDay.get(wd)!.map((c) => (
                <li key={c.course_code} className="flex justify-between text-sm">
                  <span className="font-medium text-slate-800">{c.name_th}</span>
                  <span className="text-slate-500 text-right">
                    {timeRange(c.start_time, c.end_time)}
                    {c.room ? ` · ${c.room}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </Card>
        ))
      )}
    </div>
  );
}
