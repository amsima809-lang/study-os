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
    "auth.password": "รหัสผ่าน",
    "auth.login": "เข้าสู่ระบบ",
    "auth.wrong": "รหัสผ่านไม่ถูกต้อง",
    "auth.logout": "ออกจากระบบ",
    // bottom navigation
    "nav.today": "วันนี้",
    "nav.week": "สัปดาห์",
    "nav.exams": "สอบ",
    "nav.schedule": "ตาราง",
    "nav.stats": "สถิติ",
    "nav.notes": "โน้ต",
    "nav.more": "เพิ่มเติม",
    // more hub
    "more.title": "เพิ่มเติม",
    "more.schedule": "ตารางเรียน/สอบ",
    "more.stats": "สถิติและติดตาม",
    "more.planner": "แผนการเรียน (จบ 138 หน่วยกิต)",
    "more.mock": "ข้อสอบจำลอง (ก่อนสอบจริง)",
    "more.back": "← เพิ่มเติม",
    // mock exam
    "mock.title": "ข้อสอบจำลอง",
    "mock.intro": "เปิดให้ทำ 21 วันก่อนสอบ · เน้นจุดอ่อนและการ์ดที่ยังไม่แม่น",
    "mock.empty": "ยังไม่มีวิชาที่มีตารางสอบในเทอมนี้",
    "mock.locked": "อีก {n} วันจะเปิด",
    "mock.noBank": "ทำควิซวิชานี้ก่อนเพื่อสะสมคลังข้อสอบ",
    "mock.start": "เริ่มสอบจำลอง",
    "mock.generating": "กำลังสร้างข้อสอบ…",
    "mock.timeLeft": "เหลือเวลา",
    "mock.question": "ข้อ {n}/{total}",
    "mock.answerPlaceholder": "พิมพ์คำตอบ…",
    "mock.next": "ข้อถัดไป",
    "mock.submit": "ส่งข้อสอบ",
    "mock.submitting": "กำลังตรวจ…",
    "mock.resultTitle": "ผลสอบจำลอง",
    "mock.resultScore": "ได้ {score}/{max} คะแนน",
    "mock.weak": "จุดอ่อนที่ควรทบทวน",
    "mock.madeCards": "ข้อที่พลาดถูกเพิ่มเป็นแฟลชการ์ดแล้ว ⭐",
    "mock.done": "เสร็จสิ้น",
    // planner
    "plan.title": "แผนการเรียน",
    "plan.creditsPassed": "ผ่านแล้ว {passed} / {total} หน่วยกิต",
    "plan.categories": "หน่วยกิตแยกหมวด",
    "plan.internship": "ความพร้อมฝึกงาน (PSY4499)",
    "plan.eligible": "พร้อมยื่นฝึกงาน ✅",
    "plan.notEligible": "ยังไม่พร้อมฝึกงาน",
    "plan.blocked": "⚠️ วิชาที่ถูกบล็อก (เพราะมีวิชาบังคับก่อนสอบตก)",
    "plan.blockedDueTo": "{course} — ติดเพราะ {due}",
    "plan.retake": "{course} สอบตก — แนะนำลงซ้ำเทอม {term}",
    "plan.termCredits": "{credits}/{max} หน่วยกิต",
    "plan.running": "สะสม {n}",
    "plan.placeholder": "ยังไม่เลือก",
    "plan.status.PLANNED": "ยังไม่เรียน",
    "plan.status.PASSED": "ผ่าน",
    "plan.status.FAILED": "ตก",
    // category names
    "cat.GE": "ศึกษาทั่วไป (GE)",
    "cat.FOUNDATION": "แกนจิตวิทยา",
    "cat.MAJOR_REQ": "เอกบังคับ",
    "cat.MAJOR_ELEC": "เอกเลือก",
    "cat.MINOR": "วิชาโท",
    "cat.FREE": "เลือกเสรี",
    // internship rule labels
    "rule.credits": "หน่วยกิตสะสม ≥ 108",
    "rule.foundation": "แกนจิตวิทยา ≥ 39 (รวม 6 วิชาหลัก)",
    "rule.major": "เอกบังคับครบ 8 วิชา",
    "rule.elective": "เอกเลือก ≥ 3 วิชา",
    "rule.minor": "วิชาโท ≥ 9 หน่วยกิต",
    "rule.free": "เลือกเสรี ≥ 6 หน่วยกิต",
    // schedule tab (week + exams)
    "sched.week": "สัปดาห์",
    "sched.exams": "สอบ",
    // stats / tracker
    "stats.pageTitle": "สถิติและติดตาม",
    "pomo.title": "จับเวลาอ่านหนังสือ",
    "pomo.focus": "โฟกัส",
    "pomo.break": "พัก",
    "pomo.selectCourse": "— เลือกวิชาที่อ่าน —",
    "pomo.start": "เริ่ม",
    "pomo.pause": "หยุดชั่วคราว",
    "pomo.reset": "รีเซ็ต",
    "pomo.finish": "จบและบันทึก",
    "pomo.logged": "บันทึก {m} นาทีแล้ว ✅",
    "an.title": "วิเคราะห์รายวิชา (เทอมนี้)",
    "an.hours": "ชั่วโมงสัปดาห์นี้",
    "an.hoursValue": "{actual} / {target} ชม.",
    "an.quizAvg": "คะแนนควิซเฉลี่ย",
    "an.noQuiz": "ยังไม่มีข้อมูลควิซ",
    "an.weak": "จุดอ่อน",
    "an.noExam": "ยังไม่มีสอบ",
    "an.daysToExam": "สอบอีก {n} วัน",
    "an.empty": "ยังไม่มีวิชาในเทอมนี้",
    "risk.green": "ปลอดภัย",
    "risk.yellow": "ควรระวัง",
    "risk.red": "เสี่ยง",
    "nav.quiz": "ทดสอบ",
    "nav.review": "ทวน",
    // review (flashcards)
    "review.title": "ทวนวันนี้",
    "review.empty": "ไม่มีการ์ดต้องทวนวันนี้ 🎉 เยี่ยมมาก!",
    "review.progress": "{n}/{total}",
    "review.tapReveal": "แตะเพื่อดูเฉลย",
    "review.answer": "เฉลย",
    "review.remember": "จำได้",
    "review.forgot": "ยังไม่ได้",
    "review.swipeHint": "ปัดขวา = จำได้ · ปัดซ้าย = ยังไม่ได้",
    "review.box": "กล่อง {n}",
    "review.doneTitle": "ทวนครบแล้ว!",
    "review.reviewed": "ทวนไป {n} ใบ",
    "review.remembered": "จำได้ {n} ใบ",
    "review.backHome": "เสร็จสิ้น",
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
    "notes.modeType": "⌨️ พิมพ์",
    "notes.modeDraw": "✍️ เขียนด้วยปากกา",
    "notes.drawHint": "เขียนด้วยปากกา/นิ้วได้เลย เหมาะกับจดสด ๆ ในคาบ",
    "notes.undoDraw": "↩︎ ย้อนเส้น",
    "notes.clearDraw": "ล้างทั้งหมด",
    "draw.pen": "ปากกา",
    "draw.highlighter": "ปากกาเน้นข้อความ",
    "draw.eraser": "ยางลบ",
    "draw.color": "สี",
    "draw.thin": "เส้นบาง",
    "draw.medium": "เส้นกลาง",
    "draw.thick": "เส้นหนา",
    "draw.undo": "ย้อนกลับ",
    "draw.redo": "ทำซ้ำ",
    "draw.clear": "ล้างทั้งหมด",
    "draw.zoomIn": "ซูมเข้า",
    "draw.zoomOut": "ซูมออก",
    "draw.expand": "ขยายพื้นที่",
    "draw.collapse": "ย่อพื้นที่",
    "draw.addPage": "เพิ่มหน้า",
    "draw.pages": "{n} หน้า",
    "notes.camera": "📷 ถ่ายรูป",
    "notes.gallery": "🖼️ แนบรูป",
    "notes.photoCount": "แนบรูปแล้ว {n} รูป",
    "notes.removeImage": "ลบ",
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
    "auth.password": "Password",
    "auth.login": "Sign in",
    "auth.wrong": "Wrong password",
    "auth.logout": "Sign out",
    "nav.today": "Today",
    "nav.week": "Week",
    "nav.exams": "Exams",
    "nav.schedule": "Schedule",
    "nav.stats": "Stats",
    "nav.notes": "Notes",
    "nav.more": "More",
    "more.title": "More",
    "more.schedule": "Class & exam schedule",
    "more.stats": "Stats & tracker",
    "more.planner": "Degree planner (138 credits)",
    "more.mock": "Mock exam (before the real one)",
    "more.back": "← More",
    "mock.title": "Mock exam",
    "mock.intro": "Opens 21 days before an exam · focuses on weak spots and shaky cards",
    "mock.empty": "No courses with an exam this term",
    "mock.locked": "opens in {n} days",
    "mock.noBank": "Take a quiz on this course first to build a question bank",
    "mock.start": "Start mock exam",
    "mock.generating": "Building your exam…",
    "mock.timeLeft": "Time left",
    "mock.question": "Q {n}/{total}",
    "mock.answerPlaceholder": "Type your answer…",
    "mock.next": "Next",
    "mock.submit": "Submit exam",
    "mock.submitting": "Grading…",
    "mock.resultTitle": "Mock result",
    "mock.resultScore": "Scored {score}/{max}",
    "mock.weak": "Weak spots to review",
    "mock.madeCards": "Missed questions were added as flashcards ⭐",
    "mock.done": "Done",
    "plan.title": "Degree planner",
    "plan.creditsPassed": "{passed} / {total} credits passed",
    "plan.categories": "Credits by category",
    "plan.internship": "Internship readiness (PSY4499)",
    "plan.eligible": "Ready to apply ✅",
    "plan.notEligible": "Not ready yet",
    "plan.blocked": "⚠️ Blocked courses (a prerequisite was failed)",
    "plan.blockedDueTo": "{course} — blocked by {due}",
    "plan.retake": "{course} failed — retake suggested in {term}",
    "plan.termCredits": "{credits}/{max} credits",
    "plan.running": "total {n}",
    "plan.placeholder": "not chosen yet",
    "plan.status.PLANNED": "Not taken",
    "plan.status.PASSED": "Passed",
    "plan.status.FAILED": "Failed",
    "cat.GE": "General Ed (GE)",
    "cat.FOUNDATION": "Psychology core",
    "cat.MAJOR_REQ": "Major required",
    "cat.MAJOR_ELEC": "Major elective",
    "cat.MINOR": "Minor",
    "cat.FREE": "Free elective",
    "rule.credits": "≥ 108 credits passed",
    "rule.foundation": "Core ≥ 39 (incl. 6 key courses)",
    "rule.major": "All 8 major-required",
    "rule.elective": "≥ 3 major electives",
    "rule.minor": "Minor ≥ 9 credits",
    "rule.free": "Free electives ≥ 6 credits",
    "sched.week": "Week",
    "sched.exams": "Exams",
    "stats.pageTitle": "Stats & tracker",
    "pomo.title": "Study timer",
    "pomo.focus": "Focus",
    "pomo.break": "Break",
    "pomo.selectCourse": "— select the course you're studying —",
    "pomo.start": "Start",
    "pomo.pause": "Pause",
    "pomo.reset": "Reset",
    "pomo.finish": "Finish & log",
    "pomo.logged": "Logged {m} minutes ✅",
    "an.title": "Per-course analysis (this term)",
    "an.hours": "Hours this week",
    "an.hoursValue": "{actual} / {target} h",
    "an.quizAvg": "Quiz average",
    "an.noQuiz": "No quiz data yet",
    "an.weak": "Weak spots",
    "an.noExam": "No exam",
    "an.daysToExam": "exam in {n} days",
    "an.empty": "No courses this term",
    "risk.green": "On track",
    "risk.yellow": "Watch",
    "risk.red": "At risk",
    "nav.quiz": "Quiz",
    "nav.review": "Review",
    "review.title": "Review today",
    "review.empty": "No cards due today 🎉 Great job!",
    "review.progress": "{n}/{total}",
    "review.tapReveal": "Tap to reveal the answer",
    "review.answer": "Answer",
    "review.remember": "Got it",
    "review.forgot": "Not yet",
    "review.swipeHint": "Swipe right = got it · left = not yet",
    "review.box": "Box {n}",
    "review.doneTitle": "All reviewed!",
    "review.reviewed": "Reviewed {n} cards",
    "review.remembered": "Remembered {n} cards",
    "review.backHome": "Done",
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
    "notes.modeType": "⌨️ Type",
    "notes.modeDraw": "✍️ Write by hand",
    "notes.drawHint": "Write with a stylus or finger — great for quick notes in class",
    "notes.undoDraw": "↩︎ Undo stroke",
    "notes.clearDraw": "Clear all",
    "draw.pen": "Pen",
    "draw.highlighter": "Highlighter",
    "draw.eraser": "Eraser",
    "draw.color": "Color",
    "draw.thin": "Thin",
    "draw.medium": "Medium",
    "draw.thick": "Thick",
    "draw.undo": "Undo",
    "draw.redo": "Redo",
    "draw.clear": "Clear all",
    "draw.zoomIn": "Zoom in",
    "draw.zoomOut": "Zoom out",
    "draw.expand": "Expand",
    "draw.collapse": "Collapse",
    "draw.addPage": "Add page",
    "draw.pages": "{n} pages",
    "notes.camera": "📷 Take photo",
    "notes.gallery": "🖼️ Add image",
    "notes.photoCount": "{n} image(s) attached",
    "notes.removeImage": "Remove",
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
