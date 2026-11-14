/**
 * The product's name, in ONE place.
 *
 * "StudyOS" is a placeholder (see docs/brand/). To rename the app, run
 *   node scripts/rename-app.mjs "<Name>" "<ชื่อภาษาไทย>"
 * which changes this file and the two plain-JS files that cannot import it
 * (client/public/push-sw.js and client/public/collector/ru-vod.js).
 *
 * Everything on screen reads the name from here: every translated string uses
 * the placeholder {app}, which `t()` fills in (client/src/i18n.tsx), and the
 * page title and the installed-app name come from here too (vite.config.ts).
 */

/** The name in Latin letters: used in English, in the installed-app name and in the page title. */
export const APP_NAME = "StudyOS";

/** The name as shown when the app is in Thai. The same as APP_NAME unless the brand has a Thai-script form. */
export const APP_NAME_TH = "StudyOS";

export const appName = (lang: "th" | "en"): string => (lang === "th" ? APP_NAME_TH : APP_NAME);
