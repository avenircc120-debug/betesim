-- Migration: external_match_id sur analyses
-- Permet à auto-analyse de dédupliquer : une analyse par match foot externe.

ALTER TABLE analyses
  ADD COLUMN IF NOT EXISTS external_match_id TEXT DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS source TEXT DEFAULT NULL;

CREATE INDEX IF NOT EXISTS idx_analyses_external_match_id
  ON analyses(external_match_id)
  WHERE external_match_id IS NOT NULL;

-- Commentaire : pour planifier auto-analyse automatiquement, activez pg_cron
-- dans votre dashboard Supabase (Database → Extensions → pg_cron), puis :
--
-- SELECT cron.schedule(
--   'auto-analyse-every-2h',
--   '0 */2 * * *',
--   $$ SELECT net.http_post(
--       url := 'https://<VOTRE_REF>.supabase.co/functions/v1/auto-analyse',
--       headers := '{"Content-Type":"application/json","Authorization":"Bearer <SERVICE_ROLE_KEY>"}'::jsonb,
--       body := '{}'::jsonb
--   ) $$
-- );
