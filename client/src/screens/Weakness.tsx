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
  if (!data) return <p className="text-slate-400 text-sm text-center py-8">{t("weak.empty")}</p>;

  const stats = data.reviewStats;

  return (
    <div className="space-y-4">
      {/* Overview stats */}
      <div className="grid grid-cols-2 gap-2">
        <Card>
          <div className="text-center">
            <p className="text-2xl font-bold text-indigo-600">{stats.total_cards}</p>
            <p className="text-xs text-slate-400">{t("weak.totalCards")}</p>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <p className="text-2xl font-bold text-amber-600">{stats.due}</p>
            <p className="text-xs text-slate-400">{t("weak.dueToday")}</p>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <p className="text-2xl font-bold text-green-600">
              {stats.avg_retention ? `${Math.round(stats.avg_retention * 100)}%` : "-"}
            </p>
            <p className="text-xs text-slate-400">{t("weak.retention")}</p>
          </div>
        </Card>
        <Card>
          <div className="text-center">
            <p className="text-2xl font-bold text-slate-600">
              {stats.avg_easiness ? stats.avg_easiness.toFixed(2) : "-"}
            </p>
            <p className="text-xs text-slate-400">{t("weak.easiness")}</p>
          </div>
        </Card>
      </div>

      {/* Review history chart (simple bar) */}
      {history.length > 0 && (
        <Card>
          <h3 className="font-medium text-slate-700 mb-2">{t("weak.historyTitle")}</h3>
          <HistoryBars history={history} />
          <div className="flex justify-between text-[10px] text-slate-300 mt-1">
            <span>{history[0]?.date.slice(5)}</span>
            <span>{history[history.length - 1]?.date.slice(5)}</span>
          </div>
        </Card>
      )}

      {/* Course mastery */}
      {data.courses.length > 0 && (
        <Card>
          <h3 className="font-medium text-slate-700 mb-2">{t("weak.courseMastery")}</h3>
          <div className="space-y-2">
            {data.courses.map((c) => (
              <div key={c.course_code}>
                <div className="flex justify-between text-sm">
                  <span className="text-slate-600 truncate">{c.course_code} {c.name_th}</span>
                  <span className={`font-medium ${masteryStyle(c.avg_mastery).text}`}>
                    {Math.round(c.avg_mastery)}%
                  </span>
                </div>
                <div className="bg-slate-100 rounded-full h-2 mt-1">
                  <div
                    className={`rounded-full h-2 transition-all ${masteryStyle(c.avg_mastery).bar}`}
                    style={{ width: `${Math.min(c.avg_mastery, 100)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}

      {/* Weak topics */}
      {data.weakTopics.length > 0 && (
        <Card>
          <h3 className="font-medium text-slate-700 mb-2">{t("weak.weakTopics")}</h3>
          <ul className="space-y-2">
            {data.weakTopics.map((wt, i) => (
              <li key={i} className="flex items-center justify-between text-sm">
                <div className="min-w-0">
                  <p className="text-slate-700 truncate">
                    {wt.chapter_name ?? wt.topic}
                  </p>
                  <p className="text-xs text-slate-400">{wt.course_name}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`font-medium ${masteryStyle(wt.mastery_score).text}`}>
                    {Math.round(wt.mastery_score)}%
                  </span>
                  <span className="text-xs text-slate-300">
                    {wt.correct_attempts}/{wt.total_attempts}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {data.courses.length === 0 && data.weakTopics.length === 0 && (
        <p className="text-slate-400 text-sm text-center py-4">{t("weak.noData")}</p>
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
        const color = d.avg_confidence >= 3 ? "bg-green-400" : d.avg_confidence >= 2 ? "bg-amber-400" : "bg-red-400";
        return (
          <div key={d.date} className="flex-1 flex flex-col items-center gap-0.5" title={`${d.date}: ${d.reviews} reviews`}>
            <div className={`w-full rounded-t ${color}`} style={{ height: `${Math.max(pct, 4)}%` }} />
          </div>
        );
      })}
    </div>
  );
}

function masteryStyle(score: number): { text: string; bar: string } {
  if (score >= 70) return { text: "text-green-600", bar: "bg-green-400" };
  if (score >= 40) return { text: "text-amber-600", bar: "bg-amber-400" };
  return { text: "text-red-600", bar: "bg-red-400" };
}
