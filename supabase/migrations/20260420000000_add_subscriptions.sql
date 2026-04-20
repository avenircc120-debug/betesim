-- Migration: Add subscriptions table (Pilier 4)
-- Date: 2026-04-20

CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Number details
  number TEXT NOT NULL,
  country TEXT NOT NULL,
  service TEXT NOT NULL,

  -- SMSPool tracking
  smspool_order_id TEXT,
  fedapay_transaction_id TEXT,

  -- Status: active | expired | replaced | cancelled
  status TEXT NOT NULL DEFAULT 'active',
  replaced_reason TEXT,

  -- SMS data
  last_sms_code TEXT,
  last_sms_full TEXT,
  sms_received_at TIMESTAMPTZ,

  -- Validity: 30 days
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),

  -- Metadata
  attempts INT DEFAULT 1,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Prevent duplicate FedaPay transactions
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_fedapay_tx_idx
  ON subscriptions(fedapay_transaction_id)
  WHERE fedapay_transaction_id IS NOT NULL;

-- Index for user queries
CREATE INDEX IF NOT EXISTS subscriptions_user_id_idx ON subscriptions(user_id);
CREATE INDEX IF NOT EXISTS subscriptions_expires_at_idx ON subscriptions(expires_at);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_subscriptions_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER subscriptions_updated_at
  BEFORE UPDATE ON subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION update_subscriptions_updated_at();

-- RLS
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own subscriptions"
  ON subscriptions FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Service role can manage all subscriptions"
  ON subscriptions FOR ALL
  USING (true)
  WITH CHECK (true);

-- Auto-expire subscriptions via pg_cron (if available)
-- Otherwise the API handles expiry checks
COMMENT ON TABLE subscriptions IS 'Virtual number subscriptions — 30 day validity with auto-release on expiry';
COMMENT ON COLUMN subscriptions.status IS 'active | expired | replaced | cancelled';
COMMENT ON COLUMN subscriptions.replaced_reason IS 'banned | sms_timeout';
COMMENT ON COLUMN subscriptions.attempts IS 'Number of delivery attempts (auto-replacement loop)';
