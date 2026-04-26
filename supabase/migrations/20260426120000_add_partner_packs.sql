-- Migration: Partner Pack flow + admin dashboard
-- Date: 2026-04-26

-- ─── 1. app_settings : key/value store for editable params (partner_link, etc.)
CREATE TABLE IF NOT EXISTS app_settings (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL DEFAULT '',
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO app_settings (key, value) VALUES ('partner_link', '')
  ON CONFLICT (key) DO NOTHING;

ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "anon_select_app_settings" ON public.app_settings;
CREATE POLICY "anon_select_app_settings" ON public.app_settings
  FOR SELECT TO anon, authenticated USING (true);

-- ─── 2. profiles.is_admin
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_admin BOOLEAN NOT NULL DEFAULT FALSE;

-- ─── 3. partner_packs : tracks each Pack Partenaire purchase through its 4 steps
CREATE TABLE IF NOT EXISTS partner_packs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,

  -- Payment
  fedapay_transaction_id TEXT,
  amount_fcfa INTEGER NOT NULL DEFAULT 2500,

  -- Step tracking: paid → partner_id_provided → delivered
  status TEXT NOT NULL DEFAULT 'paid',

  -- Step 3 : partner ID submitted by client
  partner_id TEXT,
  partner_id_submitted_at TIMESTAMPTZ,

  -- Step 4 : delivered Telegram number (linked to subscriptions row)
  subscription_id UUID REFERENCES subscriptions(id) ON DELETE SET NULL,
  telegram_number TEXT,
  delivered_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS partner_packs_fedapay_tx_idx
  ON partner_packs(fedapay_transaction_id) WHERE fedapay_transaction_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS partner_packs_user_idx ON partner_packs(user_id);
CREATE INDEX IF NOT EXISTS partner_packs_status_idx ON partner_packs(status);

ALTER TABLE partner_packs ENABLE ROW LEVEL SECURITY;

-- App uses Firebase auth + filters by user_id at the app layer (same pattern as
-- subscriptions / transactions), so anon SELECT is allowed. Service role does writes.
DROP POLICY IF EXISTS "anon_select_partner_packs" ON public.partner_packs;
CREATE POLICY "anon_select_partner_packs" ON public.partner_packs
  FOR SELECT TO anon, authenticated USING (true);

CREATE OR REPLACE FUNCTION update_partner_packs_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS partner_packs_updated_at ON partner_packs;
CREATE TRIGGER partner_packs_updated_at
  BEFORE UPDATE ON partner_packs
  FOR EACH ROW EXECUTE FUNCTION update_partner_packs_updated_at();

COMMENT ON TABLE partner_packs IS 'Pack Partenaire purchases — 4-step flow: paid → partner_id_provided → delivered';
COMMENT ON COLUMN partner_packs.partner_id IS 'Affiliate / promo code entered by the client (step 3)';
COMMENT ON COLUMN partner_packs.subscription_id IS 'FK to subscriptions.id once Telegram number is delivered (step 4)';
