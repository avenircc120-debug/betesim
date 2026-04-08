-- ============================================================
-- MINAGE EN ARRIÈRE-PLAN : pg_cron toutes les minutes
-- Les utilisateurs n'ont pas besoin d'avoir l'app ouverte.
-- credit_mining_earnings() est appelée automatiquement.
-- ============================================================

-- Activer l'extension pg_cron (disponible sur tous les plans Supabase)
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Supprimer l'ancien job s'il existe déjà (évite les doublons)
SELECT cron.unschedule('credit-mining-every-minute')
WHERE EXISTS (
  SELECT 1 FROM cron.job WHERE jobname = 'credit-mining-every-minute'
);

-- Planifier le crédit de minage chaque minute pour tous les utilisateurs
-- Fonctionne même quand l'app est fermée
SELECT cron.schedule(
  'credit-mining-every-minute',   -- nom unique du job
  '* * * * *',                    -- toutes les minutes
  $$SELECT public.credit_mining_earnings();$$
);

-- Vérification : afficher les jobs actifs
SELECT jobname, schedule, command FROM cron.job WHERE jobname = 'credit-mining-every-minute';
