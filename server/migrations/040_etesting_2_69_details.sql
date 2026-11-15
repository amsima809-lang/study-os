-- Migration 040: the details of e-Testing for term 2/2569 that migration 019 did not have, and
-- a record of the reminders the app adds for students from the university's dates.
--
-- Source: the e-Testing office's (สวอ., สถาบันบริการวิชาการทางอิเล็กทรอนิกส์) announcement
-- "การสอบ e-Testing ภาคเรียนที่ 2/2569", dated 26 October 2569 (ประกาศ 26 ตุลาคม 2569), two images
-- posted on its Facebook page "e-Testing สวอ. มหาวิทยาลัยรามคำแหง" on 27 Oct; website
-- https://easi.ru.ac.th, telephone 02-310-8790. Read 15 Nov 2569. What it prints:
--   * registration for central and regional students: 21-25 December 2569, in E-SERVICE,
--     which opens at 10:00 (ลงทะเบียนในระบบ E-SERVICE ระบบเปิด 10:00 น.)
--   * central centre (Hua Mak): exams 12 January - 7 March 2570, EXCEPT 21-26 January and
--     20-22 February 2570 (เว้นสอบ 21-26 มกราคม และ 20-22 กุมภาพันธ์ 2570)
--   * regional centres (Chiang Mai, Prachinburi, Khon Kaen, Nakhon Si Thammarat, Songkhla):
--     9, 10, 15, 16, 17, 27, 28, 29 January; 1, 2, 3, 4, 5, 12, 13, 14, 26, 27, 28 February;
--     5, 6, 7 March 2570
--   * a student may sit at any centre; fee 200 baht a course (central), 300 (regional)
--   * Monday-Friday 3 periods, Saturday-Sunday 4: 09:00-11:30, 12:00-14:30, 15:00-17:30,
--     18:00-20:30
--   * 134 courses; ANT1013, ANT2078, ANT3013 are part essay and their results are not known at
--     once. (The list is the same 134 codes migration 019 has, essay flags included.)
-- And from the office's own news page for 2/2569 (https://easi.ru.ac.th, which redirects to
-- https://sites.google.com/rumail.ru.ac.th/easi), read 15 Nov 2569: the system "เปิด 21 ธันวาคม
-- เวลา 10.00 น. และปิด 25 ธันวาคม เวลา 21:30 น."; its 2569 registration manual: each booking is
-- paid by QR code by 21:30 the same day, and a confirmed booking cannot be changed.

ALTER TABLE etesting_schedule ADD COLUMN registration_opens TEXT;   -- HH:MM the registration system opens on the first day
ALTER TABLE etesting_schedule ADD COLUMN registration_closes TEXT;  -- HH:MM it closes on the last day
ALTER TABLE etesting_schedule ADD COLUMN payment_deadline TEXT;     -- HH:MM by which a booking is paid, the same day (the manual)
ALTER TABLE etesting_schedule ADD COLUMN central_closed TEXT;       -- JSON [[from, to], …]: days in the exam period the central centre does not test
ALTER TABLE etesting_schedule ADD COLUMN regional_dates TEXT;       -- JSON [date, …]: the only days the regional centres test
ALTER TABLE etesting_schedule ADD COLUMN announced TEXT;            -- date of the announcement
ALTER TABLE etesting_schedule ADD COLUMN source TEXT;               -- where it was read

UPDATE etesting_schedule SET
  registration_opens = '10:00',
  registration_closes = '21:30',
  payment_deadline = '21:30',      -- manual p.10: "ควรชำระก่อน 21:30 น. ของแต่ละวัน"
  central_closed = '[["2027-01-21","2027-01-26"],["2027-02-20","2027-02-22"]]',
  regional_dates = '["2027-01-09","2027-01-10","2027-01-15","2027-01-16","2027-01-17","2027-01-27","2027-01-28","2027-01-29","2027-02-01","2027-02-02","2027-02-03","2027-02-04","2027-02-05","2027-02-12","2027-02-13","2027-02-14","2027-02-26","2027-02-27","2027-02-28","2027-03-05","2027-03-06","2027-03-07"]',
  announced = '2026-10-26',
  source = 'สวอ. announcement "การสอบ e-Testing ภาคเรียนที่ 2/2569", 26 Oct 2569 (Facebook: e-Testing สวอ. มหาวิทยาลัยรามคำแหง; https://easi.ru.ac.th)',
  notes = 'จ-ศ สอบ 3 คาบ / ส-อา สอบ 4 คาบ: คาบ1 09:00-11:30, คาบ2 12:00-14:30, คาบ3 15:00-17:30, คาบ4 18:00-20:30'
WHERE term_id = '2/69'
  AND registration_start = '2026-12-21' AND registration_end = '2026-12-25'
  AND exam_start = '2027-01-12' AND exam_end = '2027-03-07';

-- Reminders the app put in a student's list from the university's dates (server/src/universityReminders.ts).
-- One row per student and reminder, kept after she deletes the reminder, so it is never put back.
CREATE TABLE IF NOT EXISTS reminder_sources (
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  source_key  TEXT NOT NULL,              -- e.g. "etesting:2/69:open"
  reminder_id INTEGER,                    -- the reminder made (NULL once it is deleted)
  lang        TEXT NOT NULL CHECK (lang IN ('th','en')),
  title       TEXT NOT NULL,              -- what was put in (wording, day and time), to tell an untouched
  note        TEXT,                       -- reminder from one she edited, and to move it if the
  date        TEXT NOT NULL,              -- university changes the date
  time        TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, source_key)
);

-- The language the student last read the app in, so reminders made for her (above) follow the
-- app rather than whichever device last turned notifications on.
ALTER TABLE user_profiles ADD COLUMN ui_lang TEXT CHECK (ui_lang IN ('th','en'));
