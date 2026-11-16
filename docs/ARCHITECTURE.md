# StudyOS ทำงานยังไง (อธิบายง่าย ๆ)

> เอกสารนี้อธิบายภาพรวมของระบบแบบให้เด็ก 12 ขวบก็เข้าใจ
> จะอัปเดตเพิ่มทุกครั้งที่จบเฟส

## StudyOS คืออะไร
แอปช่วยเรียนส่วนตัว (นักศึกษาการตลาด บธ.บ. ม.รามคำแหง) ใช้บนมือถือเป็นหลัก ทำ 5 อย่าง:
1. รู้จักหลักสูตรของเรา (วิชา, วิชาบังคับก่อน, แผน 8 เทอม, หน่วยกิต)
2. รู้ว่าสัปดาห์นี้มีอะไร (ตารางเรียน, วันสอบ, วันนี้ควรอ่านอะไร)
3. เปลี่ยนโน้ตเป็นการเรียนรู้ (ถ่ายรูป/พิมพ์ → AI ย่อเป็นไทยง่าย ๆ → AI ถามเรา → ตรวจคำตอบ)
4. ทำให้เราจำได้ (แฟลชการ์ดจากข้อที่เราตอบผิด)
5. บอกความจริง (ชั่วโมงอ่าน, คะแนน, จุดอ่อน, ความเสี่ยงสอบตก)

## หลักการสำคัญ
AI ช่วยเรา "ฝึก" ไม่ใช่ "ทำแทน" — มันแค่ (1) ย่อเนื้อหา (2) ตั้งคำถาม (3) ตรวจคำตอบ
คำตอบจะไม่โผล่ก่อนเราตอบเอง และเนื้อหาที่ AI เพิ่มเองจะติดป้าย
`[นอกโน้ต — ตรวจกับตำราก่อน]` เสมอ เพราะตำรารามฯ คือความจริงหลัก

## บ้านของระบบมี 2 ส่วน
เหมือนร้านอาหาร: **หน้าร้าน (client)** กับ **ครัว (server)**

### 1) หน้าร้าน = client (React)
คือหน้าจอที่เราเห็นและกดบนมือถือ เขียนด้วย React + Tailwind (ตัวช่วยแต่งหน้าตา)
เปิดตอนพัฒนาได้ที่ `http://localhost:5180`

### 2) ครัว = server (Express)
คือสมองหลังบ้าน คอยรับคำสั่งจากหน้าร้าน เช่น "ขอตารางวันนี้" แล้วไปหยิบข้อมูล
จากฐานข้อมูลมาให้ และเป็นคนเดียวที่คุยกับ AI (ผ่านไฟล์ `server/src/ai.ts`)
เปิดตอนพัฒนาได้ที่ `http://localhost:3100`

หน้าร้านกับครัวคุยกันผ่านที่อยู่ที่ขึ้นต้นด้วย `/api` (เช่น `/api/health`)

### 3) ตู้เก็บของ = data/
- ฐานข้อมูล SQLite (ไฟล์เดียว `studyos.db`) เก็บวิชา, โน้ต, การ์ด, คะแนน ฯลฯ
- โฟลเดอร์ `uploads/` เก็บรูปโน้ตที่เราถ่าย
- โฟลเดอร์ `backups/` เก็บสำเนาสำรองของฐานข้อมูล

## เฟส 0 ทำอะไรไปแล้ว (setup)
สร้าง "โครงบ้าน" ให้พร้อม ยังไม่มีฟีเจอร์จริง:
- วางโครงโฟลเดอร์ client / server / data / docs
- ทำหน้าจอทดสอบ 1 หน้า ที่เช็กว่าหน้าร้านคุยกับครัวได้ (เรียก `/api/health`)
- ตั้งค่า TypeScript, Tailwind, ไฟล์ `.env.example`, และคำสั่ง `dev/build/test`
- ยังไม่มีฐานข้อมูลจริง (จะสร้างในเฟส 1)

## เฟส 1 ทำอะไรไปแล้ว (Database + Seed + 2 ภาษา)
สร้าง "ตู้เก็บของ" จริง และเติมข้อมูลหลักสูตรเข้าไป:
- **ตารางฐานข้อมูล** (ไฟล์ `server/migrations/001_init.sql`): วิชา, วิชาบังคับก่อน,
  แผน 9 เทอม, ตารางเรียน, วันสอบ, โน้ต, คำถาม, การ์ด, สถิติ ฯลฯ
  ระบบจะสร้างตารางให้อัตโนมัติตอนเปิดเซิร์ฟเวอร์ (ผ่าน `server/src/db.ts`)
- **ใส่ข้อมูลจริง** (`server/src/seed.ts`, สั่งด้วย `npm run seed`):
  38 วิชา · 46 ช่องในแผน 9 เทอม (รวม 138 หน่วยกิต) · ตารางเรียน 7 วิชา + วันสอบ เทอม 2/69
- **เทสต์ตรวจความถูกต้อง** (`npm test`, ผ่าน 6/6):
  หน่วยกิตรวม = 138 · วิชาบังคับก่อนอยู่เทอมก่อนวิชาที่ต้องใช้เสมอ ·
  ไม่มีเทอมไหนเกินเพดาน · วิชาซัมเมอร์ไม่พึ่งเทอมก่อนหน้าติดกัน · หน่วยกิตแยกหมวดถูกต้อง

### เรื่องที่ "ไม่มโน" (ตามกฎ)
- วิชาเอกเลือก 7 ช่อง และเลือกเสรี 2 ช่อง เป็น "ช่องว่าง" (placeholder) รอเลือกจริง

## ระบบ 2 ภาษา (ไทย/อังกฤษ)
- อยู่ในไฟล์เดียว `client/src/i18n.tsx` เขียนเอง ไม่ใช้ไลบรารีนอก
- มีปุ่มสลับ **ไทย/EN** มุมขวาบน กดแล้วเปลี่ยนทันที และ**จำภาษาที่เลือกไว้** (เก็บใน localStorage)
- แปลเฉพาะ "ป้าย/ปุ่ม" ของแอป — **ชื่อวิชายังเป็นไทย** เพราะยังไม่มีชื่ออังกฤษทางการ

## เฟส 2 ทำอะไรไปแล้ว (Today + Schedule)
ทำ 3 หน้าจอหลัก มีแถบเมนูล่าง สลับได้ (แปลไทย/อังกฤษครบ):
- **หน้า "วันนี้"** (`client/src/screens/Today.tsx`): คาบเรียนวันนี้+ห้อง ·
  นับถอยหลังวันสอบครั้งถัดไป · จำนวนการ์ดที่ต้องทวน · เป้าอ่านหนังสือต่อวิชา
- **หน้า "สัปดาห์"** (`Week.tsx`): ตารางเรียนทั้งสัปดาห์ จัดกลุ่มตามวัน
- **หน้า "สอบ"** (`Exams.tsx`): รายการสอบเรียงตามวันที่ + แบนเนอร์เตือน "วันสอบชนกัน"

### เป้าอ่านหนังสือคิดยังไง (ระบบแต้ม)
ความยากวิชา = แต้ม (ยาก 3 = 3 แต้ม, กลาง = 2, ง่าย = 1)
เป้ารวมต่อสัปดาห์ (ตั้งค่าได้ เริ่มต้น 36 ชม.) ÷ แต้มรวมของวิชาในเทอม = ชม.ต่อแต้ม
แล้ววิชาไหนยากกว่าก็ได้ชั่วโมงมากกว่า · เป้าต่อวัน = เป้าต่อสัปดาห์ ÷ 7
เทอม 2/69: แต้มรวม 9 → 36÷9 = 4 ชม./แต้ม

### วันที่แบบไทย/อังกฤษ
ไฟล์ `client/src/format.ts` แสดงวันที่เป็น **พ.ศ.** เมื่อภาษาไทย (เช่น "9 มี.ค. 2570")
และ **ค.ศ.** เมื่อภาษาอังกฤษ (เช่น "9 Mar 2027") ทุกอย่างคิดตามเวลาไทย (Asia/Bangkok)

### API ที่เพิ่ม (ครัวมีเมนูใหม่)
`/api/today` · `/api/schedule/week` · `/api/exams` (รวมการตรวจวันสอบชนกัน)
เทอมปัจจุบัน + เป้าชั่วโมง เก็บในตาราง `settings` (แก้ได้ทีหลัง)

หมายเหตุ: ตารางเรียนเป็นแบบ "ประจำสัปดาห์" หน้า "วันนี้" จึงโชว์คาบตามวันในสัปดาห์

## เฟส 3 ทำอะไรไปแล้ว (Notes → AI Summary)
แท็บใหม่ **"โน้ต"** — เปลี่ยนสิ่งที่จดเป็นสื่อช่วยเรียน:
- เพิ่มโน้ตได้ 2 แบบ: **พิมพ์ข้อความ** หรือ **ถ่ายรูป/แนบรูป** (กล้องมือถือ) + เลือกวิชา
- AI (Claude) คืน 4 อย่าง: สรุปไทยง่าย ๆ (≤300 คำ) · คำศัพท์สำคัญ · mind map · แท็กหัวข้อ
- โชว์แบนเนอร์เตือน **"AI อาจผิดได้ — ยึดตำรารามฯ เป็นหลัก"** ทุกครั้ง
- บันทึกโน้ต + ผล AI ลงฐานข้อมูล และเก็บแท็กหัวข้อไว้ใช้เฟส 6

### AI ทำงานยังไง (ไฟล์เดียว `server/src/ai.ts`)
- ทุกการเรียก AI ผ่านไฟล์นี้ที่เดียว (สลับรุ่นโมเดลได้ที่เดียว)
- ขอผลเป็น **JSON** แล้วตรวจความถูกต้องด้วย zod — ถ้าเพี้ยน **ลองใหม่ 1 ครั้ง** ถ้ายังพังก็ขึ้น error ไทย
- นับ token ทุกครั้งเก็บใน `ai_usage` (ดูค่าใช้จ่ายรวมได้ที่ `/api/ai/usage`)
- รูปถูก**ย่อ**ก่อนส่ง AI (ไฟล์ `sharp`, ด้านยาว ≤1568px) และเก็บไว้ที่ `data/uploads`

### ⚠️ ต้องใส่ API key ก่อนใช้จริง
1. คัดลอก `.env.example` เป็น `.env`
2. ใส่ค่า `ANTHROPIC_API_KEY=...` (ขอจาก console.anthropic.com)
3. รันใหม่ `npm run dev` แล้วลองเพิ่มโน้ต — ถ้ายังไม่ใส่ key จะขึ้นข้อความไทยเตือน

## เฟส 4 ทำอะไรไปแล้ว (Quiz Me + Grading)
แท็บใหม่ **"ทดสอบ"** 🎯 — ฝึกด้วยข้อสอบที่ AI ออกจากโน้ตของเราเอง:
- เลือกแหล่ง: **จากโน้ต 1 อัน** หรือ **จากทั้งวิชา** → AI ออกข้อสอบ 10 ข้อ (อัตนัย+ปรนัย)
- **ทำทีละข้อ ต้องพิมพ์/เลือกคำตอบก่อน ถึงจะเห็นเฉลย** (กันโกงที่ server — เฉลยไม่ถูกส่งมาก่อน)
- ปรนัยตรวจแบบเป๊ะ (ถูก=2, ผิด=0) · อัตนัยให้ AI ตรวจให้คะแนน 0/1/2 + บอกจุดที่ขาด
- **ข้อไหนได้ 0 หรือ 1 → สร้างแฟลชการ์ดอัตโนมัติ** (กล่อง 1 ทวนพรุ่งนี้) ถ้ามีอยู่แล้วรีเซ็ตกลับกล่อง 1
- จบชุดมีหน้าสรุป: คะแนนรวม + จำนวนการ์ดที่สร้าง

### กันโกงยังไง
เวลา "ออกข้อสอบ" server บันทึกเฉลยไว้ในฐานข้อมูล แต่**ส่งเฉพาะคำถามให้จอ** ไม่ส่งเฉลย
เฉลยจะถูกส่งกลับก็ต่อเมื่อเรากด "ส่งคำตอบ" แล้วเท่านั้น

## เฟส 5 ทำอะไรไปแล้ว (Flashcards — ทบทวนแบบเว้นช่วง)
แท็บใหม่ **"ทวน"** 🔁 — ทวนการ์ดที่มาจากข้อที่เราตอบผิดในควิซ:
- ระบบ **Leitner 5 กล่อง**: ตอบถูก **เลื่อนขึ้น 1 กล่อง** (สูงสุดกล่อง 5), ตอบผิด **กลับกล่อง 1**
- วันทวนถัดไปตามกล่อง: กล่อง 1=1 วัน · 2=3 วัน · 3=7 วัน · 4=14 วัน · 5=30 วัน
- หน้า "ทวนวันนี้": การ์ดพลิกดูเฉลย แล้ว **ปัดขวา=จำได้ / ปัดซ้าย=ยังไม่ได้** (หรือกดปุ่ม) ใช้มือเดียวได้
- โชว์เฉพาะการ์ดที่ครบกำหนด (วันทวน ≤ วันนี้) จบแล้วมีหน้าสรุป

### ทำไมถึงช่วยให้จำ
ยิ่งจำได้ การ์ดยิ่งอยู่กล่องสูง เว้นช่วงทวนนานขึ้น (ไม่ต้องทวนบ่อย)
พอลืม (ตอบผิด) การ์ดเด้งกลับกล่อง 1 ให้ทวนถี่ ๆ อีกครั้ง — ทวนเฉพาะสิ่งที่ยังไม่แม่น

## เฟส 6 ทำอะไรไปแล้ว (Tracker & Analytics)
- จัดเมนูใหม่ให้ไม่แน่น: รวม "สัปดาห์+สอบ" เป็นแท็บ **"ตาราง"** (สลับข้างในได้) → เพิ่มแท็บ **"สถิติ"** 📊
- **จับเวลา Pomodoro** (โฟกัส 45 นาที / พัก 10 นาที): เลือกวิชา กดเริ่ม พอครบรอบโฟกัส
  บันทึกชั่วโมงลง `study_sessions` อัตโนมัติ (หรือกด "จบและบันทึก" เพื่อบันทึกเวลาที่อ่านไปแล้ว)
- **วิเคราะห์รายวิชา** (เทอมปัจจุบัน): เป้าชั่วโมง vs ชั่วโมงจริงสัปดาห์นี้ · คะแนนควิซเฉลี่ย ·
  จุดอ่อน 3 อันดับ (จากคะแนนตามหัวข้อ) · วันถึงสอบ · **ธงความเสี่ยง แดง/เหลือง/เขียว**

### สูตรธงความเสี่ยง (risk flag)
คิดคะแนนความเสี่ยง 0–100 (ยิ่งมากยิ่งเสี่ยง) จาก 3 ส่วนบวกกัน:
1. **ความขยัน** (ชั่วโมงจริง ÷ เป้า): ≥0.8 → 0 · 0.5–0.8 → 15 · <0.5 → 30
2. **ผลควิซ** (คะแนนเฉลี่ย %): ≥70 → 0 · 50–70 → 15 · <50 → 30 · ยังไม่มีข้อมูล → 10
3. **ความใกล้สอบ** (วันถึงสอบ): ≤7 วัน → 25 · 8–21 วัน → 12 · มากกว่านั้น → 0

รวมแล้ว: **เขียว** < 25 · **เหลือง** 25–49 · **แดง** ≥ 50
(อ่านหนังสือครบเป้า + ทำควิซได้ดี = ธงเขียว · ปล่อยไว้ใกล้สอบ = ธงแดง)

หมายเหตุ: สัปดาห์เริ่มนับวันจันทร์ (เวลาไทย)

## เฟส 7 ทำอะไรไปแล้ว (Degree Planner)
- จัดเมนูใหม่: เหลือ 5 แท็บหลัก (วันนี้/โน้ต/ทดสอบ/ทวน) + แท็บ **"เพิ่มเติม" ⋯**
  ข้างในมี: ตารางเรียน/สอบ · สถิติ · **แผนการเรียน** (เผื่อ Phase 8-9 ใส่ต่อได้)
- **แผน 9 เทอม** เห็นภาพ: แต่ละเทอมโชว์หน่วยกิต/เพดาน + หน่วยกิตสะสม (ไล่ถึง 138)
- **ทำเครื่องหมายผ่าน/ตก** แต่ละวิชา (dropdown) → บันทึกลงตาราง `enrollments`
- **สอบตกแล้วเกิดอะไร:** โชว์วิชาที่ถูกบล็อก (วิชาที่มีวิชานั้นเป็นบังคับก่อน) + แนะเทอมลงซ้ำ
- **หน่วยกิตแยกหมวด:** GE 30 · แกนธุรกิจ 42 · เอกบังคับ 33 · เอกเลือก 21 · เสรี 6 (รวม 132)

หมายเหตุ: วิชาโท/เลือกเสรียังเป็น "ช่องว่าง" (ยังไม่เลือกวิชาจริง) หน่วยกิตหมวดนี้จึงเป็น 0
จนกว่าจะเพิ่มวิชาจริงเข้าไป

## เฟส 8 ทำอะไรไปแล้ว (Mock Exam Mode)
เพิ่ม **"ข้อสอบจำลอง"** ในแท็บ "เพิ่มเติม" — ซ้อมสอบเสมือนจริงก่อนสอบ:
- **เปิดให้ทำ 21 วันก่อนสอบ** ของวิชานั้น (ก่อนหน้านั้นล็อกไว้ บอกว่าอีกกี่วันจะเปิด)
- สร้างข้อสอบ (สูงสุด 40 ข้อ / 90 นาที) จาก **คลังข้อสอบของวิชา** (ข้อที่เคยออกในควิซ)
  **ถ่วงน้ำหนักเน้นจุดอ่อน** (หัวข้อคะแนนต่ำ) **+ การ์ดกล่องต่ำ** (ข้อที่ยังไม่แม่น)
- **จับเวลานับถอยหลัง** ทำทีละข้อ ไม่โชว์เฉลยจนจบ (หมดเวลาส่งอัตโนมัติ)
- ตรวจผ่านเส้นทางเดิม (`/api/quiz/answer`) → ข้อที่พลาดกลายเป็นแฟลชการ์ดอัตโนมัติ
- หน้าผล: คะแนนรวม + จุดอ่อนที่ควรทบทวน

### การเลือกข้อ (ถ่วงน้ำหนัก)
แต่ละข้อได้คะแนนน้ำหนัก = 1 + (มีการ์ดกล่อง ≤2 ? +3) + (อยู่หัวข้อจุดอ่อน ? +2)
แล้วเรียงมาก→น้อย เลือกมาก่อน → ข้อที่ยังไม่แม่นมีโอกาสออกมากกว่า

หมายเหตุ: ต้องมีคลังข้อสอบก่อน (ทำควิซของวิชานั้นสะสมไว้)

## เฟส 9 ทำอะไรไปแล้ว (PWA + Deploy + Login)
- **ล็อกอินผู้ใช้เดียว**: ใส่รหัสผ่าน (จาก `APP_PASSWORD`) → ได้ cookie เซสชัน
  API ทุกเส้น (ยกเว้น health/login) ต้องล็อกอินก่อน · มีปุ่มออกจากระบบใน "เพิ่มเติม"
- **PWA**: ติดตั้งลงหน้าจอมือถือได้ (manifest + ไอคอน) · service worker แคชแอปไว้
  เปิดออฟไลน์ได้ · หน้า "วันนี้" กับ "ทวน" จำข้อมูลล่าสุดไว้ดูตอนไม่มีเน็ต
- **โหมด production**: เซิร์ฟเวอร์เสิร์ฟหน้าเว็บที่ build แล้วเอง (ไฟล์เดียวจบ)
- **สำรองข้อมูลรายวัน**: คัดลอกฐานข้อมูลไป `/data/backups/` ทุกวัน เก็บ 14 ไฟล์ล่าสุด
- **Deploy**: `Dockerfile` + `fly.toml` (Fly.io สิงคโปร์ + volume `/data`) +
  คู่มือ `docs/DEPLOY.md` (ไทย ทีละขั้น) · ครั้งแรกใส่ข้อมูลหลักสูตรให้อัตโนมัติ

## ปรับปรุงเพิ่มเติม (หลังครบ 9 เฟส)
- **โน้ตเขียนด้วยปากกาได้**: ในหน้าเพิ่มโน้ตมีปุ่มสลับ "พิมพ์ / เขียนด้วยปากกา"
  โหมดเขียนเป็นกระดานวาด (ปากกา/นิ้ว) เหมาะจดสดในคาบ — ตอนส่งจะแปลงลายมือเป็นรูป
  ส่งให้ AI อ่าน (`client/src/components/HandwritingPad.tsx`)
- **ปุ่มกล้องแยกชัด**: "📷 ถ่ายรูป" (เปิดกล้องมือถือ) กับ "🖼️ แนบรูป" (เลือกจากคลัง)
  แนบได้หลายรูป มีรูปย่อ + ปุ่มลบ
- **ชื่อวิชา 2 ภาษา + รหัส**: แสดง `(รหัส) ชื่อภาษาหลัก` พร้อมชื่ออีกภาษาตัวเล็กจางใต้ ๆ
  สลับตามภาษาที่เลือก (`client/src/components/CourseTitle.tsx`)
  ชื่ออังกฤษตอนนี้เป็น**ชื่อทางการ**จาก catalog ที่น้ำพลอยส่งมา
- **โหลด catalog วิชาทางการเต็มชุด**: ตาราง `courses` มี 87+ วิชา (รวมวิชาที่ไม่ได้อยู่ในแผน
  เช่น ภาษาเลือกอื่น ๆ / เอกเลือกที่ไม่ได้เลือก) พร้อม
  `choose_group` (กลุ่ม "เลือก N วิชา" เก็บในตาราง `course_groups`)
  — **แผน 8 เทอม 132 หน่วยกิต** (วิชาในแผน 35 + placeholder 9)
- **กระดานเขียนเต็มรูปแบบ** (`HandwritingPad.tsx`): ปากกา + 🖍️ ปากกาเน้นข้อความ
  (โปร่งแสง เห็นตัวอักษรใต้เส้น มีสีสว่าง 5 สี) + ยางลบ · เลือกสีปากกา 5 สี ·
  ความหนา 3 ขนาด · ↩︎ undo / ↪︎ redo / 🗑 ล้าง · 🔍 ซูมเข้า-ออก (50–400%) ·
  ⤢ ขยายพื้นที่เขียน · ＋📄 เพิ่มหน้า / －📄 ลบหน้า (1–10 หน้า, ลบแบบไม่ทำลายเส้น)
  — เก็บลายเส้นเป็น vector (เบา + ซูมคม + redo ได้) ตอนส่งรวมทุกหน้าเป็นรูปเดียวให้ AI

## Phase 15 — Multi-User (หลายคนใช้ได้)
เดิม StudyOS ใช้คนเดียว ตอนนี้เพิ่มระบบผู้ใช้:
- **ตาราง `users`**: เก็บ id, email, ชื่อ, avatar, plan (free/premium)
- **login**: Google OAuth (passport) หรือ dev-login (ตอนพัฒนา ไม่ต้อง Google)
- **แยกข้อมูลรายคน**: ทุกตารางที่เป็นของผู้ใช้ (notes, questions, flashcards, materials, chapters, study_plans ฯลฯ) เพิ่มคอลัมน์ `user_id` — query ทุกอันกรอง `AND user_id = ?`
- **settings 2 ชั้น**: `settings` (ค่ากลาง ทุกคนเห็นเหมือนกัน) + `user_settings` (ค่าส่วนตัว ผู้ใช้แต่ละคนตั้งเอง)
- **legacy user**: ข้อมูลเดิมทั้งหมดย้ายไปอยู่กับ user `legacy-user-0001`
- **session**: express-session + better-sqlite3-session-store เก็บ session ใน SQLite

## Phase 16 — Multi-Program Catalog + Onboarding (หลายสาขา + เลือกสาขาตอนเข้าใช้)
เดิมระบบมีแค่วิชาสาขาการตลาด ตอนนี้รองรับหลายสาขา:
- **ตาราง catalog**: `faculties` (คณะ) → `programs` (สาขาวิชา) → `program_credit_requirements` (หน่วยกิตที่ต้องได้แต่ละหมวด)
- **ตาราง `program_courses`**: เชื่อมว่าวิชาไหนอยู่สาขาไหน (วิชา GE + CORE ใช้ร่วมทุกสาขาบริหาร, วิชาเอกบังคับ/เอกเลือกเฉพาะสาขานั้น)
- **Onboarding** (`Onboarding.tsx`): ผู้ใช้ใหม่เลือก คณะ → สาขา → ปีที่เข้า → ภาคเรียน ก่อนเข้าหน้าหลัก
- **กรองวิชาตามสาขา**: API `/api/courses` ส่งเฉพาะวิชาในสาขาของผู้ใช้ ถ้ายังไม่ได้ตั้งค่าจะเห็นวิชาทั้งหมด
- **หน่วยกิตจาก DB**: planner อ่านหน่วยกิตที่ต้องเก็บจากตาราง `program_credit_requirements` แทนค่า hardcode
- **entry_term**: บันทึกว่าเริ่มเรียนเทอมไหน (1 / 2 / ซัมเมอร์) เพราะบางคนเริ่มต่างเทอม

ตอนนี้ seed มีแค่วิชาสาขาการตลาด (88 วิชา) สาขาอื่นมีเฉพาะ GE + CORE (51 วิชา) รอเพิ่มวิชาเอกจากข้อมูลจริง

ดูวิธีเอาขึ้นเซิร์ฟเวอร์ที่ `docs/DEPLOY.md`

## Phase 20 — AI Premium (฿99/เดือน) + ดีไซน์ใหม่

- **ตาราง `subscriptions`** (migration 021) เก็บว่าใครสมัครสมาชิก หมดอายุเมื่อไร + คอลัมน์ `users.plan` (`free`/`premium`)
- **ด่านตรวจ AI** อยู่ที่ `server/src/ai.ts`:
  - `checkAiSubscription()` — ถ้ายังไม่สมัคร จะส่งรหัส `SUBSCRIPTION_REQUIRED` (403) กลับไป → ใช้กับปุ่ม AI ที่ผู้ใช้กดเอง (สร้างข้อสอบ, ตรวจคำตอบ, สรุปทั้งวิชา, แนะนำบท, อ่านข้อสอบเก่า)
  - `hasAiSubscription()` — แค่ถามว่าใช่/ไม่ใช่ → ใช้กับงาน AI เบื้องหลัง (สรุปโน้ตตอนบันทึก, OCR ตอนอัปโหลดเอกสาร) ถ้าไม่ได้สมัคร ก็ยังบันทึกได้ แค่ข้าม AI
  - ตรวจ "จ่ายเงินแล้วไหม" **ก่อน** "มี API key ไหม" เพื่อให้คนที่ยังไม่สมัครเห็นหน้าสมัครเสมอ
- **ฝั่งหน้าจอ**: `client/src/components/SubscriptionGate.tsx` — `SubscriptionProvider` + `useSubscription()` + `PaywallModal` (หน้าต่างสมัคร ฿99) + `handleSubscriptionError()`
- **หน้าล็อกอิน** ใหม่: พื้นหลังไล่สี + วงแสงลอย + การ์ดกระจก, ปุ่ม Google ปุ่มเดียว, ล็อกอิน Dev ซ่อนไว้
- ⚠️ ปุ่ม "สมัครสมาชิก" ตอนนี้ **ยังไม่มีระบบรับเงินจริง** (กดแล้วเปิดใช้ทันที 30 วัน) — ต้องต่อระบบชำระเงินก่อนเปิดให้คนอื่นใช้

## Phase 21 — University login themes
- `client/src/data/universities.ts`: 35 universities (names, colour names as the university states them, hex swatches with a `source` of official / converted / approximate, optional campus photo). Generated from the high-confidence entries in `docs/research/universities-*.json`.
- `client/src/components/UniversityPicker.tsx`: `useUniversity()` (choice kept in localStorage `studyos.university`, because the login page is shown before sign-in) and the searchable bottom-sheet picker.
- `client/src/screens/Login.tsx`: background, orbs, logo tile and button take the chosen colours; a campus photo (if any) sits under a dark tinted overlay with the author and licence shown on the page.
- Photos: archived 2026-11-16 in `docs/brand/campus-photos/` (900×1600 WebP, credits in its CREDITS.md); the login page shows none. No university logos or emblems are used.

## Phase 22 — University at onboarding
- Migration `022_university.sql` adds `user_profiles.university_id` (a slug from `client/src/data/universities.ts`).
- `Onboarding.tsx` asks for the university first. Ramkhamhaeng (`ru`) continues to faculty + program; any other university saves without them and shows a notice that its curriculum is not available yet.
- `hasCatalog(db, userId)` in `server/src/api.ts` gates the Ramkhamhaeng timetable, exams and study-plan courses, so students of other universities see none of them.
- `/api/auth/me` includes `university_id`; `App.tsx` copies it to localStorage (`studyos.university`) so the login theme follows the account across devices.

## Phase 23 — Timetable and exams by program
- `programFilter(db, userId, column)` in `server/src/api.ts` returns a WHERE fragment that keeps only courses listed in `program_courses` for the student's program. Used by `weekClasses`, `termExams`, the study plan's course list and `/api/mock/available`.
- Accounts with no program (never onboarded) are left unfiltered.

## Phase 24 — Seeding a new database
- Problem: startup seeded only when `courses` was empty, but migration 017 inserts courses, so a new database skipped the seed (no GE/CORE/Marketing courses, plan terms or settings; Marketing had no `program_courses`).
- `needsSeed(db)` in `server/src/seed.ts` checks `plan_terms`, which only the seed fills.
- `seedDatabase(db, { reset: false })` (used at startup) is additive: it deletes nothing, upserts the seed courses, fills room and teacher on the 2/69 classes migration 018 already holds instead of duplicating them, and maps the seed courses to Marketing (migration 016 ran before those courses existed).
- `seedDatabase(db)` (default, used by `npm run seed` and tests) still clears and reloads the seed tables.
- Migration `023_accounting_principles.sql` defines ACC1101 and ACC1102 (Principles of Accounting 1 and 2), which the Accounting program maps; source: RU admission guides 2566 and 2567.

## Phase 25 — Custom main menu and theme selector
- `client/src/destinations.tsx` lists every screen once (id, icon, short nav label, full label, component) and exports `useNav()`, which keeps the student's nav list in localStorage (`studyos.nav`, max 5 screens + More).
- `App.tsx` (`Shell`) renders the nav from that list. `useLongPress` opens a sheet on press-and-hold (550 ms) or right-click, with "Move to More"; the click that ends a long press does not navigate.
- `More.tsx` lists the screens that are not in the nav, each with a "+" to pin it (when the nav is full, "+" opens a sheet to pick the item to replace; it is portalled to `<body>` because the screen sits in an animated container that would trap a fixed overlay), and a Light/Dark/System theme selector (same setting as the header toggle).

## Phase 26 — App colour themes
- `client/src/theme.ts` defines the colour theme, which is independent of light/dark mode: `default`, `palette:<id>`, `school:<id>`, `hc:light`, `hc:dark` (localStorage `studyos-colour`).
- `ThemeProvider` (`components/ui.tsx`) calls `applyColour(colour, mode)`, which sets CSS variables on `<html>` over the tokens in `index.css`, and re-runs when the mode or the device's light/dark setting changes.
- Palette and school themes supply two base colours. `accentVars()` computes the real shades: `--accent` is darkened until white text on it reaches 4.5:1 (and lightened in dark mode until it stands 3:1 off the surface); `--accent-text` is shifted until it reaches 4.5:1 on cards, the page and the tint. So a yellow school gets an olive button in light mode and true yellow text in dark mode. All 42 themes pass in both modes.
- `--brand-bar` (a 4px stripe at the top of the header and sidebar) shows the two base colours unmodified.
- `--accent-2` is the second colour for graphics only (logo icon, active-tab marker, calendar class dots, More icons, progress-bar gradients), shifted to 3:1 against the backgrounds. It is not text-safe. It is unset when the second colour is white or grey, and for the default and high-contrast themes; use sites write `var(--accent-2, var(--accent-text))`.
- High contrast replaces every colour token (text pairs 7:1 or better; white on the dark theme's accent button is 6.6:1) and fixes light or dark itself, so the mode selector is disabled while it is on.
- The login-page university theme (`studyos.university`) is a separate setting and is unchanged.

## Phase 27 — Tuned school colours and font choice
- School swatches now have four sources: `official`, `converted`, `website` (the shade the university's own site uses, see `docs/research/colour-tuning.md`) and `approximate`.
- Fonts: `FONTS` in `client/src/theme.ts` lists eight typefaces designed for Thai, five sans-serif and three serif. The default is IBM Plex Sans Thai Looped for both languages (its Latin letters are IBM Plex Sans): a looped face, because loops make long Thai text easier to read; it is the font loaded in `index.html` and named in `--font-sans`. `applyFont()` overrides `--font-sans` on `<html>` and adds a Google Fonts stylesheet for the chosen family; Only the default is in `index.html`. `loadFontPreviews()` fetches only the letters the picker shows (Google's `text=` subset), so every option is drawn in its own typeface without downloading six full fonts. Offline, the stack falls back to the device's Thai fonts.

## Phase 28 — Course name repair
- Migration 017 took course names from a PDF whose Thai font encodes tone marks and similar signs as private-use codes (U+F700 to U+F71A). No font draws those, so 133 names showed boxes or looked misspelled.
- Migration `024_repair_course_names.sql` maps the codes back to Thai (U+F70A..F70E, F705..F709 and F713..F717 are the tone marks U+0E48..0E4C; F701..F704 the upper vowels; F710 mai han-akat; F712 mai taikhu; F718..F71A the lower vowels), joins split sara am, separates 15 English names that were stuck onto the Thai name, and removes 3 stray credit digits. Each UPDATE matches on the old broken name, so seed-owned courses are never touched.
- Check: of the 137 courses that also appear in the RU admission guides 2566 and 2567, the repaired Thai name matches the guide in all but one (a spacing difference in the PDF).
- Open data gap: 60 courses inserted by migration 017 have empty `name_th` and `name_en` (DBC, FIN, HOT, HRM, INB, LOG and MGT codes). They are not in the 2566 or 2567 guide; filling them needs the 2569 guide.

## Phase 29 — Palm rejection in the drawing pad
- The browser reports the Apple Pencil as a `pen` pointer and a resting palm as separate `touch` pointers, each with its own `pointerId`. `HandwritingPad` already refused to start a stroke from touch, but its move and up handlers accepted events from any pointer, so the palm shifting or lifting corrupted or ended the pen's stroke.
- Now `activePointer` records the pointer that started the stroke, and `move` / `up` ignore every other pointer. `pointercancel` (iPadOS may cancel the pen when the palm lands) ends the stroke and keeps what was drawn. The canvas also disables the long-press callout and text selection.
- Unchanged: touch never draws, so a finger cannot draw on a phone.

## Phase 30 — Recorded lecture links
- Ramkhamhaeng runs a lecture video system with subtitles at `sub-demo.ru.ac.th/student/` (login with the student's e-service account). `index.php` lists subjects, `subject.php?subject_id=N` lists sessions, `watch.php?session_id=N` plays one. A subject label can carry two course codes (`ACC1101_ACC1103`) and a section suffix (`_S1`).
- Migration `025_course_lectures.sql` stores one row per course and session (`course_lectures`). Only links are stored. `GET /api/lectures` returns them grouped by course, filtered to the student's program, and `Library.tsx` shows them in a collapsible card.
- `docs/research/ru-lecture-links.json` keeps the full list (13 subjects, 112 sessions), including the 9 subjects for faculties this app does not cover yet.
- The watch page embeds the lecture's timed Thai transcript in the page (`var CUES = [{startMs, endMs, text}]`). A future "lecture to notes" feature can use that text instead of speech-to-text, but only from the student's own signed-in browser.
- The host name contains "demo": the links may move, so treat this table as refreshable data.

## Phase 31 — Lecture transcripts (web part)
- **Storage:** `lecture_transcripts` (migration 026), one row per student, course and lecture; cues kept as JSON `[{startMs, endMs, text}]`. Every query filters on `user_id`: a transcript is the importing student's own copy.
- **Bundle format:** `{ format: "studyos-lecture-transcripts", version: 1, source, course_codes[], sessions: [{ no, url?, cues[] }] }`, validated by the zod schema `Bundle` in `server/src/lectures.ts`. `importBundle()` saves a recording under each of its course codes that is in the student's own program (a shared ACC1101_ACC1103 recording lands under ACC1103 for Marketing, ACC1101 for Accounting) and replaces an earlier copy of the same lecture.
- **Collector:** `client/public/collector/ru-vod.js`, served at `/collector/ru-vod.js`. Plain JavaScript with no build step, because it is injected into the university's page. `collectCourse(subjectUrl)` fetches the course page and then each lecture page (same-origin, 800 ms apart), extracts `var CUES`, and returns a bundle; lectures without subtitles go in `skipped`. Errors are codes: `NOT_SIGNED_IN`, `NOT_A_COURSE_PAGE`, `NO_SUBTITLES_FOUND`. Loaded from a bookmark it shows a small status panel and downloads the bundle as a file; with `window.STUDYOS_COLLECTOR_EMBED = true` it only defines `StudyOSCollector` for a host app to call.
- **UI:** `Library.tsx` — `LectureLinks` (Watch / Read per lecture, import, how-to) and `TranscriptView` (timestamps, search, delete with confirm).
- **Tests:** `server/test/lectures.test.ts` runs the real collector file in a `vm` sandbox against fake pages shaped like the RU site, and covers import rules.
- **Checked by hand 2026-11-14:** the collector logic read a full course from the live site (10 lectures, 483 KB, 9 s). The bookmark itself could not be tried from `http://localhost` (the HTTPS lecture page refuses an HTTP script); it needs the deployed HTTPS app.

## Phase 32 — Reminders and to-dos
- **Data:** `reminders` holds a rule (kind `reminder` or `todo`, title, note, optional `course_code`, first `date`, optional `time` in Asia/Bangkok, `repeat`, optional `repeat_until`). `reminder_done (reminder_id, date)` records one ticked occurrence; the date is `''` for a to-do with no date. A reminder, and anything that repeats, must have a date.
- **Recurrence** (`server/src/reminders.ts`): `occursOn(rule, date)` and `occurrencesBetween(rule, from, to)` work out the days; nothing is materialised. Monthly on the 29th to 31st falls on the last day of shorter months.
- **Lists:** `itemsForToday()` returns today's occurrences, open to-dos with no date, and one-off to-dos that are overdue (overdue first, then by time, done last). `GET /api/reminders` returns every rule with `next` (the next unticked day), `finished` and `overdue`, sorted soonest first, plus `todayItems`.
- **Calendar and Today:** `/api/calendar` adds `reminder` / `todo` events per day (and now sorts each day by start time); `/api/today` adds `reminders`.
- **Client:** `components/Reminders.tsx` (`ReminderRow`, `ReminderForm`, `setDone`, and the `studyos:reminders-changed` event that keeps the Today card, calendar and manage screen in step), `screens/Reminders.tsx`, `TodayTodos` in `screens/Today.tsx`.
- **Alerts:** `client/src/reminderAlerts.ts` polls once a minute while the app is open; an item that came due in the last five minutes gets an in-app banner and, if the student allowed it, a device notification (through the service worker when there is one). Nothing is sent when the app is closed: that needs web push (VAPID keys, a push subscription per device, a server-side scheduler), which is not built.
- **Course chips:** `CourseChip` renders a course code as a chip; `CourseTitle` uses it, so codes are chips across the app.

## Phase 33 — Hour-by-hour week and day views
- `Calendar.tsx` has three views. Month is the original grid. Week and Day render `TimeGrid` around an `anchor` date; the arrows step by month, week or day, and "Today" jumps back. The chosen view is remembered in localStorage (`studyos.calendarView`).
- Data still comes from `/api/calendar?month=`. Fetched months are kept in a small cache so a week that crosses two months has both; the cache is cleared when reminders change.
- `client/src/calendarLayout.ts` (`layoutDay`) is pure: timed events are grouped into clusters of overlapping events and each takes the first free lane; with a lane limit, the rest of a cluster is reported as overflow. A timed event with no end (a reminder) is half an hour tall. Events with no time go to the all-day row.
- `TimeGrid.tsx` draws 07:00 to 20:00 at least (wider if something falls outside), a red "now" line on today (Bangkok time), and scrolls to the current hour. Week columns on a phone show one lane and a "+N" badge that opens the day; the day view shows every lane at 96px minimum and scrolls sideways. Reminders and to-dos can be ticked in the day view.

## Phase 34 — My courses this term
- **Problem:** classes and exams were filtered by program only. `plan_items` (a course per student per term) already existed, but only the legacy account had rows, so every other student saw all of their major's classes (17 at once on some mornings).
- **Rule:** `myCoursesFilter(db, userId, termId, column)` in `server/src/api.ts`. If the student has course rows in `plan_items` for the term, only those courses are kept; otherwise it falls back to `programFilter` (the whole program), so nothing is empty before they choose. Placeholder rows (no course code) and other terms are ignored.
- **Used by:** `weekClasses`, `termExams` (so Today, the calendar, Schedule and Exams), the study plan's course list, and `/api/mock/available`. Lecture links and the course catalogue stay program-wide.
- **API:** `GET /api/term-courses` returns the current term, the chosen codes, and the options (courses of the student's program that have a class or exam this term, with their class times). `PUT /api/term-courses { codes }` replaces the student's course rows for the term in one transaction and keeps placeholders.
- **UI:** `components/TermCourses.tsx` is a sheet with search, a "chosen only" filter and courses grouped by category. Today shows a prompt card until courses are chosen, then an "N courses this term" link on the classes card. Choosing also feeds the existing study targets, which read the same table.

## Phase 35 — One way to add to the calendar
- **One model.** `reminders.kind` is now `reminder`, `todo` or `event`. An event has an optional `end_time`, nothing to tick, and is never overdue; a one-off event counts as finished once its day has passed. Migration `028_events_in_reminders.sql` rebuilds the table (SQLite cannot alter a CHECK constraint) and copies every `custom_events` row in as an event. The old table stays as an unused backup; its routes are removed.
- **One form.** `ReminderForm` handles all three kinds; `ReminderSheet` shows it over any screen and loads an existing item by id (`GET /api/reminders/:id`).
- **Ways in, all to the same sheet:** the calendar's Add button; a click on an empty spot in the week or day grid (`TimeGrid` `onAdd`, snapped to the half hour, prefilled as a one-hour event); a double-click on a day in the month grid; the "add on this day" row under a selected day. A tap on one of the student's own items opens it for editing (`onOpen`).
- **One button.** `AddButton` (`components/ui.tsx`) is used by Calendar, Reminders, Notes and Library.

## Phase 36 — Stop losing work
- **Sessions in the database.** `SqliteSessionStore` (`server/src/sessionStore.ts`) implements express-session's store on a `sessions(sid, data, expires)` table (migration 029). Expired rows are ignored on read and pruned at start-up and hourly. Tested in `server/test/sessionStore.test.ts`.
- **One place for "not signed in" and "offline".** `send()` in `client/src/api.ts` wraps every request. A 401 from anything except `/api/auth/*` dispatches `SIGNED_OUT`; `AuthGate` listens and shows the login page. A failed connection throws `{ code: "OFFLINE" }` with a readable message.
- **Note drafts.** `client/src/noteDraft.ts` stores one draft per student in IndexedDB (database `studyos`, store `drafts`, key `note:<user id>`): course, title, text, input mode, drawing (vector strokes and page count) and attached photos. `AddNote` saves 400 ms after each change, and at once when the form unmounts or the page is hidden; it clears the draft after a successful save or a confirmed discard. If storage rejects the photos, the draft is saved without them. The Notes screen shows a "continue" card while a draft exists (`DRAFT_CHANGED` event).
- **Drawing pad.** `HandwritingPad` accepts `initial` (read once) and `onChange`, so its owner holds the strokes. Remount it with a new `key` to clear it.
- **Confirm pattern.** `ConfirmDialog` (`components/ui.tsx`): portal dialog, Cancel focused first, red button named after the action, Escape or backdrop to cancel.

## Phase 37 — Tap targets and small text
- **44px everywhere.** Buttons, selects and text inputs carry `min-h-11`. Header theme and language buttons, calendar ticks, the drawing toolbar and the paywall's close button are 44×44.
- **`.tap-area`** (`client/src/index.css`): for controls that stay visually small. A centred `::after` gives a touch area of at least 44×44 without changing the layout.
- **Sliders** on the cost calculator are 44px tall (`h-11` on the range input).
- **Text floor.** `CourseChip` uses `max(0.8em, 12px)`; `TimeGrid` labels are 12px (the "+N" badge 11px).
- **Reduced motion.** One media query in `index.css` shortens every animation and transition to nothing when the device asks for less motion.

## Phase 38 — Layout by device and orientation
- **Three frames.** `useLayout()` reads two media queries and re-renders on change: `sidebar` = `(min-width: 1024px) and (min-height: 500px)`; `rail` = `(min-width: 768px), (min-width: 560px) and (max-height: 500px)`; otherwise `phone`. The root element carries `data-layout`, which the CSS in `index.css` keys on.
- **Sidebar** (240px): pinned screens (press-and-hold still unpins), an "other screens" group with every remaining destination, then More. Labels wrap instead of truncating.
- **Rail** (72px plus the left safe area): the student's menu as icons with a 12px label, language and theme buttons at the bottom; it scrolls if the screen is very short.
- **Content width.** `max-w-6xl` on the sidebar layout, `max-w-3xl` otherwise and for destinations flagged `narrow`.
- **Two columns from 1200px.** `.today-grid` places the calendar in the left column and the to-dos and day lists in the right, while keeping the phone order in the DOM. `.wide-grid` turns a stack of cards into two columns (`.span-all` for headings); used on More, Notes, Week, Exams, Stats and the degree planner.
- **Hour grid height.** `.timegrid-scroll`: 60dvh normally, nearly the whole height when the screen is under 500px tall, and the full column height in the desktop Today grid.
- Checked at 375×812, 812×375, 768×1024, 1024×768, 1440×900 and 900×1440: no screen scrolls sideways.

## Phase 39 — Time format setting
- **Setting.** `Clock = "24" | "12"` in `client/src/format.ts`, read once from localStorage `studyos.clock` and changed with `setClock()`; `subscribeClock` + `getClock` feed `useSyncExternalStore` for the selector in More. Screens re-read it when they are opened.
- **Formatting.** `formatTime("13:30")` → `13:30` or `1:30 PM`; `timeRange` collapses the period when both ends share it; `hourLabel(h)` labels the hour grid (its label column is 46px wide in AM/PM mode, 40px otherwise). Used by the timetable, exams-by-day lists, calendar day list, hour grid, reminders, due banners and device notifications, and the course picker. Tested in `server/test/clockFormat.test.ts`.
- **Not affected:** stored values, the API, the `.ics` export, and `<input type="time">`, which the browser draws using the device's own setting.

## Phase 40 — Honest errors and small fixes
- **Retry.** `ErrorBox({ onRetry })` renders a "try again" button; with no children it shows `status.offline` when `navigator.onLine` is false, otherwise `status.error`. Screens that load one resource keep their loader as a `load()` they can call again.
- **Offline banner.** `useOnline()` tracks the browser's online/offline events; the shell shows a sticky notice while offline. Requests made offline fail through `send()` with `code: "OFFLINE"`.
- **One delete pattern.** `ConfirmDialog` everywhere: `NoteView`, `MaterialDetail`, `ChapterManager`, `TranscriptView` (all in `screens/`), and `ReminderForm`. A failed delete closes the dialog and shows the error in place.
- **Calendar marks.** `DotMark` draws a shape per kind: class ●, exam ◆, study-plan task ■, e-Testing ▲, event ▬, reminder ○, to-do □. `monthKinds` drives the legend; day buttons carry `aria-label` such as "18, Class, Event, Reminder".

## Phase 41 — Gestures, search, export, import
- **Calendar swipe.** `useSwipe(step)` uses touch events on the grid wrapper (they keep firing while the page scrolls, unlike pointer events). No `touch-action` is set, so the day view's own sideways scroll still works; a swipe that starts on a sideways-scrolling element is ignored.
- **Drawing pad fingers.** The canvas keeps `touch-action: none` (the browser cannot scroll with a finger but not a pen), so touches are handled in `HandwritingPad`: a `touches` map, `touchDown/Move/Up`, a `pinch` record (start distance and zoom) and an `anchor` applied in a layout effect after the zoom changes. A second finger cancels a finger-drawn stroke in progress. The pen always wins: pen down clears the touch state.
- **Note search.** `searchNotes(db, userId, query)` in `server/src/notes.ts`: up to six words, each must appear in title + text + summary (SQL `LIKE … ESCAPE`), newest first, 50 at most, with a 140-character snippet. The route is registered before `/notes/:id`. Tested in `server/test/noteSearch.test.ts`, including that another student's notes never appear. The client waits 250 ms after typing.
- **Note export.** `window.print()` with a print stylesheet in `index.css` (`.print-area`, `.no-print`), and a Markdown download built in the browser.
- **Import.** `AddNote` accepts dropped and pasted image files; `UploadForm` in Library accepts a dropped file by assigning it to the file input. Hints for these show only where there is a mouse (`.pointer-fine-only`).

## Phase 42 — Re-audit fixes
- **Floating add button.** The shell provides `LayoutContext`; `AddButton` renders a fixed, labelled button at the bottom right on the `phone` layout (through a portal, 56px tall, above the tab bar and the safe area) and its usual inline form elsewhere. Screens whose form opens at the top (Reminders, Library) scroll up when it is tapped. Phone content has extra bottom padding so nothing ends under it.
- **Quiz progress.** `loadProgress` / `saveProgress` / `clearProgress` in `screens/Quiz.tsx`; `Runner` takes `resumed` and `onLeave`. Cleared on finish, on leave, and ignored after 24 hours. Questions never include answers, so nothing is revealed early.
- **Failed loads.** Each screen keeps a `failed` flag (and an `attempt` counter or its `load` function) and returns `<ErrorBox onRetry … />`. A failed request no longer turns into an empty list.
- **Layout hook.** Media-query objects are module-level; `resize` and `orientationchange` also trigger a re-read.

## Phase 43 — Third pass
- **Reminder form draft.** `loadFormDraft` / `clearFormDraft` in `components/Reminders.tsx`. Only for new items. A slot the student has just clicked (a preset with a time) still decides the day and time; the rest comes from the draft. `finished` stops a save after Cancel or a successful save.
- **Unsaved-work guard.** `unsaved.ts` holds a map of reasons (i18n keys). `AddNote` registers one when `saveNoteDraft` reports `"failed"` or `"partial"` (it now returns how the save went); `Quiz` registers one while generating. `Shell.open()` shows a `ConfirmDialog` before changing screen; a `beforeunload` listener covers closing the page. Kept drafts never trigger it.
- **Swipe to complete.** Touch handlers on the row: the direction is decided after 10px (sideways only if 1.5× more than vertical), the row follows the finger up to 120px, and letting go past 72px calls `onToggle`. `touch-action: pan-y` keeps vertical scrolling native.
- **Pull to refresh.** Window-level touch listeners; starts only at `scrollY === 0` and not inside a canvas, field, dialog, the hour grid or anything already scrolled. Past 64px (half the finger's travel) the shell bumps `reloads`, which is part of the screen's `key`. `overscroll-behavior-y: contain` on `<html>` turns off the browser's own.
- **Pen pressure.** `toCanvas` records `p` for `pointerType === "pen"` with pressure above 0; `widthAt` scales the pen width by `0.45 + 1.1 × p`; strokes with pressure are painted segment by segment. Stored in drafts.
- **Keyboard.** `useKeyboardInset` (in `AuthGate`, so login is covered) compares `window.innerHeight` with `visualViewport`; over 80px counts as a keyboard. CSS: the parent of any `[role=dialog]` / `[role=alertdialog]` gets `padding-bottom: var(--keyboard-inset)`, and the dialog a matching `max-height`.
- **Share target.** The manifest's `share_target` (GET) opens `/?share_title&share_text&share_url`. `shareIntake.ts` reads these at load, removes them from the address bar at once, keeps them in sessionStorage across sign-in, and the shell merges them into the note draft (appended to an unfinished note, never replacing it) and opens the note form. Tested in `server/test/shareIntake.test.ts`.

## Phase 44 — Share photos and files in
- **Why a service worker.** A page cannot read a form POST, and the Web Share Target sends files only by POST. `share-sw.js` listens for `POST /share`, reads the form, stores up to ten files in the `studyos-share` cache (`/__shared/<n>`, with `content-type` and a percent-encoded `x-file-name` header), and answers with a 303 to `/` carrying the text fields and `share_files=N`. Any failure still redirects to `/`. It is pulled into the generated worker by `workbox.importScripts` in `vite.config.ts`.
- **App side.** `takeSharedFiles()` rebuilds `File` objects from the cache and deletes the entries; `sortShared()` splits photos from documents. The shell adds text, links and photos to the note draft; if there is a document it hands the first one to the Library (`offerUpload`), which opens its upload form and places the file in the file field.
- **Server.** `POST /share` (production only) redirects to `/` without reading the body, for the moment before the service worker controls the page.
- **Tests.** `server/test/shareIntake.test.ts` runs `share-sw.js` in a sandbox with real `Request`, `FormData`, `File` and `Response` objects and a stand-in cache: files and Thai file names survive, an earlier share is replaced, other requests are left alone, an unreadable share still opens the app.

## Phase 45 — Notifications when the app is closed (Web Push)
- **Design: an empty push, then ask.** When an item comes due the server sends the device's push service a push with NO body, signed with VAPID. The service worker wakes, calls `POST /api/push/pending` with the student's own session cookie, and shows what the server returns. So reminder text never passes through Google, Mozilla, Apple or Microsoft, no payload encryption is needed, and there is no extra library: `server/src/push.ts` uses `node:crypto` and `fetch`.
- **Keys.** `loadVapidKeys` reads `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY`, or makes a P-256 pair once and stores it in `app_secrets` (migration 030). `vapidHeader` builds the ES256 token (`aud` = the push service's origin, 12-hour expiry, `sub` = `VAPID_SUBJECT`).
- **Subscriptions.** `push_subscriptions` (one row per device; `lang` and `clock` say how to word and format its notifications). `POST /api/push/subscribe` upserts by endpoint and moves a device to whoever is signed in on it now; `POST /api/push/unsubscribe` removes it; `GET /api/push/key` returns the public key; `POST /api/push/test` sends a test.
- **Only real push services.** `isPushEndpoint` allows HTTPS addresses at Google (FCM), Mozilla, Apple and Windows push hosts and nothing else, checked on subscribe and again before every send, so a forged subscription cannot make the server call another address.
- **Sender.** `startPushScheduler` runs `sendDuePushes` every 30 seconds. `dueItems` = today's occurrences (Bangkok time) with a time in the last 15 minutes, not ticked. Each announced occurrence is recorded in `reminder_pushes`, so restarts and later rounds never repeat it. One push per device per round, however many items are due. A 404 or 410 from the push service deletes the subscription; other failures leave it.
- **Service worker.** `client/public/push-sw.js` (loaded with `workbox.importScripts`): shows each pending item with the tag `studyos-<id>-<date>` — the same tag the in-app alert uses, so an open app and a push never show an item twice. It always shows something (browsers require it): a plain "something is due" when offline, and on a 401 it unsubscribes the device and says to sign in. Tapping a notification focuses or opens the app.
- **Client.** `client/src/push.ts` (`pushState`, `enablePush`, `disablePush`, `syncPush`, `sendTestPush`); controls live in the notifications card on the Reminders screen. `syncPush` runs when the app opens, so the subscription follows the signed-in account, language and time format.
- **Limits.** The server must be running at the due time (`fly.toml` keeps one machine up). On iPhone and iPad it works only after StudyOS is added to the Home Screen (iOS 16.4 or later). The dev server has no service worker, so this cannot be turned on there.
- **Tests.** `server/test/push.test.ts`: the token verifies against the public key; the address allow-list; which items are due; one signed empty push per device, once; dead devices dropped; the service worker's behaviour in a sandbox.
- **End-to-end check.** `scripts/push-e2e.mjs` drives a real Chrome (throwaway profile) against the built app and Google's push service. Run on 2026-11-14, all seven checks passed: subscribed via the app's button (`fcm.googleapis.com`), the test notification arrived, a reminder made due was shown 18 seconds after the app's tab was closed with the body "5:04 PM · Bring ID card", it was not announced again on later rounds, and turning it off unsubscribed. A first subscription in a fresh browser took about 30 seconds, so the button shows "turning on…" meanwhile.

## Phase 46 — Logo, and the name in one place
- **Logo.** (Replaced in Phase 51 by the cairn of books.) `Logo.tsx` drew the mark from two paths in a 64-unit box, in `currentColor`; `tick` coloured the lifted page (the shell passed the theme's second colour). App icons are flat PNGs from `scripts/make-icons.mjs` (indigo `#4f46e5`, white page, amber `#fbbf24` tick): 192 and 512 are full-bleed squares with the mark inside the central 80% circle so any system mask can crop them; `favicon.svg` is the rounded tile.
- **Name.** `client/src/brand.ts` exports `APP_NAME`, `APP_NAME_TH` and `appName(lang)`. `t()` replaces `{app}` in every string and the language effect sets `document.title`. `vite.config.ts` imports `APP_NAME` for the manifest and replaces `%APP_NAME%` in `index.html`. The service-worker push code and the lecture collector are plain JS that cannot import it; they keep copies on lines tagged `@app-name` / `@app-name-th`, which `scripts/rename-app.mjs` rewrites together with `brand.ts`.
- **Checked** by renaming to a candidate, building, and inspecting the output (title, home-screen title, manifest, notification text, collector messages, no leftover name in the bundle), then renaming back.

## Phase 47 — The brand: Upleaf, leaf green and lime
- **Name.** Applied with `scripts/rename-app.mjs "Upleaf"`. `server/test/brand.test.ts` keeps `brand.ts`, `push-sw.js` and `collector/ru-vod.js` in step and rejects a translated string that spells the name out.
- **Colours.** `BRAND` in `theme.ts`. `applyColour` uses it whenever no palette or school is chosen (`default`, or a saved palette that no longer exists), through the same `accentVars` / `secondAccent` maths as every other theme, without the two-colour stripe. The same computed shades are written into the three token blocks of `index.css` so the page is green before any script runs: light `#15803d` / text `#137638` / tint `#e3f0e8` / second colour `#6c9923`; dark `#15803d` / text `#5da779` / tint `#19332e` / second colour `#a3e635`. White on the button green is 5.0:1.
- **Icons.** `scripts/make-icons.mjs` now draws white and lime on leaf green; `favicon.svg` matches (`docs/brand/icon-book-leaf.svg`).
- **Leftovers removed.** Indigo that did not come from tokens: Markdown bullets, the paywall button's shadow, the drawing pad's active tool, the login page's no-university gradient and blobs.

## Phase 48 — Production sign-in fixes
- **How it was found.** `git archive HEAD` into an empty folder, `npm ci` (the committed lockfile installs cleanly; this branch changes no dependencies), `npm run build --workspace @study-os/client`, then `NODE_ENV=production npm start` with a new `DB_PATH`. The fresh database received all 30 migrations and the seed (336 courses, 9 programs, 207 class sessions, 206 exams, 52 lecture links).
- **Proxy.** `trust proxy` is set to 1 in production (one hop: Fly's edge). Before, `req.secure` was false behind the proxy, so express-session silently skipped the `Secure` cookie. Verified with `X-Forwarded-Proto: https`: the cookie is now set (`HttpOnly; Secure; SameSite=Lax`), `/api/today` answers 200, and the session survives a restart.
- **Sign-in methods.** `signInMethods({ nodeEnv, googleClientId, allowDevLogin })` is the single rule: dev login only without Google, and in production only with `ALLOW_DEV_LOGIN=true`. `auth.ts` registers routes from it and exposes it at `GET /api/auth/config`; `Login.tsx` renders only what exists and says so when nothing is configured. Tested in `server/test/signIn.test.ts`.
- **Not verified here:** a deploy to Fly, Google sign-in with a real client, and the Linux image (the Dockerfile's steps were followed on macOS).
- **Google leg (Phase 48b).** The callback uses passport's custom-callback form so every failure redirects to `/?signin=failed` (read once and removed from the address by `Login.tsx`). The strategy's verify step returns `false` when the profile has no email or `_json.email_verified === false`. Checked with `GOOGLE_CLIENT_ID=fake…` in production mode: `/api/auth/google` → 302 to `accounts.google.com/o/oauth2/v2/auth` with `redirect_uri=<APP_URL>/api/auth/google/callback`; a refused or invalid return → 302 to `/?signin=failed`; dev login stays off whatever `ALLOW_DEV_LOGIN` says.

## Phase 49 — Brand reset and more course names
- **Brand.** Name back to the placeholder through `scripts/rename-app.mjs`; `BRAND` is indigo and amber, with the three token blocks in `index.css` recomputed (light `#6d5cdf` / text `#6455ce` / tint `#edebfb` / second colour `#ae8419`; dark `#6d5cdf` / text `#9a8ee9` / tint `#2f2a57` / second colour `#fbbf24`; white on the button colour is 4.95:1). The `forest` palette returns and the short-lived `indigo` palette is gone. Changing name or colours is now a matter of one command and a handful of constants (`docs/brand/README.md`).
- **Course names.** `031_course_names_from_old_guides.sql` only fills rows that are still empty. Names were copied from the guides' text layer; where a guide stores tone marks as private-use characters they were mapped with the fixed glyph table and cross-checked against the older guides.
- **Open items.** `docs/OPEN_ITEMS.md` lists what is left by what it is waiting for: a decision, the owner, a device, or unpublished data.

## Phase 50 — The name: Termtrail
- Applied with `scripts/rename-app.mjs "Termtrail"`: `client/src/brand.ts` and the tagged copies in `push-sw.js` and `collector/ru-vod.js`. `server/test/brand.test.ts` holds them together. No code other than those three constants changed.

## Phase 51 — The logo: a cairn of books
- **One source.** `docs/brand/tools/cairn-books.cjs` holds the geometry (three books in a 64-unit box: position, size, spine side, tilt) and writes three things: `docs/brand/mark-cairn.svg` (covers and page blocks), `docs/brand/mark-cairn-small.svg` (the same stack drawn solid, with the covers overhanging a notch where the pages are), and `client/src/components/logoPaths.ts` for the app. It needs no packages.
- **In the app.** `Logo.tsx` maps over `LOGO_BOOKS` (or `LOGO_BOOKS_SMALL` when `size < 24`): one `<g>` per book with its tilt, a cover path, and a page path at `LOGO_PAGES_OPACITY`. Everything is `currentColor` except the top book, which takes `accent` (the shell passes `var(--accent-2, var(--accent-text))`, so it follows the theme; the login page passes the brand amber when no university is chosen).
- **Icons.** `scripts/make-icons.mjs` reads the two SVGs instead of carrying its own copy of the paths. 192, 512 and Apple icons use the full drawing; the 32-pixel PNG and `favicon.svg` use the solid one. The stack sits low in its box, so the script lifts it 2 units to look centred on the tile.
- **Guard.** `server/test/brand.test.ts`: every path in the two brand SVGs appears in `logoPaths.ts`, and the favicon carries the small drawing. If someone edits one by hand, it fails.
- **Lockups.** `docs/brand/tools/lockups.cjs` reads the mark from its file (`MARK_SVG`), lifts it so the bottom book stands on the lettering's baseline, and colours the top book amber (`#d97706` on white, `#fbbf24` on dark).

## Phase 52 — A trial copy under a sub-path
- **One variable, two readers.** `BASE_PATH` (for example `/termtrail`) is read at build time by `client/vite.config.ts` (`base`, and the manifest's `start_url`, `scope` and share-target address) and at run time by `server/src/env.ts` (`normaliseBasePath` → `env.basePath`, `""` at the top of a site). If they differ the page loads but every request misses.
- **Server.** Routes are declared as before; at the end `index.ts` mounts the whole app: `express().use(env.basePath, app)`. Express strips the mount path, so no route changed. Three things do know the path: the session cookie's `Path`, the redirect after Google sign-in, and the `/share` fallback redirect. Outside the sub-path the server answers 404, so it can share a hostname with other apps.
- **Client.** `client/src/base.ts` exports `BASE` (from `import.meta.env.BASE_URL`) and `withBase(path)`. `send()` in `api.ts` applies it to every request, so screens keep writing `/api/...`. Hand-built addresses use `withBase` directly. Vite rewrites the addresses in `index.html` and the bundled assets itself.
- **Service workers.** `push-sw.js` and `share-sw.js` cannot import anything, so they take the app's address from `self.registration.scope`. The offline cache rule matches `/api/today` by the end of the path, because that function is copied into the worker as text and cannot see `base`.
- **Trial sign-in.** `signInMethods` now also returns `needsCode` (dev login on, and `DEV_LOGIN_CODE` set). `POST /auth/dev-login` then requires `code`, compared in constant time; `codeGuard()` counts wrong tries per `req.ip` (8 per 15 minutes, then 429 `TOO_MANY`; a right code clears the count). It is in memory: a restart forgets the counts, which is acceptable for a trial.
- **Checked** by building with `BASE_PATH=/termtrail` and running in production mode on a new database: the page, assets, manifest, service worker, campus photos and collector answer under `/termtrail`; `/` and `/api/health` answer 404; sign-in refuses a missing or wrong code, accepts the right one and sets `Path=/termtrail; Secure; HttpOnly`; the ninth try after eight wrong ones is refused even with the right code. Then on the live trial (see `DEPLOY_SUBPATH.md`).

## Phase 53 — Your university first
- `client/src/data/universityList.ts`: `listUniversities(lang, mineId, query = "")` filters by Thai name, English name or abbreviation and sorts with the student's own university first, then A to Z for the language. `myUniversityId()` reads `studyos.university` from this browser (written on the login page, at onboarding, and from the profile at sign-in in `App.tsx`).
- `UniversityPicker` reads the student's university once when it opens and renders it above the "default theme" row with the caption `uni.yours`. It is separate from `current` (the theme now applied), because in More a student may be trying another school's colours.
- `Onboarding` builds its `<select>` from the same function, with the university chosen on the login page first. It also passes `pinned = [CATALOG_UNIVERSITY]`, so Ramkhamhaeng, the one university whose curriculum the app has, is at the top for a student who has not chosen yet (order: own, pinned, A to Z).
- The own university is only moved, never added: a search it does not match does not show it.

## Phase 54 — Term data from the registrar's documents
- **Why.** Migration 018 had been typed from the same two PDFs and did not match them: 44 class times, 8 exam dates and one "exam" that the faculty arranges itself were wrong, 5 rows were missing, and almost no class had a room.
- **Importer.** `scripts/import-ru-term.mjs` reads the PDFs with pdfjs (already a dependency), groups the positioned text into lines, and splits each line into columns by x position (code, name, LEC./LAB./SEC., day and time, room, lecturer, exam). Continuation lines belong to the course above; a centred `XXX : NAME` line is a subject heading. It checks the weekday printed beside each exam date against the calendar, and refuses to write if its count differs from the total printed on the last page, if the two documents list different courses, or if they disagree on any exam or credit.
- **`term_offerings`.** One row per course per term, for every course the university offers (2,762 in 2/69), with no foreign key to `courses`: it is the official record, not the app's catalogue. `sessions` is JSON (`kind`, the printed `text`, `weekday`, `start`, `end`, `room`); "M-F" becomes five sessions; "ไม่มีบรรยาย" and "CONTACT INSTRUCTOR" stay as text with no weekday. `exam_date` and `exam_slot` are set together or not at all; otherwise `exam_note` holds what was printed.
- **Derived tables.** `rebuildTermSchedule(db, term)` replaces the term's `class_sessions` and `exams` with what the record says for courses that are in `courses`. Migration 032 runs the same statements; a test runs the migration's text again and expects no change. `class_sessions.kind` carries LEC./LAB./SEC. when printed (not shown yet; no catalogue course has more than one session this term).
- **API.** `GET /term-courses` options = courses of the student's program that are in the record for the term (plus anything with a class or exam, for terms without a record), each with `note`. `GET /exams` adds `chosen` and `facultyArranged`, and returns clashes only when the student has chosen courses.
- **Screens.** `Schedule` asks `/term-courses` and, with nothing chosen, shows the "choose your courses" card above the week and exam views (the same card as on Today), or a link to change them. `Exams` shows the faculty-arranged list. `App` ignores a navigation event for a screen that does not exist.
- **Checked** by comparing every class and exam in a migrated database with an independent parse of the PDFs (0 differences), and in the running app as a new Accounting student before and after choosing three courses.

## Phase 55 — The majors from the official curriculum
- **Source.** The Business Administration chapter of the 2569 admission guide. Pages 2 to 11 are each major's plan by semester; page 12 names the majors and the degree totals; pages 13 to 47 list, major by major and section by section, every course with its code, Thai name, English name and credits; the rest is transfer rules.
- **Importer.** `scripts/import-ru-curriculum.mjs` knows which pages hold which major (`PROGRAMS`, with words each first page must carry, so another edition is refused). It walks the lines of those pages: a line whose first piece is a course code is a course; a line that states credits ("… 42 หน่วยกิต") and carries a section's words changes the section; a line starting in the name column under a course continues its name; everything after the free-electives heading is ignored until another section heading.
- **Sections to categories.** General education → `GE`; "แกนธุรกิจ" and Hospitality's "วิชาพื้นฐานวิชาชีพ" → `CORE`; "เอกบังคับ", "วิชาเฉพาะบังคับ" and the practicum → `MAJOR_REQ`; "เอกเลือก", "วิชาเฉพาะเลือก" and its groups → `MAJOR_ELEC`. Free electives are any course of the university, so none is listed.
- **Thai text.** The PDF stores tone marks and some vowels as private-use characters; a fixed table gives each its real character, and a name with an unknown one stops the import.
- **Checks before writing** are listed in the script's header and in the migration's. One printing slip is handled and reported: ECO1122's credits are missing from one major's list and are taken from the others'.
- **Migration 033** upserts the courses (existing names are kept; only an empty name is filled), upserts the ten programs, replaces `program_credit_requirements` and `program_courses`, deletes nameless courses that are in no major and referred to by nothing (the list of referring tables is checked by a test), and rebuilds every recorded term's classes and exams.
- **Checked** on a copy of the development database with real test accounts (no foreign-key problems, no plan item left pointing nowhere), and in the running app: onboarding offers the ten majors with their totals; a new Tourism student sees 65 courses offered this term, including ones that were missing before, and none of the invented codes.

## Phase 56 — Nothing until the student chooses their courses
- `myCoursesFilter` returns ` AND 0` when the student has no course in `plan_items` for the term. Everything built on it (week, calendar, Today, exams, faculty-arranged exams, mock exams, study plan) is therefore empty until they choose. `programFilter` is now used only for what the picker offers and for lecture links.
- `ChooseCoursesCard` owns the whole "choose your courses" flow: it fetches `/term-courses`, renders nothing when there is nothing to choose from, opens `TermCoursesPicker`, and calls `onChanged` when it closes so the screen reloads. Auto-opening is decided there too: after onboarding (a sessionStorage flag set by `App`), or once per term per device (a localStorage key holding the term).
- The screens distinguish "not chosen" from "nothing scheduled" with the `chosen` flag in the week and exam responses.

## Phase 57 — The trail planner
- **Engine (`server/src/trail.ts`).** No database. `buildTrail(input)` turns the curriculum into *units* still to do: a required course; a *choice* (one general-education group, or one elective place, with the courses that would fill it); a *free* elective. Units are ranked by the faculty's plan (`plan_year * 10 + plan_sem`; an elective place takes its position from `program_plan_slots`). `fill(cap, strategy)` walks the terms after the current one and puts units in while credits remain. A course needs a record of having run in that kind of term; a course in no past list is assumed to run in regular terms and is flagged. Two strategies are tried and the one that finishes sooner is kept: the faculty's order, and "hardest to place first" (which keeps a summer for the courses that do run in summer).
- **Verdict.** `earliestTerm` is the finish at the full limit. If that meets the target, the plan shown is the first cap from 9 upward (in threes) that still meets it; otherwise the full-limit plan is shown with `achievable: false`.
- **Limits of what it knows.** Offering history is seven terms: three first terms, two second terms, two summers. "Ran in 2 of 2" is weak evidence and the screen says how many terms the record covers. Hospitality's two kinds of elective are told apart by the label of the place in the faculty's plan ("… in Foreign Language") and the course's English name.
- **Importers.** `scripts/lib/mr30.mjs` now holds the ม.ร.30 reader shared by the term importer and `import-ru-history.mjs` (`readOffered`: codes, the term from the title, the printed total). The curriculum importer reads the semester plans in two columns, finding the divide from where the right column's codes start on each page.
- **Student data.** The goal is three columns on `user_profiles`. Passed courses are their own table because `enrollments` is keyed by course and term only (one student per course and term) and needs the course to be in the student's plan first; `passedCourses()` unions both.

## Phase 58 — Campus map
- **Drawing.** `trace.cjs` scales the university's map down, assigns each pixel to the nearest of a small palette of the map's flat colours, labels connected regions, closes each region (grow then shrink by 7 pixels, which removes the notches lettering leaves), traces its outer edge and simplifies it. `build.cjs` turns the numbered shapes into buildings, lawns, ponds, roads and the campus ground using a hand-kept table, and writes the SVG with classes instead of colours.
- **Theming.** Colours are custom properties with fallbacks (`var(--map-building, #dedaf8)`), so the file also looks right on its own. `maps.css` sets them from the app's tokens with `color-mix`. A selected building takes the accent with white lettering, like other selected things in the app.
- **Screen.** `CampusMap.tsx` imports both SVGs as text and injects the chosen one. Selection and "has a class here" are classes toggled on the injected nodes in an effect. `placeOf(room)` finds the first building code in a room string that exists on either map.

## Phase 59 — The trail chooses your courses
- **One plan, two views.** `loadTrailInput(db, user, { ignoreChosen })` builds the engine's input. With nothing chosen for the current term (or `ignoreChosen`), `firstTerm` is the current term and `published` carries that term's own list from `term_offerings` (codes in the major, and each exam's "date period"). In the published term `fill()` takes only listed courses and skips a course whose exam period is already taken in that term; later terms still go by offering history. `suggestedCourses()` is the first term of that plan when it is the current term.
- **Picker.** `TermCoursesPicker` fetches `/api/term-courses` and `/api/trail/suggested` together. Suggestions that are among the options become the first group and are removed from the category groups below; they are the initial selection only when the server has no choice saved. Opening the trail from the picker dispatches the `studyos:navigate` event directly, because `destinations.tsx` imports this file.
- **New-term check.** `unsettled()` = courses in `plan_items` of an EARLIER term that are not in `passed_courses` or a passed enrollment. `termCheck()` reports them unless `user_profiles.term_reviewed` already equals the current term; `answerTermCheck()` records only codes that were asked about and stamps the term. `ChooseCoursesCard.load()` asks this first and renders the dialog instead of the card; when answered it loads again, and the usual once-per-term auto-open of the picker follows (the `studyos.coursesPrompted` key is per term).
- **Rolling the term.** `import-ru-term.mjs --make-current` appends the `plan_terms` row and the `current_term_id` update to the generated migration, so the new term's data and the switch land together.

## Phase 60 — Walking directions to class
- **Positions.** `scripts/maps/locate.cjs` computes each drawn building's centre from the SVG, matches it to an OpenStreetMap building (by name, or by the hand-kept `IDENTIFIED` table with its own check), and writes `places.ts`: `CODES` (every drawn building), `PLACES` (those with a position) and `GROUND` (per campus: a least-squares affine from metres east/north of a reference point to drawing units, the metres per unit, the viewBox, and `accuracy` = the leave-one-out error 9 buildings in 10 stay under, rounded up to 5 m). It refuses to write if a match is ambiguous, a point is more than 25 m from its building, or the fit is worse than expected.
- **Room to place.** `placeOf(room)` tries, for each run of capitals in the room: the letters with a digit stuck to them, the letters alone, then the letters with the first digit of the number that follows; Bang Na's buildings are tried first. `positionOfRoom` is `placeOf` + `PLACES`.
- **Directions.** A plain link: `https://www.google.com/maps/dir/?api=1&destination=<lat>,<lon>&travelmode=walking`, opened in a new tab. Google Maps fills in "your location" itself. Google labels a bare coordinate with the nearest address it knows, so the destination's name on its screen may not be the building's.
- **Where am I.** `navigator.geolocation.watchPosition` starts on the button and is cleared when the screen closes. `onDrawing()` maps the fix to the drawing; the effect appends a `<g class="me">` (disc + dot) to the injected SVG and removes it when she is off the drawing. Nothing about her position is stored or sent.

## Phase 61 — The Google map inside the app
- **Key.** `env.googleMapsEmbedKey` (`GOOGLE_MAPS_EMBED_KEY`). `GET /api/maps/config` returns `{ embedKey }` or null; the client asks once (`mapsEmbedKey()`, a cached promise that is dropped if the request fails).
- **Button and sheet.** `DirectionsButton` renders an `<a href={directionsUrl(to)} target="_blank">`. Its click handler does nothing without a key or with a modifier key; otherwise it prevents the navigation and mounts `DirectionsSheet` (portal, `role="dialog"`, Escape and backdrop close). The sheet calls `getCurrentPosition` once (12 s limit), rounds the fix to five decimal places (about a metre), and renders one iframe: `embedUrl(key, to, from, lang)` → `…/maps/embed/v1/directions?key&origin&destination&mode=walking&language&region=TH`, or `…/place?key&q&zoom=18…` when there is no fix.
- **What cannot be styled.** The embed's parameters are the map type, zoom, centre, language and region. The sheet round it uses the app's tokens; the map itself is Google's.

## Phase 62 — Five sections instead of "More"
- **Data.** `sections.ts` holds page ids and the five sections with no imports, so the test can check that every page is in exactly one section. `destinations.tsx` maps each id to its screen, icon, label and `narrow` flag.
- **Shell.** `Shell` keeps `tab` (a page id, or `"settings"`) and `last` (the page each section was left on). `open()` is still the one way to change page: it asks first when the current screen holds work that would be lost. `openSection()` picks `last[section]` or the section's first page.
- **Three frames.** Phone and rail draw the five sections as the menu and the current section's pages as a `role="tablist"` above the screen. The sidebar draws each section as a labelled group of page rows and no tablist. Settings is a button with `aria-current` in all three.

## Phase 63 — One plan, one record of results, one progress page
- **results.ts.** `courseResults()` is `enrollments` rows with status PASSED or FAILED, plus `passed_courses` rows for courses not already passed in a term (term `null`). `setResult(user, course, status | null, grade?, term?)` writes one term's result: the term given, else the latest term the course is in `plan_items`, else no term (then only PASSED can be kept). It always removes the course's `passed_courses` row first, keeps the existing grade when `grade` is undefined, and never touches another term's row. `setPassedList()` diffs against `passedCourses()`: an unticked course loses its PASSED rows in every term.
- **Grades.** `gradesFor()` builds the page: terms that have `plan_items` (each item's status is that term's result, or PASSED if the course was passed before the app), `before` (no-term passes not in any term), `blocked` (a prerequisite not passed, where prerequisites are recorded), the average and the scale. `POST /api/enrollments` takes `term_id` so the row in the card that was changed is the one written.
- **Trail.** `passedCreditsByCategory()` sums passed credits by `program_courses.category` for the student's program; a course outside it counts as FREE. `/api/trail` caps each at the requirement.
- **Progress.** One component fetches `/api/analytics`, `/api/weakness` and the 30-day history together; mastery per course comes from the weakness data, looked up by course code.

## Phase 64 — The iOS app, a first shell
- **What it is.** `native/` is a Capacitor 8 project (not a workspace). `capacitor.config.json` sets `server.url` to the web app's address, so the web view loads the live site; the session cookie is first-party and nothing in the client or server changes. Full notes: `docs/IOS_APP.md`.
- **Navigation.** Capacitor allows a navigation whose address starts with `server.url`; any other top-level navigation or new window is handed to iOS (Safari, or the Maps app for a Google Maps link). Frames inside a page (the embedded Google map) load in place.
- **When the site cannot be reached.** `server.errorPath` shows `native/www/index.html` from inside the app. It reads the site's address from `WEBVIEW_SERVER_URL`, which the shell sets, with a copy in the page as a fallback (kept equal to the config by `brand.test.ts`); it retries on the button and on the `online` event.
- **Telling the web app.** Capacitor injects `window.Capacitor` before the page's scripts on every page it shows. `inNativeApp()` reads it. A web view has no service worker (so no offline cache and no web push) unless the app declares app-bound domains, which is not done.
- **Signing and upload.** Automatic signing with the team in the project. `testflight.sh` archives with the build number set to the UTC time, then exports with `destination: upload` and `testFlightInternalTestingOnly`. `run-on-mac.sh` builds for "My Mac (Designed for iPad)" and opens the app inside the wrapper bundle a Mac needs for an iOS app.

## Phase 65 — Google sign-in inside the iOS app
- **Why not the browser flow.** Google blocks its sign-in page in an embedded web view, and Capacitor hands a top-level navigation to another site to Safari, where the callback would set Safari's cookie, not the app's.
- **The sheet.** `AppSignIn.swift` holds `MainViewController` (Capacitor's view controller plus `registerPluginInstance`) and `AppSignInPlugin`, exported to every page as `Capacitor.Plugins.AppSignIn` (Capacitor injects local plugins as user scripts, so the web app needs no Capacitor package). `start({ url })` runs an `ASWebAuthenticationSession` with the bundle identifier as callback scheme and resolves with the address it returned to. `isOwnSite` limits `url` to https under `server.url` (same host and port, no user info, no `..`).
- **The hand-off.** `client/src/native.ts` `googleSignInInApp()` makes a 32-byte verifier, sends its base64url SHA-256 as `?app=`, and redeems the returned code with the verifier. Server: `/auth/google` passes `app.<challenge>` as the OAuth `state` (passport-oauth2 sends a string state through unchanged); the callback reads it with `challengeFromState`, and for the app issues a code (`createHandoffs().issue`) and redirects to `appReturnUrl(env.iosAppScheme, …)` without `req.logIn`; `/auth/app/redeem` calls `req.logIn` for the web view. `createHandoffs` keeps `sha256(code) → { userId, challenge, expires }` in a `Map` (2 minutes, at most 2,000, oldest dropped), deletes on first lookup, and compares challenges in constant time.
- **Why the verifier.** A custom URL scheme can be claimed by another app. The system sheet delivers its callback only to the app that opened it, and the verifier means a code seen anywhere else is still useless.
- **The login page.** In a browser: the link, as before. In the app with the plugin: a button that runs the flow (`busy` while the sheet is open; cancelling shows nothing; any failure shows `auth.googleFailed`). In the app without the plugin: `auth.appTooOld`.

## Phase 66 — The site moves to termtrail.com
- **Old addresses.** `parseOldAddresses(MOVED_FROM)` gives `{ host, path }` pairs. `movedTo()` matches a request by host (port ignored, case ignored) and, for a sub-path, by `path` or `path/…`; the target is `APP_URL` + the rest of the path + the query. A target that would itself match the same old address is skipped, so a mistaken list cannot loop.
- **Where it sits.** `index.ts` builds an outer Express app when `BASE_PATH` or `MOVED_FROM` is set: the redirect first, then the real app mounted at `BASE_PATH || "/"`. `req.hostname` is the visitor's host because the outer app trusts the proxy in production and the tunnel passes the Host header through.
- **What an address owns.** The session cookie, push subscriptions, the service worker and an installed Home Screen copy are all per origin, so none of them follow a move. The database does not care.
- **The iOS app.** `server.url` decides what stays inside the app; a redirect to another host is a top-level navigation elsewhere and is handed to Safari. So an address change needs a new build, not just a redirect.
- **The worker and `/api/`.** Workbox's `navigateFallback` answers a navigation with the cached `index.html`. With no denylist that includes navigations to the server's own addresses: the Google sign-in start and return, a calendar export, an uploaded file. `navigateFallbackDenylist: [/\/api\//]` sends those to the network. The pattern is tested against the path and query, so it works at the top of a site and under a sub-path. `registerType: "autoUpdate"` means a browser that has the old worker takes the new one on its next load and reloads once.

## Phase 67 — The front page
- **Where it is.** `App.tsx` shows `Login` to anyone signed out, so the front page is `screens/Login.tsx` (the first screen) plus `components/Landing.tsx` (everything below). Inside the iPhone app the App Store parts are hidden (`inNativeApp()`).
- **The trail.** `components/Trail.tsx` `TrailPath` is an absolutely positioned SVG over the whole page wrapper (z-index 1), measured in a `useEffect` (the wrapper's ref is attached only after children's layout effects) and again on `ResizeObserver`, window resize and `document.fonts.ready`. The mountain is drawn on a 1440 × 420 grid with the summit at (720, 20) and placed so the summit is 28 px under the sign-in column and the foot at the bottom of the first screen, stretched to reach both page edges. The trail is a Catmull-Rom spline (`smoothPath`) through: the base of the amber cap, the switchbacks, then for each `data-trail-stop` the marker and two points out to the side of its row, and last the trailhead. Content above it is `relative z-[2]` (the first screen's content is `z-10`).
- **Screenshots.** `scripts/landing-shots.mjs` drives a throwaway headless Chrome over CDP at 390 × 844, device scale 2, dark theme; it signs in with the dev login as a made-up student, sets them up once (onboarding, the trail's courses, a study plan, the trail aimed at its earliest possible term, two to-dos in the language being shot) and writes WebP files with sharp. It refuses any origin that is not localhost.

## Phase 68 — This term on the trail
- **Data.** `thisTermCourses(db, user)` = `termCourses(this term)` ∪ `suggestedCourses().codes` (the plan with `ignoreChosen`), joined to `courses` and the student's `program_courses` for credits and category, sorted by code. Sent as `thisTerm` with GET /api/trail.
- **Ticking.** The card keeps `ticked` (optimistic) and `dropped` (rows unticked this visit). A tick PUTs the full set to /api/term-courses, fires `REMINDERS_CHANGED` (Today, timetable and exams reload) and reloads the trail. `loadTrailInput` then counts the ticked courses as done and starts the plan next term, so the later terms re-plan. With nothing ticked the plan's first term is this term: its card is not repeated below, and its elective places are listed in the This term card.
- **Labels.** `plannedFor(code)` finds the later term holding an unticked course, for "Not registered · moved to <term>".

## Phase 69 — Summer terms, the real credit limits, a goal that always shows its effect
- **One answer.** `trailPayload(db, user)` builds everything the trail screen shows (goal, plan, this term, `otherSummers`, `lastSummer`, categories). GET /api/trail sends it; PUT /api/trail/goal saves and sends it too (`{ ok: true, ...payload }`). The screen keeps `pendingGoal` (the change shown on the controls at once), `saving` (dims the verdict and plan, "Re-planning…", `aria-busy`) and `goalFailed` (said in the goal card), and sets its data from the PUT's answer. Requests for the plan are numbered (`latest`); only the newest answer is applied, `inflight` holds the newest and a save awaits it (`settled()`) before unlocking; `load(true)` reports a failure inside the card instead of the full-screen error. A failed PUT re-reads the plan (it may have been saved). `busy` (a goal save or a tick) disables the goal controls, the ticks, Edit courses and the passed list.
- **No stored answers.** `index.ts` sets `Cache-Control: no-store` on everything under /api before auth; `getJSON` fetches with `cache: "no-store"`. The worker's NetworkFirst copy of /api/today (offline only) is unaffected.
- **Limits.** `CREDIT_LIMITS = { regular: 22, summer: 9, regularMin: 9 }` (regulation B.E. 2560, cl. 13.4). The goal schema takes 9–22, a multiple of 3 or exactly 22; `trailGoal` reads a stored ceiling of 22 or more as 22 and anything else as the multiple of 3 below it, at least 9; a stored target not after the current term reads as the default. The pacing loop (9, 12 … 21) falls back to the full limit, so 22 is reachable.
- **Summers switched the other way.** `otherSummers(input)` reruns `buildTrail` with `summers` flipped (and, when the plan starts next term, `firstTerm` re-worked: the summer straight after this term when summers are on) and returns its `achievable` and `earliestTerm`.
- **Past summers.** `term_offerings` rows for S/67 and S/68 (migration 039, `scripts/import-ru-past-term.mjs`). Every reader of `term_offerings` filters by term, so they never reach a timetable. `lastSummer(db, codes, now)` picks each course's latest summer not after now and groups its sessions back into printed lines (`days` 1–7, start, end, room, kind; `text` when no day was printed), with the exam date and period or the registrar's note.
- **The reader.** `scripts/lib/mr30.mjs`: `DAY_GROUPS` (MWF, TTS) in `sessionsOf`; the page header is everything above that page's first column-header row (except department headings), found per page; `offeringRow` and `q` shared by both importers.

## Phase 70 — e-Testing 2/2569 on the calendar, with early reminders
- **Data.** `etesting_schedule` (019) gains `registration_opens`, `registration_closes`, `central_closed` (JSON ranges), `regional_dates` (JSON list), `announced`, `source` (040). The 2/69 row is updated only if its four dates still match the announcement.
- **Calendar.** For a Ramkhamhaeng student, `/api/calendar` takes every `etesting_schedule` row whose registration or exam window overlaps the month and pushes an `etesting` entry for each registration day (the first carries `start_time` = the opening) and for each central testing day not inside a `central_closed` range (description 09:00–17:30 Mon–Fri, 09:00–20:30 Sat–Sun). `EventRow` and `TimeGrid` show `name_en` in English for entries with no course.
- **Reminders.** `universityReminders(db)` derives, per schedule row, three `{ key, date, time, title{th,en}, note{th,en} }` (week before at 09:00, opening, last day at 09:00). `syncUniversityReminders(db, user, lang, now)` (RU students only, one transaction) inserts each not-yet-given one whose day is not past in Bangkok, recording `reminder_sources(user, key, reminder_id, lang, title, note, date, time)`. A recorded one is never inserted again (deleted = gone for good). If the reminder still has exactly the recorded title, note, date and time it is rewritten to the current wording, language, date and time (a moved one loses its `reminder_pushes` rows so it is announced again); past days are never touched; if she edited it and the university's date moved, a new reminder is added and the record points to it. `readingLanguage()` = `user_profiles.ui_lang` (set by the route), else the newest subscription's `lang`. `sendDuePushes` computes `universityReminders()` once per round and wraps each student's sync in try/catch. Callers: `POST /api/reminders/university` (App shell, on start and language change; fires `REMINDERS_CHANGED` if anything changed) and `sendDuePushes` (each subscribed student, newest device's language) before working out what is due.

## Phase 71 — The term preview, e-Testing bookings, the university's links
- **Sums.** `client/src/termFit.ts` (pure): `meetings()` reads "1 08:30-11:00;3 13:00-15:00"; `weekFit(courses, dates, commitmentsOn)` puts classes on each date, lists overlaps class×class (different courses) and class×commitment (commitments with an end time only), counts class days and hours; `examFit(courses, finals)` lays out every day of the fortnight with periods A/B, clashes (≥2 in a period), exam days, weekday exam days, two-in-a-day, faculty-set, no final, e-Testing-able. `weekOf`/`weekdayOf` are Monday-first.
- **Data.** `server/src/termExams.ts`: `courseExams(db, term, codes)` (term_offerings + etesting_courses), `termExamWindows(db, term)` (`term_start` from plan_terms, finals min/max of term_offerings dates, the etesting_schedule row with `central_closed` parsed), `etestingBefore(db, codes, now)`. `/api/term-courses` options carry `exam_*`, `etesting`, `etesting_essay`, and the response `windows`. The trail payload carries `examWindows`, `etestingBefore`, and `thisTerm.courses[].classes` + exam fields (a bound `?` for the term in the class subquery). `GET /api/commitments?from&to` (≤ 31 days) returns her timed, non-to-do occurrences per date.
- **Screens.** `TermPreview` (portal dialog, z-60 over the picker's z-50; tabs Week/Exams; week arrows; a picked day shows the day grid) and `FitSummary` (one line; fetches the week's commitments). `TermCoursesPicker` shows them from `picked`; Trail shows them from registered courses, or the suggestions before any are registered, and passes `canBook` when registered.
- **Bookings.** `etesting_bookings(user, term, course) → centre, date, period` (041). `testingDays(schedule, centre)`, `periodsOn(date)`, `checkBooking()` → `NOT_REGISTERED | NOT_ON_LIST | NO_SCHEDULE | NOT_A_TESTING_DAY | NO_SUCH_PERIOD | PERIOD_TAKEN`. `/api/calendar` adds `etbooked` entries (period hours) for RU students; `Calendar.tsx` draws `etbooked` solid and `etesting` at 45% opacity, with its own legend label. `scripts/import-ru-curriculum.mjs` REFERRING includes `etesting_bookings`.
- **Links.** `client/src/ruLinks.ts` `RU_LINKS`; `RuLink` (in TermPreview.tsx) opens them outside the app.

## Phase 72 — Calendar linking: a subscribe feed and busy times
- **Feed.** `buildFeed(db, user, now)` writes VCALENDAR with a fixed +07:00 VTIMEZONE; classes from `class_sessions` (first weekday on/after `plan_terms.start_date`, `RRULE:FREQ=WEEKLY;BYDAY=..;UNTIL=<day before finals>T165959Z`), finals from `courseExams` + `EXAM_PERIODS`, e-Testing registration as an all-day TRANSP:TRANSPARENT event, bookings joined to `plan_items`. `fold()` folds at 75 octets by whole characters. Routes: GET/POST/DELETE `/api/calendar-feed` (POST makes or replaces the token), public `GET /cal/:token.ics` (`serveFeed`, `Cache-Control: private, max-age=900`).
- **Busy times.** `busyTimes.ts`: `availableSource()` (plugin present → iphone; Google client configured → google), `chosenSource()`/`connect()`/`disconnect()` (localStorage `studyos.busy`, event `studyos:busy-changed`), `prepareGoogle()` (loads GIS, makes the token client before any tap), `busyBetween(fromDate, toDate)` → `{ source, blocks } | { needsTap } | { error } | null`. Google: POST `https://www.googleapis.com/calendar/v3/freeBusy` with `items: [{ id: "primary" }]`. iPhone: `Capacitor.Plugins.AppCalendar.status|request|busy`.
- **Use.** `termFit.blocksByDay(blocks, dates)` and `finalsInBusyTime(examFit, busyOn)`; `TermPreview.useBusy(dates)` merges busy blocks as commitments (`kind: "busy"`), fetched for the shown week and for the finals fortnight; `BusyNote` shows the hint / refresh / cannot-read line.


## Phase 73 — North-star fixes: honest plans for a working student
- **Her exams in one place.** `server/src/myExams.ts` `myExams(db, user, term?, today?)`: for each course in `plan_items` this term, the printed final (`exams`), `facultySet` (term_offerings has an exam note and no date), the date she entered (`my_exams`, migration 043, only where the registrar gives none), her e-Testing booking (`etesting_bookings`, period hours from `ETESTING_PERIODS`), her seat, and `next` = the earliest of those on or after `today` (a booking comes before its final). Used by the study plan, Today's next exam, Progress risk, the Exams page, `examReminders`, the calendar and the feed. Routes: GET `/api/my-exams`, PUT `/api/my-exams/:code` (`exam_date` only for a faculty-arranged exam → else 400 HAS_DATE; `seat`; 404 NOT_REGISTERED).
- **Study plan.** `dayCapacity(db, user, settings, from, to)`: weekday/weekend hours; 0 on `blocked_dates`; on a day where her own timed events (`occurrencesInRange`, kind `event`, with an end) add up to `LONG_DAY_HOURS` (6) the setting `workday_hours` (`sp_workday_hours`, default 1); all × 0.8. `generatePlan(db, user, done)` books each exam's last week first (−7…−3 review 30 + quiz ≤40, −2/−1 mock ≤ `MOCK_MINUTES` 150), earliest exam first, then reading round-robin to each course's deadline (exam − 8), all from the same per-day budget. Generate carries the old active plan's done tasks over (sort_order −1, done) and skips reading chunks / chapter quizzes already done (`doneKey`). `planFingerprint` (settings, courses' next exams, chapters, capacity) is stored in `settings_json.fingerprint`; GET `/api/studyplan` returns `plan.stale` when it differs, or when a planned exam has passed and another is ahead. Reschedule only moves a task to a day before its course's exam with room (`noTime` lists the rest).
- **No hidden target.** `studyTargets` = this week's planned minutes per course from the active plan (null without one); `studyToday` = today's tasks + overdue count, shown on Today (`StudyTodayCard`).
- **Starting goal.** `trailRoutes.ts`: `entryYearOf` (69, 2569, Thai digits, 2026 → "69"; stored normalised by PUT /api/profile); `storedGoal`; `startingTarget(input, entryGuess)`; `trailGoal` and `trailPayload` use it when she has set no target. `failEffect(db, user, failed)` is returned by POST `/trail/term-check` and drives `FailSheet` in `TermCourses.tsx`.
- **Reminders from her exams.** `examReminders(db, user, today)` in `universityReminders.ts` (keys `final:`, `etbooked:`, `own:`, `seat:`, `leave:` + term), merged into `syncUniversityReminders`; untouched reminders follow wording changes; personal ones no longer wanted (dropped course, removed booking) are deleted if untouched and still ahead.
- **Clashes.** `findExamClashes` compares periods when both have one, else hours (`ownExamRows`). The preview's `finalsInBusyTime` gets `ownBusy(commitments)` as well as calendar busy blocks.

### บทเรียนที่เตรียมไว้ล่วงหน้า

หน้าเรียนเปิดคลังบทเรียนได้โดยตรงที่ `?view=lectures` ตาราง `shared_lecture_transcripts` และ `shared_lecture_summaries` เก็บต้นฉบับหนึ่งชุดต่อวิดีโอ รหัสวิชาที่ใช้วิดีโอเดียวกันชี้ไปยังต้นฉบับเดียวกัน นักศึกษาทดลองอ่านได้ตามรายชื่อใน `SHARED_LECTURE_USERS` ส่วนสรุปที่แก้เอง โน้ต และรูปของแต่ละคนผูกกับบัญชีตนเอง รายละเอียดการนำเข้าอยู่ใน `docs/LECTURE_TRANSCRIPTS_PLAN.md`

## Phase 78 — จดโน้ตประกอบสรุป

นักศึกษาขีดเส้นใต้หรือวงข้อความเพื่อจดเพิ่ม ระบบผูกลายมือกับคำที่เลือกและบันทึกรูปกับสีไว้ในบัญชีของตน เมื่อให้ AI อ่านลายมือ นักศึกษาตรวจคำก่อนใช้ในการค้นหาหรือรวมโน้ต แอป iOS ใช้ PencilKit และใช้ Apple Speech เมื่อแตะพูด เบราว์เซอร์ใช้กระดานเขียนและระบบรับเสียงของเบราว์เซอร์

เมื่อเลือกรวมโน้ต AI เลือกบรรทัดสรุปที่สัมพันธ์กับข้อความของนักศึกษา เซิร์ฟเวอร์ตรวจตำแหน่งแล้วดึงคำกับสีจากต้นฉบับของเจ้าของ เลือกแยกเพื่ออ่านสรุปและคำจดคนละส่วน

รูปที่บันทึกกับโน้ตเปิดให้อ่านเป็นแผนภาพ สมการ และข้อความได้ นักศึกษาตอบคำถามที่ AI ยังไม่แน่ใจพร้อมกัน รูปต้นฉบับยังเปิดดูได้เสมอ บทเรียนที่บันทึกไว้ การแก้ไข และคำตอบจากการอ่านรูปเก็บใน SQLite ชุดสำรองประจำวันรวมตารางเหล่านี้ด้วย

## Phase 79 — Lecture navigation and layout

Under Study, the sidebar’s **Lecture notes** destination opens the lecture list and provides access to documents and personal notes. Course rows show how many summaries are available. The lecture list and linked personal notes use a single **Notes** shortcut to open the reader’s **Notes** tab. The reader shows a single chronological list of personal notes below the available summary. Transcript and Watch are available where applicable.

The Notes tab and the Transcript preview share an **AI summary** heading with the textbook reminder beside it.

Migration 049 adds `lecture_note_layouts` keyed by student and catalogue lecture. An existing row in `created_lecture_notes` seeds the layout for that student and lecture from the copy’s saved mode. The older layout preferences and generated copies are retained for compatibility. The current reader uses the same notes section for every lecture.

The production entry at `/api/open/lectures?view=lectures&summary=MGT3204-1` serves the app through the network even with an older installed service worker. The browser keeps the requested lecture in the current tab through sign-in. The authenticated lecture list determines whether that student can open its summary.

## Phase 80 — Handwritten notes

The note input opens the annotation editor full screen, using PencilKit in the iOS app and the shared canvas in browsers. Browser drafts keep editable strokes. Migration 050 records which private attachment is the handwritten original. The server preserves its uploaded PNG or JPEG and skips automatic summarisation for the note. Tapping **Generate notes from handwriting** runs the existing DeepSeek sketch-v4 reading for that page. The reader keeps the original thumbnail available before and after generation. Transcript timestamp targets, search matches and text selections use a pale yellow highlight.

## Phase 81 — Inline annotations

A saved underline or circle belongs to one student and one source. Each rendered sentence has a stable key and a place for its annotations. The reader reconciles the key, quote and surrounding text when the page changes. A transcript search excludes hidden cues, and an inserted personal note stays outside the text used for locating marks.

The summary accepts marks directly. Underlines use the visible character boxes on the marked line, including when the stroke extends into a margin or below the letters. Circles use the characters inside the loop. The selected words show their mark immediately and the handwriting editor opens below the scrollable lecture.

There is space below a sentence for another underline after a note has been added. A touch that begins in that gap uses its actual screen position, even when the browser associates the touch with the nearby yellow note. Tapping the note opens its editing menu.

The iOS reader uses PencilKit when the installed app registers both `AppInk.drawInSheet` and `closeSheet`. A child view controller covers the lower half of the web view so the reading pane above it can still receive touches. Saved PencilKit strokes reopen for editing. Browsers, older app builds and notes previously edited as images use the web canvas in the same lower pane.

Migration 051 identifies the source and records the transcription status. Saving ink stores the original before starting recognition. Successful recognition displays a pale yellow sub-bullet at the marked sentence. Revising the text or ink uses the current revision so an older recognition result cannot overwrite a correction. Search opens the matching annotation in its source.


## Lecture note editing and automatic updates

The summary and transcript share one **My Notes** list for a lecture. Each saved note keeps its own identity for edits and deletion. Linked images share the gallery after the list. Opening the editor puts the reading and writing areas in independently scrollable panes. Expanding the editor keeps the current draft.

Saving lecture notes updates the combined document in the background. Clarifying answers become eligible when saved. Matching sources are linked to their summary points from the list. Margin annotations retain their positions at the marked sentences.
