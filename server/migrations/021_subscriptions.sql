-- Migration 021: Subscription tracking for AI premium features.
CREATE TABLE IF NOT EXISTS subscriptions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  plan        TEXT NOT NULL DEFAULT 'premium' CHECK (plan IN ('premium')),
  status      TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','cancelled','expired')),
  price       INTEGER NOT NULL DEFAULT 99,
  started_at  TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at  TEXT NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id, status);
