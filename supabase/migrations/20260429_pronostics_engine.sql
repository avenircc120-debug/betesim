-- ─── MOTEUR DE PRONOSTICS ─────────────────────────────────────────────────────

-- Analyses de matchs (postées par l'analyste/admin)
CREATE TABLE IF NOT EXISTS analyses (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  title        TEXT        NOT NULL,
  team_home    TEXT        NOT NULL,
  team_away    TEXT        NOT NULL,
  league       TEXT,
  country      TEXT,
  match_date   TIMESTAMPTZ,
  prediction   TEXT        NOT NULL,
  confidence   TEXT        NOT NULL DEFAULT 'moyen' CHECK (confidence IN ('faible','moyen','fort')),
  odds         NUMERIC(6,2),
  stats        JSONB       NOT NULL DEFAULT '{}',
  notes        TEXT,
  result       TEXT        NOT NULL DEFAULT 'en_attente' CHECK (result IN ('gagné','perdu','nul','annulé','en_attente')),
  published    BOOLEAN     NOT NULL DEFAULT true,
  source       TEXT        DEFAULT 'manual',
  external_id  TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS analyses_date_idx       ON analyses (match_date DESC);
CREATE INDEX IF NOT EXISTS analyses_published_idx  ON analyses (published, match_date DESC);

-- Coupons partenaires (ils vendent l'accès à leurs analyses)
CREATE TABLE IF NOT EXISTS coupons (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id  UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  analysis_id UUID        REFERENCES analyses(id) ON DELETE SET NULL,
  code        TEXT        NOT NULL UNIQUE,
  label       TEXT,
  price_fcfa  INTEGER     NOT NULL DEFAULT 500,
  sold_count  INTEGER     NOT NULL DEFAULT 0,
  status      TEXT        NOT NULL DEFAULT 'active' CHECK (status IN ('active','paused','expired')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS coupons_partner_idx ON coupons (partner_id);

-- Commissions (20% prélevées sur vente coupon + retrait partenaire)
CREATE TABLE IF NOT EXISTS commission_records (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  partner_id        UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  type              TEXT        NOT NULL CHECK (type IN ('coupon_sale','withdrawal')),
  gross_amount      INTEGER     NOT NULL,
  commission_amount INTEGER     NOT NULL,
  net_amount        INTEGER     NOT NULL,
  reference_id      UUID,
  description       TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS commission_partner_idx ON commission_records (partner_id, created_at DESC);

-- Matchs récupérés automatiquement (scraper multi-sources)
CREATE TABLE IF NOT EXISTS football_matches (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  external_id TEXT        UNIQUE,
  source      TEXT        NOT NULL,
  team_home   TEXT        NOT NULL,
  team_away   TEXT        NOT NULL,
  league      TEXT,
  country     TEXT,
  match_date  TIMESTAMPTZ,
  status      TEXT        DEFAULT 'scheduled',
  score_home  INTEGER,
  score_away  INTEGER,
  raw_data    JSONB       NOT NULL DEFAULT '{}',
  fetched_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS football_date_idx ON football_matches (match_date);

-- ─── RLS ─────────────────────────────────────────────────────────────────────
ALTER TABLE analyses          ENABLE ROW LEVEL SECURITY;
ALTER TABLE coupons           ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_records ENABLE ROW LEVEL SECURITY;
ALTER TABLE football_matches  ENABLE ROW LEVEL SECURITY;

-- analyses: lecture publique des analyses publiées
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='analyses' AND policyname='analyses_select_published') THEN
    CREATE POLICY analyses_select_published ON analyses FOR SELECT USING (published = true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='analyses' AND policyname='analyses_service_all') THEN
    CREATE POLICY analyses_service_all ON analyses FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='coupons' AND policyname='coupons_partner_own') THEN
    CREATE POLICY coupons_partner_own ON coupons FOR ALL USING (partner_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='coupons' AND policyname='coupons_service_all') THEN
    CREATE POLICY coupons_service_all ON coupons FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='commission_records' AND policyname='commission_own_read') THEN
    CREATE POLICY commission_own_read ON commission_records FOR SELECT USING (partner_id = auth.uid());
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='commission_records' AND policyname='commission_service_all') THEN
    CREATE POLICY commission_service_all ON commission_records FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='football_matches' AND policyname='matches_select_all') THEN
    CREATE POLICY matches_select_all ON football_matches FOR SELECT USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='football_matches' AND policyname='matches_service_all') THEN
    CREATE POLICY matches_service_all ON football_matches FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END $$;
