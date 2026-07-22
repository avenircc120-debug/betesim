-- Migration: ajout colonne coin_balance dans profiles
-- Taux : 1 Coin = 100 FCFA  |  Date : 2026-07-21

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS coin_balance INTEGER NOT NULL DEFAULT 0;

-- Migre le solde existant (fcfa_balance FCFA → Coins)
UPDATE profiles
  SET coin_balance = FLOOR(fcfa_balance / 100)
  WHERE fcfa_balance > 0 AND coin_balance = 0;

-- Suivi Coins dans la table transactions
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS amount_coins INTEGER;
