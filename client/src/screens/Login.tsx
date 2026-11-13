import { useState } from "react";
import { useT, LanguageToggle } from "../i18n.tsx";
import { postJSON } from "../api.ts";
import { ThemeToggle } from "../components/ui.tsx";
import Icon from "../components/Icon.tsx";

const BG_IMAGE = "https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=800&q=80";

export default function Login({ onAuthed }: { onAuthed: () => void }) {
  const { t } = useT();
  const [showDev, setShowDev] = useState(false);
  const [devEmail, setDevEmail] = useState("");
  const [devName, setDevName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function devLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!devEmail) return;
    setError("");
    setBusy(true);
    try {
      await postJSON("/api/auth/dev-login", { email: devEmail, name: devName || devEmail.split("@")[0] });
      onAuthed();
    } catch (err: any) {
      setError(err?.message ?? t("auth.wrong"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="min-h-dvh flex flex-col items-center justify-center px-6 relative overflow-hidden">
      <div
        className="absolute inset-0 bg-cover bg-center"
        style={{ backgroundImage: `url(${BG_IMAGE})` }}
      />
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, rgba(10,10,26,0.85) 0%, rgba(26,16,53,0.70) 50%, rgba(10,10,26,0.92) 100%)",
        }}
      />

      <div
        className="absolute right-4 flex items-center gap-1 z-10"
        style={{ top: "calc(1rem + env(safe-area-inset-top))", color: "rgba(255,255,255,0.7)" }}
      >
        <ThemeToggle />
        <LanguageToggle />
      </div>

      <div className="relative z-10 w-full max-w-sm animate-slide-up">
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
          <div className="space-y-4">
            {/* Google OAuth */}
            <a
              href="/api/auth/google"
              className="w-full flex items-center justify-center gap-3 font-semibold rounded-xl py-3 transition-all active:scale-[0.98]"
              style={{
                background: "#fff",
                color: "#333",
                border: "1px solid rgba(0,0,0,0.1)",
              }}
            >
              <svg width="20" height="20" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
              </svg>
              {t("auth.google")}
            </a>

            {/* Dev login toggle */}
            {!showDev && (
              <button
                type="button"
                onClick={() => setShowDev(true)}
                className="w-full text-center text-xs py-2 transition-opacity"
                style={{ color: "rgba(255,255,255,0.35)" }}
              >
                {t("auth.dev_login")}
              </button>
            )}

            {showDev && (
              <form onSubmit={devLogin} className="space-y-3 pt-2 border-t" style={{ borderColor: "rgba(255,255,255,0.1)" }}>
                <p className="text-xs text-center" style={{ color: "rgba(255,255,255,0.4)" }}>
                  Dev login (ไม่ต้อง Google)
                </p>
                <input
                  type="email"
                  value={devEmail}
                  onChange={(e) => setDevEmail(e.target.value)}
                  placeholder="Email"
                  required
                  className="w-full rounded-xl border px-4 py-2.5 text-sm"
                  style={{
                    backgroundColor: "rgba(255,255,255,0.06)",
                    borderColor: "rgba(255,255,255,0.12)",
                    color: "#fff",
                  }}
                />
                <input
                  type="text"
                  value={devName}
                  onChange={(e) => setDevName(e.target.value)}
                  placeholder={t("auth.name_optional")}
                  className="w-full rounded-xl border px-4 py-2.5 text-sm"
                  style={{
                    backgroundColor: "rgba(255,255,255,0.06)",
                    borderColor: "rgba(255,255,255,0.12)",
                    color: "#fff",
                  }}
                />
                {error && (
                  <p className="text-sm text-center" style={{ color: "#f87171" }}>{error}</p>
                )}
                <button
                  type="submit"
                  disabled={busy || !devEmail}
                  className="w-full font-semibold rounded-xl py-2.5 disabled:opacity-40 transition-all active:scale-[0.98]"
                  style={{
                    background: "rgba(255,255,255,0.10)",
                    border: "1px solid rgba(255,255,255,0.15)",
                    color: "#fff",
                  }}
                >
                  {t("auth.login")}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
