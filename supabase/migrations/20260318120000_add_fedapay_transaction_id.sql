-- Ajouter fedapay_transaction_id à la table transactions pour anti-double spend
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS fedapay_transaction_id TEXT,
  ADD COLUMN IF NOT EXISTS amount_fcfa INTEGER;

-- Index unique pour éviter d'utiliser le même ID FedaPay deux fois
CREATE UNIQUE INDEX IF NOT EXISTS transactions_fedapay_tx_id_unique
  ON public.transactions (fedapay_transaction_id)
  WHERE fedapay_transaction_id IS NOT NULL;
