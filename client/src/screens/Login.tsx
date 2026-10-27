import { useState } from "react";
import { useT, LanguageToggle } from "../i18n.tsx";
import { postJSON, type ApiError } from "../api.ts";
import { ThemeToggle } from "../components/ui.tsx";

export default function Login({ onAuthed }: { onAuthed: () => void }) {
  const { t } = useT();
  const [password, setPassword] = useState("");
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(false);
    setBusy(true);
    try {
      await postJSON("/api/login", { password });
      onAuthed();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="min-h-dvh flex flex-col items-center justify-center px-6"
      style={{ backgroundColor: "var(--bg-base)" }}
    >
      <div
        className="absolute right-4 flex items-center gap-1"
        style={{ top: "calc(1rem + env(safe-area-inset-top))" }}
      >
        <ThemeToggle />
        <LanguageToggle />
      </div>

      <div
        className="w-full max-w-sm rounded-2xl px-8 py-10 border animate-slide-up"
        style={{
          backgroundColor: "var(--bg-surface)",
          borderColor: "var(--border-light)",
          boxShadow: "var(--shadow-lg)",
        }}
      >
        <div className="text-center mb-8">
          <div className="text-5xl mb-3">📚</div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--accent-text)" }}>
            {t("app.name")}
          </h1>
          <p className="text-sm mt-1" style={{ color: "var(--text-tertiary)" }}>
            {t("app.tagline")}
          </p>
        </div>
        <form onSubmit={submit} className="space-y-4">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={t("auth.password")}
            autoFocus
            className="w-full rounded-xl border px-4 py-3 text-sm focus:ring-2 focus:ring-offset-0"
            style={{
              backgroundColor: "var(--bg-base)",
              borderColor: "var(--border)",
              color: "var(--text-primary)",
              outlineColor: "var(--accent)",
            }}
          />
          {error && (
            <p className="text-sm text-center" style={{ color: "var(--danger)" }}>
              {t("auth.wrong")}
            </p>
          )}
          <button
            type="submit"
            disabled={busy || !password}
            className="w-full font-semibold rounded-xl py-3 disabled:opacity-40 transition-all active:scale-[0.98]"
            style={{
              backgroundColor: "var(--accent)",
              color: "var(--text-inverse)",
            }}
          >
            {t("auth.login")}
          </button>
        </form>
      </div>
    </div>
  );
}
