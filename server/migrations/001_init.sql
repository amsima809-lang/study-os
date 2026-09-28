-- StudyOS schema (Phase 1)
-- All dates stored as ISO strings. Times in Asia/Bangkok.
-- weekday: ISO 8601 integer (1=Monday .. 7=Sunday).

-- ---------- Curriculum ----------
CREATE TABLE IF NOT EXISTS courses (
  code        TEXT PRIMARY KEY,           -- e.g. "PSY1002"
  name_th     TEXT NOT NULL,
  name_en     TEXT,                        -- NULL until official EN name is known
  credits     INTEGER NOT NULL DEFAULT 3,
  category    TEXT NOT NULL CHECK (category IN
                ('GE','FOUNDATION','MAJOR_REQ','MAJOR_ELEC','MINOR','FREE')),
  difficulty  INTEGER NOT NULL DEFAULT 2 CHECK (difficulty IN (1,2,3)),
  notes       TEXT
);

CREATE TABLE IF NOT EXISTS prerequisites (
  course_code   TEXT NOT NULL REFERENCES courses(code),
  requires_code TEXT NOT NULL REFERENCES courses(code),
  PRIMARY KEY (course_code, requires_code)
);

-- ---------- Plan (9-term) ----------
CREATE TABLE IF NOT EXISTS plan_terms (
  term_id     TEXT PRIMARY KEY,            -- e.g. "2/69", "S/69", "1/70"
  ord         INTEGER NOT NULL,            -- chronological order (0-based)
  max_credits INTEGER NOT NULL            -- 21 regular, 9 summer
);

CREATE TABLE IF NOT EXISTS plan_items (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  term_id           TEXT NOT NULL REFERENCES plan_terms(term_id),
  course_code       TEXT REFERENCES courses(code),   -- NULL for placeholders
  placeholder_label TEXT                              -- e.g. "วิชาโท #1"
);

CREATE TABLE IF NOT EXISTS enrollments (
  course_code TEXT NOT NULL REFERENCES courses(code),
  term_id     TEXT NOT NULL REFERENCES plan_terms(term_id),
  status      TEXT NOT NULL DEFAULT 'PLANNED' CHECK (status IN
                ('PLANNED','ENROLLED','PASSED','FAILED','WITHDRAWN')),
  grade       TEXT,
  PRIMARY KEY (course_code, term_id)
);

-- ---------- Schedule & exams ----------
CREATE TABLE IF NOT EXISTS class_sessions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  course_code TEXT NOT NULL REFERENCES courses(code),
  term_id     TEXT NOT NULL REFERENCES plan_terms(term_id),
  weekday     INTEGER NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  start_time  TEXT NOT NULL,               -- "HH:MM"
  end_time    TEXT NOT NULL,               -- "HH:MM"
  room        TEXT
);

CREATE TABLE IF NOT EXISTS exams (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  course_code    TEXT NOT NULL REFERENCES courses(code),
  term_id        TEXT NOT NULL REFERENCES plan_terms(term_id),
  datetime_start TEXT NOT NULL,            -- ISO with +07:00 offset
  datetime_end   TEXT NOT NULL,
  slot           TEXT CHECK (slot IN ('A','B')),
  location       TEXT
);

-- ---------- Notes & AI-generated learning ----------
CREATE TABLE IF NOT EXISTS notes (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  course_code   TEXT REFERENCES courses(code),
  created_at    TEXT NOT NULL,
  title         TEXT,
  raw_text      TEXT,
  image_paths   TEXT,                      -- JSON array of file paths
  ai_summary_md TEXT,
  ai_mindmap_md TEXT
);

CREATE TABLE IF NOT EXISTS questions (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  note_id      INTEGER REFERENCES notes(id),
  course_code  TEXT REFERENCES courses(code),
  topic        TEXT,
  question     TEXT NOT NULL,
  model_answer TEXT,
  type         TEXT NOT NULL DEFAULT 'short' CHECK (type IN ('short','mcq')),
  choices_json TEXT                        -- JSON array for MCQ
);

CREATE TABLE IF NOT EXISTS attempts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id INTEGER NOT NULL REFERENCES questions(id),
  my_answer   TEXT,
  ai_score    INTEGER CHECK (ai_score BETWEEN 0 AND 2),
  ai_feedback TEXT,
  created_at  TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS flashcards (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  question_id      INTEGER NOT NULL REFERENCES questions(id),
  box              INTEGER NOT NULL DEFAULT 1 CHECK (box BETWEEN 1 AND 5),
  next_review_date TEXT NOT NULL
);

-- ---------- Tracking & analytics ----------
CREATE TABLE IF NOT EXISTS study_sessions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  course_code TEXT REFERENCES courses(code),
  started_at  TEXT NOT NULL,
  minutes     INTEGER NOT NULL,
  kind        TEXT NOT NULL CHECK (kind IN ('read','quiz','review','mock'))
);

CREATE TABLE IF NOT EXISTS mock_exams (
  id                INTEGER PRIMARY KEY AUTOINCREMENT,
  course_code       TEXT REFERENCES courses(code),
  created_at        TEXT NOT NULL,
  question_ids_json TEXT NOT NULL,
  score             INTEGER,
  duration_min      INTEGER
);

CREATE TABLE IF NOT EXISTS topics (
  course_code TEXT NOT NULL REFERENCES courses(code),
  name        TEXT NOT NULL,
  mastery     INTEGER NOT NULL DEFAULT 0 CHECK (mastery BETWEEN 0 AND 100),
  PRIMARY KEY (course_code, name)
);

-- ---------- AI cost logging ----------
CREATE TABLE IF NOT EXISTS ai_usage (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at    TEXT NOT NULL,
  model         TEXT NOT NULL,
  purpose       TEXT,
  input_tokens  INTEGER NOT NULL DEFAULT 0,
  output_tokens INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_plan_items_term ON plan_items(term_id);
CREATE INDEX IF NOT EXISTS idx_class_sessions_term ON class_sessions(term_id);
CREATE INDEX IF NOT EXISTS idx_exams_term ON exams(term_id);
CREATE INDEX IF NOT EXISTS idx_flashcards_due ON flashcards(next_review_date);
