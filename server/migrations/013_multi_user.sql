-- Migration 013: Multi-user support
-- Creates users, user_profiles, notification_settings tables.
-- Adds user_id to all user-data tables.
-- Creates a legacy user for existing data.
-- Catalog tables (courses, prerequisites, plan_terms, class_sessions, exams,
-- course_groups) stay shared — no user_id needed.

-- ===================== NEW TABLES =====================

CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  email         TEXT NOT NULL UNIQUE,
  name          TEXT,
  avatar_url    TEXT,
  google_id     TEXT UNIQUE,
  plan          TEXT NOT NULL DEFAULT 'free' CHECK (plan IN ('free','premium')),
  referral_code TEXT UNIQUE,
  referred_by   TEXT,
  created_at    TEXT NOT NULL,
  last_login_at TEXT
);

CREATE TABLE IF NOT EXISTS user_profiles (
  user_id       TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  faculty_id    TEXT,
  program_id    TEXT,
  entry_year    TEXT,
  target_years  REAL DEFAULT 4.0,
  onboarded     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS notification_settings (
  user_id          TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  daily_schedule   INTEGER NOT NULL DEFAULT 1,
  before_class     INTEGER NOT NULL DEFAULT 1,
  before_class_min INTEGER NOT NULL DEFAULT 30,
  exam_reminder    INTEGER NOT NULL DEFAULT 1,
  review_reminder  INTEGER NOT NULL DEFAULT 1,
  morning_time     TEXT NOT NULL DEFAULT '07:00',
  push_token       TEXT
);

-- ===================== LEGACY USER =====================
-- All existing data belongs to this user.

INSERT INTO users (id, email, name, referral_code, created_at, last_login_at)
VALUES (
  'legacy-user-0001',
  'legacy@studyos.local',
  'น้ำพลอย (legacy)',
  'legacy01',
  datetime('now'),
  datetime('now')
);

INSERT INTO user_profiles (user_id)
VALUES ('legacy-user-0001');

INSERT INTO notification_settings (user_id)
VALUES ('legacy-user-0001');

-- ===================== ADD user_id TO EXISTING TABLES =====================

-- plan_items
ALTER TABLE plan_items ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE;
UPDATE plan_items SET user_id = 'legacy-user-0001';

-- enrollments
ALTER TABLE enrollments ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE;
UPDATE enrollments SET user_id = 'legacy-user-0001';

-- notes
ALTER TABLE notes ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE;
UPDATE notes SET user_id = 'legacy-user-0001';

-- questions
ALTER TABLE questions ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE;
UPDATE questions SET user_id = 'legacy-user-0001';

-- attempts
ALTER TABLE attempts ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE;
UPDATE attempts SET user_id = 'legacy-user-0001';

-- flashcards
ALTER TABLE flashcards ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE;
UPDATE flashcards SET user_id = 'legacy-user-0001';

-- study_sessions
ALTER TABLE study_sessions ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE;
UPDATE study_sessions SET user_id = 'legacy-user-0001';

-- mock_exams
ALTER TABLE mock_exams ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE;
UPDATE mock_exams SET user_id = 'legacy-user-0001';

-- topics
ALTER TABLE topics ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE;
UPDATE topics SET user_id = 'legacy-user-0001';

-- ai_usage
ALTER TABLE ai_usage ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE;
UPDATE ai_usage SET user_id = 'legacy-user-0001';

-- user_settings (per-user overrides of global settings)
CREATE TABLE IF NOT EXISTS user_settings (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  key     TEXT NOT NULL,
  value   TEXT NOT NULL,
  PRIMARY KEY (user_id, key)
);

-- Copy legacy user's personal settings from global settings table
INSERT INTO user_settings (user_id, key, value)
SELECT 'legacy-user-0001', key, value FROM settings
WHERE key IN ('weekly_target_hours', 'daily_review_limit', 'grade_cutoffs',
              'sp_weekday_hours', 'sp_weekend_hours', 'sp_reading_speed',
              'sp_blocked_dates', 'grade_scale');

-- materials
ALTER TABLE materials ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE;
UPDATE materials SET user_id = 'legacy-user-0001';

-- material_pages (linked via material_id, no direct user_id needed)
-- chapters
ALTER TABLE chapters ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE;
UPDATE chapters SET user_id = 'legacy-user-0001';

-- material_chunks (linked via chapter_id, no direct user_id needed)

-- chapter_mastery
ALTER TABLE chapter_mastery ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE;
UPDATE chapter_mastery SET user_id = 'legacy-user-0001';

-- review_history (linked via flashcard_id, no direct user_id needed)

-- study_plans
ALTER TABLE study_plans ADD COLUMN user_id TEXT REFERENCES users(id) ON DELETE CASCADE;
UPDATE study_plans SET user_id = 'legacy-user-0001';

-- study_tasks (linked via plan_id, no direct user_id needed)

-- mock_sessions (linked via mock_id → mock_exams, no direct user_id needed)

-- ===================== INDEXES =====================

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_google ON users(google_id);
CREATE INDEX IF NOT EXISTS idx_plan_items_user ON plan_items(user_id);
CREATE INDEX IF NOT EXISTS idx_enrollments_user ON enrollments(user_id);
CREATE INDEX IF NOT EXISTS idx_notes_user ON notes(user_id);
CREATE INDEX IF NOT EXISTS idx_questions_user ON questions(user_id);
CREATE INDEX IF NOT EXISTS idx_flashcards_user ON flashcards(user_id);
CREATE INDEX IF NOT EXISTS idx_study_sessions_user ON study_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_mock_exams_user ON mock_exams(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_user ON ai_usage(user_id);
CREATE INDEX IF NOT EXISTS idx_materials_user ON materials(user_id);
CREATE INDEX IF NOT EXISTS idx_chapters_user ON chapters(user_id);
CREATE INDEX IF NOT EXISTS idx_mastery_user ON chapter_mastery(user_id);
CREATE INDEX IF NOT EXISTS idx_study_plans_user ON study_plans(user_id);
CREATE INDEX IF NOT EXISTS idx_user_settings_key ON user_settings(user_id, key);
