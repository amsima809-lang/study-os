import { useState } from "react";
import { useT, LanguageToggle } from "../i18n.tsx";
import { postJSON, type ApiError } from "../api.ts";
import { ThemeToggle } from "../components/ui.tsx";
import Icon from "../components/Icon.tsx";

const BG_IMAGE = "https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=800&q=80";

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
    <div className="min-h-dvh flex flex-col items-center justify-center px-6 relative overflow-hidden">
      {/* Background photo */}
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${BG_IMAGE})` }}
      />
      {/* Dark gradient overlay */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(10,10,26,0.85) 0%, rgba(26,16,53,0.70) 50%, rgba(10,10,26,0.92) 100%)",
        }}
      />

      {/* Top controls */}
      <div
        className="absolute right-4 flex items-center gap-1 z-10"
        style={{ top: "calc(1rem + env(safe-area-inset-top))", color: "rgba(255,255,255,0.7)" }}
      >
        <ThemeToggle />
        <LanguageToggle />
      </div>

      {/* Content */}
      <div className="relative z-10 w-full max-w-sm animate-slide-up">
        {/* Logo — icon only, blending with background */}
        <div className="text-center mb-10">
          <div className="inline-block mb-4" style={{ color: "rgba(255,255,255,0.85)" }}>
            <Icon name="book" size={56} />
          </div>
          <h1 className="text-3xl font-bold" style={{ color: "#fff" }}>
            {t("app.name")}
          </h1>
          <p className="text-sm mt-2" style={{ color: "rgba(255,255,255,0.5)" }}>
            {t("app.tagline")}
          </p>
        </div>

        {/* Glass card for form */}
        <div
          className="rounded-3xl px-8 py-8 border"
          style={{
            background: "rgba(255,255,255,0.06)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
            borderColor: "rgba(255,255,255,0.1)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.3)",
          }}
        >
          <form onSubmit={submit} className="space-y-4">
            <div className="relative">
              <div className="absolute left-3.5 top-1/2 -translate-y-1/2" style={{ color: "rgba(255,255,255,0.35)" }}>
                <Icon name="shield" size={18} />
              </div>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={t("auth.password")}
                autoFocus
                className="w-full rounded-xl border pl-10 pr-4 py-3 text-sm focus:ring-2 focus:ring-offset-0 transition-all"
                style={{
                  backgroundColor: "rgba(255,255,255,0.06)",
                  borderColor: "rgba(255,255,255,0.12)",
                  color: "#fff",
                  outlineColor: "rgba(255,255,255,0.3)",
                }}
              />
            </div>

            {error && (
              <p className="text-sm text-center" style={{ color: "#f87171" }}>
                {t("auth.wrong")}
              </p>
            )}

            <button
              type="submit"
              disabled={busy || !password}
              className="w-full font-semibold rounded-xl py-3 disabled:opacity-40 transition-all active:scale-[0.98]"
              style={{
                background: "rgba(255,255,255,0.10)",
                backdropFilter: "blur(8px)",
                WebkitBackdropFilter: "blur(8px)",
                border: "1px solid rgba(255,255,255,0.15)",
                color: "#fff",
              }}
            >
              {t("auth.login")}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
