-- A private note on a passage. Context disambiguates repeated quotes after a reflow or edit.
CREATE TABLE lecture_annotations (
  id INTEGER PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lecture_id INTEGER NOT NULL REFERENCES course_lectures(id) ON DELETE CASCADE,
  client_key TEXT NOT NULL,
  quote TEXT NOT NULL,
  prefix TEXT NOT NULL,
  suffix TEXT NOT NULL,
  mark TEXT NOT NULL CHECK(mark IN ('underline','circle')),
  png BLOB NOT NULL,
  drawing BLOB,
  colors TEXT NOT NULL,
  runs TEXT NOT NULL DEFAULT '[]',
  revision INTEGER NOT NULL DEFAULT 1,
  UNIQUE(user_id, lecture_id, client_key)
);
CREATE INDEX lecture_annotations_by_owner ON lecture_annotations(user_id, lecture_id);
