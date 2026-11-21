CREATE TABLE lecture_note_preferences (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK(mode IN ('separate','combined'))
);

CREATE TABLE created_lecture_notes (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lecture_id INTEGER NOT NULL REFERENCES course_lectures(id) ON DELETE CASCADE,
  mode TEXT NOT NULL CHECK(mode IN ('separate','combined')),
  blocks_json TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY(user_id, lecture_id)
);
