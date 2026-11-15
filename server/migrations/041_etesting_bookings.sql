-- Migration 041: the e-Testing exams a student has booked, as she booked them in the university's
-- e-Testing system (the app cannot see that system: she records it here).
--
-- How booking works, from the e-Testing office's 2569 registration manual (linked from
-- https://easi.ru.ac.th) and its FAQ: for each course she is registered in this term and that is
-- on the term's e-Testing list, she chooses the centre (ศูนย์สอบ), the day (วันสอบ) and the period
-- (คาบสอบ); one course per period; once confirmed it cannot be changed. Periods (the 2/2569
-- announcement): 1 09:00-11:30, 2 12:00-14:30, 3 15:00-17:30, and on Saturday and Sunday only
-- 4 18:00-20:30. A pass means no final for that course; a fail, and she still sits the final.

CREATE TABLE IF NOT EXISTS etesting_bookings (
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  term_id     TEXT NOT NULL,
  course_code TEXT NOT NULL,
  centre      TEXT NOT NULL CHECK (centre IN ('central', 'regional')),
  date        TEXT NOT NULL,              -- YYYY-MM-DD
  period      INTEGER NOT NULL CHECK (period BETWEEN 1 AND 4),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (user_id, term_id, course_code)
);
CREATE INDEX IF NOT EXISTS idx_etesting_bookings_day ON etesting_bookings(user_id, date);
