-- Migration: Livrauto — colonnes QR scan + statuts commande
-- Ajoute les colonnes manquantes pour livrauto-scan et le flux de livraison

-- ── Colonnes QR sur lv_orders ─────────────────────────────────────────────────
ALTER TABLE lv_orders
  ADD COLUMN IF NOT EXISTS qr_token          TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS qr_scanned_at     TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS funds_released_at TIMESTAMPTZ;

-- ── Extension du CHECK status pour inclure pending_delivery et completed ──────
ALTER TABLE lv_orders DROP CONSTRAINT IF EXISTS lv_orders_status_check;
ALTER TABLE lv_orders ADD CONSTRAINT lv_orders_status_check
  CHECK (status IN ('pending','paid','pending_delivery','completed','delivered','cancelled','refunded'));

-- Index sur qr_token pour scan rapide
CREATE UNIQUE INDEX IF NOT EXISTS lv_orders_qr_token_idx
  ON lv_orders (qr_token) WHERE qr_token IS NOT NULL;

-- ── Fonction pour générer un QR token unique ──────────────────────────────────
CREATE OR REPLACE FUNCTION generate_qr_token()
RETURNS TEXT LANGUAGE sql AS $$
  SELECT encode(gen_random_bytes(16), 'hex');
$$;
