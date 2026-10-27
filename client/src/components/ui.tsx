import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

/* ── Theme context ── */

type Theme = "light" | "dark" | "system";

const ThemeCtx = createContext<{ theme: Theme; setTheme: (t: Theme) => void }>({
  theme: "system",
  setTheme: () => {},
});

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    try {
      return (localStorage.getItem("studyos-theme") as Theme) || "system";
    } catch {
      return "system";
    }
  });

  function setTheme(t: Theme) {
    setThemeState(t);
    try { localStorage.setItem("studyos-theme", t); } catch {}
  }

  useEffect(() => {
    const root = document.documentElement;
    if (theme === "system") {
      root.removeAttribute("data-theme");
    } else {
      root.setAttribute("data-theme", theme);
    }
  }, [theme]);

  return <ThemeCtx.Provider value={{ theme, setTheme }}>{children}</ThemeCtx.Provider>;
}

export function useTheme() {
  return useContext(ThemeCtx);
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const next: Theme = theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
  const icon = theme === "light" ? "☀️" : theme === "dark" ? "🌙" : "💻";

  return (
    <button
      onClick={() => setTheme(next)}
      className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[var(--bg-surface-hover)] transition-colors text-sm"
      title={`Theme: ${theme}`}
    >
      {icon}
    </button>
  );
}

/* ── UI primitives ── */

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl px-4 py-3 border animate-fade-in ${className}`}
      style={{
        backgroundColor: "var(--bg-surface)",
        borderColor: "var(--border-light)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      {children}
    </div>
  );
}

export function Loading({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 gap-3">
      <div
        className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin"
        style={{ borderColor: "var(--border)", borderTopColor: "transparent" }}
      />
      <p className="text-sm" style={{ color: "var(--text-tertiary)" }}>{children}</p>
    </div>
  );
}

export function ErrorBox({ children }: { children: ReactNode }) {
  return (
    <div
      className="rounded-2xl text-sm px-4 py-3 text-center"
      style={{ backgroundColor: "var(--danger-bg)", color: "var(--danger)" }}
    >
      {children}
    </div>
  );
}
