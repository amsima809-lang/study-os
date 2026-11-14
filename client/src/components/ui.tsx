import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import Icon from "./Icon.tsx";
import { applyColour, applyFont, forcedMode, DEFAULT_FONT, type Colour } from "../theme.ts";

/* ── Theme context ── */

type Theme = "light" | "dark" | "system";

const ThemeCtx = createContext<{
  theme: Theme;
  setTheme: (t: Theme) => void;
  /** Colour theme, see client/src/theme.ts ("default", "palette:ocean", "school:ru", "hc:dark"). */
  colour: Colour;
  setColour: (c: Colour) => void;
  /** Font id, see FONTS in client/src/theme.ts. */
  font: string;
  setFont: (f: string) => void;
}>({
  theme: "system",
  setTheme: () => {},
  colour: "default",
  setColour: () => {},
  font: DEFAULT_FONT,
  setFont: () => {},
});

function stored(key: string, fallback: string): string {
  try {
    return localStorage.getItem(key) || fallback;
  } catch {
    return fallback;
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => stored("studyos-theme", "system") as Theme);
  const [colour, setColourState] = useState<Colour>(() => stored("studyos-colour", "default"));
  // What "system" currently means on this device.
  const [systemDark, setSystemDark] = useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches);

  function setTheme(t: Theme) {
    setThemeState(t);
    try { localStorage.setItem("studyos-theme", t); } catch {}
  }

  const [font, setFontState] = useState(() => stored("studyos-font", DEFAULT_FONT));

  function setFont(f: string) {
    setFontState(f);
    try { localStorage.setItem("studyos-font", f); } catch {}
  }

  useEffect(() => applyFont(font), [font]);

  function setColour(c: Colour) {
    setColourState(c);
    try { localStorage.setItem("studyos-colour", c); } catch {}
  }

  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setSystemDark(mq.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    const root = document.documentElement;
    // A high-contrast theme decides light/dark itself.
    const forced = forcedMode(colour);
    const attr = forced ?? (theme === "system" ? null : theme);
    if (attr) root.setAttribute("data-theme", attr);
    else root.removeAttribute("data-theme");
    applyColour(colour, forced ?? (theme === "system" ? (systemDark ? "dark" : "light") : theme));
  }, [theme, colour, systemDark]);

  return (
    <ThemeCtx.Provider value={{ theme, setTheme, colour, setColour, font, setFont }}>{children}</ThemeCtx.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeCtx);
}

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const next: Theme = theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
  const iconName = theme === "light" ? "sun" : theme === "dark" ? "moon" : "monitor";

  return (
    <button
      onClick={() => setTheme(next)}
      className="w-8 h-8 flex items-center justify-center rounded-lg hover:bg-[var(--bg-surface-hover)] transition-colors"
      title={`Theme: ${theme}`}
      style={{ color: "var(--text-secondary)" }}
    >
      <Icon name={iconName} size={18} />
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
