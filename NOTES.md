# StudyOS — สรุปสถานะโปรเจกต์

อัปเดตล่าสุด: 2026-11-02

---

## เสร็จแล้ว (Completed)

### Phase 0–9 (เดิม)
- Setup, DB+Seed, Today+Schedule, Notes→AI Summary, Quiz+Grading
- Flashcards (Leitner), Tracker & Analytics, Degree Planner
- Mock Exam Mode, PWA+Deploy

### Phase 10 — Document Upload + Quiz from Real Content
- อัปโหลด PDF → ดึงข้อความ + OCR fallback (Claude vision)
- จัดบทเนื้อหา (chapters) + AI แนะนำบท
- ควิซจากเนื้อหาจริง เลือกบท/ความยาก/รูปแบบ
- แยกข้อสอบเก่า (past exam parsing)

### Phase 11 — SM-2 Spaced Repetition + Confidence Tracking
- แทนที่ Leitner boxes ด้วย SM-2 algorithm
- ปุ่มความมั่นใจ 4 ระดับ (ลืมหมด/ยากมาก/ยาก/จำได้)
- จำกัดรอบทบทวนรายวัน (ค่าเริ่มต้น 30)
- คะแนนความชำนาญรายบท (chapter mastery)
- หน้าจุดอ่อน (Weakness summary) พร้อมกราฟ

### Phase 12 — Study Planner (เสร็จแล้ว)
- วางแผนอ่านย้อนจากวันสอบ (backward scheduling)
- daily tasks + auto-reschedule + ICS export
- backend + frontend + wired into More hub

### Phase 13 — สอบจำลองอัปเกรด (เสร็จแล้ว)
- ตั้งค่าจำนวนข้อ/เวลา/เลือกบท ก่อนเริ่มสอบ
- ตารางเลขข้อ (grid) + ปักธง (flag) + นำทางข้อไหนก็ได้
- Auto-save ทั้ง localStorage + server (กลับมาทำต่อได้หลังปิดเบราว์เซอร์)
- เวลาที่ใช้ต่อข้อ + เวลารวม
- เกณฑ์ตัดเกรดกำหนดเอง (A/B+/B/C+/C/D+/D/F)
- คะแนนแยกตามบท + กราฟแนวโน้มคะแนน
- ประวัติสอบ + แท็บตั้งค่า

### Phase 14 — ติดตาม GPA / หน่วยกิต / แผนจบ (เสร็จแล้ว)
- เกรดเฉลี่ยสะสม (GPA) + เกรดเฉลี่ยรายเทอม
- เลือกเกรดรายวิชา (dropdown) เมื่อสถานะ = ผ่าน
- ความเร็วจบ: กำลังดี / ค่อนข้างหนัก / ต้องเร่ง
- ลองคำนวณ "ถ้าได้เกรด..." (what-if calculator)
- เกณฑ์ให้เกรด (grade scale) แก้ไขได้

---

## สิ่งที่เปลี่ยนรอบนี้ (2026-11-02)

### เปลี่ยนสาขาจากจิตวิทยามาเป็นการตลาด (B.B.A.)
- ลบวิชา PSY ทั้งหมด เปลี่ยนเป็นหลักสูตรการตลาด ม.รามคำแหง (87 วิชา, 132 หน่วยกิต)
- แผน 8 เทอม: GE 30 + แกนธุรกิจ 42 + เอกบังคับ 33 + เอกเลือก 21 + เสรี 6
- ข้อมูลเทอม 2/69 จาก มร.30 (ประกาศ 26 ส.ค. 2569):
  - 8 วิชา 24 หน่วยกิต: RAM1111, RAM1131, RAM1212, RAM1301, ACC1103, ECO1121, MKT2101, MGT2101
  - ตารางเรียน: วัน/เวลา/ห้อง/อาจารย์ครบทุกวิชา
  - ตารางสอบ: 9–21 มี.ค. 2570 ครบทุกวิชา
- แก้ DB path bug: env.ts resolve relative DB_PATH ให้ถูกที่ (ก่อนหน้านี้ seed เขียนไป server/data/ แทน data/)
- migration 012: เพิ่ม instructor column ใน class_sessions
- AI system prompt เปลี่ยนเป็น Marketing student

---

## รอคิว (Planned)

- Phase 5 — ถอดเสียงบรรยาย → สรุป + ควิซ (ต้องเลือก speech-to-text API ก่อน)

---

## บั๊กที่รู้อยู่ (Known Bugs)

1. **ยังไม่มีบั๊กที่พบ** — ทดสอบในเบราว์เซอร์ ข้อมูลแสดงถูกต้องทุกหน้า
2. **ข้อจำกัด**: หน้า Weakness ยังไม่มีข้อมูลจริงให้ทดสอบกราฟ (ต้องทำควิซและทบทวนการ์ดก่อน)
