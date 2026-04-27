-- Migration: Profile completion wall
-- Date: 2026-04-27
-- Adds 3 mandatory fields collected at first login.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS full_name         TEXT,
  ADD COLUMN IF NOT EXISTS deposit_number    TEXT,
  ADD COLUMN IF NOT EXISTS withdrawal_number TEXT,
  ADD COLUMN IF NOT EXISTS profile_completed_at TIMESTAMPTZ;

COMMENT ON COLUMN profiles.full_name IS 'Nom & Prénom collectés au premier login (mur dobligation)';
COMMENT ON COLUMN profiles.deposit_number IS 'Numéro Mobile Money utilisé pour les dépôts';
COMMENT ON COLUMN profiles.withdrawal_number IS 'Numéro Mobile Money utilisé pour les retraits';
