# StudyOS — สรุปสถานะโปรเจกต์

อัปเดตล่าสุด: 2026-10-26

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

---

## ทำค้างไว้ (In Progress)

### Phase 3 — วางแผนอ่านย้อนจากวันสอบ (Study Planner)
- **เสร็จแล้ว**: migration 007 + studyplan.ts (backend algorithm + router)
- **ยังไม่ได้ทำ**: mount router ใน index.ts, frontend (StudyPlan screen), i18n, wiring เข้า More hub, ทดสอบ
- **ส่งต่อไปทำใน session แยก**

### Phase 13 — สอบจำลองอัปเกรด (เสร็จแล้ว)
- ตั้งค่าจำนวนข้อ/เวลา/เลือกบท ก่อนเริ่มสอบ
- ตารางเลขข้อ (grid) + ปักธง (flag) + นำทางข้อไหนก็ได้
- Auto-save ทั้ง localStorage + server (กลับมาทำต่อได้หลังปิดเบราว์เซอร์)
- เวลาที่ใช้ต่อข้อ + เวลารวม
- เกณฑ์ตัดเกรดกำหนดเอง (A/B+/B/C+/C/D+/D/F)
- คะแนนแยกตามบท + กราฟแนวโน้มคะแนน
- ประวัติสอบ + แท็บตั้งค่า

### รอคิว (Planned)
- Phase 5 — ถอดเสียงบรรยาย → สรุป + ควิซ (ต้องเลือก speech-to-text API ก่อน)

---

## บั๊กที่รู้อยู่ (Known Bugs)

1. **ยังไม่มีบั๊กที่พบ** — Phase 11 ผ่านการทดสอบในเบราว์เซอร์ API ทุก endpoint ตอบ 200 OK
2. **ข้อจำกัด**: หน้า Weakness ยังไม่มีข้อมูลจริงให้ทดสอบกราฟ (ต้องทำควิซและทบทวนการ์ดก่อน)
3. **Pre-existing**: มีไฟล์ที่ยังไม่ได้ commit จาก phase ก่อนหน้า (HandwritingPad.tsx, Notes.tsx, fly.toml, ai.ts, notes.ts)

---

## Code Cleanup ที่ทำแล้ว (Phase 11)

1. ✅ Weakness.tsx: ย้าย `Math.max()` ออกนอก render loop → แก้ O(n²)
2. ✅ Review.tsx: capture card id ก่อน POST → กัน race condition
3. ✅ flashcards.ts: wrap review ใน transaction → ข้อมูลครบหรือไม่เขียนเลย
4. ✅ Weakness.tsx: รวม masteryColor + masteryBarColor → ฟังก์ชันเดียว
5. ✅ Review.tsx: ใช้ t() interpolation แทน .replace() → pattern สม่ำเสมอ

---

## ขั้นตอนถัดไป (Next Steps)

1. Phase 6 — ติดตามหน่วยกิต/เกรด/แผนเรียนจบ (GPA tracking)
2. Phase 5 — ถอดเสียงบรรยาย (ต้องเลือก API + confirm ค่าใช้จ่าย)
3. Phase 7 — ออกแบบหน้าตาใหม่ (UI redesign — ทำหลังสุด)
