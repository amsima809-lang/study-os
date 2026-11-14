/**
 * Colour themes. A theme is separate from light/dark mode:
 *   "default"        the built-in purple
 *   "palette:<id>"   one of the palettes below
 *   "school:<id>"    a university's colours (client/src/data/universities.ts)
 *   "hc:light|dark"  high contrast (this one also fixes the mode)
 *
 * A theme is applied by setting CSS variables on <html>, over the tokens in
 * index.css. Palette and school themes only give two base colours; the actual
 * accent shades are computed here so text stays readable (WCAG AA, 4.5:1)
 * whatever the base colour is — buttons in this app always put white text on
 * the accent, and several school colours (yellow, pale blue) are far too light
 * for that as they are.
 */
import { UNIVERSITIES } from "./data/universities.ts";

export type Mode = "light" | "dark";
export type Colour = string;

export const PALETTES = [
  { id: "ocean", primary: "#2563eb", secondary: "#06b6d4" },
  { id: "teal", primary: "#0d9488", secondary: "#5eead4" },
  { id: "forest", primary: "#15803d", secondary: "#a3e635" },
  { id: "sunset", primary: "#ea580c", secondary: "#fbbf24" },
  { id: "rose", primary: "#e11d48", secondary: "#fb7185" },
  { id: "berry", primary: "#a21caf", secondary: "#f0abfc" },
  { id: "slate", primary: "#475569", secondary: "#94a3b8" },
] as const;

/** Swatch shown for the default theme in the selector. */
export const DEFAULT_SWATCH = { primary: "#6d5cdf", secondary: "#a096f5" };

// Card and page backgrounds of the two modes (same values as index.css).
const SURFACE = { light: "#ffffff", dark: "#1a1929" };
const PAGE = { light: "#f8f7fc", dark: "#0f0e17" };

type Rgb = [number, number, number];
const toRgb = (hex: string): Rgb => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)) as Rgb;
const toHex = (c: Rgb) => "#" + c.map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");
const mix = (a: Rgb, b: Rgb, t: number): Rgb => [0, 1, 2].map((i) => a[i] * (1 - t) + b[i] * t) as Rgb;
const BLACK: Rgb = [0, 0, 0];
const WHITE: Rgb = [255, 255, 255];

function luminance(c: Rgb): number {
  const [r, g, b] = c.map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG contrast ratio between two colours (1 to 21). */
export function contrast(a: string | Rgb, b: string | Rgb): number {
  const la = luminance(typeof a === "string" ? toRgb(a) : a);
  const lb = luminance(typeof b === "string" ? toRgb(b) : b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Move `c` towards `to` in small steps until `ok` passes (keeps the hue). */
function shift(c: Rgb, to: Rgb, ok: (c: Rgb) => boolean): Rgb {
  let out = c;
  for (let i = 0; i < 60 && !ok(out); i++) out = mix(out, to, 0.04);
  return out;
}

/** The accent variables for a base colour in one mode. */
export function accentVars(primary: string, mode: Mode): Record<string, string> {
  const base = toRgb(primary);
  const surface = toRgb(SURFACE[mode]);

  // Button background: white text on it must be readable...
  let accent = shift(base, BLACK, (c) => contrast(c, WHITE) >= 4.5);
  // ...and in dark mode the button itself must stand out from the dark surface.
  if (mode === "dark") accent = shift(accent, WHITE, (c) => contrast(c, surface) >= 3);

  // Tinted background (selected rows, chips).
  const tint = mode === "light" ? mix(accent, WHITE, 0.88) : mix(accent, surface, 0.75);

  // Coloured text and icons: readable on cards, on the page and on the tint.
  const backgrounds = [surface, toRgb(PAGE[mode]), tint];
  const text = shift(mode === "light" ? accent : base, mode === "light" ? BLACK : WHITE, (c) =>
    backgrounds.every((bg) => contrast(c, bg) >= 4.6), // a little over 4.5 to survive rounding to hex
  );
  return {
    "--accent": toHex(accent),
    "--accent-hover": toHex(mix(accent, mode === "light" ? BLACK : WHITE, 0.12)),
    "--accent-light": toHex(tint),
    "--bg-accent": toHex(tint),
    "--accent-text": toHex(text),
  };
}

/**
 * The second colour, for graphics only (icons, dots, bars, the active-tab
 * marker): shifted until it stands 3:1 off the backgrounds, which is the WCAG
 * minimum for non-text marks. NOT safe for text. Returns null when the second
 * colour is white or grey (several schools pair a colour with white), so the
 * app falls back to the first colour instead of showing grey.
 */
export function secondAccent(secondary: string, mode: Mode): string | null {
  const c = toRgb(secondary);
  if (Math.max(...c) - Math.min(...c) < 40) return null;
  const backgrounds = [toRgb(SURFACE[mode]), toRgb(PAGE[mode])];
  return toHex(shift(c, mode === "light" ? BLACK : WHITE, (x) => backgrounds.every((bg) => contrast(x, bg) >= 3.05)));
}

// High contrast: text on its background is 7:1 or better (WCAG AAA). The one
// exception is white text on the dark theme's accent buttons, at 6.6:1: a
// darker blue would pass 7:1 but disappear against the black page.
const HIGH_CONTRAST: Record<Mode, Record<string, string>> = {
  light: {
    "--bg-base": "#ffffff", "--bg-surface": "#ffffff", "--bg-surface-hover": "#e6e6e6", "--bg-accent": "#e0e7ff",
    "--border": "#000000", "--border-light": "#000000",
    "--text-primary": "#000000", "--text-secondary": "#1a1a1a", "--text-tertiary": "#333333", "--text-inverse": "#ffffff",
    "--accent": "#0033aa", "--accent-hover": "#002277", "--accent-light": "#e0e7ff", "--accent-text": "#0033aa",
    "--success": "#005a2b", "--success-bg": "#e6f4ea", "--warning": "#6b4000", "--warning-bg": "#fff4d6",
    "--danger": "#8f0000", "--danger-bg": "#fde8e8",
  },
  dark: {
    "--bg-base": "#000000", "--bg-surface": "#000000", "--bg-surface-hover": "#262626", "--bg-accent": "#001a66",
    "--border": "#ffffff", "--border-light": "#ffffff",
    "--text-primary": "#ffffff", "--text-secondary": "#f0f0f0", "--text-tertiary": "#d6d6d6", "--text-inverse": "#000000",
    "--accent": "#1f4fd8", "--accent-hover": "#3a66e6", "--accent-light": "#001a66", "--accent-text": "#ffe94d",
    "--success": "#5dfc9b", "--success-bg": "#002b12", "--warning": "#ffd84d", "--warning-bg": "#2b2000",
    "--danger": "#ff8a8a", "--danger-bg": "#330000",
  },
};

const MANAGED = [...new Set([...Object.keys(HIGH_CONTRAST.light), "--brand-bar", "--accent-2"])];

/** The two base colours of a palette or school theme (null for default / high contrast). */
export function baseColours(colour: Colour): { primary: string; secondary: string } | null {
  const [kind, id] = colour.split(":");
  if (kind === "palette") return PALETTES.find((p) => p.id === id) ?? null;
  if (kind === "school") {
    const uni = UNIVERSITIES.find((u) => u.id === id);
    if (!uni) return null;
    return { primary: uni.swatches[0].hex, secondary: uni.swatches[1]?.hex ?? uni.swatches[0].hex };
  }
  return null;
}

/** High-contrast themes fix the mode; other themes follow the student's choice. */
export function forcedMode(colour: Colour): Mode | null {
  return colour === "hc:light" ? "light" : colour === "hc:dark" ? "dark" : null;
}

/** Write (or clear) the theme's CSS variables on <html>. */
export function applyColour(colour: Colour, mode: Mode): void {
  const root = document.documentElement;
  for (const name of MANAGED) root.style.removeProperty(name);

  const forced = forcedMode(colour);
  const base = baseColours(colour);
  const vars: Record<string, string> = forced
    ? HIGH_CONTRAST[forced]
    : base
      ? { ...accentVars(base.primary, mode), "--brand-bar": `linear-gradient(90deg, ${base.primary}, ${base.secondary})` }
      : {};
  // Themes without a usable second colour leave --accent-2 unset; every use
  // site falls back to the first colour.
  const second = base && !forced ? secondAccent(base.secondary, mode) : null;
  if (second) vars["--accent-2"] = second;
  for (const [name, value] of Object.entries(vars)) root.style.setProperty(name, value);
}

/* ── Fonts ─────────────────────────────────────────────────────────────────
 * All choices are typefaces designed for Thai (they also cover Latin).
 * The default (IBM Plex Sans Thai Looped, whose Latin letters are IBM Plex
 * Sans) ships with the page in index.html; the others load from Google Fonts
 * only when chosen. If a font cannot load (offline), the stack falls back to
 * the device's own Thai fonts.
 */
export const FONT_SAMPLE = "สวัสดี Aa";

// `loops`: Thai letters drawn with their traditional loops (หัว). Looped text
// is easier to read at length, because the loops tell similar letters apart
// (ค ด ต, พ ผ); that is why the default is a looped face.
export const FONTS = [
  { id: "plex-looped", kind: "sans", loops: true, family: "IBM Plex Sans Thai Looped" },
  { id: "sarabun", kind: "sans", loops: true, family: "Sarabun" },
  { id: "noto-looped", kind: "sans", loops: true, family: "Noto Sans Thai Looped" },
  { id: "plex", kind: "sans", loops: false, family: "IBM Plex Sans Thai" },
  { id: "noto-sans", kind: "sans", loops: false, family: "Noto Sans Thai" },
  { id: "noto-serif", kind: "serif", loops: true, family: "Noto Serif Thai" },
  { id: "trirong", kind: "serif", loops: true, family: "Trirong" },
  { id: "taviraj", kind: "serif", loops: true, family: "Taviraj" },
] as const;

export type FontId = (typeof FONTS)[number]["id"];
export const DEFAULT_FONT: FontId = "plex-looped";

const FALLBACK = {
  sans: 'system-ui, -apple-system, "Segoe UI", "Noto Sans Thai", "Thonburi", sans-serif',
  serif: '"Noto Serif Thai", "Thonburi", Georgia, "Times New Roman", serif',
};

export function fontStack(id: string): string {
  const font = FONTS.find((f) => f.id === id) ?? FONTS[0];
  return `"${font.family}", ${FALLBACK[font.kind]}`;
}

function loadStylesheet(id: string, href: string): void {
  if (document.getElementById(id)) return;
  const link = document.createElement("link");
  link.id = id;
  link.rel = "stylesheet";
  link.href = href;
  document.head.appendChild(link);
}

const GOOGLE = "https://fonts.googleapis.com/css2?display=swap";
const param = (family: string) => `&family=${family.replace(/ /g, "+")}`;

/** Use a font for the whole app (loads it first if it is not the default). */
export function applyFont(id: string): void {
  const font = FONTS.find((f) => f.id === id) ?? FONTS[0];
  if (font.id !== DEFAULT_FONT) {
    loadStylesheet(`font-${font.id}`, `${GOOGLE}${param(font.family)}:wght@300;400;500;600;700`);
  }
  if (font.id === DEFAULT_FONT) document.documentElement.style.removeProperty("--font-sans");
  else document.documentElement.style.setProperty("--font-sans", fontStack(font.id));
}

/**
 * Load just the few letters the font picker shows, for every font, so each
 * option can be drawn in its own typeface without downloading whole fonts.
 */
export function loadFontPreviews(): void {
  const letters = [...new Set(FONT_SAMPLE + FONTS.map((f) => f.family).join(""))].join("");
  const families = FONTS.filter((f) => f.id !== DEFAULT_FONT).map((f) => param(f.family) + ":wght@500").join("");
  loadStylesheet("font-previews", `${GOOGLE}${families}&text=${encodeURIComponent(letters)}`);
}
