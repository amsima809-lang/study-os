-- Phase 2: SM-2 spaced repetition, confidence tracking, chapter mastery.
-- Preserves ALL existing data — only adds new columns and tables.

-- SM-2 fields on flashcards (existing cards keep working with defaults)
ALTER TABLE flashcards ADD COLUMN easiness REAL NOT NULL DEFAULT 2.5;
ALTER TABLE flashcards ADD COLUMN interval_days INTEGER NOT NULL DEFAULT 1;
ALTER TABLE flashcards ADD COLUMN repetitions INTEGER NOT NULL DEFAULT 0;
ALTER TABLE flashcards ADD COLUMN last_confidence INTEGER;
ALTER TABLE flashcards ADD COLUMN last_reviewed_at TEXT;
ALTER TABLE flashcards ADD COLUMN total_reviews INTEGER NOT NULL DEFAULT 0;
ALTER TABLE flashcards ADD COLUMN correct_reviews INTEGER NOT NULL DEFAULT 0;

-- Chapter mastery (per user × course × chapter)
CREATE TABLE IF NOT EXISTS chapter_mastery (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  course_code   TEXT NOT NULL REFERENCES courses(code),
  chapter_id    INTEGER REFERENCES chapters(id) ON DELETE SET NULL,
  topic         TEXT,
  mastery_score REAL NOT NULL DEFAULT 0 CHECK (mastery_score BETWEEN 0 AND 100),
  total_attempts INTEGER NOT NULL DEFAULT 0,
  correct_attempts INTEGER NOT NULL DEFAULT 0,
  last_activity_at TEXT,
  updated_at    TEXT NOT NULL,
  UNIQUE(course_code, chapter_id, topic)
);

CREATE INDEX IF NOT EXISTS idx_mastery_course ON chapter_mastery(course_code);

-- Review history for decay calculation and graphs
CREATE TABLE IF NOT EXISTS review_history (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  flashcard_id  INTEGER NOT NULL REFERENCES flashcards(id) ON DELETE CASCADE,
  confidence    INTEGER NOT NULL CHECK (confidence BETWEEN 1 AND 4),
  old_easiness  REAL NOT NULL,
  new_easiness  REAL NOT NULL,
  old_interval  INTEGER NOT NULL,
  new_interval  INTEGER NOT NULL,
  reviewed_at   TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_review_history_card ON review_history(flashcard_id);
CREATE INDEX IF NOT EXISTS idx_review_history_date ON review_history(reviewed_at);

-- Daily review limit setting
INSERT OR IGNORE INTO settings (key, value) VALUES ('daily_review_limit', '30');
