-- Phase 3: Study planner — backward scheduling from exam dates.
-- Preserves ALL existing data.

-- Add page_count to chapters so planner knows how much to read
ALTER TABLE chapters ADD COLUMN page_count INTEGER;

-- Study plans (one active at a time)
CREATE TABLE IF NOT EXISTS study_plans (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  status        TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','outdated','archived')),
  generated_at  TEXT NOT NULL,
  settings_json TEXT NOT NULL,
  feasibility   TEXT NOT NULL DEFAULT 'ok' CHECK (feasibility IN ('ok','tight','impossible')),
  warnings_json TEXT
);

-- Individual daily tasks
CREATE TABLE IF NOT EXISTS study_tasks (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  plan_id     INTEGER NOT NULL REFERENCES study_plans(id) ON DELETE CASCADE,
  course_code TEXT NOT NULL REFERENCES courses(code),
  date        TEXT NOT NULL,
  task_type   TEXT NOT NULL CHECK (task_type IN ('read','quiz','review','mock')),
  chapter_id  INTEGER REFERENCES chapters(id),
  description TEXT NOT NULL,
  page_start  INTEGER,
  page_end    INTEGER,
  minutes     INTEGER NOT NULL,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  done        INTEGER NOT NULL DEFAULT 0,
  done_at     TEXT
);

CREATE INDEX IF NOT EXISTS idx_study_tasks_plan_date ON study_tasks(plan_id, date);
CREATE INDEX IF NOT EXISTS idx_study_tasks_course ON study_tasks(course_code);

-- Default planner settings
INSERT OR IGNORE INTO settings (key, value) VALUES ('sp_weekday_hours', '2');
INSERT OR IGNORE INTO settings (key, value) VALUES ('sp_weekend_hours', '5');
INSERT OR IGNORE INTO settings (key, value) VALUES ('sp_reading_speed', '10');
INSERT OR IGNORE INTO settings (key, value) VALUES ('sp_blocked_dates', '[]');
