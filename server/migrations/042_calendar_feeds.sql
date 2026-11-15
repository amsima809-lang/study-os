-- Migration 042: a student's private calendar feed (server/src/calendarFeed.ts).
-- Google Calendar or the iPhone's Calendar subscribes to https://<site>/cal/<token>.ics and shows
-- her classes, finals and e-Testing dates beside her own calendars. The token is the only key (a
-- calendar app cannot sign in), so it is long and random, and she can reset or turn it off.
CREATE TABLE IF NOT EXISTS calendar_feeds (
  user_id    TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  token      TEXT NOT NULL UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Addresses she reset or turned off, kept (as a SHA-256, never the token) so that a calendar
-- still subscribed to one gets an EMPTY calendar and clears its copy, instead of an error that
-- leaves the old classes and finals frozen in it. Forgotten after 180 days.
CREATE TABLE IF NOT EXISTS calendar_feeds_revoked (
  token_hash TEXT PRIMARY KEY,
  revoked_at TEXT NOT NULL DEFAULT (datetime('now'))
);
