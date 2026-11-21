-- Migration 025: links to recorded lectures, per course.
-- Source: Ramkhamhaeng's "VOD Subtitle" lecture video system
-- (https://sub-demo.ru.ac.th/student/), read 2026-11-14 with a student login.
-- Only links are stored; the videos and their subtitles stay on the university
-- site, and a student needs their own e-service login to open them.
-- The site lists 13 subjects; the 4 that match courses in this app are stored
-- here (ACC1101 and ACC1103 share one recording). Full list:
-- docs/research/ru-lecture-links.json. Missing session numbers were cancelled.
-- The host name says "demo", so these links may move.

CREATE TABLE IF NOT EXISTS course_lectures (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  course_code TEXT NOT NULL REFERENCES courses(code),
  session_no  INTEGER NOT NULL,
  url         TEXT NOT NULL,
  source      TEXT NOT NULL DEFAULT 'ru-vod-subtitle',
  UNIQUE (course_code, session_no, source)
);
CREATE INDEX IF NOT EXISTS idx_course_lectures_course ON course_lectures(course_code);

INSERT OR IGNORE INTO course_lectures (course_code, session_no, url) VALUES
  ('ACC1101', 1, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=162'),
  ('ACC1101', 2, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=200'),
  ('ACC1101', 3, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=202'),
  ('ACC1101', 4, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=203'),
  ('ACC1101', 5, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=204'),
  ('ACC1101', 6, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=206'),
  ('ACC1101', 7, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=205'),
  ('ACC1101', 8, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=222'),
  ('ACC1101', 9, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=224'),
  ('ACC1101', 10, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=225'),
  ('ACC1103', 1, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=162'),
  ('ACC1103', 2, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=200'),
  ('ACC1103', 3, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=202'),
  ('ACC1103', 4, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=203'),
  ('ACC1103', 5, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=204'),
  ('ACC1103', 6, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=206'),
  ('ACC1103', 7, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=205'),
  ('ACC1103', 8, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=222'),
  ('ACC1103', 9, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=224'),
  ('ACC1103', 10, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=225'),
  ('MGT3204', 1, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=3'),
  ('MGT3204', 2, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=152'),
  ('MGT3204', 3, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=153'),
  ('MGT3204', 5, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=7'),
  ('MGT3204', 6, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=160'),
  ('MGT3204', 7, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=161'),
  ('MGT3204', 8, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=163'),
  ('MGT3204', 9, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=164'),
  ('MGT3204', 10, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=165'),
  ('MGT3204', 12, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=166'),
  ('RAM1103', 1, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=15'),
  ('RAM1103', 2, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=16'),
  ('RAM1103', 3, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=17'),
  ('RAM1103', 5, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=18'),
  ('RAM1103', 7, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=20'),
  ('RAM1103', 9, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=22'),
  ('RAM1103', 10, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=24'),
  ('RAM1103', 11, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=25'),
  ('RAM1103', 12, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=26'),
  ('RAM1103', 13, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=27'),
  ('RAM1132', 1, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=32'),
  ('RAM1132', 2, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=33'),
  ('RAM1132', 3, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=34'),
  ('RAM1132', 4, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=36'),
  ('RAM1132', 5, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=37'),
  ('RAM1132', 6, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=38'),
  ('RAM1132', 7, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=39'),
  ('RAM1132', 8, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=40'),
  ('RAM1132', 9, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=41'),
  ('RAM1132', 10, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=42'),
  ('RAM1132', 11, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=43'),
  ('RAM1132', 12, 'https://sub-demo.ru.ac.th/student/watch.php?session_id=44');
