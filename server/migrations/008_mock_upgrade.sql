-- Phase 4: Mock exam upgrade — sessions, per-question timing, grade cutoffs, history

-- Persist exam sessions for auto-save / resume
CREATE TABLE IF NOT EXISTS mock_sessions (
  mock_id       INTEGER PRIMARY KEY REFERENCES mock_exams(id),
  answers_json  TEXT NOT NULL DEFAULT '{}',
  flags_json    TEXT NOT NULL DEFAULT '[]',
  current_idx   INTEGER NOT NULL DEFAULT 0,
  seconds_left  INTEGER NOT NULL,
  time_per_q_json TEXT NOT NULL DEFAULT '{}',
  updated_at    TEXT NOT NULL
);

-- Add fields to mock_exams for richer results
ALTER TABLE mock_exams ADD COLUMN finished_at TEXT;
ALTER TABLE mock_exams ADD COLUMN time_per_q_json TEXT;
ALTER TABLE mock_exams ADD COLUMN chapter_scores_json TEXT;
ALTER TABLE mock_exams ADD COLUMN total_seconds INTEGER;
ALTER TABLE mock_exams ADD COLUMN question_count INTEGER;

-- Grade cutoffs as a user setting (JSON: [{label, min_pct},...])
INSERT OR IGNORE INTO settings (key, value) VALUES (
  'grade_cutoffs',
  '[{"label":"A","min_pct":80},{"label":"B+","min_pct":75},{"label":"B","min_pct":70},{"label":"C+","min_pct":65},{"label":"C","min_pct":60},{"label":"D+","min_pct":55},{"label":"D","min_pct":50},{"label":"F","min_pct":0}]'
);
