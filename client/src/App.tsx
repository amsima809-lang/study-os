import { useEffect, useState } from "react";
import { LanguageProvider, LanguageToggle, useT } from "./i18n.tsx";

type Health = { ok: boolean; phase: number; tz: string };
type Stats = { courses: number; terms: number; plannedCredits: number };

function Home() {
  const { t } = useT();
  const [health, setHealth] = useState<Health | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    Promise.all([
      fetch("/api/health").then((r) => r.json()),
      fetch("/api/stats").then((r) => r.json()),
    ])
      .then(([h, s]) => {
        setHealth(h);
        setStats(s);
      })
      .catch(() => setError(true));
  }, []);

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col items-center gap-5 px-6 py-10">
      <div className="w-full max-w-sm flex justify-end">
        <LanguageToggle />
      </div>

      <header className="text-center mt-6">
        <h1 className="text-3xl font-bold text-indigo-600">{t("app.name")}</h1>
        <p className="text-slate-600 mt-1">{t("app.tagline")}</p>
        {health && (
          <p className="text-green-600 text-sm mt-2 font-medium">
            {t("phase.ready", { n: health.phase })} ✅
          </p>
        )}
      </header>

      {/* Server status */}
      <div className="rounded-xl bg-white shadow px-4 py-3 text-sm w-full max-w-sm">
        {error && <span className="text-red-600">{t("status.error")}</span>}
        {!error && !health && <span className="text-slate-400">{t("status.connecting")}</span>}
        {health && (
          <div className="flex justify-between">
            <span>{t("status.server")}</span>
            <span className="text-green-600 font-medium">{t("status.connected")}</span>
          </div>
        )}
      </div>

      {/* Curriculum stats from the seeded database */}
      {stats && (
        <div className="rounded-xl bg-white shadow px-4 py-3 w-full max-w-sm">
          <h2 className="font-semibold text-slate-700 mb-2">{t("stats.title")}</h2>
          <dl className="space-y-1 text-sm">
            <Row label={t("stats.courses")} value={stats.courses} />
            <Row label={t("stats.credits")} value={stats.plannedCredits} />
            <Row label={t("stats.terms")} value={stats.terms} />
          </dl>
        </div>
      )}
    </div>
  );
}

function Row({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex justify-between">
      <dt className="text-slate-500">{label}</dt>
      <dd className="font-medium text-slate-800">{value}</dd>
    </div>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <Home />
    </LanguageProvider>
  );
}
