-- ══════════════════════════════════════════════════════════════════════════════
-- Migration: Mémoire conversationnelle Groq — historique par utilisateur
-- Date: 2026-07-02
--
-- Principe :
--   Chaque utilisateur bot a un historique des N derniers échanges (user/assistant)
--   stocké en JSONB dans bot_sessions.groq_history.
--   Groq reçoit cet historique à chaque requête → il se souvient du contexte.
--
-- Limite : 10 messages max (5 échanges) pour rester dans le budget token.
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. Colonne groq_history sur bot_sessions ──────────────────────────────────
ALTER TABLE bot_sessions
  ADD COLUMN IF NOT EXISTS groq_history JSONB NOT NULL DEFAULT '[]';

CREATE INDEX IF NOT EXISTS bot_sessions_chat_history_idx
  ON bot_sessions(telegram_chat_id)
  WHERE groq_history != '[]';

COMMENT ON COLUMN bot_sessions.groq_history IS
  'Historique des échanges Groq pour cet utilisateur.
   Format : [{role:"user",content:"..."},{role:"assistant",content:"..."},...].
   Max 10 messages (5 échanges). Survit aux clearBotState (state machine).
   Réinitialisé uniquement par /start ou commande explicite.';

-- ── 2. Fonction RPC : upsert_groq_history ────────────────────────────────────
--    Upsert "ciblé" : ne touche QUE groq_history, préserve state/data.
--    Crée la ligne si elle n'existe pas encore (nouvel utilisateur).
CREATE OR REPLACE FUNCTION upsert_groq_history(p_chat_id BIGINT, p_history JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  INSERT INTO bot_sessions (telegram_chat_id, state, data, groq_history, updated_at)
  VALUES (p_chat_id, 'idle', '{}'::jsonb, p_history, NOW())
  ON CONFLICT (telegram_chat_id)
  DO UPDATE SET
    groq_history = p_history,
    updated_at   = NOW();
    -- state et data sont préservés intentionnellement
END;
$$;

COMMENT ON FUNCTION upsert_groq_history IS
  'Sauvegarde l''historique Groq sans écraser state/data de la state machine.
   Crée la ligne si absente (premier message d''un nouvel utilisateur).';

-- ── 3. Fonction RPC : clear_groq_history ─────────────────────────────────────
--    Réinitialise la mémoire Groq d'un utilisateur (sur /start par exemple).
CREATE OR REPLACE FUNCTION clear_groq_history(p_chat_id BIGINT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  UPDATE bot_sessions
    SET groq_history = '[]'::jsonb, updated_at = NOW()
    WHERE telegram_chat_id = p_chat_id;
END;
$$;

COMMENT ON FUNCTION clear_groq_history IS
  'Vide la mémoire conversationnelle Groq d''un utilisateur. Appelé sur /start.';
