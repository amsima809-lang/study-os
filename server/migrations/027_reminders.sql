-- Migration 027: reminders and to-dos (per student).
-- One table for both: a reminder is something to be told about at a date and
-- time; a to-do is something to tick off, with an optional due date.
-- Either can repeat. Completion is per occurrence (reminder_done), so ticking
-- today's "review flashcards" does not tick tomorrow's.
CREATE TABLE IF NOT EXISTS reminders (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('reminder', 'todo')),
  title        TEXT NOT NULL,
  note         TEXT,
  course_code  TEXT REFERENCES courses(code),  -- optional: the course this is for
  date         TEXT,                    -- YYYY-MM-DD; first occurrence, or a to-do's due date; NULL = to-do with no date
  time         TEXT,                    -- HH:MM (Asia/Bangkok), optional
  repeat       TEXT NOT NULL DEFAULT 'none' CHECK (repeat IN ('none', 'daily', 'weekdays', 'weekly', 'monthly')),
  repeat_until TEXT,                    -- YYYY-MM-DD inclusive, optional
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_reminders_user ON reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_reminders_course ON reminders(user_id, course_code);

CREATE TABLE IF NOT EXISTS reminder_done (
  reminder_id INTEGER NOT NULL REFERENCES reminders(id) ON DELETE CASCADE,
  date        TEXT NOT NULL,            -- the occurrence's date; '' for a to-do with no date
  done_at     TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (reminder_id, date)
);
