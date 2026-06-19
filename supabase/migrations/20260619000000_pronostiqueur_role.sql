-- Migration: Rôle Pronostiqueur + sous-wallet
-- Date: 2026-06-19

-- ── 1. Ajouter pronostiqueur_id à analyses ───────────────────────────────────
ALTER TABLE analyses
  ADD COLUMN IF NOT EXISTS pronostiqueur_id TEXT REFERENCES profiles(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS analyses_pronostiqueur_idx ON analyses(pronostiqueur_id)
  WHERE pronostiqueur_id IS NOT NULL;

-- ── 2. Étendre le CHECK type de commission_records ───────────────────────────
ALTER TABLE commission_records DROP CONSTRAINT IF EXISTS commission_records_type_check;
ALTER TABLE commission_records ADD CONSTRAINT commission_records_type_check
  CHECK (type IN ('coupon_sale','withdrawal','referral_commission','pronostiqueur_share'));

-- ── 3. Vue sous-wallet pronostiqueur ─────────────────────────────────────────
CREATE OR REPLACE VIEW pronostiqueur_wallet_balances AS
SELECT
  partner_id,
  COALESCE(SUM(net_amount), 0)        AS total_earned_fcfa,
  COALESCE(SUM(gross_amount), 0)      AS total_gross_fcfa,
  COUNT(*)                            AS total_shares,
  MAX(created_at)                     AS last_share_at
FROM commission_records
WHERE type = 'pronostiqueur_share'
GROUP BY partner_id;

-- ── 4. Vue activité pronostiqueur (revendeurs + clients sur ses analyses) ────
CREATE OR REPLACE VIEW pronostiqueur_activity AS
SELECT
  a.pronostiqueur_id,
  a.id           AS analysis_id,
  a.team_home,
  a.team_away,
  a.league,
  a.result,
  c.id           AS coupon_id,
  c.creator_id   AS reseller_id,
  c.buyer_id,
  c.status       AS coupon_status,
  c.price_fcfa,
  c.sold_at,
  p_r.full_name  AS reseller_name,
  p_b.full_name  AS buyer_name
FROM analyses a
LEFT JOIN coupons c        ON c.analysis_id = a.id
LEFT JOIN profiles p_r     ON p_r.id = c.creator_id
LEFT JOIN profiles p_b     ON p_b.id = c.buyer_id
WHERE a.pronostiqueur_id IS NOT NULL;

-- RLS service_role pour la vue
GRANT SELECT ON pronostiqueur_wallet_balances TO service_role;
GRANT SELECT ON pronostiqueur_activity        TO service_role;
