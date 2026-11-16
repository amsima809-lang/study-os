/**
 * The front page's lower half, under the sign-in card (screens/Login.tsx): what the app does,
 * shown with screenshots of the app itself, the iPhone app, and a last button to sign in or
 * create an account.
 *
 * Every claim here describes a screen the app has. Keep it that way: no feature that is only
 * planned, and nothing about the university that the app does not take from its documents.
 *
 * The screenshots are client/public/landing/<th|en>/<name>.webp, made by
 * `node scripts/landing-shots.mjs <local copy>` from a made-up student. Take them again after
 * a screen they show changes.
 */
import { useT } from "../i18n.tsx";
import { inNativeApp, APP_STORE_URL } from "../native.ts";
import { withBase } from "../base.ts";
import Icon from "./Icon.tsx";

/**
 * The features with a screenshot, in the order they are shown. The planning comes first (owner
 * 2026-11-16: "the trail planner and auto-scheduling of near-term and long-term activities …
 * that's the killer app"): the whole degree, then the study week, then the rest.
 */
const SHOWN: { shot: string; key: string; icon: string }[] = [
  { shot: "trail", key: "trail", icon: "flag" },
  { shot: "studyplan", key: "studyplan", icon: "bookOpen" },
  { shot: "exams", key: "exams", icon: "fileEdit" },
  { shot: "timetable", key: "timetable", icon: "calendarRange" },
  { shot: "map", key: "map", icon: "mapPin" },
];
/** And the rest, as small cards. */
const MORE: { icon: string; key: string }[] = [
  { icon: "target", key: "practice" },
  { icon: "notebook", key: "notes" },
  { icon: "bell", key: "reminders" },
];

/** A screenshot of the app in a phone's outline. */
export function PhoneShot({ shot, className = "" }: { shot: string; className?: string }) {
  const { lang, t } = useT();
  return (
    <div
      className={`rounded-[2.4rem] p-2 ${className}`}
      style={{ background: "linear-gradient(160deg, #3a3760 0%, #17162b 100%)", boxShadow: "0 30px 60px rgba(0,0,0,0.45), inset 0 0 0 1px rgba(255,255,255,0.08)" }}
    >
      <img
        src={withBase(`/landing/${lang}/${shot}.webp`)}
        alt={t(`land.shot.${shot}`)}
        width={390}
        height={844}
        loading="lazy"
        decoding="async"
        className="block w-full h-auto rounded-[1.9rem]"
      />
    </div>
  );
}

/** The App Store button. Until the app is released it says "coming soon" and goes nowhere. */
export function AppStoreButton({ compact = false }: { compact?: boolean }) {
  const { t } = useT();
  if (inNativeApp()) return null; // already in the app
  const live = APP_STORE_URL !== null;
  const body = (
    <>
      <Icon name="download" size={compact ? 18 : 22} />
      <span className="flex flex-col items-start leading-tight text-left">
        <span className="text-xs opacity-75">{live ? t("land.appStoreSmall") : t("land.appSoonSmall")}</span>
        <span className={compact ? "text-sm font-semibold" : "text-base font-semibold"}>App Store</span>
      </span>
    </>
  );
  const cls = `inline-flex items-center gap-2.5 rounded-xl border px-4 ${compact ? "min-h-11" : "min-h-14"}`;
  const style = { backgroundColor: "#000", borderColor: "rgba(255,255,255,0.28)", color: "#fff" };
  return live ? (
    <a href={APP_STORE_URL!} target="_blank" rel="noopener noreferrer" className={cls} style={style} aria-label={t("land.appStore")}>
      {body}
    </a>
  ) : (
    <span className={cls} style={{ ...style, opacity: 0.7 }}>
      {body}
    </span>
  );
}

/**
 * A stop on the trail (Trail.tsx): a round marker the dotted trail passes through. Each
 * section of the page has one, with that section's icon.
 */
function Stop({ icon, size = 48 }: { icon: string; size?: number }) {
  return (
    <span
      data-trail-stop
      className="relative inline-flex rounded-full items-center justify-center"
      style={{ width: size, height: size, backgroundColor: "#16152d", border: "2px solid #fbbf24", color: "#fbbf24", boxShadow: "0 0 0 6px rgba(251,191,36,0.10), 0 6px 18px rgba(0,0,0,0.35)" }}
    >
      <Icon name={icon} size={Math.round(size * 0.45)} />
    </span>
  );
}

/** Cards that the trail passes behind are solid, so it never runs through their text. */
const SOLID = { backgroundColor: "#1a1934", borderColor: "rgba(255,255,255,0.09)" };

export default function LandingMore({ onSignIn }: { onSignIn: () => void }) {
  const { t } = useT();
  const native = inNativeApp();
  return (
    <div id="features" style={{ background: "linear-gradient(180deg, #24243e 0%, #14132a 30%, #0b0b18 100%)", color: "#fff" }}>
      {/* Everything here sits above the trail, which is drawn behind the whole page. */}
      <section data-trail-row className="relative z-[2] max-w-5xl mx-auto px-9 md:px-6 pt-16 text-center">
        <Stop icon="flag" />
        <h2 className="mt-4 text-2xl md:text-4xl font-extrabold tracking-tight">{t("land.featuresTitle")}</h2>
        <p className="text-sm md:text-base mt-2" style={{ color: "rgba(255,255,255,0.6)" }}>{t("land.featuresIntro")}</p>
      </section>

      {/* One feature at a time, a stop each: what it does, beside the screen that does it. */}
      <div className="relative z-[2] max-w-5xl mx-auto px-9 md:px-6 py-14 space-y-20 md:space-y-28">
        {SHOWN.map((f, i) => (
          <section key={f.key} data-trail-row className={`flex flex-col gap-8 md:gap-16 items-center ${i % 2 ? "md:flex-row-reverse" : "md:flex-row"}`}>
            <div className="flex-1 max-w-md text-center md:text-left">
              <Stop icon={f.icon} />
              <h3 className="mt-4 text-xl md:text-2xl font-bold">{t(`land.f.${f.key}`)}</h3>
              <p className="mt-2 text-sm md:text-base" style={{ color: "rgba(255,255,255,0.66)" }}>{t(`land.f.${f.key}.body`)}</p>
            </div>
            <PhoneShot shot={f.shot} className="w-[230px] md:w-[260px] shrink-0" />
          </section>
        ))}
      </div>

      <section data-trail-row className="relative z-[2] max-w-5xl mx-auto px-9 md:px-6 pb-8 text-center">
        <Stop icon="sparkles" />
        <h2 className="mt-4 text-lg font-bold">{t("land.moreTitle")}</h2>
        <ul className="mt-5 grid gap-3 sm:grid-cols-3 text-left">
          {MORE.map((f) => (
            <li key={f.key} className="rounded-2xl border p-5" style={SOLID}>
              <span className="inline-flex w-10 h-10 rounded-xl items-center justify-center" style={{ backgroundColor: "rgba(251,191,36,0.14)", color: "#fbbf24" }}>
                <Icon name={f.icon} size={20} />
              </span>
              <h3 className="mt-3 font-semibold">{t(`land.f.${f.key}`)}</h3>
              <p className="mt-1 text-sm" style={{ color: "rgba(255,255,255,0.62)" }}>{t(`land.f.${f.key}.body`)}</p>
            </li>
          ))}
        </ul>
      </section>

      {!native && (
        <section data-trail-row className="relative z-[2] max-w-5xl mx-auto px-9 md:px-6 py-12 text-center">
          <Stop icon="download" />
          <div className="mt-4 rounded-3xl border p-6 md:p-8 flex flex-col md:flex-row md:items-center gap-5 text-left" style={SOLID}>
            {/* The app's own icon, as it looks on the Home Screen. */}
            <img src={withBase("/apple-touch-icon.png")} alt="" width={56} height={56} className="w-14 h-14 rounded-2xl shrink-0" />
            <div className="flex-1">
              <h2 className="text-lg font-bold">{t(APP_STORE_URL ? "land.appTitle" : "land.appSoonTitle")}</h2>
              <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.68)" }}>{t(APP_STORE_URL ? "land.appBody" : "land.appSoonBody")}</p>
            </div>
            <AppStoreButton />
          </div>
        </section>
      )}

      {/* The trailhead: where the trail starts, on its way up to the sign-in card. */}
      <section className="relative z-[2] max-w-5xl mx-auto px-6 pt-8 pb-16 text-center">
        <h2 className="text-xl font-bold">{t("land.readyTitle")}</h2>
        <p className="text-sm mt-1" style={{ color: "rgba(255,255,255,0.6)" }}>{t("land.readyBody")}</p>
        <button
          type="button"
          data-trail-start
          onClick={onSignIn}
          className="mt-5 inline-flex items-center justify-center gap-2 rounded-2xl px-6 min-h-12 font-semibold"
          style={{ backgroundColor: "#fff", color: "#24243e", boxShadow: "0 0 0 6px rgba(251,191,36,0.12)" }}
        >
          <Icon name="flag" size={16} />
          {t("land.readyButton")}
        </button>
      </section>

      <footer className="relative z-[2] px-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] text-center text-xs" style={{ color: "rgba(255,255,255,0.62)" }}>
        {t("land.footer")}
      </footer>
    </div>
  );
}
