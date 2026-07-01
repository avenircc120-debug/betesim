-- ══════════════════════════════════════════════════════════════════════════════
-- Migration: lv_vendor_own_products — Flux Vendeur isolé
-- Date: 2026-07-01
-- ⚠️  Ce flux est totalement indépendant du système Grossiste / Revendeur.
--     Les produits ici ne transitent JAMAIS par lv_products ni lv_reseller_products.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS lv_vendor_own_products (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_id   UUID        NOT NULL REFERENCES lv_vendors(id) ON DELETE CASCADE,
  name        TEXT        NOT NULL CHECK (char_length(name) BETWEEN 2 AND 120),
  description TEXT,
  price       NUMERIC(12,2) NOT NULL CHECK (price > 0),
  stock       INT         NOT NULL DEFAULT 0 CHECK (stock >= 0),
  photo_url   TEXT,
  is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE lv_vendor_own_products IS
  'Produits propres d''un Vendeur simple. ISOLÉ du système Grossiste/Revendeur.
   Split payment, parrainage, et visibilité catalogue grossiste = ABSENT.
   Visibilité Acheteurs : contrôlée par is_active uniquement.';

-- Index performance
CREATE INDEX IF NOT EXISTS lv_vop_vendor_idx    ON lv_vendor_own_products(vendor_id);
CREATE INDEX IF NOT EXISTS lv_vop_active_idx    ON lv_vendor_own_products(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS lv_vop_created_idx   ON lv_vendor_own_products(created_at DESC);

-- RLS : le service_role gère tout (bot Edge Function)
ALTER TABLE lv_vendor_own_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "service_role_full_access"  ON lv_vendor_own_products;
DROP POLICY IF EXISTS "public_read_active"         ON lv_vendor_own_products;

CREATE POLICY "service_role_full_access" ON lv_vendor_own_products
  FOR ALL
  USING (true)
  WITH CHECK (true);

CREATE POLICY "public_read_active" ON lv_vendor_own_products
  FOR SELECT
  USING (is_active = TRUE);

-- Trigger auto-updated_at
CREATE OR REPLACE FUNCTION touch_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trg_lv_vop_updated_at ON lv_vendor_own_products;
CREATE TRIGGER trg_lv_vop_updated_at
  BEFORE UPDATE ON lv_vendor_own_products
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
