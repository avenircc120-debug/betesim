
-- Migration: Add virtual number support and partner system
-- Date: 2026-04-08

-- Add is_partner column to profiles
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS is_partner BOOLEAN DEFAULT FALSE;

-- Add virtual_number and fedapay_transaction_id columns to transactions
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS virtual_number TEXT;
ALTER TABLE transactions ADD COLUMN IF NOT EXISTS fedapay_transaction_id TEXT;

-- Add new transaction types for number purchases
-- (no change needed if type is TEXT, existing constraints allow new values)

-- Create index for fedapay_transaction_id to prevent duplicate processing
CREATE UNIQUE INDEX IF NOT EXISTS transactions_fedapay_tx_id_idx
  ON transactions(fedapay_transaction_id)
  WHERE fedapay_transaction_id IS NOT NULL;

-- Add RLS policy comments
COMMENT ON COLUMN profiles.is_partner IS 'True if user has purchased the Partner Pack (2500 FCFA)';
COMMENT ON COLUMN transactions.virtual_number IS 'The virtual phone number delivered (e.g. +33612345678)';
COMMENT ON COLUMN transactions.fedapay_transaction_id IS 'FedaPay transaction ID to prevent duplicate processing';
