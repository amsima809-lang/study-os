-- Migration 036: what a student tells the trail planner (server/src/trail.ts).
--
-- The goal: the term they want to graduate in, whether they will take summer
-- terms, and their own ceiling on credits per regular term.
ALTER TABLE user_profiles ADD COLUMN trail_target TEXT;                       -- e.g. "2/72"; NULL = not set yet
ALTER TABLE user_profiles ADD COLUMN trail_summers INTEGER NOT NULL DEFAULT 0;
ALTER TABLE user_profiles ADD COLUMN trail_max INTEGER;                       -- NULL = the university's limit

-- Courses a student says they have already passed. Kept apart from `enrollments`,
-- whose key (course, term) allows only one student per course and term, and which
-- needs the course to be in a term of the student's plan first.
CREATE TABLE IF NOT EXISTS passed_courses (
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_code TEXT NOT NULL REFERENCES courses(code),
  PRIMARY KEY (user_id, course_code)
) WITHOUT ROWID;
