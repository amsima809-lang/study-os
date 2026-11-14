-- Migration 038: one record of what a student has passed, failed and scored.
--
-- 1. `enrollments` (a course's result in the term it was taken) was keyed by course and term
--    only. With more than one student that is wrong: a second student recording the same
--    course in the same term overwrote the first student's row, and had none of their own.
--    The key becomes student + course + term. SQLite cannot change a key in place, so the
--    table is rebuilt. Rows with no owner (there should be none) are not carried over.
CREATE TABLE enrollments_new (
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_code TEXT NOT NULL REFERENCES courses(code),
  term_id     TEXT NOT NULL REFERENCES plan_terms(term_id),
  status      TEXT NOT NULL DEFAULT 'PLANNED' CHECK (status IN
                ('PLANNED','ENROLLED','PASSED','FAILED','WITHDRAWN')),
  grade       TEXT,
  PRIMARY KEY (user_id, course_code, term_id)
);
INSERT INTO enrollments_new (user_id, course_code, term_id, status, grade)
  SELECT user_id, course_code, term_id, status, grade FROM enrollments
  WHERE user_id IN (SELECT id FROM users);
DROP TABLE enrollments;
ALTER TABLE enrollments_new RENAME TO enrollments;
CREATE INDEX IF NOT EXISTS idx_enrollments_user ON enrollments(user_id);

-- 2. A course passed BEFORE the student used the app has no term here (`passed_courses`).
--    It can now carry its grade too, so it counts in the grade average.
ALTER TABLE passed_courses ADD COLUMN grade TEXT;
