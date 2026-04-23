-- Migration: Solde wallet bloqué pour les remboursements de livraison échouée
-- Date: 2026-04-23
--
-- Règle métier :
--   * Quand une livraison SMSPool échoue, l'argent est remboursé sur le wallet
--     (fcfa_balance) et un montant équivalent est ajouté à fcfa_locked_balance.
--   * fcfa_locked_balance NE PEUT PAS être retiré en Mobile Money.
--   * fcfa_locked_balance peut être consommé pour racheter une SIM (depuis le wallet).
--   * Les gains de parrainage atterrissent uniquement dans fcfa_balance, donc ils
--     restent retirables tant que (fcfa_balance - fcfa_locked_balance) >= montant.
--
-- Solde retirable réel = fcfa_balance - fcfa_locked_balance.

ALTER TABLE profiles
  ADD COLUMN IF NOT EXISTS fcfa_locked_balance INTEGER NOT NULL DEFAULT 0;

ALTER TABLE profiles
  ADD CONSTRAINT profiles_fcfa_locked_balance_nonneg
  CHECK (fcfa_locked_balance >= 0) NOT VALID;

COMMENT ON COLUMN profiles.fcfa_locked_balance IS
  'Portion du fcfa_balance bloquée pour le retrait. Issue des remboursements de livraisons SMSPool échouées. Utilisable uniquement pour racheter une SIM via le wallet. Solde retirable = fcfa_balance - fcfa_locked_balance.';
