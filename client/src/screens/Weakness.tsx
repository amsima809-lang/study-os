import { useEffect, useState } from "react";
import { useT } from "../i18n.tsx";
import { getJSON, type WeaknessData, type ReviewHistoryDay } from "../api.ts";
import { Card, Loading } from "../components/ui.tsx";

export default function Weakness() {
  const { t } = useT();
  const [data, setData] = useState<WeaknessData | null>(null);
  const [history, setHistory] = useState<ReviewHistoryDay[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      getJSON<WeaknessData>("/api/weakness"),
      getJSON<{ history: ReviewHistoryDay[] }>("/api/flashcards/history?days=30"),
    ])
      .then(([w, h]) => { setData(w); setHistory(h.history); })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <Loading>{t("status.connecting")}</Loading>;
  if (!data) return <p className="text-sm text-center py-8" style={{ color: "var(--text-tertiary)" }}>{t("weak.empty")}</p>;

  const stats = data.reviewStats;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <Card>
          <div className="text-center">
            <p className="text-2xl font-bold" style={{ color: "var(--accent-text)" }}>{stats.total_cards}</p>
            <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>{t("weak.totalCards")}</p>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <p className="text-2xl font-bold" style={{ color: "var(--warning)" }}>{stats.due}</p>
            <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>{t("weak.dueToday")}</p>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <p className="text-2xl font-bold" style={{ color: "var(--success)" }}>
              {stats.avg_retention ? `${Math.round(stats.avg_retention * 100)}%` : "-"}
            </p>
            <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>{t("weak.retention")}</p>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <p className="text-2xl font-bold" style={{ color: "var(--text-secondary)" }}>
              {stats.avg_easiness ? stats.avg_easiness.toFixed(2) : "-"}
            </p>
            <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>{t("weak.easiness")}</p>
          </div>
        </Card>
      </div>

      {history.length > 0 && (
        <Card>
          <h3 className="font-medium mb-2" style={{ color: "var(--text-primary)" }}>{t("weak.historyTitle")}</h3>
          <HistoryBars history={history} />
          <div className="flex justify-between mt-1" style={{ fontSize: 10, color: "var(--text-tertiary)" }}>
            <span>{history[0]?.date.slice(5)}</span>
            <span>{history[history.length - 1]?.date.slice(5)}</span>
          </div>
        </Card>
      )}

      {data.courses.length > 0 && (
        <Card>
          <h3 className="font-medium mb-2" style={{ color: "var(--text-primary)" }}>{t("weak.courseMastery")}</h3>
          <div className="space-y-2">
            {data.courses.map((c) => (
              <div key={c.course_code}>
                <div className="flex justify-between text-sm">
                  <span className="truncate" style={{ color: "var(--text-secondary)" }}>{c.course_code} {c.name_th}</span>
                  <span className="font-medium" style={{ color: masteryColor(c.avg_mastery) }}>
                    {Math.round(c.avg_mastery)}%
                  </span>
                </div>
                <div className="rounded-full h-2 mt-1" style={{ backgroundColor: "var(--border-light)" }}>
                  <div
                    className="rounded-full h-2 transition-all"
                    style={{ width: `${Math.min(c.avg_mastery, 100)}%`, backgroundColor: masteryBar(c.avg_mastery) }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {data.weakTopics.length > 0 && (
        <Card>
          <h3 className="font-medium mb-2" style={{ color: "var(--text-primary)" }}>{t("weak.weakTopics")}</h3>
          <ul className="space-y-2">
            {data.weakTopics.map((wt, i) => (
              <li key={i} className="flex items-center justify-between text-sm">
                <div className="min-w-0">
                  <p className="truncate" style={{ color: "var(--text-primary)" }}>
                    {wt.chapter_name ?? wt.topic}
                  </p>
                  <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>{wt.course_name}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-medium" style={{ color: masteryColor(wt.mastery_score) }}>
                    {Math.round(wt.mastery_score)}%
                  </span>
                  <span className="text-xs" style={{ color: "var(--text-tertiary)" }}>
                    {wt.correct_attempts}/{wt.total_attempts}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {data.courses.length === 0 && data.weakTopics.length === 0 && (
        <p className="text-sm text-center py-4" style={{ color: "var(--text-tertiary)" }}>{t("weak.noData")}</p>
      )}
    </div>
  );
}

function HistoryBars({ history }: { history: ReviewHistoryDay[] }) {
  const maxR = Math.max(...history.map((h) => h.reviews), 1);
  return (
    <div className="flex items-end gap-1 h-24">
      {history.map((d) => {
        const pct = (d.reviews / maxR) * 100;
        const color = d.avg_confidence >= 3 ? "var(--success)" : d.avg_confidence >= 2 ? "var(--warning)" : "var(--danger)";
        return (
          <div key={d.date} className="flex-1 flex flex-col items-center gap-0.5" title={`${d.date}: ${d.reviews} reviews`}>
            <div className="w-full rounded-t" style={{ height: `${Math.max(pct, 4)}%`, backgroundColor: color }} />
          </div>
        );
      })}
    </div>
  );
}

function masteryColor(score: number): string {
  if (score >= 70) return "var(--success)";
  if (score >= 40) return "var(--warning)";
  return "var(--danger)";
}

function masteryBar(score: number): string {
  if (score >= 70) return "var(--success)";
  if (score >= 40) return "var(--warning)";
  return "var(--danger)";
}
