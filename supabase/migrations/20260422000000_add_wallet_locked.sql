-- Migration: Add locked wallet balance (refunds) + phone OTP table
-- Date: 2026-04-22

-- Add locked balance column to profiles
-- fcfa_locked_balance = refunded money (delivery failure) — cannot be withdrawn, only used to buy SIM
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS fcfa_locked_balance INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN profiles.fcfa_locked_balance IS 'FCFA from refunds (delivery failures) — can only be used to buy SIM, not withdraw. Part of fcfa_balance.';

-- Ensure fcfa_locked_balance never exceeds fcfa_balance
ALTER TABLE profiles ADD CONSTRAINT IF NOT EXISTS chk_locked_le_total
  CHECK (fcfa_locked_balance <= fcfa_balance);

-- phone_otps table for custom OTP verification (no reCAPTCHA)
CREATE TABLE IF NOT EXISTS phone_otps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  phone TEXT NOT NULL,
  otp_hash TEXT NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '10 minutes'),
  used BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS phone_otps_phone_idx ON phone_otps(phone, expires_at);

-- RLS: only service role can access
ALTER TABLE phone_otps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role only"
  ON phone_otps FOR ALL
  USING (true)
  WITH CHECK (true);

-- Auto-cleanup old OTPs (optional, can be done via pg_cron)
COMMENT ON TABLE phone_otps IS 'Temporary OTP codes for phone authentication — auto-expire after 10 minutes';
