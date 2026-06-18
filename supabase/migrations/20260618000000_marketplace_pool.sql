-- Migration: Marketplace Pool Commun
-- Date: 2026-06-18

-- ── 1. COUPONS : colonnes marketplace ────────────────────────────────────────
ALTER TABLE coupons
  ADD COLUMN IF NOT EXISTS creator_id   TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS buyer_id     TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS sold_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS referrer_id  TEXT REFERENCES profiles(id) ON DELETE SET NULL;

-- Élargir le CHECK status pour inclure 'sold'
ALTER TABLE coupons DROP CONSTRAINT IF EXISTS coupons_status_check;
ALTER TABLE coupons ADD CONSTRAINT coupons_status_check
  CHECK (status IN ('active','paused','expired','sold'));

-- ── 2. COMMISSION_RECORDS : colonnes referrer + buyer ────────────────────────
ALTER TABLE commission_records
  ADD COLUMN IF NOT EXISTS referrer_id  TEXT REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS buyer_id     TEXT REFERENCES profiles(id) ON DELETE SET NULL;

-- Élargir le CHECK type pour referral_commission
ALTER TABLE commission_records DROP CONSTRAINT IF EXISTS commission_records_type_check;
ALTER TABLE commission_records ADD CONSTRAINT commission_records_type_check
  CHECK (type IN ('coupon_sale','withdrawal','referral_commission'));

-- ── 3. RLS : lecture publique du Pool Commun ─────────────────────────────────
DROP POLICY IF EXISTS coupons_public_pool_select ON coupons;
CREATE POLICY coupons_public_pool_select ON coupons
  FOR SELECT USING (status = 'active');

-- ── 4. INDEX performances marketplace ───────────────────────────────────────
CREATE INDEX IF NOT EXISTS coupons_pool_active_idx  ON coupons (status, created_at DESC) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS coupons_creator_idx      ON coupons (creator_id);
CREATE INDEX IF NOT EXISTS coupons_buyer_idx        ON coupons (buyer_id);
CREATE INDEX IF NOT EXISTS commission_referrer_idx  ON commission_records (referrer_id, created_at DESC);
