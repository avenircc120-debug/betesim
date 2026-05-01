-- Migration: Seller Wallet & Bot Intelligence
-- Date: 2026-05-01

-- Vue agrégée du portefeuille vendeur (net_amount = 70% après commission plateforme)
CREATE OR REPLACE VIEW seller_wallet_balances AS
SELECT
  partner_id,
  COALESCE(SUM(CASE WHEN type = 'coupon_sale' THEN net_amount ELSE 0 END), 0)  AS total_earned_fcfa,
  COALESCE(SUM(CASE WHEN type = 'coupon_sale' THEN gross_amount ELSE 0 END), 0) AS total_gross_fcfa,
  COALESCE(SUM(CASE WHEN type = 'coupon_sale' THEN commission_amount ELSE 0 END), 0) AS total_commission_fcfa,
  COUNT(CASE WHEN type = 'coupon_sale' THEN 1 END)                               AS total_sales,
  MAX(created_at)                                                                 AS last_sale_at
FROM commission_records
GROUP BY partner_id;

-- Retraits vendeurs (séparés des retraits wallet principal)
CREATE TABLE IF NOT EXISTS seller_withdrawal_requests (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id   TEXT        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  amount_fcfa  INTEGER     NOT NULL CHECK (amount_fcfa >= 500),
  phone_number TEXT        NOT NULL,
  provider     TEXT        NOT NULL DEFAULT 'mtn' CHECK (provider IN ('mtn','moov','orange')),
  status       TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','completed','failed')),
  note         TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS seller_wr_partner_idx ON seller_withdrawal_requests (partner_id, created_at DESC);

ALTER TABLE seller_withdrawal_requests ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  CREATE POLICY seller_wr_own ON seller_withdrawal_requests
    FOR ALL USING (partner_id = auth.uid()::text);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Lien télégramme → profil via telegram_user_id
CREATE INDEX IF NOT EXISTS partner_packs_tguid_idx ON partner_packs(telegram_user_id)
  WHERE telegram_user_id IS NOT NULL;
