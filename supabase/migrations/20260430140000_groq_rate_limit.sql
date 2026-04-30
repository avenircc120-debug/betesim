-- ──────────────────────────────────────────────────────────────────────────
-- Rate limiter atomique pour les appels à l'API Groq.
-- Objectif : ne JAMAIS dépasser 25 requêtes par minute (toutes Edge Functions
-- confondues), pour rester dans le quota gratuit et éviter le bannissement.
-- ──────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.groq_call_log (
  id        BIGSERIAL PRIMARY KEY,
  caller    TEXT        NOT NULL DEFAULT 'unknown',
  called_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS groq_call_log_called_at_idx
  ON public.groq_call_log (called_at DESC);

-- RLS activée mais aucun accès anon : seul service_role (Edge Functions) lit/écrit
ALTER TABLE public.groq_call_log ENABLE ROW LEVEL SECURITY;

-- ──────────────────────────────────────────────────────────────────────────
-- Fonction atomique : essaie de consommer un "ticket" du seau de tokens.
-- Renvoie TRUE si l'appel est autorisé (et l'enregistre), FALSE sinon.
-- Elle nettoie aussi les entrées trop vieilles à chaque appel (cheap).
-- ──────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.consume_groq_rate_limit(
  p_caller       TEXT DEFAULT 'unknown',
  p_max_per_min  INT  DEFAULT 25
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  -- Nettoyage des entrées de plus d'1 minute (limite la croissance de la table)
  DELETE FROM public.groq_call_log
   WHERE called_at < NOW() - INTERVAL '60 seconds';

  -- Comptage de la fenêtre courante
  SELECT COUNT(*) INTO v_count
    FROM public.groq_call_log
   WHERE called_at >= NOW() - INTERVAL '60 seconds';

  IF v_count >= p_max_per_min THEN
    RETURN FALSE;
  END IF;

  INSERT INTO public.groq_call_log (caller) VALUES (p_caller);
  RETURN TRUE;
END;
$$;

-- Permettre l'appel de la RPC depuis les Edge Functions (service_role)
GRANT EXECUTE ON FUNCTION public.consume_groq_rate_limit(TEXT, INT) TO service_role;

-- ──────────────────────────────────────────────────────────────────────────
-- Cache des analyses de pronostics (clé = sport|match en minuscules).
-- Évite de re-payer Groq 10 000 fois pour le même match dans la même heure.
-- ──────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.pronostic_cache (
  id          BIGSERIAL PRIMARY KEY,
  cache_key   TEXT        NOT NULL,
  match       TEXT        NOT NULL,
  sport       TEXT        NOT NULL DEFAULT 'football',
  analysis    JSONB       NOT NULL,
  sources     JSONB       NOT NULL DEFAULT '[]'::JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS pronostic_cache_key_created_idx
  ON public.pronostic_cache (cache_key, created_at DESC);

ALTER TABLE public.pronostic_cache ENABLE ROW LEVEL SECURITY;

-- Lecture autorisée pour tous (les analyses ne sont pas sensibles)
DROP POLICY IF EXISTS "pronostic_cache_select_all" ON public.pronostic_cache;
CREATE POLICY "pronostic_cache_select_all"
  ON public.pronostic_cache FOR SELECT
  USING (true);

-- Insertion réservée au service_role (Edge Function pronostic-analysis)
-- (pas de policy INSERT → seul service_role peut écrire en bypass RLS)
