-- Migration 008: FCM tokens for Firebase push notifications

CREATE TABLE IF NOT EXISTS fcm_tokens (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token        TEXT    NOT NULL,
  device_id    VARCHAR(255),                  -- optional unique device identifier
  platform     VARCHAR(20)                    -- 'android' | 'ios' | 'web'
                 CHECK (platform IN ('android', 'ios', 'web')),
  is_active    BOOLEAN NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- One active token per device per user; upsert by (user_id, device_id)
  UNIQUE (user_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_fcm_tokens_user_id   ON fcm_tokens (user_id);
CREATE INDEX IF NOT EXISTS idx_fcm_tokens_token      ON fcm_tokens (token);
CREATE INDEX IF NOT EXISTS idx_fcm_tokens_active     ON fcm_tokens (user_id, is_active);
