-- A shared recording (including its course aliases) has one bank. A student's
-- privately imported recording has its own bank with the same access boundary.
CREATE TABLE lecture_quiz_banks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  shared_transcript_id INTEGER UNIQUE REFERENCES shared_lecture_transcripts(id) ON DELETE CASCADE,
  private_transcript_id INTEGER UNIQUE REFERENCES lecture_transcripts(id) ON DELETE CASCADE,
  source_hash TEXT NOT NULL,
  generator_model TEXT NOT NULL CHECK (generator_model = 'deepseek-v4-pro'),
  prompt_version TEXT NOT NULL,
  CHECK ((shared_transcript_id IS NULL) <> (private_transcript_id IS NULL))
);

CREATE TABLE lecture_quiz_questions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  bank_id INTEGER NOT NULL REFERENCES lecture_quiz_banks(id) ON DELETE CASCADE,
  slot INTEGER NOT NULL CHECK (slot BETWEEN 1 AND 25),
  stem TEXT NOT NULL,
  options TEXT NOT NULL CHECK (json_valid(options) AND json_type(options) = 'array' AND json_array_length(options) = 4),
  correct_index INTEGER NOT NULL CHECK (correct_index BETWEEN 0 AND 3),
  explanation TEXT NOT NULL,
  evidence_ms INTEGER NOT NULL CHECK (evidence_ms >= 0),
  evidence_quote TEXT NOT NULL,
  concept TEXT NOT NULL,
  UNIQUE(bank_id, slot),
  UNIQUE(bank_id, stem)
);

-- Session 0 identifies the course quiz. A non-NULL score is the number correct.
CREATE TABLE lecture_quiz_attempts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  course_code TEXT NOT NULL REFERENCES courses(code) ON DELETE CASCADE,
  session_no INTEGER NOT NULL CHECK (session_no >= 0),
  slot INTEGER NOT NULL CHECK (slot BETWEEN 1 AND 5 AND (session_no > 0 OR slot = 1)),
  initial INTEGER NOT NULL CHECK (initial IN (0,1)),
  score INTEGER,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  submitted_at TEXT
);
CREATE INDEX idx_lecture_quiz_history ON lecture_quiz_attempts(user_id, course_code, session_no, slot, id);

CREATE TABLE lecture_quiz_items (
  attempt_id INTEGER NOT NULL REFERENCES lecture_quiz_attempts(id) ON DELETE CASCADE,
  question_id INTEGER NOT NULL REFERENCES lecture_quiz_questions(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  option_order TEXT NOT NULL,
  choice INTEGER CHECK (choice BETWEEN 0 AND 3),
  PRIMARY KEY (attempt_id, question_id),
  UNIQUE (attempt_id, position)
);
CREATE INDEX idx_lecture_quiz_item_question ON lecture_quiz_items(question_id);

-- Remove attempts containing replaced material as a unit. A student must never
-- be presented with a shortened quiz or a result graded against an edited key.
CREATE TRIGGER lecture_quiz_question_removed BEFORE DELETE ON lecture_quiz_questions BEGIN
  DELETE FROM lecture_quiz_attempts WHERE id IN
    (SELECT attempt_id FROM lecture_quiz_items WHERE question_id = OLD.id);
END;
CREATE TRIGGER lecture_quiz_shared_changed AFTER UPDATE OF cues, source_url ON shared_lecture_transcripts
WHEN NEW.cues <> OLD.cues OR NEW.source_url IS NOT OLD.source_url BEGIN
  DELETE FROM lecture_quiz_banks WHERE shared_transcript_id = NEW.id;
END;
CREATE TRIGGER lecture_quiz_private_changed AFTER UPDATE OF cues, source_url ON lecture_transcripts
WHEN NEW.cues <> OLD.cues OR NEW.source_url IS NOT OLD.source_url BEGIN
  DELETE FROM lecture_quiz_banks WHERE private_transcript_id = NEW.id;
END;
