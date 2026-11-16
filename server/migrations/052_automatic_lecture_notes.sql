-- Keep the older explicitly generated document while a lecture is being refreshed.
CREATE TABLE automatic_lecture_notes (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lecture_id INTEGER NOT NULL REFERENCES course_lectures(id) ON DELETE CASCADE,
  source_hash TEXT NOT NULL,
  blocks_json TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (user_id, lecture_id)
);

-- A new image attached to a lecture can resume its reading after a restart.
ALTER TABLE sketch_pages ADD COLUMN auto_read INTEGER NOT NULL DEFAULT 0;
