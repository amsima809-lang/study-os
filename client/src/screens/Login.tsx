import { useEffect, useRef, useState } from "react";
import { useT, LanguageToggle } from "../i18n.tsx";
import { getJSON, postJSON } from "../api.ts";
import { ThemeToggle } from "../components/ui.tsx";
import Icon from "../components/Icon.tsx";
import UniversityPicker, { useUniversity } from "../components/UniversityPicker.tsx";
import Logo from "../components/Logo.tsx";
import { BRAND } from "../theme.ts";
import { DEFAULT_UNIVERSITY } from "../data/universityList.ts";
import { withBase } from "../base.ts";
import { inNativeApp, canGoogleSignInInApp, googleSignInInApp } from "../native.ts";
import LandingMore, { AppStoreButton, PhoneShot } from "../components/Landing.tsx";
import { TrailPath } from "../components/Trail.tsx";

const DARK = "#0b0b18";

/** Blend a hex colour towards another (t = share of `to`), as an rgb() string. */
function mix(from: string, to: string, t: number, alpha = 1): string {
  const ch = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  const v = [0, 1, 2].map((i) => Math.round(ch(from, i) * (1 - t) + ch(to, i) * t));
  return `rgba(${v[0]},${v[1]},${v[2]},${alpha})`;
}

function GoogleMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

/**
 * Scroll slowly (about 1.6 s, easing in and out) until the mountain's peak, which stands just under
 * the sign-in card, is near the top edge of the screen. With reduced motion: straight there.
 */
function scrollToMountain() {
  const card = document.querySelector("[data-trail-summit]");
  if (!card) return;
  const peak = card.getBoundingClientRect().bottom + window.scrollY + 28; // TrailPath puts the peak 28 px under the card
  const target = Math.max(0, peak - 24);
  const from = window.scrollY;
  if (window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { window.scrollTo(0, target); return; }
  const duration = 1600, start = performance.now();
  const ease = (x: number) => (x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2);
  const step = (now: number) => {
    const k = Math.min(1, (now - start) / duration);
    window.scrollTo(0, from + (target - from) * ease(k));
    if (k < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

export default function Login({ onAuthed }: { onAuthed: () => void }) {
  const { t, lang } = useT();
  const [uni, chooseUni] = useUniversity();
  const [picking, setPicking] = useState(false);

  // Theme colours: the chosen university's, or the default purple/blue/pink.
  // With no university chosen, the page wears the brand's own indigo.
  // Ramkhamhaeng, the default university, wears the app's own colours (owner 2026-11-16): `look` is
  // the university whose colours the page shows. No campus photos any more (archived in
  // docs/brand/campus-photos/).
  const look = uni && uni.id !== DEFAULT_UNIVERSITY ? uni : null;
  const primary = look?.swatches[0].hex ?? BRAND.primary;
  const secondary = look?.swatches[1]?.hex ?? (look ? primary : "#3b82f6");
  const approx = look?.swatches.some((s) => s.source !== "official") ?? false;
  const [showDev, setShowDev] = useState(false);
  // Which ways of signing in this server offers (dev login is off on a live site).
  const [methods, setMethods] = useState<{ google: boolean; devLogin: boolean; needsCode?: boolean } | null>(null);
  useEffect(() => {
    getJSON<{ google: boolean; devLogin: boolean; needsCode?: boolean }>("/api/auth/config")
      .then(setMethods)
      .catch(() => setMethods({ google: true, devLogin: false })); // an older server: offer Google only
  }, []);
  const [devEmail, setDevEmail] = useState("");
  const [devName, setDevName] = useState("");
  // A private trial site asks for the access code its owner handed out.
  const [devCode, setDevCode] = useState("");
  const [error, setError] = useState("");
  // Back from Google without being signed in (cancelled, expired, or an unverified address).
  const [googleFailed] = useState(() => {
    const failed = new URLSearchParams(window.location.search).get("signin") === "failed";
    if (failed) window.history.replaceState(null, "", window.location.pathname);
    return failed;
  });
  const [busy, setBusy] = useState(false);
  // The whole front page, which the trail is measured against.
  const landing = useRef<HTMLDivElement>(null);
  const summitHeading = useRef<HTMLHeadingElement>(null);
  // In the iPhone app Google sign-in goes through the system's sign-in sheet (native.ts).
  // A copy of the app from before it could do that cannot sign in with Google at all.
  const inApp = inNativeApp();
  const appCanGoogle = inApp && canGoogleSignInInApp();
  const [appGoogleFailed, setAppGoogleFailed] = useState(false);

  async function googleInApp() {
    if (busy) return;
    setAppGoogleFailed(false);
    setBusy(true);
    try {
      const result = await googleSignInInApp(
        (challenge) => new URL(withBase(`/api/auth/google?app=${challenge}`), window.location.origin).toString(),
        (code, verifier) => postJSON("/api/auth/app/redeem", { code, verifier }),
      );
      if (result === "done") onAuthed();
    } catch {
      setAppGoogleFailed(true);
    } finally {
      setBusy(false);
    }
  }

  const googleStyle = { background: "#fff", color: "#333", boxShadow: "0 2px 8px rgba(0,0,0,0.15)" } as const;
  const googleClass = "w-full flex items-center justify-center gap-3 font-semibold rounded-2xl py-3.5 transition-all active:scale-[0.98] hover:shadow-lg";

  async function devLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!devEmail) return;
    setError("");
    setBusy(true);
    try {
      await postJSON("/api/auth/dev-login", { email: devEmail, name: devName || devEmail.split("@")[0], code: devCode });
      onAuthed();
    } catch (err: any) {
      setError(err?.code === "BAD_CODE" ? t("auth.badCode") : err?.code === "TOO_MANY" ? t("auth.tooMany") : (err?.message ?? t("auth.wrong")));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div ref={landing} className="relative">
    {/* The mountain under the sign-in card, and the trail that winds up the whole page to its summit (Trail.tsx). */}
    <TrailPath root={landing} />
    {/* The first screen, the summit: signing in or creating an account, with room below it for
        the mountain (pb-56), so the mountain never sits behind the text. Below, what the app does (Landing.tsx). */}
    <section id="top" className="min-h-dvh flex flex-col items-center justify-center px-6 pt-10 pb-56 relative overflow-hidden">
      {/* Modern animated gradient background */}
      <div
        className="absolute inset-0"
        style={{
          background: look
            ? `linear-gradient(135deg, ${mix(primary, DARK, 0.85)} 0%, ${mix(primary, DARK, 0.6)} 40%, ${mix(secondary, DARK, 0.8)} 100%)`
            : "linear-gradient(135deg, #0f0c29 0%, #302b63 40%, #24243e 100%)" /* the brand's deep indigo */,
        }}
      />
      {/* Floating gradient orbs */}
      <div
        className="absolute w-[500px] h-[500px] rounded-full opacity-30 blur-[100px]"
        style={{
          background: `radial-gradient(circle, ${primary} 0%, transparent 70%)`,
          top: "-10%",
          right: "-10%",
          animation: "float 8s ease-in-out infinite",
        }}
      />
      <div
        className="absolute w-[400px] h-[400px] rounded-full opacity-20 blur-[80px]"
        style={{
          background: `radial-gradient(circle, ${secondary} 0%, transparent 70%)`,
          bottom: "-5%",
          left: "-10%",
          animation: "float 10s ease-in-out infinite reverse",
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

      {/* On a wide screen a phone stands beside the card, showing the app. */}
      <div className="relative z-10 w-full max-w-5xl flex items-center justify-center gap-16">
      <div data-trail-summit className="w-full max-w-sm animate-slide-up">
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
            <Logo size={44} accent={look ? undefined : BRAND.secondary} style={{ color: "rgba(255,255,255,0.95)" }} />
          </div>
          <h1 ref={summitHeading} tabIndex={-1} className="text-4xl font-extrabold tracking-tight outline-none" style={{ color: "#fff" }}>
            {t("app.name")}
          </h1>
          <p className="text-sm mt-2 font-medium" style={{ color: "rgba(255,255,255,0.75)" }}>{t("app.tagline")}</p>
          {uni && <p className="text-xs mt-1" style={{ color: "rgba(255,255,255,0.6)" }}>{lang === "th" ? uni.nameTh : uni.nameEn}</p>}
        </div>

        {/* Login card */}
        <div
          className="rounded-3xl px-7 py-7 border"
          style={{
            background: "rgba(255,255,255,0.05)",
            backdropFilter: "blur(40px)",
            WebkitBackdropFilter: "blur(40px)",
            borderColor: "rgba(255,255,255,0.08)",
            boxShadow: "0 8px 32px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.05)",
          }}
        >
          <div className="space-y-4">
            {/* Google OAuth */}
            {methods?.google && !inApp && <a href={withBase("/api/auth/google")} className={googleClass} style={googleStyle}>
              <GoogleMark />
              {t("auth.google")}
            </a>}
            {methods?.google && appCanGoogle && (
              <button type="button" onClick={googleInApp} disabled={busy} className={`${googleClass} disabled:opacity-60`} style={googleStyle}>
                <GoogleMark />
                {t("auth.google")}
              </button>
            )}
            {/* New here: a first Google sign-in creates the account, so this is the same step, said for a newcomer. */}
            {methods?.google && (!inApp || appCanGoogle) && (
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
                  <span className="text-xs" style={{ color: "rgba(255,255,255,0.65)" }}>{t("land.newHere")}</span>
                  <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
                </div>
                {inApp ? (
                  <button type="button" onClick={googleInApp} disabled={busy} className="w-full rounded-2xl border min-h-12 font-semibold disabled:opacity-60" style={{ borderColor: "rgba(255,255,255,0.22)", color: "#fff" }}>
                    {t("land.register")}
                  </button>
                ) : (
                  <a href={withBase("/api/auth/google")} className="w-full rounded-2xl border min-h-12 font-semibold flex items-center justify-center" style={{ borderColor: "rgba(255,255,255,0.22)", color: "#fff" }}>
                    {t("land.register")}
                  </a>
                )}
                <p className="text-xs text-center text-balance" style={{ color: "rgba(255,255,255,0.7)" }}>{t("land.registerNote")}</p>
              </div>
            )}
            {methods?.google && inApp && !appCanGoogle && (
              <p role="alert" className="text-sm text-center" style={{ color: "rgba(255,255,255,0.75)" }}>{t("auth.appTooOld")}</p>
            )}

            {(googleFailed || appGoogleFailed) && (
              <p role="alert" className="text-sm text-center" style={{ color: "#fca5a5" }}>{t("auth.googleFailed")}</p>
            )}

            {methods && !methods.google && !methods.devLogin && (
              <p role="alert" className="text-sm text-center" style={{ color: "rgba(255,255,255,0.75)" }}>{t("auth.none")}</p>
            )}

            {/* Divider */}
            {methods?.google && methods.devLogin && <div className="flex items-center gap-3">
              <div className="flex-1 h-px" style={{ background: "rgba(255,255,255,0.08)" }} />
              <span className="text-xs" style={{ color: "rgba(255,255,255,0.6)" }}>{t("auth.or")}</span>
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
                {methods.needsCode ? t("auth.trial_login") : t("auth.dev_login")}
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
                {methods.needsCode && (
                  <input
                    type="password"
                    value={devCode}
                    onChange={(e) => setDevCode(e.target.value)}
                    placeholder={t("auth.code")}
                    aria-label={t("auth.code")}
                    autoComplete="off"
                    required
                    className="w-full rounded-xl border px-4 py-3 text-sm placeholder:text-white/25 min-h-11"
                    style={{
                      backgroundColor: "rgba(255,255,255,0.04)",
                      borderColor: "rgba(255,255,255,0.08)",
                      color: "#fff",
                    }}
                  />
                )}
                {error && (
                  <p role="alert" className="text-sm text-center" style={{ color: "#f87171" }}>{error}</p>
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

        {/* The iPhone app, and the way down to what the app does. */}
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <AppStoreButton compact />
          {/* Not a jump: the page glides down until the top of the mountain is near the top of the
              screen, so she sees where the trail begins (owner 2026-11-16). */}
          <button onClick={scrollToMountain} className="inline-flex items-center gap-1.5 rounded-xl px-3 min-h-11 text-sm font-medium" style={{ color: "rgba(255,255,255,0.8)" }}>
            {t("land.scrollDown")}
            <Icon name="chevronDown" size={16} />
          </button>
        </div>

        {/* Bottom text: school colours (as the university names them) */}
        <div className="text-center text-xs mt-5 space-y-1" style={{ color: "rgba(255,255,255,0.65)" }}>
          {look && (
            <>
              <p title={approx ? t("uni.approx") : undefined}>
                {lang === "th" ? look.colourTh : look.colourEn}
                {approx && " *"}
              </p>
              {approx && <p style={{ color: "rgba(255,255,255,0.58)" }}>* {t("uni.approx")}</p>}
            </>
          )}
        </div>
      </div>
      <PhoneShot shot="today" className="hidden md:block w-[270px] shrink-0 animate-slide-up" />
      </div>

    </section>

      <LandingMore
        onSignIn={() => {
          const still = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
          document.getElementById("top")?.scrollIntoView({ behavior: still ? "auto" : "smooth" });
          summitHeading.current?.focus({ preventScroll: true });
        }}
      />

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
