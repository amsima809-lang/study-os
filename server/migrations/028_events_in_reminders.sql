-- Migration 028: one model for everything a student puts on their calendar.
-- Until now there were two: "custom events" (custom_events) and reminders /
-- to-dos (reminders), each with its own add button on the same screen.
-- Reminders gain a third kind, 'event' (something that happens at a time, with
-- an optional end time and nothing to tick off), and existing custom events are
-- copied across. SQLite cannot change a CHECK constraint in place, so the
-- table is rebuilt. custom_events is left in place, unused, as a backup.
CREATE TABLE reminders_new (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id      TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind         TEXT NOT NULL CHECK (kind IN ('reminder', 'todo', 'event')),
  title        TEXT NOT NULL,
  note         TEXT,
  course_code  TEXT REFERENCES courses(code),
  date         TEXT,
  time         TEXT,                    -- HH:MM; for an event, when it starts
  end_time     TEXT,                    -- HH:MM; events only
  repeat       TEXT NOT NULL DEFAULT 'none' CHECK (repeat IN ('none', 'daily', 'weekdays', 'weekly', 'monthly')),
  repeat_until TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO reminders_new (id, user_id, kind, title, note, course_code, date, time, repeat, repeat_until, created_at)
  SELECT id, user_id, kind, title, note, course_code, date, time, repeat, repeat_until, created_at FROM reminders;

INSERT INTO reminders_new (user_id, kind, title, note, date, time, end_time, created_at)
  SELECT user_id, 'event', title, note, date, start_time, end_time, created_at FROM custom_events;

DROP TABLE reminders;
ALTER TABLE reminders_new RENAME TO reminders;
CREATE INDEX IF NOT EXISTS idx_reminders_user ON reminders(user_id);
CREATE INDEX IF NOT EXISTS idx_reminders_course ON reminders(user_id, course_code);
