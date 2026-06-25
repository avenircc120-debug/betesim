-- Bot logs table for real-time error monitoring
CREATE TABLE IF NOT EXISTS bot_logs (
  id         UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  level      TEXT        NOT NULL CHECK (level IN ('error', 'warn', 'info')),
  event      TEXT        NOT NULL,
  chat_id    BIGINT,
  message    TEXT        NOT NULL,
  details    JSONB,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_bot_logs_level      ON bot_logs(level);
CREATE INDEX IF NOT EXISTS idx_bot_logs_event      ON bot_logs(event);
CREATE INDEX IF NOT EXISTS idx_bot_logs_created_at ON bot_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_bot_logs_chat_id    ON bot_logs(chat_id);

-- Only service role can read/write (no public access)
ALTER TABLE bot_logs ENABLE ROW LEVEL SECURITY;

-- Auto-purge logs older than 30 days to keep the table lean
CREATE OR REPLACE FUNCTION purge_old_bot_logs() RETURNS void
  LANGUAGE sql SECURITY DEFINER AS $$
    DELETE FROM bot_logs WHERE created_at < now() - INTERVAL '30 days';
  $$;
