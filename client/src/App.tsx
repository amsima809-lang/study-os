import { useEffect, useState } from "react";
import { LanguageProvider, LanguageToggle, useT } from "./i18n.tsx";
import { getJSON } from "./api.ts";
import { ThemeProvider, ThemeToggle } from "./components/ui.tsx";
import Icon from "./components/Icon.tsx";
import Login from "./screens/Login.tsx";
import Today from "./screens/Today.tsx";
import Notes from "./screens/Notes.tsx";
import Quiz from "./screens/Quiz.tsx";
import Review from "./screens/Review.tsx";
import More from "./screens/More.tsx";

type Tab = "today" | "notes" | "quiz" | "review" | "more";

const TAB_ICONS: Record<Tab, string> = {
  today: "calendar",
  notes: "notebook",
  quiz: "target",
  review: "refresh",
  more: "moreHorizontal",
};

function Shell() {
  const { t } = useT();
  const [tab, setTab] = useState<Tab>("today");

  const tabIds: Tab[] = ["today", "notes", "quiz", "review", "more"];

  return (
    <div className="min-h-dvh flex flex-col md:flex-row" style={{ backgroundColor: "var(--bg-base)" }}>
      {/* Sidebar — md+ */}
      <aside
        className="hidden md:flex flex-col w-56 fixed inset-y-0 left-0 z-20 border-r"
        style={{
          backgroundColor: "var(--bg-surface)",
          borderColor: "var(--border-light)",
          paddingTop: "env(safe-area-inset-top)",
        }}
      >
        <div className="px-5 py-4 flex items-center gap-2">
          <Icon name="book" size={22} style={{ color: "var(--accent-text)" }} />
          <span className="font-bold text-lg" style={{ color: "var(--accent-text)" }}>
            {t("app.name")}
          </span>
        </div>
        <nav className="flex-1 px-3 space-y-1">
          {tabIds.map((id) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all"
              style={{
                backgroundColor: tab === id ? "var(--accent-light)" : "transparent",
                color: tab === id ? "var(--accent-text)" : "var(--text-secondary)",
              }}
            >
              <Icon name={TAB_ICONS[id]} size={20} />
              {t(`nav.${id}`)}
            </button>
          ))}
        </nav>
        <div className="px-5 py-3 border-t flex items-center justify-between" style={{ borderColor: "var(--border-light)" }}>
          <LanguageToggle />
          <ThemeToggle />
        </div>
      </aside>

      {/* Main area */}
      <div className="flex-1 flex flex-col md:ml-56">
        {/* Top bar — mobile */}
        <header
          className="sticky top-0 z-10 md:hidden backdrop-blur-md border-b"
          style={{
            backgroundColor: "color-mix(in srgb, var(--bg-surface) 85%, transparent)",
            borderColor: "var(--border-light)",
            paddingTop: "env(safe-area-inset-top)",
          }}
        >
          <div className="max-w-3xl mx-auto flex justify-between items-center px-5 py-3">
            <div className="flex items-center gap-2">
              <Icon name="book" size={20} style={{ color: "var(--accent-text)" }} />
              <span className="font-bold" style={{ color: "var(--accent-text)" }}>{t("app.name")}</span>
            </div>
            <div className="flex items-center gap-1">
              <ThemeToggle />
              <LanguageToggle />
            </div>
          </div>
        </header>

        {/* Screen content */}
        <main className="flex-1 px-5 py-5 max-w-3xl w-full mx-auto pb-24 md:pb-5">
          <div className="animate-fade-in">
            {tab === "today" && <Today />}
            {tab === "notes" && <Notes />}
            {tab === "quiz" && <Quiz />}
            {tab === "review" && <Review />}
            {tab === "more" && <More />}
          </div>
        </main>

        {/* Bottom nav — mobile */}
        <nav
          className="fixed bottom-0 inset-x-0 border-t flex justify-around max-w-3xl mx-auto z-10 md:hidden backdrop-blur-md"
          style={{
            backgroundColor: "color-mix(in srgb, var(--bg-surface) 90%, transparent)",
            borderColor: "var(--border-light)",
            paddingBottom: "env(safe-area-inset-bottom)",
          }}
        >
          {tabIds.map((id) => (
            <button
              key={id}
              onClick={() => setTab(id)}
              className="flex-1 flex flex-col items-center py-2 text-xs gap-0.5 min-h-12 justify-center font-medium transition-colors"
              style={{
                color: tab === id ? "var(--accent-text)" : "var(--text-tertiary)",
              }}
            >
              <Icon name={TAB_ICONS[id]} size={20} />
              {t(`nav.${id}`)}
              {tab === id && (
                <span
                  className="absolute top-0 w-8 h-0.5 rounded-full"
                  style={{ backgroundColor: "var(--accent)" }}
                />
              )}
            </button>
          ))}
        </nav>
      </div>
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

  if (authed === null) return <div className="min-h-dvh" style={{ backgroundColor: "var(--bg-base)" }} />;
  if (!authed) return <Login onAuthed={() => setAuthed(true)} />;
  return <Shell />;
}

export default function App() {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <AuthGate />
      </LanguageProvider>
    </ThemeProvider>
  );
}
