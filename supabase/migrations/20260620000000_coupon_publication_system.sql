-- ══════════════════════════════════════════════════════════════════════════════
-- Migration: Coupon Publication System (Reseller Wizard + Auto-Expiry)
-- Date: 2026-06-20
-- ══════════════════════════════════════════════════════════════════════════════

-- 1. Nouvelles colonnes sur coupons ──────────────────────────────────────────
ALTER TABLE coupons
  ADD COLUMN IF NOT EXISTS total_odds       NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS codes_json       JSONB    DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS match_start_time TIMESTAMPTZ;

-- Élargir le CHECK status (inclure 'sold' en plus d'expired)
ALTER TABLE coupons DROP CONSTRAINT IF EXISTS coupons_status_check;
ALTER TABLE coupons ADD CONSTRAINT coupons_status_check
  CHECK (status IN ('active','paused','expired','sold'));

-- 2. fedapay_id sur bot_orders ────────────────────────────────────────────────
ALTER TABLE bot_orders
  ADD COLUMN IF NOT EXISTS fedapay_id TEXT;

-- 3. Auto-expiry function ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION expire_past_coupons()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE cnt INTEGER;
BEGIN
  UPDATE coupons
    SET status = 'expired'
    WHERE status = 'active'
      AND match_start_time IS NOT NULL
      AND match_start_time <= NOW();
  GET DIAGNOSTICS cnt = ROW_COUNT;
  RETURN cnt;
END;
$$;

-- 4. Trigger auto-expiry à chaque INSERT/UPDATE ───────────────────────────────
CREATE OR REPLACE FUNCTION trg_auto_expire_on_upsert()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.match_start_time IS NOT NULL AND NEW.match_start_time <= NOW() THEN
    NEW.status := 'expired';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS auto_expire_coupon ON coupons;
CREATE TRIGGER auto_expire_coupon
  BEFORE INSERT OR UPDATE ON coupons
  FOR EACH ROW EXECUTE FUNCTION trg_auto_expire_on_upsert();

-- 5. pg_cron toutes les 5 min (si disponible) ─────────────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('expire-coupons');
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule('expire-coupons','*/5 * * * *','SELECT expire_past_coupons()');
  END IF;
END $$;

-- 6. Index pour le cron & la publication ─────────────────────────────────────
CREATE INDEX IF NOT EXISTS coupons_expiry_idx ON coupons (match_start_time, status)
  WHERE status = 'active' AND match_start_time IS NOT NULL;
CREATE INDEX IF NOT EXISTS coupons_active_new_idx ON coupons (created_at DESC)
  WHERE status = 'active';
