-- Each student chooses a layout for each lecture. Only a saved document identifies
-- the lecture the student was working on when they chose its layout.
CREATE TABLE lecture_note_layouts (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lecture_id INTEGER NOT NULL REFERENCES course_lectures(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK(mode IN ('separate','combined')),
  PRIMARY KEY (user_id, lecture_id)
);
INSERT INTO lecture_note_layouts (user_id, lecture_id, mode)
SELECT user_id, lecture_id, mode FROM created_lecture_notes;
