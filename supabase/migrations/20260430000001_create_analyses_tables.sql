-- Table des analyses de pronostics publiées par l'admin
CREATE TABLE IF NOT EXISTS analyses (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title       text NOT NULL,
  team_home   text NOT NULL,
  team_away   text NOT NULL,
  league      text,
  country     text,
  match_date  timestamptz,
  prediction  text NOT NULL DEFAULT '',
  confidence  text NOT NULL DEFAULT 'moyen' CHECK (confidence IN ('faible','moyen','fort')),
  odds        numeric(6,2),
  stats       jsonb DEFAULT '{}',
  notes       text,
  result      text NOT NULL DEFAULT 'en_attente' CHECK (result IN ('gagné','perdu','nul','annulé','en_attente')),
  published   boolean NOT NULL DEFAULT true,
  source      text DEFAULT 'manual',
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Table des matchs de football (importés automatiquement)
CREATE TABLE IF NOT EXISTS football_matches (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_home  text NOT NULL,
  team_away  text NOT NULL,
  league     text,
  country    text,
  match_date timestamptz,
  source     text DEFAULT 'api',
  raw        jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Cache des analyses Groq (30 min TTL)
CREATE TABLE IF NOT EXISTS pronostic_cache (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cache_key  text NOT NULL,
  match      text NOT NULL,
  sport      text NOT NULL DEFAULT 'football',
  analysis   jsonb NOT NULL,
  sources    jsonb DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now()
);
