-- ══════════════════════════════════════════════════════════════════════════════
-- Migration: Auto-Delete Expired Coupons & Analyses (Coffre-fort propre)
-- Date: 2026-06-23
--
-- Remplace le système "expire" (status='expired') par une SUPPRESSION réelle
-- des coupons périmés et de leurs analyses associées (source='revendeur').
-- Cron : toutes les 5 minutes.
-- ══════════════════════════════════════════════════════════════════════════════

-- 1. Nouvelle fonction de suppression ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION delete_expired_coupons_and_analyses()
RETURNS INTEGER LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  expired_analysis_ids UUID[];
  cnt INTEGER;
BEGIN
  -- Collecter les analysis_id des coupons revendeur périmés
  SELECT ARRAY_AGG(DISTINCT analysis_id::UUID)
  INTO expired_analysis_ids
  FROM coupons
  WHERE status = 'active'
    AND match_start_time IS NOT NULL
    AND match_start_time <= NOW()
    AND analysis_id IS NOT NULL;

  -- Supprimer les coupons actifs dont le match a commencé
  DELETE FROM coupons
  WHERE status = 'active'
    AND match_start_time IS NOT NULL
    AND match_start_time <= NOW();

  GET DIAGNOSTICS cnt = ROW_COUNT;

  -- Supprimer les analyses associées (uniquement source='revendeur')
  IF expired_analysis_ids IS NOT NULL AND array_length(expired_analysis_ids, 1) > 0 THEN
    DELETE FROM analyses
    WHERE id = ANY(expired_analysis_ids)
      AND source = 'revendeur';
  END IF;

  RETURN cnt;
END;
$$;

-- 2. Trigger BEFORE INSERT/UPDATE : bloquer l'insertion si match déjà commencé
CREATE OR REPLACE FUNCTION trg_block_expired_coupon()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.match_start_time IS NOT NULL AND NEW.match_start_time <= NOW() THEN
    RAISE EXCEPTION 'match_start_time est déjà passé — impossible de publier un coupon périmé';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS block_expired_coupon ON coupons;
CREATE TRIGGER block_expired_coupon
  BEFORE INSERT OR UPDATE ON coupons
  FOR EACH ROW EXECUTE FUNCTION trg_block_expired_coupon();

-- 3. Mise à jour du cron : remplace l'ancienne tâche par la suppression réelle
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('expire-coupons');
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    PERFORM cron.schedule(
      'expire-coupons',
      '*/5 * * * *',
      'SELECT delete_expired_coupons_and_analyses()'
    );
  END IF;
END $$;

-- 4. Index pour les performances de la purge cron ─────────────────────────────
CREATE INDEX IF NOT EXISTS coupons_auto_delete_idx
  ON coupons (match_start_time, status)
  WHERE status = 'active' AND match_start_time IS NOT NULL;
