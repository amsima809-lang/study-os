import { useEffect, useState } from "react";
import { useT, LanguageToggle } from "../i18n.tsx";
import { getJSON, postJSON } from "../api.ts";
import { ThemeToggle } from "../components/ui.tsx";
import Icon from "../components/Icon.tsx";
import UniversityPicker, { useUniversity } from "../components/UniversityPicker.tsx";
import Logo from "../components/Logo.tsx";
import { BRAND } from "../theme.ts";

const DARK = "#0b0b18";

/** Blend a hex colour towards another (t = share of `to`), as an rgb() string. */
function mix(from: string, to: string, t: number, alpha = 1): string {
  const ch = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  const v = [0, 1, 2].map((i) => Math.round(ch(from, i) * (1 - t) + ch(to, i) * t));
  return `rgba(${v[0]},${v[1]},${v[2]},${alpha})`;
}

export default function Login({ onAuthed }: { onAuthed: () => void }) {
  const { t, lang } = useT();
  const [uni, chooseUni] = useUniversity();
  const [picking, setPicking] = useState(false);

  // Theme colours: the chosen university's, or the default purple/blue/pink.
  // With no university chosen, the page wears the brand's own indigo.
  const primary = uni?.swatches[0].hex ?? BRAND.primary;
  const secondary = uni?.swatches[1]?.hex ?? (uni ? primary : "#3b82f6");
  const third = uni ? primary : "#fbbf24";
  const approx = uni?.swatches.some((s) => s.source !== "official") ?? false;
  const [showDev, setShowDev] = useState(false);
  // Which ways of signing in this server offers (dev login is off on a live site).
  const [methods, setMethods] = useState<{ google: boolean; devLogin: boolean } | null>(null);
  useEffect(() => {
    getJSON<{ google: boolean; devLogin: boolean }>("/api/auth/config")
      .then(setMethods)
      .catch(() => setMethods({ google: true, devLogin: false })); // an older server: offer Google only
  }, []);
  const [devEmail, setDevEmail] = useState("");
  const [devName, setDevName] = useState("");
  const [error, setError] = useState("");
  // Back from Google without being signed in (cancelled, expired, or an unverified address).
  const [googleFailed] = useState(() => {
    const failed = new URLSearchParams(window.location.search).get("signin") === "failed";
    if (failed) window.history.replaceState(null, "", window.location.pathname);
    return failed;
  });
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
      {/* Modern animated gradient background */}
      <div
        className="absolute inset-0"
        style={{
          background: uni
            ? `linear-gradient(135deg, ${mix(primary, DARK, 0.85)} 0%, ${mix(primary, DARK, 0.6)} 40%, ${mix(secondary, DARK, 0.8)} 100%)`
            : "linear-gradient(135deg, #0f0c29 0%, #302b63 40%, #24243e 100%)" /* the brand's deep indigo */,
        }}
      />
      {/* Campus photo (only some universities have one) under a tinted dark overlay */}
      {uni?.photo && (
        <>
          <div
            key={uni.id}
            className="absolute inset-0 bg-cover bg-center"
            style={{ backgroundImage: `url(${uni.photo.src})` }}
          />
          <div
            className="absolute inset-0"
            style={{
              background: `linear-gradient(180deg, ${mix(primary, DARK, 0.92, 0.88)} 0%, ${mix(primary, DARK, 0.85, 0.74)} 45%, ${mix(primary, DARK, 0.95, 0.94)} 100%)`,
            }}
          />
        </>
      )}
      {/* Floating gradient orbs */}
      <div
        className="absolute w-[500px] h-[500px] rounded-full opacity-30 blur-[100px]"
        style={{
          display: uni?.photo ? "none" : undefined,
          background: `radial-gradient(circle, ${primary} 0%, transparent 70%)`,
          top: "-10%",
          right: "-10%",
          animation: "float 8s ease-in-out infinite",
        }}
      />
      <div
        className="absolute w-[400px] h-[400px] rounded-full opacity-20 blur-[80px]"
        style={{
          display: uni?.photo ? "none" : undefined,
          background: `radial-gradient(circle, ${secondary} 0%, transparent 70%)`,
          bottom: "-5%",
          left: "-10%",
          animation: "float 10s ease-in-out infinite reverse",
        }}
      />
      <div
        className="absolute w-[300px] h-[300px] rounded-full opacity-15 blur-[60px]"
        style={{
          display: uni?.photo ? "none" : undefined,
          background: `radial-gradient(circle, ${third} 0%, transparent 70%)`,
          top: "40%",
          left: "50%",
          animation: "float 12s ease-in-out infinite",
        }}
      />

      {/* Subtle grid overlay */}
      <div
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: "linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)",
          backgroundSize: "60px 60px",
        }}
      />

      {/* Theme/language controls */}
      <div
        className="absolute right-4 flex items-center gap-1 z-10"
        style={{ top: "calc(1rem + env(safe-area-inset-top))", color: "rgba(255,255,255,0.7)" }}
      >
        <ThemeToggle />
        <LanguageToggle />
      </div>

      <div className="relative z-10 w-full max-w-sm animate-slide-up">
        {/* Logo and branding */}
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-20 h-20 rounded-3xl mb-5"
            style={{
              background: `linear-gradient(135deg, ${mix(primary, "#ffffff", 0.15, 0.35)} 0%, ${mix(secondary, "#ffffff", 0.15, 0.22)} 100%)`,
              border: "1px solid rgba(255,255,255,0.1)",
              backdropFilter: "blur(20px)",
              boxShadow: `0 8px 32px ${mix(primary, DARK, 0.2, 0.25)}`,
            }}
          >
            <Logo size={44} style={{ color: "rgba(255,255,255,0.95)" }} />
          </div>
          <h1 className="text-4xl font-extrabold tracking-tight" style={{ color: "#fff" }}>
            {t("app.name")}
          </h1>
          <p className="text-sm mt-2 font-medium" style={{ color: "rgba(255,255,255,0.45)" }}>
            {uni ? (lang === "th" ? uni.nameTh : uni.nameEn) : t("app.tagline")}
          </p>
        </div>

        {/* Login card */}
        <div
          className="rounded-3xl px-7 py-7 border"
          style={{
            background: uni?.photo ? "rgba(11,11,24,0.45)" : "rgba(255,255,255,0.05)",
            backdropFilter: "blur(40px)",
            WebkitBackdropFilter: "blur(40px)",
            borderColor: "rgba(255,255,255,0.08)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)",
          }}
        >
          <div className="space-y-4">
            {/* Google OAuth */}
            {methods?.google && <a
              href="/api/auth/google"
              className="w-full flex items-center justify-center gap-3 font-semibold rounded-2xl py-3.5 transition-all active:scale-[0.98] hover:shadow-lg"
              style={{
                background: "#fff",
                color: "#333",
                boxShadow: "0 2px 8px rgba(0,0,0,0.15)",
              }}
            >
              <svg width="20" height="20" viewBox="0 0 48 48">
                <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
                <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
                <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
                <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
              </svg>
              {t("auth.google")}
            </a>}

            {googleFailed && (
              <p role="alert" className="text-sm text-center" style={{ color: "#fca5a5" }}>{t("auth.googleFailed")}</p>
            )}

            {methods && !methods.google && !methods.devLogin && (
              <p role="alert" className="text-sm text-center" style={{ color: "rgba(255,255,255,0.75)" }}>{t("auth.none")}</p>
            )}

            {/* Divider */}
            {methods?.google && methods.devLogin && <div className="flex items-center gap-3">
              <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
              <span className="text-xs" style={{ color: "rgba(255,255,255,0.25)" }}>{t("auth.or")}</span>
              <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
            </div>}

            {/* Dev login toggle */}
            {methods?.devLogin && !showDev && (
              <button
                type="button"
                onClick={() => setShowDev(true)}
                className="w-full text-center text-xs py-2.5 rounded-2xl transition-all min-h-11"
                style={{
                  color: "rgba(255,255,255,0.4)",
                  border: "1px solid rgba(255,255,255,0.06)",
                  background: "rgba(255,255,255,0.02)",
                }}
              >
                {t("auth.dev_login")}
              </button>
            )}

            {methods?.devLogin && showDev && (
              <form onSubmit={devLogin} className="space-y-3">
                <input
                  type="email"
                  value={devEmail}
                  onChange={(e) => setDevEmail(e.target.value)}
                  placeholder="Email"
                  required
                  className="w-full rounded-xl border px-4 py-3 text-sm placeholder:text-white/25 min-h-11"
                  style={{
                    backgroundColor: "rgba(255,255,255,0.04)",
                    borderColor: "rgba(255,255,255,0.08)",
                    color: "#fff",
                  }}
                />
                <input
                  type="text"
                  value={devName}
                  onChange={(e) => setDevName(e.target.value)}
                  placeholder={t("auth.name_optional")}
                  className="w-full rounded-xl border px-4 py-3 text-sm placeholder:text-white/25 min-h-11"
                  style={{
                    backgroundColor: "rgba(255,255,255,0.04)",
                    borderColor: "rgba(255,255,255,0.08)",
                    color: "#fff",
                  }}
                />
                {error && (
                  <p className="text-sm text-center" style={{ color: "#f87171" }}>{error}</p>
                )}
                <button
                  type="submit"
                  disabled={busy || !devEmail}
                  className="w-full font-semibold rounded-xl py-3 disabled:opacity-40 transition-all active:scale-[0.98] min-h-11"
                  style={{
                    background: `linear-gradient(135deg, ${mix(primary, "#ffffff", 0.1, 0.5)} 0%, ${mix(secondary, "#ffffff", 0.1, 0.4)} 100%)`,
                    border: "1px solid rgba(255,255,255,0.1)",
                    color: "#fff",
                  }}
                >
                  {t("auth.login")}
                </button>
              </form>
            )}
          </div>
        </div>

        {/* University theme picker */}
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="w-full mt-4 flex items-center justify-center gap-2 text-sm py-3 rounded-2xl transition-all active:scale-[0.98] min-h-11"
          style={{
            color: "rgba(255,255,255,0.75)",
            border: "1px solid rgba(255,255,255,0.1)",
            background: "rgba(255,255,255,0.05)",
          }}
        >
          <Icon name="graduationCap" size={18} />
          {uni ? t("uni.change") : t("uni.choose")}
        </button>

        {/* Bottom text: school colours (as the university names them) + photo credit */}
        <div className="text-center text-xs mt-5 space-y-1" style={{ color: "rgba(255,255,255,0.4)" }}>
          {uni ? (
            <>
              <p title={approx ? t("uni.approx") : undefined}>
                {lang === "th" ? uni.colourTh : uni.colourEn}
                {approx && " *"}
              </p>
              {approx && <p style={{ color: "rgba(255,255,255,0.28)" }}>* {t("uni.approx")}</p>}
              {uni.photo && (
                <p>
                  {t("uni.photo_by")}{" "}
                  <a href={uni.photo.page} target="_blank" rel="noreferrer" className="tap-area inline-block underline">
                    {uni.photo.author}
                  </a>
                  , {uni.photo.licence} (Wikimedia Commons)
                </p>
              )}
            </>
          ) : (
            <p>{t("uni.tagline")}</p>
          )}
        </div>
      </div>

      {picking && (
        <UniversityPicker current={uni} onPick={chooseUni} onClose={() => setPicking(false)} />
      )}

      <style>{`
        @keyframes float {
          0%, 100% { transform: translateY(0px) scale(1); }
          50% { transform: translateY(-20px) scale(1.05); }
        }
      `}</style>
    </div>
  );
}
