-- Migration 043: what a student writes down about her own exams (server/src/myExams.ts).
-- * exam_date / start_time / end_time: the date of an exam the registrar does not schedule
--   ("คณะจัดสอบเอง": the faculty arranges it). She finds it from the lecturer or the faculty and
--   keeps it here; the app then treats it like any other exam (clashes, countdown, study plan),
--   always labelled as entered by her. Null for a course the registrar dates.
-- * seat: her exam room and seat, from her personal exam timetable in e-Service (published about
--   a week before the finals). Free text, as she copies it.
CREATE TABLE IF NOT EXISTS my_exams (
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  term_id     TEXT NOT NULL,
  course_code TEXT NOT NULL,
  exam_date   TEXT,             -- YYYY-MM-DD, only for a faculty-arranged exam
  start_time  TEXT,             -- HH:MM
  end_time    TEXT,             -- HH:MM
  seat        TEXT,             -- e.g. "SB 305, seat 41"
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, term_id, course_code)
);
