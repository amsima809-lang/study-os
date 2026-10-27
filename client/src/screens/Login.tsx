import { useState } from "react";
import { useT, LanguageToggle } from "../i18n.tsx";
import { postJSON, type ApiError } from "../api.ts";
import { ThemeToggle } from "../components/ui.tsx";
import Icon from "../components/Icon.tsx";

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
      className="min-h-dvh flex flex-col items-center justify-center px-6 relative overflow-hidden"
      style={{ background: "linear-gradient(135deg, #0a0a1a 0%, #1a1035 40%, #0d0d2b 100%)" }}
    >
      {/* Animated glow orbs */}
      <div
        className="absolute rounded-full blur-3xl opacity-30 animate-pulse"
        style={{
          width: 300, height: 300, top: "-8%", right: "-10%",
          background: "radial-gradient(circle, #7c3aed 0%, transparent 70%)",
        }}
      />
      <div
        className="absolute rounded-full blur-3xl opacity-20"
        style={{
          width: 250, height: 250, bottom: "5%", left: "-8%",
          background: "radial-gradient(circle, #6366f1 0%, transparent 70%)",
          animation: "pulse 4s ease-in-out infinite alternate",
        }}
      />

      {/* Grid pattern overlay */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.1) 1px, transparent 1px)",
          backgroundSize: "40px 40px",
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

      {/* Glass card */}
      <div
        className="w-full max-w-sm rounded-3xl px-8 py-10 border relative z-10 animate-slide-up"
        style={{
          background: "rgba(255,255,255,0.06)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
          borderColor: "rgba(255,255,255,0.1)",
          boxShadow: "0 8px 32px rgba(0,0,0,0.4), inset 0 1px 0 rgba(255,255,255,0.08)",
        }}
      >
        {/* Logo */}
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
            style={{
              background: "linear-gradient(135deg, #7c3aed, #6366f1)",
              boxShadow: "0 0 30px rgba(124,58,237,0.4), 0 0 60px rgba(124,58,237,0.15)",
            }}
          >
            <Icon name="book" size={32} style={{ color: "#fff" }} />
          </div>
          <h1 className="text-2xl font-bold" style={{ color: "#fff" }}>
            {t("app.name")}
          </h1>
          <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.5)" }}>
            {t("app.tagline")}
          </p>
        </div>

        {/* Form */}
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
                outlineColor: "#7c3aed",
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
              background: "linear-gradient(135deg, #7c3aed, #6366f1)",
              color: "#fff",
              boxShadow: password ? "0 0 20px rgba(124,58,237,0.35)" : "none",
            }}
          >
            {t("auth.login")}
          </button>
        </form>
      </div>

      {/* Bottom glow line */}
      <div
        className="absolute bottom-0 left-1/2 -translate-x-1/2 h-px w-2/3"
        style={{
          background: "linear-gradient(90deg, transparent, rgba(124,58,237,0.5), transparent)",
        }}
      />
    </div>
  );
}
