-- Migration 030: notifications when the app is closed (Web Push).

-- One row per device (browser) a student has turned closed-app notifications on for.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint   TEXT NOT NULL UNIQUE,     -- the push service's address for this device
  p256dh     TEXT NOT NULL,            -- the device's keys (kept for encrypted payloads; not used yet)
  auth       TEXT NOT NULL,
  lang       TEXT NOT NULL DEFAULT 'th' CHECK (lang IN ('th','en')),
  clock      TEXT NOT NULL DEFAULT '24' CHECK (clock IN ('24','12')),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_push_user ON push_subscriptions(user_id);

-- Which occurrences have already been announced, so a restart never repeats one.
CREATE TABLE IF NOT EXISTS reminder_pushes (
  reminder_id INTEGER NOT NULL REFERENCES reminders(id) ON DELETE CASCADE,
  date        TEXT NOT NULL,           -- the day of the occurrence (YYYY-MM-DD)
  sent_at     TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (reminder_id, date)
);

-- Server-generated secrets that must survive a restart (the push signing key).
CREATE TABLE IF NOT EXISTS app_secrets (
  name  TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
