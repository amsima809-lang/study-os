/**
 * Tiny in-house i18n (no external library).
 * - Two languages: Thai ("th", default) and English ("en").
 * - The chosen language is remembered in localStorage.
 * - Use the `useT()` hook to read the current language and translate keys.
 *
 * NOTE: only UI chrome (labels/buttons) is translated here. Course names come
 * from the database (Thai only for now) — never invented in English.
 */
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type Lang = "th" | "en";

type Dict = Record<string, string>;

// One flat dictionary per language. Add keys as new phases add screens.
const STRINGS: Record<Lang, Dict> = {
  th: {
    "app.name": "StudyOS",
    "app.tagline": "ผู้ช่วยการเรียนส่วนตัว",
    "lang.th": "ไทย",
    "lang.en": "EN",
    "status.server": "สถานะเซิร์ฟเวอร์",
    "status.connected": "เชื่อมต่อแล้ว",
    "status.connecting": "กำลังเชื่อมต่อ…",
    "status.error": "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้",
    "stats.title": "ข้อมูลหลักสูตร",
    "stats.courses": "จำนวนวิชา",
    "stats.credits": "หน่วยกิตตามแผน",
    "stats.terms": "จำนวนเทอม",
    "phase.ready": "เฟส {n} พร้อมแล้ว",
  },
  en: {
    "app.name": "StudyOS",
    "app.tagline": "Your personal study assistant",
    "lang.th": "ไทย",
    "lang.en": "EN",
    "status.server": "Server status",
    "status.connected": "Connected",
    "status.connecting": "Connecting…",
    "status.error": "Cannot reach the server",
    "stats.title": "Curriculum data",
    "stats.courses": "Courses",
    "stats.credits": "Planned credits",
    "stats.terms": "Terms",
    "phase.ready": "Phase {n} ready",
  },
};

type Translate = (key: string, vars?: Record<string, string | number>) => string;

type I18nValue = {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: Translate;
};

const I18nContext = createContext<I18nValue | null>(null);
const STORAGE_KEY = "studyos.lang";

function readStoredLang(): Lang {
  try {
    const v = localStorage.getItem(STORAGE_KEY);
    if (v === "th" || v === "en") return v;
  } catch {
    // localStorage may be blocked (private mode) — fall back to default.
  }
  return "th";
}

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(readStoredLang);

  useEffect(() => {
    document.documentElement.lang = lang;
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // ignore write failures
    }
  }, [lang]);

  const value = useMemo<I18nValue>(() => {
    const t: Translate = (key, vars) => {
      let s = STRINGS[lang][key] ?? STRINGS.th[key] ?? key;
      if (vars) {
        for (const [k, val] of Object.entries(vars)) {
          s = s.replace(`{${k}}`, String(val));
        }
      }
      return s;
    };
    return { lang, setLang: setLangState, t };
  }, [lang]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useT(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useT must be used inside <LanguageProvider>");
  return ctx;
}

/** The TH / EN toggle button. */
export function LanguageToggle() {
  const { lang, setLang, t } = useT();
  const base =
    "px-3 py-1 text-sm font-medium rounded-full transition-colors";
  const active = "bg-indigo-600 text-white";
  const idle = "bg-white text-slate-500 border border-slate-200";
  return (
    <div className="inline-flex gap-1" role="group" aria-label="language">
      <button className={`${base} ${lang === "th" ? active : idle}`} onClick={() => setLang("th")}>
        {t("lang.th")}
      </button>
      <button className={`${base} ${lang === "en" ? active : idle}`} onClick={() => setLang("en")}>
        {t("lang.en")}
      </button>
    </div>
  );
}
