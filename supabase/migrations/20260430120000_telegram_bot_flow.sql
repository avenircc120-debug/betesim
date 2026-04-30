-- Migration: Telegram Bot flow (Pack Officiel)
-- Date: 2026-04-30
-- Ajoute le suivi du parcours bot Telegram : 2FA -> partenaire 1win -> déblocage logiciel

ALTER TABLE partner_packs
  ADD COLUMN IF NOT EXISTS telegram_user_id     BIGINT,
  ADD COLUMN IF NOT EXISTS telegram_username    TEXT,
  ADD COLUMN IF NOT EXISTS telegram_first_name  TEXT,
  ADD COLUMN IF NOT EXISTS bot_started_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS secured_2fa_at       TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS partner_clicked_at   TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS software_unlocked_at TIMESTAMPTZ;

CREATE INDEX IF NOT EXISTS partner_packs_telegram_user_idx
  ON partner_packs(telegram_user_id) WHERE telegram_user_id IS NOT NULL;

COMMENT ON COLUMN partner_packs.telegram_user_id IS 'ID Telegram numérique de l''utilisateur (récupéré auto par le bot)';
COMMENT ON COLUMN partner_packs.telegram_username IS 'Username Telegram (@xxx) si disponible';
COMMENT ON COLUMN partner_packs.bot_started_at IS 'Date du premier /start sur le bot';
COMMENT ON COLUMN partner_packs.secured_2fa_at IS 'Date à laquelle l''utilisateur a confirmé avoir activé la 2FA';
COMMENT ON COLUMN partner_packs.partner_clicked_at IS 'Date à laquelle l''utilisateur a cliqué sur le lien partenaire 1win';
COMMENT ON COLUMN partner_packs.software_unlocked_at IS 'Date de déblocage de l''accès au logiciel Pack Officiel';

-- URL publique de l'app (utilisée par le bot pour générer le lien vers /pronostics)
INSERT INTO app_settings (key, value) VALUES ('app_base_url', '')
  ON CONFLICT (key) DO NOTHING;
