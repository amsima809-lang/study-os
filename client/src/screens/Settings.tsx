import { useEffect, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { useT } from "../i18n.tsx";
import Icon from "../components/Icon.tsx";
import { useTheme } from "../components/ui.tsx";
import UniversityPicker from "../components/UniversityPicker.tsx";
import CalendarLinks from "../components/CalendarLinks.tsx";
import { UNIVERSITIES } from "../data/universities.ts";
import { formatTime, getClock, setClock, subscribeClock, type Clock } from "../format.ts";
import { PALETTES, DEFAULT_SWATCH, forcedMode, FONTS, FONT_SAMPLE, fontStack, loadFontPreviews } from "../theme.ts";

const THEMES = [
  { id: "light", icon: "sun" },
  { id: "dark", icon: "moon" },
  { id: "system", icon: "monitor" },
] as const;

/**
 * Settings: how the app looks and reads on this device (light/dark mode, colour palettes, school
 * colours, high contrast, font, time format: see theme.ts and format.ts). Signing out is in the
 * account menu (her picture, at the right of the header: components/Account.tsx).
 * Opened from the gear in the header, the rail or the sidebar.
 */
export default function Settings() {
  const { t, lang } = useT();
  const clock = useSyncExternalStore(subscribeClock, getClock);
  const { theme, setTheme, colour, setColour, font, setFont } = useTheme();
  useEffect(loadFontPreviews, []);
  const [pickingSchool, setPickingSchool] = useState(false);
  const highContrast = forcedMode(colour) !== null;
  const school = colour.startsWith("school:") ? UNIVERSITIES.find((u) => u.id === colour.slice(7)) ?? null : null;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold" style={{ color: "var(--text-primary)" }}>
        {t("nav.settings")}
      </h1>


      {/* Theme: mode, colour palette, school colours, high contrast */}
      <section
        className="rounded-2xl border px-4 py-4 space-y-4"
        style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border-light)", boxShadow: "var(--shadow-sm)" }}
      >
        <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>
          {t("more.theme")}
        </h2>

        <div className="space-y-2">
          <h3 className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
            {t("more.theme_mode")}
          </h3>
          <div
            role="radiogroup"
            aria-label={t("more.theme_mode")}
            className="grid grid-cols-3 gap-1 rounded-xl p-1"
            style={{ backgroundColor: "var(--bg-base)", opacity: highContrast ? 0.45 : 1 }}
          >
            {THEMES.map((th) => (
              <button
                key={th.id}
                role="radio"
                aria-checked={theme === th.id}
                disabled={highContrast}
                onClick={() => setTheme(th.id)}
                className="flex items-center justify-center gap-1.5 rounded-lg py-2.5 text-sm font-medium transition-colors min-h-11"
                style={{
                  backgroundColor: theme === th.id ? "var(--accent)" : "transparent",
                  color: theme === th.id ? "#fff" : "var(--text-secondary)",
                }}
              >
                <Icon name={th.icon} size={16} />
                {t(`more.theme_${th.id}`)}
              </button>
            ))}
          </div>
          {highContrast && (
            <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>{t("more.theme_hc_note")}</p>
          )}
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
            {t("more.theme_colour")}
          </h3>
          <div role="radiogroup" aria-label={t("more.theme_colour")} className="grid grid-cols-4 gap-2">
            {[{ id: "default", ...DEFAULT_SWATCH }, ...PALETTES].map((p) => {
              const value = p.id === "default" ? "default" : `palette:${p.id}`;
              const on = colour === value;
              return (
                <button
                  key={p.id}
                  role="radio"
                  aria-checked={on}
                  onClick={() => setColour(value)}
                  className="flex flex-col items-center gap-1.5 rounded-xl border py-2.5 text-xs font-medium transition-colors min-h-11"
                  style={{
                    borderColor: on ? "var(--accent-text)" : "var(--border-light)",
                    borderWidth: on ? 2 : 1,
                    backgroundColor: on ? "var(--accent-light)" : "transparent",
                    color: "var(--text-primary)",
                  }}
                >
                  <span
                    className="w-8 h-8 rounded-full"
                    style={{ background: `linear-gradient(135deg, ${p.primary} 50%, ${p.secondary} 50%)` }}
                  />
                  {t(`theme.${p.id}`)}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
            {t("more.theme_school")}
          </h3>
          <button
            onClick={() => setPickingSchool(true)}
            className="w-full flex items-center gap-3 rounded-xl border px-4 py-3 text-left text-sm transition-all active:scale-[0.99] min-h-11"
            style={{
              borderColor: school ? "var(--accent-text)" : "var(--border-light)",
              borderWidth: school ? 2 : 1,
              backgroundColor: school ? "var(--accent-light)" : "transparent",
              color: "var(--text-primary)",
            }}
          >
            <Icon name="graduationCap" size={20} style={{ color: "var(--accent-text)" }} />
            <span className="flex-1 min-w-0 truncate font-medium">
              {school ? (lang === "th" ? school.nameTh : school.nameEn) : t("more.theme_school_pick")}
            </span>
            <span style={{ color: "var(--text-tertiary)" }}>›</span>
          </button>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
            {t("more.theme_hc")}
          </h3>
          <div role="radiogroup" aria-label={t("more.theme_hc")} className="grid grid-cols-2 gap-2">
            {(["light", "dark"] as const).map((m) => {
              const on = colour === `hc:${m}`;
              return (
                <button
                  key={m}
                  role="radio"
                  aria-checked={on}
                  aria-label={`${t("more.theme_hc")}: ${t(`more.theme_hc_${m}`)}`}
                  onClick={() => setColour(on ? "default" : `hc:${m}`)}
                  className="flex items-center justify-center gap-2 rounded-xl py-3 text-sm font-semibold min-h-11"
                  style={{
                    // Each button previews its own theme.
                    backgroundColor: m === "light" ? "#ffffff" : "#000000",
                    color: m === "light" ? "#000000" : "#ffffff",
                    border: `2px solid ${m === "light" ? "#000000" : "#ffffff"}`,
                    outline: on ? "3px solid var(--accent-text)" : "none",
                    outlineOffset: 2,
                  }}
                >
                  <Icon name={m === "light" ? "sun" : "moon"} size={16} />
                  {t(`more.theme_hc_${m}`)}
                </button>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <h3 className="text-sm font-medium" style={{ color: "var(--text-secondary)" }}>
            {t("more.theme_font")}
          </h3>
          {(["sans", "serif"] as const).map((kind) => (
            <div key={kind} role="radiogroup" aria-label={t(`more.font_${kind}`)} className="space-y-1.5">
              <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>{t(`more.font_${kind}`)}</p>
              <div className="grid grid-cols-1 gap-1.5">
                {FONTS.filter((f) => f.kind === kind).map((f) => {
                  const on = font === f.id;
                  return (
                    <button
                      key={f.id}
                      role="radio"
                      aria-checked={on}
                      onClick={() => setFont(f.id)}
                      className="flex items-center justify-between gap-3 rounded-xl border px-4 py-2.5 text-left transition-colors min-h-11"
                      style={{
                        // Each option is drawn in its own typeface.
                        fontFamily: fontStack(f.id),
                        fontWeight: 500,
                        borderColor: on ? "var(--accent-text)" : "var(--border-light)",
                        borderWidth: on ? 2 : 1,
                        backgroundColor: on ? "var(--accent-light)" : "transparent",
                        color: "var(--text-primary)",
                      }}
                    >
                      <span className="min-w-0">
                        <span className="block leading-snug">{f.family}</span>
                        {kind === "sans" && (
                          <span className="block text-xs" style={{ color: "var(--text-tertiary)" }}>
                            {t(f.loops ? "more.font_looped" : "more.font_loopless")}
                          </span>
                        )}
                      </span>
                      <span className="shrink-0" style={{ color: "var(--text-secondary)" }}>{FONT_SAMPLE}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Her term in her own calendar apps, and their busy times in this one */}
      <CalendarLinks />

      {/* Time format: 24-hour or AM/PM, for every time the app shows */}
      <section
        className="rounded-2xl border px-4 py-4 space-y-2"
        style={{ backgroundColor: "var(--bg-surface)", borderColor: "var(--border-light)", boxShadow: "var(--shadow-sm)" }}
      >
        <h2 className="font-semibold" style={{ color: "var(--text-primary)" }}>
          {t("more.clock")}
        </h2>
        <div
          role="radiogroup"
          aria-label={t("more.clock")}
          className="grid grid-cols-2 gap-1 rounded-xl p-1"
          style={{ backgroundColor: "var(--bg-base)" }}
        >
          {(["24", "12"] as Clock[]).map((c) => (
            <button
              key={c}
              role="radio"
              aria-checked={clock === c}
              onClick={() => setClock(c)}
              className="flex flex-col items-center justify-center rounded-lg py-1.5 text-sm font-medium transition-colors min-h-11"
              style={{
                backgroundColor: clock === c ? "var(--accent)" : "transparent",
                color: clock === c ? "#fff" : "var(--text-secondary)",
              }}
            >
              <span>{t(c === "24" ? "more.clock_24" : "more.clock_12")}</span>
              <span className="text-xs opacity-80">{formatTime("13:30", c)}</span>
            </button>
          ))}
        </div>
        <p className="text-xs" style={{ color: "var(--text-tertiary)" }}>{t("more.clock_hint")}</p>
      </section>

      {pickingSchool && createPortal(
        <UniversityPicker
          current={school}
          onPick={(id) => setColour(id ? `school:${id}` : "default")}
          onClose={() => setPickingSchool(false)}
        />,
        document.body,
      )}

    </div>
  );
}
