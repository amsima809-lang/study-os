/**
 * Seed script — official RU Psychology (I/O) catalog + the student's 9-term plan.
 * Source of truth: the course-catalog JSON provided by the student (ระเบียบการ 2569).
 *
 * - ALL courses (including ones not in the plan) go into `courses`.
 * - `term` marks a course as part of the 9-term plan (-> plan_items).
 * - `choose_group` records "pick N of" groups (see GROUPS + course_groups table).
 *
 * Run with `npm run seed`.
 */
import { openDb, type DB } from "./db.js";
import { env } from "./env.js";

type Category = "GE" | "FOUNDATION" | "MAJOR_REQ" | "MAJOR_ELEC" | "MINOR" | "FREE";

type CourseSeed = {
  code: string;
  name_th: string;
  name_en: string;
  credits?: number; // default 3
  category: Category;
  difficulty?: 1 | 2 | 3; // default 2 (only in-plan courses are rated)
  choose_group?: string;
  term?: string; // set => part of the 9-term plan
  prereq?: string[];
  notes?: string;
};

// "choose N of" groups.
const GROUPS: Array<{ id: string; choose: number; required?: boolean; note?: string }> = [
  { id: "GE_THAI", choose: 1 },
  { id: "GE_ENGLISH", choose: 1, required: true },
  { id: "GE_FOREIGN", choose: 1 },
  { id: "GE_TECH", choose: 1 },
  { id: "GE_ADAPT", choose: 1 },
  { id: "GE_THINK", choose: 1 },
  { id: "GE_ENTRE", choose: 1 },
  { id: "GE_CITIZEN_REQ", choose: 1, required: true },
  { id: "GE_CITIZEN", choose: 1 },
  { id: "GE_ARTS", choose: 1 },
  { id: "INTERNSHIP", choose: 1, note: "PSY4497 only for full-time employees with proof + committee approval" },
  { id: "MAJOR_ELEC", choose: 3 },
];

const COURSES: CourseSeed[] = [
  // ---------- GE — General Education ----------
  { code: "RAM1101", name_th: "ทักษะการใช้ภาษาไทย", name_en: "Thai Language Skills", category: "GE", choose_group: "GE_THAI", term: "2/69", difficulty: 1 },
  { code: "RAM1102", name_th: "ภาษาไทยเพื่อการนำเสนอ", name_en: "Thai for Presentations", category: "GE", choose_group: "GE_THAI" },
  { code: "RAM1103", name_th: "ภาษาไทยเพื่อการสื่อสารในการทำงาน", name_en: "Thai for Communication at Work", category: "GE", choose_group: "GE_THAI" },

  { code: "RAM1111", name_th: "ภาษาอังกฤษในชีวิตประจำวัน", name_en: "English in Daily Life", category: "GE", choose_group: "GE_ENGLISH", term: "2/69", difficulty: 2 },

  { code: "RAM1112", name_th: "ภาษาและวัฒนธรรมอังกฤษ", name_en: "English Language and Culture", category: "GE", choose_group: "GE_FOREIGN", term: "1/70", difficulty: 2 },
  { code: "RAM1113", name_th: "ภาษาและวัฒนธรรมจีน", name_en: "Chinese Language and Culture", category: "GE", choose_group: "GE_FOREIGN" },
  { code: "RAM1114", name_th: "ภาษาและวัฒนธรรมญี่ปุ่น", name_en: "Japanese Language and Culture", category: "GE", choose_group: "GE_FOREIGN" },
  { code: "RAM1115", name_th: "ภาษาและวัฒนธรรมเกาหลี", name_en: "Korean Language and Culture", category: "GE", choose_group: "GE_FOREIGN" },
  { code: "RAM1116", name_th: "ภาษาและวัฒนธรรมมลายู", name_en: "Malay Language and Culture", category: "GE", choose_group: "GE_FOREIGN" },
  { code: "RAM1117", name_th: "ภาษาและวัฒนธรรมเมียนมา", name_en: "Myanmar Language and Culture", category: "GE", choose_group: "GE_FOREIGN" },
  { code: "RAM1118", name_th: "ภาษาและวัฒนธรรมเขมร", name_en: "Khmer Language and Culture", category: "GE", choose_group: "GE_FOREIGN" },
  { code: "RAM1119", name_th: "ภาษาและวัฒนธรรมเวียดนาม", name_en: "Vietnamese Language and Culture", category: "GE", choose_group: "GE_FOREIGN" },
  { code: "RAM1121", name_th: "ภาษาและวัฒนธรรมลาว", name_en: "Laotian Language and Culture", category: "GE", choose_group: "GE_FOREIGN" },
  { code: "RAM1122", name_th: "ภาษาและวัฒนธรรมอาหรับ", name_en: "Arabic Language and Culture", category: "GE", choose_group: "GE_FOREIGN" },
  { code: "RAM1123", name_th: "ภาษาฮินดีและวัฒนธรรมอินเดีย", name_en: "Hindi Language and Indian Culture", category: "GE", choose_group: "GE_FOREIGN" },
  { code: "RAM1124", name_th: "ภาษาและวัฒนธรรมฝรั่งเศส", name_en: "French Language and Culture", category: "GE", choose_group: "GE_FOREIGN" },
  { code: "RAM1125", name_th: "ภาษาและวัฒนธรรมเยอรมัน", name_en: "German Language and Culture", category: "GE", choose_group: "GE_FOREIGN" },
  { code: "RAM1126", name_th: "ภาษาและวัฒนธรรมสเปน", name_en: "Spanish Language and Culture", category: "GE", choose_group: "GE_FOREIGN" },
  { code: "RAM1127", name_th: "ภาษาและวัฒนธรรมรัสเซีย", name_en: "Russian Language and Culture", category: "GE", choose_group: "GE_FOREIGN" },
  { code: "RAM1128", name_th: "ภาษาและวัฒนธรรมกรีก", name_en: "Greek Language and Culture", category: "GE", choose_group: "GE_FOREIGN" },

  { code: "RAM1131", name_th: "ทักษะการเข้าใจดิจิทัล", name_en: "Digital Literacy", category: "GE", choose_group: "GE_TECH", term: "2/69", difficulty: 1 },
  { code: "RAM1132", name_th: "ทักษะทางสารสนเทศ", name_en: "Information Literacy", category: "GE", choose_group: "GE_TECH" },

  { code: "RAM1141", name_th: "ศาสตร์แห่งบุคลิกภาพ", name_en: "Science of Personality", category: "GE", choose_group: "GE_ADAPT", term: "2/69", difficulty: 1 },
  { code: "RAM1142", name_th: "การพัฒนาคุณภาพชีวิตและสังคม", name_en: "Quality of Life and Society Development", category: "GE", choose_group: "GE_ADAPT" },

  { code: "RAM1201", name_th: "ความคิดสร้างสรรค์เพื่อการพัฒนานวัตกรรม", name_en: "Creativity for Innovation Development", category: "GE", choose_group: "GE_THINK" },
  { code: "RAM1202", name_th: "ศิลป์สร้างสรรค์", name_en: "Creativity Arts", category: "GE", choose_group: "GE_THINK" },
  { code: "RAM1203", name_th: "ศาสตร์การคิดเปลี่ยนโลก", name_en: "Thinking Science that Changes the World", category: "GE", choose_group: "GE_THINK" },
  { code: "RAM1204", name_th: "คณิตศาสตร์และสถิติเพื่อการดำเนินชีวิตในโลกสมัยใหม่", name_en: "Mathematics and Statistics for Daily Life in the Modern World", category: "GE", choose_group: "GE_THINK", term: "2/69", difficulty: 2, notes: "MUST take — prerequisite for PSY2008, PSY3003, PSY3004" },

  { code: "RAM1211", name_th: "ศาสตร์แห่งการเป็นผู้ประกอบการ", name_en: "Principles of Entrepreneurship", category: "GE", choose_group: "GE_ENTRE", term: "S/69", difficulty: 1, notes: "Fallback RAM1212 if not offered" },
  { code: "RAM1212", name_th: "ผู้ประกอบการรุ่นใหม่", name_en: "Smart Entrepreneurs", category: "GE", choose_group: "GE_ENTRE" },
  { code: "RAM1213", name_th: "ภูมิปัญญาท้องถิ่นกับการพัฒนานวัตกรรมเพื่อสังคมและเศรษฐกิจ", name_en: "Local Wisdom and Innovation Development for Society and Economy", category: "GE", choose_group: "GE_ENTRE" },
  { code: "RAM1214", name_th: "วิถีวิทย์สู่โมเดลเศรษฐกิจ BCG", name_en: "Science, Technology, and Innovation (STI) for the BCG Economy Model", category: "GE", choose_group: "GE_ENTRE" },

  { code: "RAM1301", name_th: "คุณธรรมคู่ความรู้", name_en: "Morality and Knowledge", category: "GE", choose_group: "GE_CITIZEN_REQ", term: "2/69", difficulty: 1 },
  { code: "RAM1302", name_th: "การเมืองและกฎหมายในชีวิตประจำวัน", name_en: "Politics and Law in Daily Life", category: "GE", choose_group: "GE_CITIZEN", term: "S/69", difficulty: 1 },
  { code: "RAM1303", name_th: "วิทยาศาสตร์เพื่อการพัฒนาที่ยั่งยืน", name_en: "Science for Sustainable Development", category: "GE", choose_group: "GE_CITIZEN" },

  { code: "RAM1311", name_th: "ศิลปะและวัฒนธรรมในท้องถิ่นไทย", name_en: "Thai Local Art and Culture", category: "GE", choose_group: "GE_ARTS" },
  { code: "RAM1312", name_th: "วัฒนธรรมร่วมสมัยกับการเปลี่ยนผันทางดิจิทัล", name_en: "Contemporary Culture and Digital Disruption", category: "GE", choose_group: "GE_ARTS", term: "S/69", difficulty: 1 },

  // ---------- Foundation ----------
  { code: "PSY1002", name_th: "จิตวิทยาเบื้องต้น", name_en: "Introduction to Psychology", category: "FOUNDATION", term: "2/69", difficulty: 1 },
  { code: "PSY2001", name_th: "จิตวิทยาการเรียนรู้", name_en: "Psychology of Learning", category: "FOUNDATION", term: "1/70", difficulty: 2 },
  { code: "PSY2002", name_th: "จิตวิทยาบุคลิกภาพและการปรับตัว", name_en: "Psychology of Personality and Adjustment", category: "FOUNDATION", term: "2/70", difficulty: 2 },
  { code: "PSY2005", name_th: "จิตวิทยาสังคมเบื้องต้น", name_en: "Introduction to Social Psychology", category: "FOUNDATION", term: "1/70", difficulty: 2 },
  { code: "PSY2006", name_th: "จิตวิทยาพัฒนาการ", name_en: "Developmental Psychology", category: "FOUNDATION", term: "1/70", difficulty: 2 },
  { code: "PSY2007", name_th: "สรีรจิตวิทยา", name_en: "Physiological Psychology", category: "FOUNDATION", term: "1/70", difficulty: 3 },
  { code: "PSY2008", name_th: "การวิเคราะห์เชิงปริมาณทางจิตวิทยาเบื้องต้น", name_en: "Introduction to Quantitative Analysis of Psychology", category: "FOUNDATION", term: "1/70", difficulty: 3, prereq: ["RAM1204"] },
  { code: "PSY2009", name_th: "ทฤษฎีและการฝึกพลวัตกลุ่ม", name_en: "Theories and Practice of Group Dynamics", category: "FOUNDATION", term: "2/70", difficulty: 2, prereq: ["PSY1002"] },
  { code: "PSY2010", name_th: "ภาษาอังกฤษสำหรับนักจิตวิทยา", name_en: "English for Psychologist", category: "FOUNDATION", term: "2/70", difficulty: 2, prereq: ["PSY1002"] },
  { code: "PSY3001", name_th: "จิตวิทยาการรับรู้และการรู้คิด", name_en: "Psychology of Perception and Cognition", category: "FOUNDATION", term: "1/71", difficulty: 2, prereq: ["PSY1002", "PSY2001", "PSY2007"] },
  { code: "PSY3002", name_th: "การทดสอบและวัดผลทางจิตวิทยา", name_en: "Psychological Test and Measurement", category: "FOUNDATION", term: "2/70", difficulty: 3, prereq: ["PSY2006", "PSY2008"] },
  { code: "PSY3003", name_th: "วิธีวิจัยทางจิตวิทยา", name_en: "Methods in Psychological Research", category: "FOUNDATION", term: "2/70", difficulty: 3, prereq: ["RAM1204", "PSY2008"] },
  { code: "PSY3004", name_th: "จิตวิทยาการทดลองเบื้องต้น", name_en: "Introduction to Experimental Psychology", category: "FOUNDATION", term: "1/71", difficulty: 3, prereq: ["RAM1204", "PSY2008", "PSY3003", "PSY1002"] },
  { code: "PSY3005", name_th: "จิตวิทยาความแตกต่าง", name_en: "Differential Psychology", category: "FOUNDATION", term: "1/71", difficulty: 2 },
  { code: "PSY4001", name_th: "ระบบและทฤษฎีทางจิตวิทยา", name_en: "Systems and Theories in Psychology", category: "FOUNDATION", term: "S/71", difficulty: 3, prereq: ["PSY1002", "PSY2001", "PSY2002", "PSY2007", "PSY3004"] },

  // ---------- Major Required ----------
  { code: "PSY2401", name_th: "จิตวิทยาอุตสาหกรรมและองค์การเบื้องต้น", name_en: "Introduction to Industrial and Organizational Psychology", category: "MAJOR_REQ", term: "1/70", difficulty: 2 },
  { code: "PSY2402", name_th: "จิตวิทยาการบริหารบุคลากร", name_en: "Managerial Personnel Psychology", category: "MAJOR_REQ", term: "2/70", difficulty: 2, prereq: ["PSY2401"] },
  { code: "PSY2404", name_th: "พฤติกรรมผู้นำ", name_en: "Leadership Behavior", category: "MAJOR_REQ", term: "2/70", difficulty: 2 },
  { code: "PSY3401", name_th: "จิตวิทยาการให้คำปรึกษาเพื่อคุณภาพชีวิตพนักงาน", name_en: "Counseling Psychology for Quality of Work Life", category: "MAJOR_REQ", term: "1/71", difficulty: 2 },
  { code: "PSY3402", name_th: "จิตวิทยาการตลาดและผู้บริโภค", name_en: "Psychology of Marketing and Consumer", category: "MAJOR_REQ", term: "1/71", difficulty: 2 },
  { code: "PSY3403", name_th: "แรงจูงใจและขวัญในการทำงาน", name_en: "Motive and Work Morale", category: "MAJOR_REQ", term: "2/71", difficulty: 2 },
  { code: "PSY3408", name_th: "จิตวิทยาการปรับพฤติกรรมบุคคลในองค์การ", name_en: "Psychology for Behavior Modification in Organization", category: "MAJOR_REQ", term: "S/71", difficulty: 2, prereq: ["PSY1002", "PSY2001", "PSY2401", "PSY2402"] },
  { code: "PSY4401", name_th: "การทดสอบและการประเมินทางจิตวิทยาในอุตสาหกรรมและองค์การ", name_en: "Psychological Testing and Assessment in Industry and Organizations", category: "MAJOR_REQ", term: "1/71", difficulty: 3, prereq: ["PSY2008", "PSY3002", "PSY3003"], notes: "มร.30 also lists STA2003 as PR (likely old curriculum) — TODO confirm with department" },
  { code: "PSY4405", name_th: "การวิจัยพัฒนาและพัฒนาเพื่อการฝึกอบรม", name_en: "Research and Development for Training", category: "MAJOR_REQ", term: "2/71", difficulty: 2 },
  { code: "PSY4499", name_th: "การฝึกงานทางจิตวิทยาอุตสาหกรรมและองค์การ", name_en: "Field Work in Industrial and Organizational Psychology", category: "MAJOR_REQ", choose_group: "INTERNSHIP", term: "1/72", difficulty: 2, prereq: ["PSY2005", "PSY2009", "PSY2401", "PSY2402", "PSY2404", "PSY3001", "PSY3002", "PSY3003", "PSY3004", "PSY3401", "PSY3402", "PSY3403", "PSY4401", "PSY4405"] },
  { code: "PSY4497", name_th: "การศึกษาและวิจัยรายบุคคลทางจิตวิทยาอุตสาหกรรมและองค์กร", name_en: "Individual Research in Industrial and Organizational Psychology", category: "MAJOR_REQ", choose_group: "INTERNSHIP", prereq: ["PSY2005", "PSY2009", "PSY2401", "PSY2402", "PSY2404", "PSY3001", "PSY3002", "PSY3003", "PSY3004", "PSY3401", "PSY3402", "PSY3403", "PSY4401", "PSY4405"] },

  // ---------- Major Elective (choose 3) ----------
  { code: "PSY2403", name_th: "พฤติกรรมการทำงานและค่านิยมทางสังคมในแรงงานไทย", name_en: "Work Behavior and Social Value in Thai Workforces", category: "MAJOR_ELEC", choose_group: "MAJOR_ELEC", term: "S/70", difficulty: 1, notes: "มร.30 lists PR PSY2005 — already passed by S/70 in plan" },
  { code: "PSY2405", name_th: "เจตคติและความพึงพอใจในการทำงาน", name_en: "Attitudes and Job Satisfaction", category: "MAJOR_ELEC", choose_group: "MAJOR_ELEC", term: "1/71", difficulty: 1 },
  { code: "PSY2406", name_th: "จิตวิทยาบริการและทักษะการปฏิสัมพันธ์", name_en: "Service Psychology and Interaction Skills", category: "MAJOR_ELEC", choose_group: "MAJOR_ELEC", term: "2/71", difficulty: 1 },
  { code: "PSY3404", name_th: "จิตวิทยาการสื่อสารและการชักจูง", name_en: "Psychology of Communication and Persuasion", category: "MAJOR_ELEC", choose_group: "MAJOR_ELEC" },
  { code: "PSY3405", name_th: "จิตวิทยาการทำงาน", name_en: "Psychology at Work", category: "MAJOR_ELEC", choose_group: "MAJOR_ELEC" },
  { code: "PSY3406", name_th: "จิตวิทยาองค์การ", name_en: "Organizational Psychology", category: "MAJOR_ELEC", choose_group: "MAJOR_ELEC" },
  { code: "PSY3407", name_th: "การพัฒนาอาชีพในอุตสาหกรรมและองค์การ", name_en: "Career Development in Industrial and Organization", category: "MAJOR_ELEC", choose_group: "MAJOR_ELEC" },
  { code: "PSY4402", name_th: "การวิเคราะห์ข้อมูลด้วยโปรแกรมคอมพิวเตอร์สำหรับจิตวิทยา", name_en: "Data Analysis with Computer Program for Psychologist", category: "MAJOR_ELEC", choose_group: "MAJOR_ELEC" },
  { code: "PSY4498", name_th: "สัมมนาและศึกษาดูงานทางจิตวิทยาอุตสาหกรรมและองค์การ", name_en: "Seminar and Field Trip in Industrial and Organizational Psychology", category: "MAJOR_ELEC", choose_group: "MAJOR_ELEC", prereq: ["PSY2005", "PSY2009", "PSY2401", "PSY2402", "PSY2404", "PSY3001", "PSY3002", "PSY3003", "PSY3004", "PSY3402", "PSY3403", "PSY3408", "PSY4401", "PSY4405"] },
  { code: "HRM3208", name_th: "แรงงานสัมพันธ์และกฎหมายที่เกี่ยวข้อง", name_en: "Labor Relations and the Law", category: "MAJOR_ELEC", choose_group: "MAJOR_ELEC" },
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

// ---------- Plan placeholders (minor / free electives, no codes yet) ----------
const PLACEHOLDERS: Array<{ label: string; term: string }> = [
  { label: "เลือกเสรี #1", term: "S/70" },
  { label: "เลือกเสรี #2", term: "S/70" },
  { label: "วิชาโท #1", term: "2/71" },
  { label: "วิชาโท #2", term: "2/71" },
  { label: "วิชาโท #3", term: "2/71" },
  { label: "วิชาโท #4", term: "2/71" },
  { label: "วิชาโท #5", term: "S/71" },
  { label: "วิชาโท #6", term: "1/72" },
];

// ---------- Class schedule 2/2569 ----------
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

const DEFAULT_SETTINGS: Array<[string, string]> = [
  ["current_term_id", "2/69"],
  ["weekly_target_hours", "36"],
];

/** Insert every seed row. Idempotent: clears seed tables first, then re-inserts. */
export function seedDatabase(db: DB): void {
  const tx = db.transaction(() => {
    const insSetting = db.prepare("INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)");
    for (const [k, v] of DEFAULT_SETTINGS) insSetting.run(k, v);

    db.exec(`
      DELETE FROM exams;
      DELETE FROM class_sessions;
      DELETE FROM plan_items;
      DELETE FROM plan_terms;
      DELETE FROM prerequisites;
      DELETE FROM course_groups;
      DELETE FROM courses;
    `);

    const insGroup = db.prepare(
      "INSERT INTO course_groups (id, choose, required, note) VALUES (@id, @choose, @required, @note)",
    );
    for (const g of GROUPS) {
      insGroup.run({ id: g.id, choose: g.choose, required: g.required ? 1 : 0, note: g.note ?? null });
    }

    const insCourse = db.prepare(
      `INSERT INTO courses (code, name_th, name_en, credits, category, difficulty, choose_group, notes)
       VALUES (@code, @name_th, @name_en, @credits, @category, @difficulty, @choose_group, @notes)`,
    );
    const insPre = db.prepare("INSERT INTO prerequisites (course_code, requires_code) VALUES (?, ?)");
    for (const c of COURSES) {
      insCourse.run({
        code: c.code,
        name_th: c.name_th,
        name_en: c.name_en,
        credits: c.credits ?? 3,
        category: c.category,
        difficulty: c.difficulty ?? 2,
        choose_group: c.choose_group ?? null,
        notes: c.notes ?? null,
      });
      for (const req of c.prereq ?? []) insPre.run(c.code, req);
    }

    const insTerm = db.prepare(
      "INSERT INTO plan_terms (term_id, ord, max_credits) VALUES (@term_id, @ord, @max_credits)",
    );
    for (const t of PLAN_TERMS) insTerm.run(t);

    // plan_items: in-plan courses (those with a term) + placeholders
    const insItem = db.prepare(
      `INSERT INTO plan_items (term_id, course_code, placeholder_label)
       VALUES (@term_id, @course_code, @placeholder_label)`,
    );
    for (const c of COURSES) {
      if (c.term) insItem.run({ term_id: c.term, course_code: c.code, placeholder_label: null });
    }
    for (const p of PLACEHOLDERS) {
      insItem.run({ term_id: p.term, course_code: null, placeholder_label: p.label });
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
