-- 0002_email_digest_log.sql — one row per daily digest send, to guarantee at most one
-- email per day. recipient_hash is an HMAC of the recipient email (raw email never stored here).
-- Only ONE digest per local date exists, so no digest_type column is needed.

CREATE TABLE IF NOT EXISTS email_digest_log (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  digest_date         TEXT    NOT NULL,        -- the report date (YYYY-MM-DD), e.g. yesterday
  recipient_hash      TEXT    NOT NULL,
  sent_at             INTEGER NOT NULL,
  status              TEXT    NOT NULL,         -- 'sent' | 'failed'
  provider_message_id TEXT,
  last_error          TEXT
);
-- at most one digest per (date, recipient) — prevents duplicate daily emails
CREATE UNIQUE INDEX IF NOT EXISTS idx_digest_unique ON email_digest_log(digest_date, recipient_hash);
