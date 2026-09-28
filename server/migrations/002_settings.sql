-- Simple key/value settings (current term, weekly study-hour target, etc.)
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
