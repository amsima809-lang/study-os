import { useEffect, useState } from "react";
import { useT } from "../i18n.tsx";
import { getJSON, type WeekData, type ClassSession } from "../api.ts";
import { weekdayName } from "../format.ts";
import ClassRows from "../components/ClassRows.tsx";
import { Card, ErrorBox, Loading } from "../components/ui.tsx";

export default function Week() {
  const { t, lang } = useT();
  const [data, setData] = useState<WeekData | null>(null);
  const [error, setError] = useState(false);

  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    setError(false);
    getJSON<WeekData>("/api/schedule/week").then(setData).catch(() => setError(true));
  }, [attempt]);

  if (error) return <ErrorBox onRetry={() => setAttempt((n) => n + 1)} />;
  if (!data) return <Loading>{t("status.connecting")}</Loading>;

  const byDay = new Map<number, ClassSession[]>();
  for (const c of data.classes) {
    const list = byDay.get(c.weekday) ?? [];
    list.push(c);
    byDay.set(c.weekday, list);
  }
  const days = [...byDay.keys()].sort((a, b) => a - b);

  return (
    <div className="wide-grid space-y-4">
      <h1 className="span-all text-2xl font-bold" style={{ color: "var(--text-primary)" }}>{t("week.title")}</h1>

      {days.length === 0 ? (
        <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>{t(data.chosen === false ? "week.chooseFirst" : "week.empty")}</p>
      ) : (
        days.map((wd) => (
          <Card key={wd}>
            <h2 className="font-semibold mb-2" style={{ color: "var(--accent-text)" }}>{weekdayName(wd, lang)}</h2>
            <ClassRows classes={byDay.get(wd)!} />
          </Card>
        ))
      )}
    </div>
  );
}
