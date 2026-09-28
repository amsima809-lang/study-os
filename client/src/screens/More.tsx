import { useState } from "react";
import { useT } from "../i18n.tsx";
import Schedule from "./Schedule.tsx";
import Stats from "./Stats.tsx";
import Planner from "./Planner.tsx";

type Sub = "schedule" | "stats" | "planner";

/** Secondary-screen hub, so the bottom nav stays small as features grow. */
export default function More() {
  const { t } = useT();
  const [sub, setSub] = useState<Sub | null>(null);

  const items: Array<{ id: Sub; icon: string }> = [
    { id: "schedule", icon: "🗓️" },
    { id: "stats", icon: "📊" },
    { id: "planner", icon: "🎓" },
  ];

  if (sub) {
    return (
      <div className="space-y-3">
        <button onClick={() => setSub(null)} className="text-sm text-indigo-600">
          {t("more.back")}
        </button>
        {sub === "schedule" && <Schedule />}
        {sub === "stats" && <Stats />}
        {sub === "planner" && <Planner />}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <h1 className="text-2xl font-bold text-slate-800">{t("more.title")}</h1>
      <ul className="space-y-2">
        {items.map((it) => (
          <li key={it.id}>
            <button
              onClick={() => setSub(it.id)}
              className="w-full flex items-center gap-3 rounded-xl bg-white shadow px-4 py-3 text-left"
            >
              <span className="text-xl">{it.icon}</span>
              <span className="font-medium text-slate-700">{t(`more.${it.id}`)}</span>
              <span className="ml-auto text-slate-300">›</span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
