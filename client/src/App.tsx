import { useState } from "react";
import { LanguageProvider, LanguageToggle, useT } from "./i18n.tsx";
import Today from "./screens/Today.tsx";
import Week from "./screens/Week.tsx";
import Exams from "./screens/Exams.tsx";

type Tab = "today" | "week" | "exams";

function Shell() {
  const { t } = useT();
  const [tab, setTab] = useState<Tab>("today");

  const tabs: Array<{ id: Tab; icon: string }> = [
    { id: "today", icon: "📅" },
    { id: "week", icon: "🗓️" },
    { id: "exams", icon: "📝" },
  ];

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex flex-col">
      {/* top bar */}
      <div className="flex justify-between items-center px-5 py-3 bg-white shadow-sm sticky top-0 z-10">
        <span className="font-bold text-indigo-600">{t("app.name")}</span>
        <LanguageToggle />
      </div>

      {/* screen content */}
      <main className="flex-1 px-5 py-5 max-w-lg w-full mx-auto pb-24">
        {tab === "today" && <Today />}
        {tab === "week" && <Week />}
        {tab === "exams" && <Exams />}
      </main>

      {/* bottom navigation */}
      <nav className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 flex justify-around max-w-lg mx-auto">
        {tabs.map((tb) => (
          <button
            key={tb.id}
            onClick={() => setTab(tb.id)}
            className={`flex-1 flex flex-col items-center py-2 text-xs gap-0.5 ${
              tab === tb.id ? "text-indigo-600 font-semibold" : "text-slate-400"
            }`}
          >
            <span className="text-lg">{tb.icon}</span>
            {t(`nav.${tb.id}`)}
          </button>
        ))}
      </nav>
    </div>
  );
}

export default function App() {
  return (
    <LanguageProvider>
      <Shell />
    </LanguageProvider>
  );
}
