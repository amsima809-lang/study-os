-- Migration 059: the six other subjects on Ramkhamhaeng's "VOD Subtitle" lecture site
-- (https://sub-demo.ru.ac.th/student/), so their recordings can be served like the first four
-- (migrations 025 and 044). These courses are outside the Business Administration curriculum:
-- they are NOT added to any programme (program_courses), so the term picker, timetable, trail and
-- notes course list do not change. They exist only to carry lecture links and shared lecture
-- material. Category FREE because, for a B.B.A. student, they could only count as free electives.
--
-- Names: Thai and English from the university's admission guides (cited per course below);
-- credits from the registrar's 2/2569 list (migration 032). A former code (LAW1001, LAW1002,
-- MCS1151) shares its recording with the current code. LAW1001 and LAW1002 are still offered in
-- 2/2569 for students with ID 62 (registrar's notes); MCS1151 is printed beside CDM2103 as its
-- former code. The importer makes the CURRENT code the original, so it is the one listed.
-- Links: docs/research/ru-lecture-links.json (read 2026-11-14), checked against the transcript
-- bundles collected 2026-11-16. Missing session numbers were cancelled on the site. LAW1003,
-- LAW2002 and LAW3001 had no recordings, so they are not added.

-- CDM1101: admission guide 2569, Faculty of Communication Arts chapter (Center_study_plan/21/11_69.pdf) p. 5–6
INSERT INTO courses (code, name_th, name_en, credits, category, notes) VALUES ('CDM1101', 'นิเทศศาสตร์และสื่อดิจิทัลเบื้องต้น', 'Introduction to Communication Arts and Digital Media', 3, 'FREE', 'Lecture recordings only; not in the B.B.A. curriculum')
  ON CONFLICT(code) DO NOTHING;
-- CDM2103: admission guide 2569, 11_69.pdf p. 5: CDM2103 (MCS1151)
INSERT INTO courses (code, name_th, name_en, credits, category, notes) VALUES ('CDM2103', 'ทฤษฎีการสื่อสาร', 'Communication Theory', 3, 'FREE', 'Lecture recordings only; not in the B.B.A. curriculum')
  ON CONFLICT(code) DO NOTHING;
-- MCS1151: former code of CDM2103: admission guide 2569, 11_69.pdf p. 5
INSERT INTO courses (code, name_th, name_en, credits, category, notes) VALUES ('MCS1151', 'ทฤษฎีการสื่อสาร', 'Communication Theory', 3, 'FREE', 'Lecture recordings only; not in the B.B.A. curriculum')
  ON CONFLICT(code) DO NOTHING;
-- LAW1101: admission guide 2569, Faculty of Law chapter (Center_study_plan/21/04_69.pdf) p. 8
INSERT INTO courses (code, name_th, name_en, credits, category, notes) VALUES ('LAW1101', 'หลักกฎหมายมหาชน', 'Principle of Public Law', 2, 'FREE', 'Lecture recordings only; not in the B.B.A. curriculum')
  ON CONFLICT(code) DO NOTHING;
-- LAW1001: former code of LAW1101: Faculty of Law guide 2563 (Center_study_plan/15/03-1_คณะนิติศาสตร์_63.pdf) p. 6
INSERT INTO courses (code, name_th, name_en, credits, category, notes) VALUES ('LAW1001', 'หลักกฎหมายมหาชน', 'Principle of Public Law', 2, 'FREE', 'Lecture recordings only; not in the B.B.A. curriculum')
  ON CONFLICT(code) DO NOTHING;
-- LAW1102: admission guide 2569, 04_69.pdf p. 7
INSERT INTO courses (code, name_th, name_en, credits, category, notes) VALUES ('LAW1102', 'หลักกฎหมายเอกชน', 'Principle of Private Law', 2, 'FREE', 'Lecture recordings only; not in the B.B.A. curriculum')
  ON CONFLICT(code) DO NOTHING;
-- LAW1002: former code of LAW1102: Faculty of Law guide 2563 p. 6
INSERT INTO courses (code, name_th, name_en, credits, category, notes) VALUES ('LAW1002', 'หลักกฎหมายเอกชน', 'Principle of Private Law', 2, 'FREE', 'Lecture recordings only; not in the B.B.A. curriculum')
  ON CONFLICT(code) DO NOTHING;
-- POL1101: admission guide 2569, Faculty of Political Science chapter (Center_study_plan/21/09_69.pdf) p. 6
INSERT INTO courses (code, name_th, name_en, credits, category, notes) VALUES ('POL1101', 'การเมืองการปกครองไทย', 'Thai Politics and Government', 3, 'FREE', 'Lecture recordings only; not in the B.B.A. curriculum')
  ON CONFLICT(code) DO NOTHING;
-- POL2106: admission guide 2569, 09_69.pdf p. 6
INSERT INTO courses (code, name_th, name_en, credits, category, notes) VALUES ('POL2106', 'ปรัชญาการเมืองเบื้องต้น', 'Introduction to Political Philosophy', 3, 'FREE', 'Lecture recordings only; not in the B.B.A. curriculum')
  ON CONFLICT(code) DO NOTHING;

INSERT OR IGNORE INTO course_lectures (course_code, session_no, url) VALUES
  ('CDM1101', 1, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=187'),
  ('CDM1101', 2, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=188'),
  ('CDM1101', 3, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=189'),
  ('CDM1101', 4, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=208'),
  ('CDM1101', 5, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=209'),
  ('CDM1101', 6, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=210'),
  ('CDM1101', 7, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=211'),
  ('CDM1101', 8, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=212'),
  ('CDM1101', 9, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=213'),
  ('CDM1101', 10, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=214'),
  ('CDM1101', 11, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=215'),
  ('CDM1101', 12, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=216'),
  ('CDM2103', 1, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=97'),
  ('CDM2103', 2, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=98'),
  ('CDM2103', 3, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=99'),
  ('CDM2103', 5, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=105'),
  ('CDM2103', 6, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=106'),
  ('CDM2103', 8, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=112'),
  ('CDM2103', 11, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=113'),
  ('CDM2103', 12, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=114'),
  ('CDM2103', 14, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=115'),
  ('CDM2103', 15, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=221'),
  ('MCS1151', 1, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=97'),
  ('MCS1151', 2, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=98'),
  ('MCS1151', 3, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=99'),
  ('MCS1151', 5, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=105'),
  ('MCS1151', 6, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=106'),
  ('MCS1151', 8, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=112'),
  ('MCS1151', 11, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=113'),
  ('MCS1151', 12, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=114'),
  ('MCS1151', 14, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=115'),
  ('MCS1151', 15, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=221'),
  ('LAW1001', 1, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=201'),
  ('LAW1001', 2, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=148'),
  ('LAW1001', 3, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=149'),
  ('LAW1001', 5, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=150'),
  ('LAW1001', 6, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=151'),
  ('LAW1001', 8, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=170'),
  ('LAW1001', 9, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=182'),
  ('LAW1001', 11, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=185'),
  ('LAW1001', 12, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=207'),
  ('LAW1001', 14, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=217'),
  ('LAW1001', 15, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=218'),
  ('LAW1001', 16, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=219'),
  ('LAW1101', 1, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=201'),
  ('LAW1101', 2, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=148'),
  ('LAW1101', 3, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=149'),
  ('LAW1101', 5, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=150'),
  ('LAW1101', 6, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=151'),
  ('LAW1101', 8, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=170'),
  ('LAW1101', 9, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=182'),
  ('LAW1101', 11, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=185'),
  ('LAW1101', 12, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=207'),
  ('LAW1101', 14, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=217'),
  ('LAW1101', 15, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=218'),
  ('LAW1101', 16, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=219'),
  ('LAW1002', 2, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=168'),
  ('LAW1002', 3, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=169'),
  ('LAW1002', 4, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=171'),
  ('LAW1002', 5, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=172'),
  ('LAW1002', 6, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=173'),
  ('LAW1002', 7, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=174'),
  ('LAW1002', 8, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=175'),
  ('LAW1002', 9, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=176'),
  ('LAW1002', 10, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=177'),
  ('LAW1002', 12, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=178'),
  ('LAW1002', 14, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=179'),
  ('LAW1002', 15, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=180'),
  ('LAW1002', 16, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=181'),
  ('LAW1102', 2, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=168'),
  ('LAW1102', 3, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=169'),
  ('LAW1102', 4, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=171'),
  ('LAW1102', 5, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=172'),
  ('LAW1102', 6, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=173'),
  ('LAW1102', 7, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=174'),
  ('LAW1102', 8, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=175'),
  ('LAW1102', 9, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=176'),
  ('LAW1102', 10, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=177'),
  ('LAW1102', 12, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=178'),
  ('LAW1102', 14, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=179'),
  ('LAW1102', 15, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=180'),
  ('LAW1102', 16, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=181'),
  ('POL1101', 1, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=50'),
  ('POL1101', 2, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=52'),
  ('POL1101', 3, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=54'),
  ('POL1101', 4, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=56'),
  ('POL1101', 5, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=58'),
  ('POL1101', 6, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=62'),
  ('POL1101', 7, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=63'),
  ('POL1101', 9, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=65'),
  ('POL1101', 10, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=66'),
  ('POL1101', 12, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=69'),
  ('POL1101', 14, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=70'),
  ('POL1101', 15, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=71'),
  ('POL1101', 16, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=72'),
  ('POL2106', 1, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=73'),
  ('POL2106', 2, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=74'),
  ('POL2106', 3, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=75'),
  ('POL2106', 4, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=76'),
  ('POL2106', 5, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=220'),
  ('POL2106', 6, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=78'),
  ('POL2106', 7, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=79'),
  ('POL2106', 9, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=81'),
  ('POL2106', 10, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=82'),
  ('POL2106', 11, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=83');
