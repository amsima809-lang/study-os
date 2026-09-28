/**
 * Seed script — loads the RU Psychology (I/O) curriculum, 9-term plan,
 * class schedule and exams for semester 2/2569 into the database.
 *
 * Source of truth: the project's SEED DATA. We never invent facts:
 * - EN course names are unknown => name_en stays NULL (translate UI chrome only).
 * - Major-elective courses have no Thai name in the source => placeholder + TODO.
 *
 * Run with `npm run seed`.
 */
import { openDb, type DB } from "./db.js";
import { env } from "./env.js";

type Category = "GE" | "FOUNDATION" | "MAJOR_REQ" | "MAJOR_ELEC" | "MINOR" | "FREE";

type CourseSeed = {
  code: string;
  name_th: string;
  credits?: number; // default 3
  category: Category;
  difficulty: 1 | 2 | 3;
  notes?: string;
};

// ---------- Courses ----------
const COURSES: CourseSeed[] = [
  // GE (30 credits)
  { code: "RAM1301", name_th: "คุณธรรมคู่ความรู้", category: "GE", difficulty: 1, notes: "required" },
  { code: "RAM1111", name_th: "ภาษาอังกฤษในชีวิตประจำวัน", category: "GE", difficulty: 2, notes: "required" },
  { code: "RAM1101", name_th: "ทักษะการใช้ภาษาไทย", category: "GE", difficulty: 1 },
  { code: "RAM1112", name_th: "ภาษาและวัฒนธรรมอังกฤษ", category: "GE", difficulty: 2 },
  { code: "RAM1131", name_th: "ทักษะการเข้าใจดิจิทัล", category: "GE", difficulty: 1 },
  { code: "RAM1141", name_th: "ศาสตร์แห่งบุคลิกภาพ", category: "GE", difficulty: 1 },
  { code: "RAM1204", name_th: "คณิตศาสตร์และสถิติเพื่อการดำเนินชีวิตในโลกสมัยใหม่", category: "GE", difficulty: 2, notes: "prerequisite for PSY2008/PSY3003/PSY3004" },
  { code: "RAM1211", name_th: "ศาสตร์แห่งการเป็นผู้ประกอบการ", category: "GE", difficulty: 1, notes: "fallback RAM1212 if not offered" },
  { code: "RAM1302", name_th: "การเมืองและกฎหมายในชีวิตประจำวัน", category: "GE", difficulty: 1 },
  { code: "RAM1312", name_th: "วัฒนธรรมร่วมสมัยกับการเปลี่ยนแปลงทางดิจิทัล", category: "GE", difficulty: 1 },

  // Foundation (45 credits)
  { code: "PSY1002", name_th: "จิตวิทยาเบื้องต้น", category: "FOUNDATION", difficulty: 1 },
  { code: "PSY2001", name_th: "จิตวิทยาการเรียนรู้", category: "FOUNDATION", difficulty: 2 },
  { code: "PSY2002", name_th: "จิตวิทยาบุคลิกภาพและการปรับตัว", category: "FOUNDATION", difficulty: 2 },
  { code: "PSY2005", name_th: "จิตวิทยาสังคมเบื้องต้น", category: "FOUNDATION", difficulty: 2 },
  { code: "PSY2006", name_th: "จิตวิทยาพัฒนาการ", category: "FOUNDATION", difficulty: 2 },
  { code: "PSY2007", name_th: "สรีรจิตวิทยา", category: "FOUNDATION", difficulty: 3 },
  { code: "PSY2008", name_th: "การวิเคราะห์เชิงปริมาณทางจิตวิทยาเบื้องต้น", category: "FOUNDATION", difficulty: 3 },
  { code: "PSY2009", name_th: "ทฤษฎีและการฝึกพลวัตกลุ่ม", category: "FOUNDATION", difficulty: 2 },
  { code: "PSY2010", name_th: "ภาษาอังกฤษสำหรับนักจิตวิทยา", category: "FOUNDATION", difficulty: 2 },
  { code: "PSY3001", name_th: "จิตวิทยาการรับรู้และการรู้คิด", category: "FOUNDATION", difficulty: 2 },
  { code: "PSY3002", name_th: "การทดสอบและวัดผลทางจิตวิทยา", category: "FOUNDATION", difficulty: 3 },
  { code: "PSY3003", name_th: "วิธีวิจัยทางจิตวิทยา", category: "FOUNDATION", difficulty: 3 },
  { code: "PSY3004", name_th: "จิตวิทยาการทดลองเบื้องต้น", category: "FOUNDATION", difficulty: 3 },
  { code: "PSY3005", name_th: "จิตวิทยาความแตกต่าง", category: "FOUNDATION", difficulty: 2 },
  { code: "PSY4001", name_th: "ระบบและทฤษฎีทางจิตวิทยา", category: "FOUNDATION", difficulty: 3 },

  // Major Required (30 credits)
  { code: "PSY2401", name_th: "จิตวิทยาอุตสาหกรรมและองค์การเบื้องต้น", category: "MAJOR_REQ", difficulty: 2 },
  { code: "PSY2402", name_th: "จิตวิทยาการบริหารบุคลากร", category: "MAJOR_REQ", difficulty: 2 },
  { code: "PSY2404", name_th: "พฤติกรรมผู้นำ", category: "MAJOR_REQ", difficulty: 2 },
  { code: "PSY3401", name_th: "จิตวิทยาการให้คำปรึกษาเพื่อคุณภาพชีวิตพนักงาน", category: "MAJOR_REQ", difficulty: 2 },
  { code: "PSY3402", name_th: "จิตวิทยาการตลาดและผู้บริโภค", category: "MAJOR_REQ", difficulty: 2 },
  { code: "PSY3403", name_th: "แรงจูงใจและขวัญในการทำงาน", category: "MAJOR_REQ", difficulty: 2 },
  { code: "PSY3408", name_th: "จิตวิทยาการปรับพฤติกรรมบุคคลในองค์การ", category: "MAJOR_REQ", difficulty: 2 },
  { code: "PSY4401", name_th: "การทดสอบและการประเมินทางจิตวิทยาในอุตสาหกรรมและองค์การ", category: "MAJOR_REQ", difficulty: 3 },
  { code: "PSY4405", name_th: "การวิจัยพัฒนาและพัฒนาเพื่อการฝึกอบรม", category: "MAJOR_REQ", difficulty: 2 },
  { code: "PSY4499", name_th: "การฝึกงานทางจิตวิทยาอุตสาหกรรมและองค์การ", category: "MAJOR_REQ", difficulty: 1, notes: "internship; alternative PSY4497 for full-time employees. TODO: confirm difficulty" },

  // Major Elective — my current picks. Source lists codes only (no Thai names).
  { code: "PSY2403", name_th: "วิชาเอกเลือก (PSY2403)", category: "MAJOR_ELEC", difficulty: 1, notes: "TODO: เติมชื่อวิชาไทย/อังกฤษ" },
  { code: "PSY2405", name_th: "วิชาเอกเลือก (PSY2405)", category: "MAJOR_ELEC", difficulty: 1, notes: "TODO: เติมชื่อวิชาไทย/อังกฤษ" },
  { code: "PSY2406", name_th: "วิชาเอกเลือก (PSY2406)", category: "MAJOR_ELEC", difficulty: 1, notes: "TODO: เติมชื่อวิชาไทย/อังกฤษ" },
];

// ---------- Prerequisites (course requires ...) ----------
const PREREQUISITES: Array<[string, string]> = [
  ["PSY2008", "RAM1204"],
  ["PSY2009", "PSY1002"],
  ["PSY2010", "PSY1002"],
  ["PSY3001", "PSY1002"], ["PSY3001", "PSY2001"], ["PSY3001", "PSY2007"],
  ["PSY3002", "PSY2006"], ["PSY3002", "PSY2008"],
  ["PSY3003", "RAM1204"], ["PSY3003", "PSY2008"],
  ["PSY3004", "RAM1204"], ["PSY3004", "PSY2008"], ["PSY3004", "PSY3003"], ["PSY3004", "PSY1002"],
  ["PSY4001", "PSY1002"], ["PSY4001", "PSY2001"], ["PSY4001", "PSY2002"], ["PSY4001", "PSY2007"], ["PSY4001", "PSY3004"],
  ["PSY2402", "PSY2401"],
  ["PSY3408", "PSY1002"], ["PSY3408", "PSY2001"], ["PSY3408", "PSY2401"], ["PSY3408", "PSY2402"],
  ["PSY4401", "PSY2008"], ["PSY4401", "PSY3002"], ["PSY4401", "PSY3003"],
  // PSY4499 internship — big prerequisite set
  ["PSY4499", "PSY2005"], ["PSY4499", "PSY2009"], ["PSY4499", "PSY2401"], ["PSY4499", "PSY2402"],
  ["PSY4499", "PSY2404"], ["PSY4499", "PSY3001"], ["PSY4499", "PSY3002"], ["PSY4499", "PSY3003"],
  ["PSY4499", "PSY3004"], ["PSY4499", "PSY3401"], ["PSY4499", "PSY3402"], ["PSY4499", "PSY3403"],
  ["PSY4499", "PSY4401"], ["PSY4499", "PSY4405"],
];

// ---------- Plan terms ----------
const PLAN_TERMS: Array<{ term_id: string; ord: number; max_credits: number }> = [
  { term_id: "2/69", ord: 0, max_credits: 21 },
  { term_id: "S/69", ord: 1, max_credits: 9 },
  { term_id: "1/70", ord: 2, max_credits: 21 },
  { term_id: "2/70", ord: 3, max_credits: 21 },
  { term_id: "S/70", ord: 4, max_credits: 9 },
  { term_id: "1/71", ord: 5, max_credits: 21 },
  { term_id: "2/71", ord: 6, max_credits: 21 },
  { term_id: "S/71", ord: 7, max_credits: 9 },
  { term_id: "1/72", ord: 8, max_credits: 21 },
];

// ---------- Plan items (course codes or placeholder labels) ----------
// A string = course code; { ph } = placeholder.
type PlanEntry = string | { ph: string };
const PLAN: Record<string, PlanEntry[]> = {
  "2/69": ["RAM1301", "RAM1111", "RAM1204", "RAM1131", "RAM1101", "RAM1141", "PSY1002"],
  "S/69": ["RAM1211", "RAM1302", "RAM1312"],
  "1/70": ["RAM1112", "PSY2001", "PSY2005", "PSY2006", "PSY2007", "PSY2008", "PSY2401"],
  "2/70": ["PSY2002", "PSY2009", "PSY2010", "PSY2402", "PSY2404", "PSY3002", "PSY3003"],
  "S/70": ["PSY2403", { ph: "เลือกเสรี #1" }, { ph: "เลือกเสรี #2" }],
  "1/71": ["PSY3001", "PSY3004", "PSY4401", "PSY3005", "PSY3401", "PSY3402", "PSY2405"],
  "2/71": ["PSY4405", "PSY3403", "PSY2406", { ph: "วิชาโท #1" }, { ph: "วิชาโท #2" }, { ph: "วิชาโท #3" }, { ph: "วิชาโท #4" }],
  "S/71": ["PSY4001", "PSY3408", { ph: "วิชาโท #5" }],
  "1/72": ["PSY4499", { ph: "วิชาโท #6" }],
};

// ---------- Class schedule 2/2569 ----------
// weekday: 1=Mon .. 7=Sun. Exam slots: A = 09:30-12:00, B = 14:00-16:30.
type ClassSeed = {
  code: string; weekday: number; start: string; end: string; room: string;
  examDate: string; slot: "A" | "B";
};
const SCHEDULE_2_69: ClassSeed[] = [
  { code: "RAM1111", weekday: 1, start: "08:30", end: "11:00", room: "KTB 301", examDate: "2027-03-14", slot: "B" },
  { code: "RAM1101", weekday: 2, start: "11:10", end: "13:40", room: "KTB 401", examDate: "2027-03-22", slot: "A" },
  { code: "PSY1002", weekday: 2, start: "13:30", end: "15:20", room: "VKB 401", examDate: "2027-03-19", slot: "A" },
  { code: "RAM1204", weekday: 4, start: "08:30", end: "11:00", room: "KTB 501", examDate: "2027-03-17", slot: "A" },
  { code: "RAM1141", weekday: 4, start: "13:50", end: "16:20", room: "KTB 501", examDate: "2027-03-16", slot: "A" },
  { code: "RAM1301", weekday: 5, start: "09:30", end: "11:20", room: "KLB 201", examDate: "2027-03-10", slot: "B" },
  { code: "RAM1131", weekday: 5, start: "11:10", end: "13:40", room: "KTB 301", examDate: "2027-03-09", slot: "A" },
];

const SLOT_TIMES: Record<"A" | "B", { start: string; end: string }> = {
  A: { start: "09:30", end: "12:00" },
  B: { start: "14:00", end: "16:30" },
};

/** Insert every seed row. Idempotent: clears seed tables first, then re-inserts. */
export function seedDatabase(db: DB): void {
  const tx = db.transaction(() => {
    // Clear seed-owned tables (leave user data like notes/attempts untouched).
    db.exec(`
      DELETE FROM exams;
      DELETE FROM class_sessions;
      DELETE FROM plan_items;
      DELETE FROM plan_terms;
      DELETE FROM prerequisites;
      DELETE FROM courses;
    `);

    const insCourse = db.prepare(
      `INSERT INTO courses (code, name_th, name_en, credits, category, difficulty, notes)
       VALUES (@code, @name_th, NULL, @credits, @category, @difficulty, @notes)`,
    );
    for (const c of COURSES) {
      insCourse.run({
        code: c.code,
        name_th: c.name_th,
        credits: c.credits ?? 3,
        category: c.category,
        difficulty: c.difficulty,
        notes: c.notes ?? null,
      });
    }

    const insPre = db.prepare(
      "INSERT INTO prerequisites (course_code, requires_code) VALUES (?, ?)",
    );
    for (const [course, requires] of PREREQUISITES) insPre.run(course, requires);

    const insTerm = db.prepare(
      "INSERT INTO plan_terms (term_id, ord, max_credits) VALUES (@term_id, @ord, @max_credits)",
    );
    for (const t of PLAN_TERMS) insTerm.run(t);

    const insItem = db.prepare(
      `INSERT INTO plan_items (term_id, course_code, placeholder_label)
       VALUES (@term_id, @course_code, @placeholder_label)`,
    );
    for (const [term_id, entries] of Object.entries(PLAN)) {
      for (const e of entries) {
        if (typeof e === "string") {
          insItem.run({ term_id, course_code: e, placeholder_label: null });
        } else {
          insItem.run({ term_id, course_code: null, placeholder_label: e.ph });
        }
      }
    }

    const insClass = db.prepare(
      `INSERT INTO class_sessions (course_code, term_id, weekday, start_time, end_time, room)
       VALUES (@code, '2/69', @weekday, @start, @end, @room)`,
    );
    const insExam = db.prepare(
      `INSERT INTO exams (course_code, term_id, datetime_start, datetime_end, slot, location)
       VALUES (@code, '2/69', @start, @end, @slot, @room)`,
    );
    for (const s of SCHEDULE_2_69) {
      insClass.run({ code: s.code, weekday: s.weekday, start: s.start, end: s.end, room: s.room });
      const times = SLOT_TIMES[s.slot];
      insExam.run({
        code: s.code,
        start: `${s.examDate}T${times.start}:00+07:00`,
        end: `${s.examDate}T${times.end}:00+07:00`,
        slot: s.slot,
        room: null,
      });
    }
  });
  tx();
}

/** Summary counts, for the CLI output. */
function summarize(db: DB) {
  const courses = (db.prepare("SELECT COUNT(*) n FROM courses").get() as { n: number }).n;
  const items = (db.prepare("SELECT COUNT(*) n FROM plan_items").get() as { n: number }).n;
  const classes = (db.prepare("SELECT COUNT(*) n FROM class_sessions").get() as { n: number }).n;
  const exams = (db.prepare("SELECT COUNT(*) n FROM exams").get() as { n: number }).n;
  return { courses, items, classes, exams };
}

// Run as a script: `npm run seed`
if (import.meta.url === `file://${process.argv[1]}`) {
  const db = openDb(env.dbPath);
  seedDatabase(db);
  const s = summarize(db);
  console.log(
    `[StudyOS] seed done: ${s.courses} courses, ${s.items} plan items, ` +
      `${s.classes} classes, ${s.exams} exams.`,
  );
  db.close();
}
