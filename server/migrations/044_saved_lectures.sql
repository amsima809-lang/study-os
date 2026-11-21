-- A recording can serve two catalogue codes. Keep one original, with each
-- course_lectures row pointing at the same transcript and summary.
CREATE TABLE shared_lecture_transcripts (
  id INTEGER PRIMARY KEY REFERENCES course_lectures(id) ON DELETE CASCADE,
  course_code TEXT NOT NULL REFERENCES courses(code),
  session_no INTEGER NOT NULL,
  source_url TEXT NOT NULL UNIQUE,
  cues TEXT NOT NULL,
  cue_count INTEGER NOT NULL,
  duration_ms INTEGER NOT NULL,
  collected_at TEXT NOT NULL
);
ALTER TABLE course_lectures ADD COLUMN shared_transcript_id INTEGER REFERENCES shared_lecture_transcripts(id) ON DELETE SET NULL;
CREATE TABLE shared_lecture_summaries (
  transcript_id INTEGER PRIMARY KEY REFERENCES shared_lecture_transcripts(id) ON DELETE CASCADE,
  summary_md TEXT NOT NULL,
  model TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE student_lecture_summaries (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  lecture_id INTEGER NOT NULL REFERENCES course_lectures(id) ON DELETE CASCADE,
  summary_md TEXT NOT NULL,
  PRIMARY KEY (user_id, lecture_id)
);
ALTER TABLE notes ADD COLUMN lecture_id INTEGER REFERENCES course_lectures(id) ON DELETE SET NULL;
CREATE INDEX idx_notes_lecture ON notes(user_id, lecture_id);
