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
- Photos: `client/public/campus/*.webp` (900×1600), credits in `docs/PHOTO_CREDITS.md`. No university logos or emblems are used.

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

