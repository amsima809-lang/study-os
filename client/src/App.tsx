import { useEffect, useState } from "react";
import { LanguageProvider, LanguageToggle, useT } from "./i18n.tsx";
import { getJSON } from "./api.ts";
import Login from "./screens/Login.tsx";
import Today from "./screens/Today.tsx";
import Notes from "./screens/Notes.tsx";
import Quiz from "./screens/Quiz.tsx";
import Review from "./screens/Review.tsx";
import More from "./screens/More.tsx";

type Tab = "today" | "notes" | "quiz" | "review" | "more";

function Shell() {
  const { t } = useT();
  const [tab, setTab] = useState<Tab>("today");

  const tabs: Array<{ id: Tab; icon: string }> = [
    { id: "today", icon: "📅" },
    { id: "notes", icon: "📓" },
    { id: "quiz", icon: "🎯" },
    { id: "review", icon: "🔁" },
    { id: "more", icon: "⋯" },
  ];

  return (
    <div className="min-h-dvh bg-slate-50 text-slate-900 flex flex-col">
      {/* top bar (spans full width; content centered; respects the iOS notch) */}
      <header
        className="bg-white shadow-sm sticky top-0 z-10"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="max-w-lg mx-auto flex justify-between items-center px-5 py-3">
          <span className="font-bold text-indigo-600">{t("app.name")}</span>
          <LanguageToggle />
        </div>
      </header>

      {/* screen content — clears the fixed nav + the iOS home indicator */}
      <main
        className="flex-1 px-5 py-5 max-w-lg w-full mx-auto"
        style={{ paddingBottom: "calc(5.5rem + env(safe-area-inset-bottom))" }}
      >
        {tab === "today" && <Today />}
        {tab === "notes" && <Notes />}
        {tab === "quiz" && <Quiz />}
        {tab === "review" && <Review />}
        {tab === "more" && <More />}
      </main>

      {/* bottom navigation — centered to content width, safe-area aware */}
      <nav
        className="fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 flex justify-around max-w-lg mx-auto z-10"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {tabs.map((tb) => (
          <button
            key={tb.id}
            onClick={() => setTab(tb.id)}
            className={`flex-1 flex flex-col items-center py-2 text-xs gap-0.5 min-h-12 justify-center ${
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

function AuthGate() {
  const [authed, setAuthed] = useState<boolean | null>(null);

  useEffect(() => {
    getJSON<{ authed: boolean }>("/api/me")
      .then((d) => setAuthed(d.authed))
      .catch(() => setAuthed(false));
  }, []);

  if (authed === null) return <div className="min-h-dvh bg-slate-50" />;
  if (!authed) return <Login onAuthed={() => setAuthed(true)} />;
  return <Shell />;
}

export default function App() {
  return (
    <LanguageProvider>
      <AuthGate />
    </LanguageProvider>
  );
}
