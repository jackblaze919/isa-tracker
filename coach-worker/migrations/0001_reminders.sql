-- 0001_reminders.sql — Hammy reminders schema (Cloudflare D1 / SQLite).
-- Stores only the minimum needed to send gentle push reminders. No names, emails, phone
-- numbers, weights, meal contents, photos, chat, or medical data are ever stored here.
-- user_id is an HMAC of the browser's anonymous id (never the raw id, never the access code).

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         TEXT    NOT NULL,
  endpoint        TEXT    NOT NULL UNIQUE,
  p256dh          TEXT    NOT NULL,
  auth            TEXT    NOT NULL,
  expiration_time INTEGER,
  enabled         INTEGER NOT NULL DEFAULT 1,
  created_at      INTEGER NOT NULL,
  updated_at      INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_subs_user ON push_subscriptions(user_id);

CREATE TABLE IF NOT EXISTS reminder_preferences (
  user_id           TEXT PRIMARY KEY,
  timezone          TEXT    NOT NULL DEFAULT 'UTC',
  quiet_start       TEXT    NOT NULL DEFAULT '21:00',
  quiet_end         TEXT    NOT NULL DEFAULT '08:00',
  paused_local_date TEXT,
  -- categories_json: { steps:{enabled,time}, workout:{...}, protein:{...}, meals:{...}, checkin:{...} }
  categories_json   TEXT    NOT NULL DEFAULT '{}',
  enabled           INTEGER NOT NULL DEFAULT 1,
  updated_at        INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_status (
  user_id     TEXT    NOT NULL,
  local_date  TEXT    NOT NULL,           -- YYYY-MM-DD in the user's timezone
  timezone    TEXT    NOT NULL,
  status_json TEXT    NOT NULL,           -- minimal completion flags only (see reminders.js schema)
  updated_at  INTEGER NOT NULL,
  PRIMARY KEY (user_id, local_date)
);

CREATE TABLE IF NOT EXISTS reminder_log (
  user_id        TEXT    NOT NULL,
  local_date     TEXT    NOT NULL,
  category       TEXT    NOT NULL,
  sent_at        INTEGER NOT NULL,
  delivery_count INTEGER NOT NULL DEFAULT 0,
  last_result    TEXT,
  -- guarantees at most one reminder per category per local day
  PRIMARY KEY (user_id, local_date, category)
);
