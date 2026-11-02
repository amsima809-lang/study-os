/**
 * Seed script — official RU Marketing (B.B.A.) catalog + the student's 8-term plan.
 * Source of truth: the course-catalog PDF provided by the student (ระเบียบการ 2569).
 *
 * - ALL courses (including ones not in the plan) go into `courses`.
 * - `term` marks a course as part of the 8-term plan (-> plan_items).
 * - `choose_group` records "pick N of" groups (see GROUPS + course_groups table).
 *
 * Run with `npm run seed`.
 */
import { openDb, type DB } from "./db.js";
import { env } from "./env.js";

type Category = "GE" | "CORE" | "MAJOR_REQ" | "MAJOR_ELEC" | "FREE";

type CourseSeed = {
  code: string;
  name_th: string;
  name_en: string;
  credits?: number; // default 3
  category: Category;
  difficulty?: 1 | 2 | 3; // default 2 (only in-plan courses are rated)
  choose_group?: string;
  term?: string; // set => part of the 8-term plan
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
  { id: "MAJOR_ELEC", choose: 7 },
];

const COURSES: CourseSeed[] = [
  // ========== GE — General Education (30 credits, 10 courses) ==========
  { code: "RAM1101", name_th: "ทักษะภาษาไทย", name_en: "Thai Language Skills", category: "GE", choose_group: "GE_THAI", term: "2/70", difficulty: 1 },
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

  { code: "RAM1131", name_th: "ทักษะดิจิทัล", name_en: "Digital Literacy", category: "GE", choose_group: "GE_TECH", term: "2/69", difficulty: 1 },
  { code: "RAM1132", name_th: "ทักษะสารสนเทศ", name_en: "Information Literacy", category: "GE", choose_group: "GE_TECH" },

  { code: "RAM1141", name_th: "ศาสตร์แห่งบุคลิกภาพ", name_en: "Science of Personality", category: "GE", choose_group: "GE_ADAPT", term: "2/70", difficulty: 1 },
  { code: "RAM1142", name_th: "คุณภาพชีวิตและการพัฒนาสังคม", name_en: "Quality of Life and Society Development", category: "GE", choose_group: "GE_ADAPT" },

  { code: "RAM1201", name_th: "ความคิดสร้างสรรค์เพื่อการพัฒนานวัตกรรม", name_en: "Creativity for Innovation Development", category: "GE", choose_group: "GE_THINK" },
  { code: "RAM1202", name_th: "ศิลปะสร้างสรรค์", name_en: "Creativity Arts", category: "GE", choose_group: "GE_THINK" },
  { code: "RAM1203", name_th: "วิทยาศาสตร์การคิดที่เปลี่ยนโลก", name_en: "Thinking Science that Changes the World", category: "GE", choose_group: "GE_THINK" },
  { code: "RAM1204", name_th: "คณิตศาสตร์และสถิติในชีวิตประจำวัน", name_en: "Mathematics and Statistics for Daily Life in the Modern World", category: "GE", choose_group: "GE_THINK", term: "1/70", difficulty: 2 },

  { code: "RAM1211", name_th: "ศาสตร์แห่งการเป็นผู้ประกอบการ", name_en: "Principles of Entrepreneurship", category: "GE", choose_group: "GE_ENTRE" },
  { code: "RAM1212", name_th: "ผู้ประกอบการรุ่นใหม่", name_en: "Smart Entrepreneurs", category: "GE", choose_group: "GE_ENTRE", term: "2/69", difficulty: 1 },
  { code: "RAM1213", name_th: "ภูมิปัญญาท้องถิ่นกับการพัฒนานวัตกรรม", name_en: "Local Wisdom and Innovation Development for Society and Economy", category: "GE", choose_group: "GE_ENTRE" },
  { code: "RAM1214", name_th: "วิทยาศาสตร์ เทคโนโลยี และนวัตกรรม", name_en: "Science, Technology, and Innovation (STI) for the BCG Economy Model", category: "GE", choose_group: "GE_ENTRE" },

  { code: "RAM1301", name_th: "คุณธรรมคู่ความรู้", name_en: "Morality and Knowledge", category: "GE", choose_group: "GE_CITIZEN_REQ", term: "2/69", difficulty: 1 },
  { code: "RAM1302", name_th: "การเมืองและกฎหมายในชีวิตประจำวัน", name_en: "Politics and Law in Daily Life", category: "GE", choose_group: "GE_CITIZEN", term: "1/70", difficulty: 1 },
  { code: "RAM1303", name_th: "วิทยาศาสตร์เพื่อการพัฒนาที่ยั่งยืน", name_en: "Science for Sustainable Development", category: "GE", choose_group: "GE_CITIZEN" },

  { code: "RAM1311", name_th: "ศิลปวัฒนธรรมท้องถิ่นไทย", name_en: "Thai Local Art and Culture", category: "GE", choose_group: "GE_ARTS" },
  { code: "RAM1312", name_th: "วัฒนธรรมร่วมสมัยกับดิจิทัล", name_en: "Contemporary Culture and Digital Disruption", category: "GE", choose_group: "GE_ARTS", term: "1/70", difficulty: 1 },

  // ========== Core Business — แกนธุรกิจ (42 credits, 14 courses) ==========
  { code: "ACC1103", name_th: "การบัญชีการเงิน", name_en: "Financial Accounting", category: "CORE", term: "2/69", difficulty: 3 },
  { code: "ACC1104", name_th: "การบัญชีบริหาร", name_en: "Management Accounting", category: "CORE", term: "1/70", difficulty: 3 },
  { code: "DBC2101", name_th: "ทักษะภาษาเพื่อการสื่อสารธุรกิจระดับโลก", name_en: "Language Skills for Global Business Communications", category: "CORE", term: "2/70", difficulty: 2 },
  { code: "ECO1121", name_th: "หลักเศรษฐศาสตร์จุลภาค", name_en: "Principles of Microeconomics", category: "CORE", term: "2/69", difficulty: 2 },
  { code: "ECO1122", name_th: "หลักเศรษฐศาสตร์มหภาค", name_en: "Principles of Macroeconomics", category: "CORE", term: "1/70", difficulty: 2 },
  { code: "FIN2101", name_th: "การเงินธุรกิจ", name_en: "Business Finance", category: "CORE", term: "2/70", difficulty: 2 },
  { code: "HRM2101", name_th: "การจัดการทรัพยากรมนุษย์", name_en: "Human Resources Management", category: "CORE", term: "1/71", difficulty: 2 },
  { code: "LAW2116", name_th: "กฎหมายธุรกิจ", name_en: "Business Law", category: "CORE", term: "1/71", difficulty: 2 },
  { code: "MGT2101", name_th: "หลักการจัดการ", name_en: "Principles of Management", category: "CORE", term: "2/69", difficulty: 2 },
  { code: "MGT2102", name_th: "การจัดการการดำเนินงานและโซ่อุปทาน", name_en: "Operations and Supply Chain Management", category: "CORE", term: "1/71", difficulty: 2 },
  { code: "MGT3101", name_th: "การจัดการเชิงกลยุทธ์", name_en: "Strategic Management", category: "CORE", term: "2/71", difficulty: 3 },
  { code: "MGT3102", name_th: "การภาษีอากร", name_en: "Taxation", category: "CORE", term: "2/71", difficulty: 2 },
  { code: "MKT2101", name_th: "หลักการตลาด", name_en: "Principles of Marketing", category: "CORE", term: "2/69", difficulty: 2 },
  { code: "STA2016", name_th: "สถิติธุรกิจและการวิเคราะห์เชิงปริมาณ", name_en: "Business Statistics and Quantitative Analysis", category: "CORE", term: "1/71", difficulty: 3 },

  // ========== Major Required — เอกบังคับ (33 credits, 11 courses) ==========
  { code: "MKT2205", name_th: "การจัดการช่องทางการตลาด", name_en: "Marketing Channel Management", category: "MAJOR_REQ", term: "1/71", difficulty: 2 },
  { code: "MKT2206", name_th: "การจัดการผลิตภัณฑ์และตราสินค้า", name_en: "Product and Brand Management", category: "MAJOR_REQ", term: "2/70", difficulty: 2 },
  { code: "MKT3202", name_th: "การจัดการการขาย", name_en: "Sales Management", category: "MAJOR_REQ", term: "2/71", difficulty: 2 },
  { code: "MKT3204", name_th: "พฤติกรรมผู้บริโภค", name_en: "Consumer Behavior", category: "MAJOR_REQ", term: "2/71", difficulty: 2 },
  { code: "MKT3206", name_th: "การวางแผนการตลาด", name_en: "Marketing Planning", category: "MAJOR_REQ", term: "1/72", difficulty: 2 },
  { code: "MKT3209", name_th: "การสื่อสารการตลาดแบบบูรณาการ", name_en: "Integrated Marketing Communication", category: "MAJOR_REQ", term: "1/72", difficulty: 2 },
  { code: "MKT3210", name_th: "นโยบายและกลยุทธ์ราคา", name_en: "Price Policies and Strategies", category: "MAJOR_REQ", term: "1/72", difficulty: 2 },
  { code: "MKT3211", name_th: "การตลาดดิจิทัล", name_en: "Digital Marketing", category: "MAJOR_REQ", term: "1/72", difficulty: 2 },
  { code: "MKT4201", name_th: "การวิจัยการตลาด", name_en: "Marketing Research", category: "MAJOR_REQ", term: "2/72", difficulty: 3 },
  { code: "MKT4207", name_th: "การตลาดระดับโลก", name_en: "Global Marketing", category: "MAJOR_REQ", term: "2/72", difficulty: 2 },
  { code: "MKT4208", name_th: "การจัดการกลยุทธ์การตลาด", name_en: "Marketing Strategy Management", category: "MAJOR_REQ", term: "1/73", difficulty: 3 },

  // ========== Major Elective — เอกเลือก (choose 7 = 21 credits) ==========
  { code: "MKT2307", name_th: "การตลาดบริการ", name_en: "Services Marketing", category: "MAJOR_ELEC", choose_group: "MAJOR_ELEC" },
  { code: "MKT3307", name_th: "การตลาดทางตรง", name_en: "Direct Marketing", category: "MAJOR_ELEC", choose_group: "MAJOR_ELEC" },
  { code: "MKT3313", name_th: "การขายโดยบุคคล", name_en: "Personal Selling", category: "MAJOR_ELEC", choose_group: "MAJOR_ELEC" },
  { code: "MKT3319", name_th: "การจัดการตราสินค้า", name_en: "Brand Management", category: "MAJOR_ELEC", choose_group: "MAJOR_ELEC" },
  { code: "MKT3321", name_th: "นวัตกรรมผลิตภัณฑ์และการบรรจุภัณฑ์", name_en: "Product and Packaging Innovation", category: "MAJOR_ELEC", choose_group: "MAJOR_ELEC" },
  { code: "MKT3322", name_th: "กลยุทธ์การโฆษณาและการส่งเสริมการขาย", name_en: "Advertising and Sale Promotion Strategy", category: "MAJOR_ELEC", choose_group: "MAJOR_ELEC" },
  { code: "MKT3328", name_th: "การตลาดการท่องเที่ยวและโรงแรม", name_en: "Tourism and Hotel Marketing", category: "MAJOR_ELEC", choose_group: "MAJOR_ELEC" },
  { code: "MKT3329", name_th: "การจัดการค้าปลีกค้าส่งสมัยใหม่", name_en: "Modern Retail and Wholesale Management", category: "MAJOR_ELEC", choose_group: "MAJOR_ELEC" },
  { code: "MKT4303", name_th: "โลจิสติกส์และโซ่อุปทานทางการตลาด", name_en: "Marketing Logistics and Supply Chain", category: "MAJOR_ELEC", choose_group: "MAJOR_ELEC" },
  { code: "MKT4305", name_th: "การส่งเสริมการตลาดเพื่อการส่งออก", name_en: "Marketing Promotion for Export", category: "MAJOR_ELEC", choose_group: "MAJOR_ELEC" },
  { code: "MKT4308", name_th: "การตลาดเกษตรกรรม", name_en: "Agricultural Marketing", category: "MAJOR_ELEC", choose_group: "MAJOR_ELEC" },
  { code: "MKT4311", name_th: "การตลาดเพื่อสังคม", name_en: "Social Marketing", category: "MAJOR_ELEC", choose_group: "MAJOR_ELEC" },
  { code: "MKT4312", name_th: "การจัดการโครงการการตลาด", name_en: "Marketing Project Management", category: "MAJOR_ELEC", choose_group: "MAJOR_ELEC" },
  { code: "MKT4314", name_th: "การตลาดอุตสาหกรรม", name_en: "Industrial Marketing", category: "MAJOR_ELEC", choose_group: "MAJOR_ELEC" },
  { code: "MKT4316", name_th: "สัมมนาการตลาด", name_en: "Seminar in Marketing", category: "MAJOR_ELEC", choose_group: "MAJOR_ELEC" },
  { code: "MKT4317", name_th: "ระบบสารสนเทศทางการตลาด", name_en: "Marketing Information System", category: "MAJOR_ELEC", choose_group: "MAJOR_ELEC" },
  { code: "MKT4321", name_th: "การตลาดกีฬาและบันเทิง", name_en: "Sport and Entertainment Marketing", category: "MAJOR_ELEC", choose_group: "MAJOR_ELEC" },
  { code: "MKT4322", name_th: "การวิเคราะห์เชิงปริมาณทางการตลาด", name_en: "Quantitative Analysis in Marketing", category: "MAJOR_ELEC", choose_group: "MAJOR_ELEC" },
  { code: "MKT4323", name_th: "การจัดการลูกค้าสัมพันธ์", name_en: "Customer Relationship Management", category: "MAJOR_ELEC", choose_group: "MAJOR_ELEC" },
  { code: "MKT4324", name_th: "การจัดการตลาดแนวทางเศรษฐกิจพอเพียง", name_en: "Marketing Management in Sufficiency Economy Approach", category: "MAJOR_ELEC", choose_group: "MAJOR_ELEC" },
  { code: "MKT4328", name_th: "การตลาดสำหรับองค์การไม่มุ่งหวังกำไร", name_en: "Marketing for Non-Profit Organization", category: "MAJOR_ELEC", choose_group: "MAJOR_ELEC" },
  { code: "MKT4329", name_th: "นวัตกรรมทางการตลาด", name_en: "Marketing Innovation", category: "MAJOR_ELEC", choose_group: "MAJOR_ELEC" },
  { code: "MKT4330", name_th: "การวิเคราะห์ตลาด", name_en: "Marketing Analytics", category: "MAJOR_ELEC", choose_group: "MAJOR_ELEC" },
  { code: "DBC3111", name_th: "กิจกรรมและการจัดแสดงสินค้ายุคดิจิทัล", name_en: "Event and Digital Merchandise Display", category: "MAJOR_ELEC", choose_group: "MAJOR_ELEC" },
  { code: "DBC3112", name_th: "สื่อใหม่เพื่อธุรกิจยุคดิจิทัล", name_en: "New Media for Digital Business Communication", category: "MAJOR_ELEC", choose_group: "MAJOR_ELEC" },

  // ========== Free Elective — เลือกเสรี (6 credits) ==========
  { code: "FIN4319", name_th: "การจัดการการเงินส่วนบุคคล", name_en: "Personal Financial Management", category: "FREE" },
];

// ---------- Plan terms (8 regular semesters, no summer) ----------
const PLAN_TERMS: Array<{ term_id: string; ord: number; max_credits: number; start_date: string | null }> = [
  { term_id: "2/69", ord: 0, max_credits: 24, start_date: "2026-11-16" },
  { term_id: "1/70", ord: 1, max_credits: 18, start_date: null },
  { term_id: "2/70", ord: 2, max_credits: 15, start_date: null },
  { term_id: "1/71", ord: 3, max_credits: 15, start_date: null },
  { term_id: "2/71", ord: 4, max_credits: 18, start_date: null },
  { term_id: "1/72", ord: 5, max_credits: 18, start_date: null },
  { term_id: "2/72", ord: 6, max_credits: 12, start_date: null },
  { term_id: "1/73", ord: 7, max_credits: 12, start_date: null },
];

// ---------- Placeholders (major electives + free electives, no codes yet) ----------
const PLACEHOLDERS: Array<{ label: string; term: string }> = [
  { label: "เอกเลือก #1", term: "2/71" },
  { label: "เอกเลือก #2", term: "2/71" },
  { label: "เอกเลือก #3", term: "1/72" },
  { label: "เลือกเสรี #1", term: "1/72" },
  { label: "เอกเลือก #4", term: "2/72" },
  { label: "เอกเลือก #5", term: "2/72" },
  { label: "เอกเลือก #6", term: "1/73" },
  { label: "เอกเลือก #7", term: "1/73" },
  { label: "เลือกเสรี #2", term: "1/73" },
];

// ---------- Class schedule 2/2569 ----------
// Source: มร.30 (26 ส.ค. 2569) + ตารางสอบไล่ ภาค 2/2569
type ClassSeed = {
  code: string; weekday: number; start: string; end: string; room: string;
  instructor: string; examDate: string; slot: "A" | "B";
};
const SCHEDULE_2_69: ClassSeed[] = [
  { code: "RAM1111", weekday: 1, start: "08:30", end: "11:00", room: "KTB 301", instructor: "ASST.PROF.TIPPA-U-SA", examDate: "2027-03-14", slot: "B" },
  { code: "ACC1103", weekday: 1, start: "11:10", end: "13:40", room: "KTB 301", instructor: "DR.NATCHAREE", examDate: "2027-03-12", slot: "A" },
  { code: "ECO1121", weekday: 2, start: "13:50", end: "16:20", room: "KTB 201", instructor: "ASSOC.PROF.BOONTHAM", examDate: "2027-03-21", slot: "A" },
  { code: "MGT2101", weekday: 3, start: "09:30", end: "11:20", room: "VPB 501", instructor: "ASST.PROF.DR.MUNLIKAR", examDate: "2027-03-18", slot: "B" },
  { code: "RAM1212", weekday: 3, start: "13:50", end: "16:20", room: "KTB 401", instructor: "ASST.PROF.DR.NANTHAWAN", examDate: "2027-03-16", slot: "B" },
  { code: "MKT2101", weekday: 4, start: "09:30", end: "11:20", room: "KLB 201", instructor: "DR.USA, THITIKUL", examDate: "2027-03-13", slot: "B" },
  { code: "RAM1301", weekday: 5, start: "09:30", end: "11:20", room: "KLB 201", instructor: "ASSOC.PROF.DR.KRISDA", examDate: "2027-03-10", slot: "B" },
  { code: "RAM1131", weekday: 5, start: "11:10", end: "13:40", room: "KTB 301", instructor: "ASST.PROF.DR.SATHIT", examDate: "2027-03-09", slot: "A" },
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
  db.pragma("foreign_keys = OFF");
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
      "INSERT INTO plan_terms (term_id, ord, max_credits, start_date) VALUES (@term_id, @ord, @max_credits, @start_date)",
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
      `INSERT INTO class_sessions (course_code, term_id, weekday, start_time, end_time, room, instructor)
       VALUES (@code, '2/69', @weekday, @start, @end, @room, @instructor)`,
    );
    const insExam = db.prepare(
      `INSERT INTO exams (course_code, term_id, datetime_start, datetime_end, slot, location)
       VALUES (@code, '2/69', @start, @end, @slot, @room)`,
    );
    for (const s of SCHEDULE_2_69) {
      insClass.run({ code: s.code, weekday: s.weekday, start: s.start, end: s.end, room: s.room, instructor: s.instructor });
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
  db.pragma("foreign_keys = ON");
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
