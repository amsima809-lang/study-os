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
    "nav.notes": "โน้ต",
    "nav.quiz": "ทดสอบ",
    // quiz
    "quiz.title": "แบบทดสอบ",
    "quiz.pickSource": "เลือกแหล่งออกข้อสอบ",
    "quiz.byNote": "จากโน้ต",
    "quiz.byCourse": "จากทั้งวิชา",
    "quiz.selectNote": "— เลือกโน้ต —",
    "quiz.selectCourse": "— เลือกวิชา —",
    "quiz.start": "สร้างข้อสอบ 10 ข้อ",
    "quiz.needNotes": "ยังไม่มีโน้ตให้ออกข้อสอบ ไปเพิ่มโน้ตก่อนนะ",
    "quiz.generating": "AI กำลังออกข้อสอบ…",
    "quiz.grading": "AI กำลังตรวจ…",
    "quiz.question": "ข้อ {n}/{total}",
    "quiz.yourAnswer": "คำตอบของคุณ",
    "quiz.answerPlaceholder": "พิมพ์คำตอบก่อนดูเฉลย…",
    "quiz.submit": "ส่งคำตอบ",
    "quiz.next": "ข้อถัดไป",
    "quiz.finish": "ดูสรุป",
    "quiz.modelAnswer": "เฉลย",
    "quiz.flashcardMade": "⭐ เพิ่มเป็นแฟลชการ์ดให้ทวนแล้ว",
    "quiz.score": "ได้ {n} คะแนน",
    "quiz.doneTitle": "จบแบบทดสอบ!",
    "quiz.totalScore": "คะแนนรวม {score}/{max}",
    "quiz.cardsMade": "สร้างแฟลชการ์ด {n} ใบ",
    "quiz.again": "ทำชุดใหม่",
    "quiz.disclaimer": "AI อาจผิดได้ — ยึดตำรารามฯ เป็นหลัก",
    // notes
    "notes.title": "โน้ตของฉัน",
    "notes.add": "+ เพิ่มโน้ต",
    "notes.empty": "ยังไม่มีโน้ต ลองเพิ่มโน้ตแรกดูสิ",
    "notes.newTitle": "เพิ่มโน้ตใหม่",
    "notes.course": "วิชา",
    "notes.selectCourse": "— เลือกวิชา —",
    "notes.noteTitle": "หัวข้อโน้ต (ไม่บังคับ)",
    "notes.text": "พิมพ์เนื้อหาโน้ต",
    "notes.textPlaceholder": "พิมพ์หรือวางเนื้อหาที่จดไว้…",
    "notes.photo": "หรือถ่ายรูป/แนบรูปโน้ต",
    "notes.submit": "ให้ AI ช่วยสรุป",
    "notes.processing": "AI กำลังอ่านและสรุป…",
    "notes.back": "← กลับ",
    "notes.cancel": "ยกเลิก",
    "notes.needInput": "กรุณาพิมพ์ข้อความหรือแนบรูปอย่างน้อย 1 อย่าง",
    "notes.aiNotConfigured": "ยังไม่ได้ตั้งค่า AI — ใส่ ANTHROPIC_API_KEY ในไฟล์ .env ก่อนใช้งาน",
    "notes.result.summary": "สรุปแบบง่าย",
    "notes.result.terms": "คำศัพท์สำคัญ",
    "notes.result.mindmap": "แผนผังความคิด",
    "notes.result.topics": "หัวข้อ",
    "notes.disclaimer": "AI อาจผิดได้ — ยึดตำรารามฯ เป็นหลัก",
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
    "nav.notes": "Notes",
    "nav.quiz": "Quiz",
    "quiz.title": "Quiz me",
    "quiz.pickSource": "Choose what to quiz on",
    "quiz.byNote": "From a note",
    "quiz.byCourse": "From a course",
    "quiz.selectNote": "— select a note —",
    "quiz.selectCourse": "— select a course —",
    "quiz.start": "Generate 10 questions",
    "quiz.needNotes": "No notes to quiz on yet — add some notes first",
    "quiz.generating": "AI is writing questions…",
    "quiz.grading": "AI is grading…",
    "quiz.question": "Question {n}/{total}",
    "quiz.yourAnswer": "Your answer",
    "quiz.answerPlaceholder": "Type your answer before seeing the key…",
    "quiz.submit": "Submit answer",
    "quiz.next": "Next question",
    "quiz.finish": "See summary",
    "quiz.modelAnswer": "Model answer",
    "quiz.flashcardMade": "⭐ Added as a flashcard to review",
    "quiz.score": "Scored {n}",
    "quiz.doneTitle": "Quiz complete!",
    "quiz.totalScore": "Total score {score}/{max}",
    "quiz.cardsMade": "{n} flashcards created",
    "quiz.again": "New quiz",
    "quiz.disclaimer": "AI can be wrong — the RU textbook is the source of truth",
    "notes.title": "My notes",
    "notes.add": "+ Add note",
    "notes.empty": "No notes yet — try adding your first one",
    "notes.newTitle": "Add a new note",
    "notes.course": "Course",
    "notes.selectCourse": "— select a course —",
    "notes.noteTitle": "Note title (optional)",
    "notes.text": "Type the note content",
    "notes.textPlaceholder": "Type or paste what you wrote down…",
    "notes.photo": "Or take/attach a photo of the note",
    "notes.submit": "Ask AI to summarize",
    "notes.processing": "AI is reading and summarizing…",
    "notes.back": "← Back",
    "notes.cancel": "Cancel",
    "notes.needInput": "Please type text or attach at least one photo",
    "notes.aiNotConfigured": "AI is not set up — add ANTHROPIC_API_KEY to your .env first",
    "notes.result.summary": "Simple summary",
    "notes.result.terms": "Key terms",
    "notes.result.mindmap": "Mind map",
    "notes.result.topics": "Topics",
    "notes.disclaimer": "AI can be wrong — the RU textbook is the source of truth",
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
