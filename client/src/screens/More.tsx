import { useState } from "react";
import { useT } from "../i18n.tsx";
import { postJSON } from "../api.ts";
import Icon from "../components/Icon.tsx";
import Schedule from "./Schedule.tsx";
import Stats from "./Stats.tsx";
import Planner from "./Planner.tsx";
import Mock from "./Mock.tsx";
import Library from "./Library.tsx";
import Weakness from "./Weakness.tsx";
import StudyPlan from "./StudyPlan.tsx";
import Costs from "./Costs.tsx";

type Sub = "schedule" | "stats" | "planner" | "mock" | "library" | "weakness" | "studyplan" | "costs";

export default function More() {
  const { t } = useT();
  const [sub, setSub] = useState<Sub | null>(null);

  const items: Array<{ id: Sub; icon: string }> = [
    { id: "studyplan", icon: "calendarCheck" },
    { id: "library", icon: "library" },
    { id: "schedule", icon: "calendarRange" },
    { id: "stats", icon: "chartBar" },
    { id: "planner", icon: "graduationCap" },
    { id: "mock", icon: "fileEdit" },
    { id: "weakness", icon: "crosshair" },
    { id: "costs", icon: "coins" },
  ];

  if (sub) {
    return (
      <div className="space-y-3">
        <button
          onClick={() => setSub(null)}
          className="text-sm font-medium transition-colors"
          style={{ color: "var(--accent-text)" }}
        >
          ← {t("more.back")}
        </button>
        {sub === "schedule" && <Schedule />}
        {sub === "stats" && <Stats />}
        {sub === "planner" && <Planner />}
        {sub === "mock" && <Mock />}
        {sub === "library" && <Library />}
        {sub === "weakness" && <Weakness />}
        {sub === "studyplan" && <StudyPlan />}
        {sub === "costs" && <Costs />}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
        {t("more.title")}
      </h1>
      <ul className="space-y-2">
        {items.map((it, i) => (
          <li key={it.id} className="animate-fade-in" style={{ animationDelay: `${i * 40}ms` }}>
            <button
              onClick={() => setSub(it.id)}
              className="w-full flex items-center gap-3 rounded-2xl border px-4 py-3.5 text-left transition-all active:scale-[0.99]"
              style={{
                backgroundColor: "var(--bg-surface)",
                borderColor: "var(--border-light)",
                boxShadow: "var(--shadow-sm)",
              }}
            >
              <Icon name={it.icon} size={22} style={{ color: "var(--accent-text)" }} />
              <span className="font-medium" style={{ color: "var(--text-primary)" }}>
                {t(`more.${it.id}`)}
              </span>
              <span className="ml-auto" style={{ color: "var(--text-tertiary)" }}>›</span>
            </button>
          </li>
        ))}
      </ul>

      <button
        onClick={async () => {
          try {
            await postJSON("/api/logout", {});
          } catch {
            /* ignore */
          }
          window.location.reload();
        }}
        className="w-full text-sm py-3 mt-2 transition-colors"
        style={{ color: "var(--text-tertiary)" }}
      >
        {t("auth.logout")}
      </button>
    </div>
  );
}
