-- Migration 029: keep sign-in sessions in the database.
-- They used to live in the server's memory, so every restart or deploy signed
-- every student out in the middle of whatever they were doing.
CREATE TABLE IF NOT EXISTS sessions (
  sid     TEXT PRIMARY KEY,
  data    TEXT NOT NULL,      -- the session as JSON
  expires INTEGER NOT NULL    -- epoch milliseconds
);
CREATE INDEX IF NOT EXISTS idx_sessions_expires ON sessions(expires);
