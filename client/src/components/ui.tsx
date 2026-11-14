import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Icon from "./Icon.tsx";
import { useT } from "../i18n.tsx";
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
      className="w-11 h-11 flex items-center justify-center rounded-lg hover:bg-[var(--bg-surface-hover)] transition-colors"
      title={`Theme: ${theme}`}
      style={{ color: "var(--text-secondary)" }}
    >
      <Icon name={iconName} size={18} />
    </button>
  );
}

/* ── UI primitives ── */

/**
 * THE button for a screen's main "add" action. Every screen uses this one, so
 * the action looks the same and is found in the same way everywhere.
 */
export function AddButton({ label, onClick, expanded }: { label: string; onClick: () => void; expanded?: boolean }) {
  return (
    <button
      onClick={onClick}
      aria-expanded={expanded}
      className="shrink-0 inline-flex items-center gap-1.5 rounded-xl pl-3 pr-4 min-h-11 text-sm font-semibold transition-all active:scale-[0.98]"
      style={{ backgroundColor: "var(--accent)", color: "#fff" }}
    >
      <Icon name={expanded ? "x" : "plus"} size={18} />
      {label}
    </button>
  );
}

/**
 * THE confirmation for anything that deletes or throws work away. In the page
 * (not the browser's own pop-up), same look and wording pattern everywhere:
 * what will be lost, a red button that names the action, and a way out.
 */
export function ConfirmDialog({
  title,
  message,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  busy,
}: {
  title: string;
  message?: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onCancel();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onCancel]);

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-end md:items-center justify-center p-3" style={{ background: "rgba(0,0,0,0.5)" }} onClick={onCancel}>
      <div
        role="alertdialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-sm rounded-3xl border p-5 animate-slide-up"
        style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border-light)", marginBottom: "env(safe-area-inset-bottom)" }}
      >
        <h2 className="text-lg font-bold" style={{ color: "var(--text-primary)" }}>{title}</h2>
        {message && <p className="text-sm mt-1" style={{ color: "var(--text-secondary)" }}>{message}</p>}
        <div className="flex gap-2 mt-4">
          <button
            autoFocus
            onClick={onCancel}
            className="flex-1 rounded-xl min-h-11 font-medium border"
            style={{ borderColor: "var(--border)", color: "var(--text-primary)" }}
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="flex-1 rounded-xl min-h-11 font-semibold disabled:opacity-40"
            style={{ backgroundColor: "var(--danger)", color: "#fff" }}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

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

/**
 * Something failed. With no text of its own it says whether the device is
 * offline or the server could not be reached; with `onRetry` it offers the
 * way out — a "try again" button — instead of a dead end.
 */
export function ErrorBox({ children, onRetry }: { children?: ReactNode; onRetry?: () => void }) {
  const { t } = useT();
  const offline = typeof navigator !== "undefined" && navigator.onLine === false;
  return (
    <div
      role="alert"
      className="rounded-2xl text-sm px-4 py-3 text-center"
      style={{ backgroundColor: "var(--danger-bg)", color: "var(--danger)" }}
    >
      <p>{children ?? t(offline ? "status.offline" : "status.error")}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="mt-2 inline-flex items-center gap-1.5 rounded-xl border px-4 min-h-11 font-semibold"
          style={{ borderColor: "var(--danger)", color: "var(--danger)" }}
        >
          <Icon name="refresh" size={16} />
          {t("status.retry")}
        </button>
      )}
    </div>
  );
}

/** True while the device has a connection. (It can still be true on a dead Wi-Fi; requests then fail and say so.) */
export function useOnline(): boolean {
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine !== false);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);
  return online;
}
