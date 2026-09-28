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
    "status.connecting": "กำลังเชื่อมต่อ…",
    "status.error": "เชื่อมต่อเซิร์ฟเวอร์ไม่ได้",
    // bottom navigation
    "nav.today": "วันนี้",
    "nav.week": "สัปดาห์",
    "nav.exams": "สอบ",
    // today screen
    "today.title": "วันนี้",
    "today.term": "เทอม {term}",
    "today.classes": "คาบเรียนวันนี้",
    "today.noClasses": "วันนี้ไม่มีคาบเรียน 🎉",
    "today.nextExam": "สอบครั้งถัดไป",
    "today.daysLeft": "อีก {n} วัน",
    "today.examToday": "สอบวันนี้!",
    "today.noExam": "ยังไม่มีตารางสอบ",
    "today.review": "การ์ดที่ต้องทวนวันนี้",
    "today.cards": "{n} ใบ",
    "today.targets": "เป้าอ่านหนังสือต่อวิชา",
    "today.perDay": "{h} ชม./วัน",
    "today.perWeek": "{h} ชม./สัปดาห์",
    "today.weekTarget": "เป้ารวม {h} ชม./สัปดาห์",
    // week screen
    "week.title": "ตารางเรียนทั้งสัปดาห์",
    "week.empty": "ยังไม่มีตารางเรียน",
    // exams screen
    "exams.title": "ตารางสอบ",
    "exams.empty": "ยังไม่มีตารางสอบ",
    "exams.slot": "คาบ {slot}",
    "exams.noClash": "ไม่มีวันสอบชนกัน ✅",
    "exams.clash": "⚠️ วันสอบชนกัน",
    "exams.clashDetail": "{date}: {courses} สอบวันและคาบเดียวกัน",
    "diff.1": "ง่าย",
    "diff.2": "ปานกลาง",
    "diff.3": "ยาก",
  },
  en: {
    "app.name": "StudyOS",
    "app.tagline": "Your personal study assistant",
    "lang.th": "ไทย",
    "lang.en": "EN",
    "status.connecting": "Connecting…",
    "status.error": "Cannot reach the server",
    "nav.today": "Today",
    "nav.week": "Week",
    "nav.exams": "Exams",
    "today.title": "Today",
    "today.term": "Term {term}",
    "today.classes": "Today's classes",
    "today.noClasses": "No classes today 🎉",
    "today.nextExam": "Next exam",
    "today.daysLeft": "in {n} days",
    "today.examToday": "Exam today!",
    "today.noExam": "No exams scheduled",
    "today.review": "Cards to review today",
    "today.cards": "{n} cards",
    "today.targets": "Study target per course",
    "today.perDay": "{h} h/day",
    "today.perWeek": "{h} h/week",
    "today.weekTarget": "Total target {h} h/week",
    "week.title": "Weekly class schedule",
    "week.empty": "No classes scheduled",
    "exams.title": "Exam schedule",
    "exams.empty": "No exams scheduled",
    "exams.slot": "Slot {slot}",
    "exams.noClash": "No exam clashes ✅",
    "exams.clash": "⚠️ Exam clash",
    "exams.clashDetail": "{date}: {courses} share the same date and slot",
    "diff.1": "Easy",
    "diff.2": "Medium",
    "diff.3": "Hard",
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
