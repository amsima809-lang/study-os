-- Migration 026: lecture transcripts a student brought in themselves.
-- A transcript belongs to the student who imported it (user_id) and is never
-- shown to anyone else: the lectures are the university's content, and this
-- is a student's own study copy. See docs/LECTURE_TRANSCRIPTS_PLAN.md.
CREATE TABLE IF NOT EXISTS lecture_transcripts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_code TEXT NOT NULL REFERENCES courses(code),
  session_no  INTEGER NOT NULL,
  source      TEXT NOT NULL,           -- e.g. 'ru-vod-subtitle'
  source_url  TEXT,
  cues        TEXT NOT NULL,           -- JSON: [{ "startMs": n, "endMs": n, "text": "..." }]
  cue_count   INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  imported_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (user_id, course_code, session_no)
);
CREATE INDEX IF NOT EXISTS idx_lecture_transcripts_user ON lecture_transcripts(user_id, course_code);
