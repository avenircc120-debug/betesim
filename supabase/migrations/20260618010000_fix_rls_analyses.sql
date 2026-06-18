-- Migration: Fix RLS analyses + football_matches
-- Date: 2026-06-18

ALTER TABLE analyses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS analyses_select_published ON analyses;
CREATE POLICY analyses_select_published ON analyses FOR SELECT USING (published = true);
DROP POLICY IF EXISTS analyses_service_all ON analyses;
CREATE POLICY analyses_service_all ON analyses FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Publication des analyses existantes non publiées
UPDATE analyses SET published = true WHERE published = false OR published IS NULL;

ALTER TABLE football_matches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS matches_select_all ON football_matches;
CREATE POLICY matches_select_all ON football_matches FOR SELECT USING (true);
DROP POLICY IF EXISTS matches_service_all ON football_matches;
CREATE POLICY matches_service_all ON football_matches FOR ALL TO service_role USING (true) WITH CHECK (true);
