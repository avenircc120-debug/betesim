-- Chap Money coin purchases for Betesim.
-- The order is the local source of truth for the pack selected by the user.

CREATE TABLE IF NOT EXISTS public.coin_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id TEXT NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  pack_coins INTEGER NOT NULL CHECK (pack_coins > 0),
  amount_fcfa INTEGER NOT NULL CHECK (amount_fcfa > 0),
  chap_transaction_id TEXT UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'failed', 'canceled')),
  operator TEXT NOT NULL,
  country TEXT NOT NULL,
  phone_number TEXT NOT NULL,
  description TEXT NOT NULL,
  failure_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  credited_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS coin_orders_user_created_idx
  ON public.coin_orders(user_id, created_at DESC);

ALTER TABLE public.coin_orders ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own coin orders" ON public.coin_orders;
CREATE POLICY "Users can view their own coin orders"
  ON public.coin_orders FOR SELECT
  USING (auth.uid()::text = user_id);

CREATE OR REPLACE FUNCTION public.credit_coin_order(
  p_order_id UUID,
  p_chap_transaction_id TEXT,
  p_amount_fcfa INTEGER
)
RETURNS TABLE(status TEXT, coin_balance INTEGER)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_order public.coin_orders%ROWTYPE;
  v_balance INTEGER;
BEGIN
  SELECT *
    INTO v_order
    FROM public.coin_orders
   WHERE id = p_order_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Coin order not found';
  END IF;

  IF v_order.chap_transaction_id IS DISTINCT FROM p_chap_transaction_id THEN
    RAISE EXCEPTION 'Chap transaction does not match coin order';
  END IF;

  IF v_order.amount_fcfa <> p_amount_fcfa THEN
    RAISE EXCEPTION 'Payment amount does not match coin order';
  END IF;

  -- Replayed webhooks are successful no-ops.
  IF v_order.status = 'completed' THEN
    SELECT p.coin_balance INTO v_balance
      FROM public.profiles p
     WHERE p.id = v_order.user_id;
    RETURN QUERY SELECT v_order.status, COALESCE(v_balance, 0);
    RETURN;
  END IF;

  IF v_order.status <> 'pending' THEN
    RAISE EXCEPTION 'Coin order is not pending';
  END IF;

  UPDATE public.profiles
     SET coin_balance = coin_balance + v_order.pack_coins,
         updated_at = now()
   WHERE id = v_order.user_id
   RETURNING profiles.coin_balance INTO v_balance;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Betesim profile not found';
  END IF;

  UPDATE public.coin_orders
     SET status = 'completed',
         credited_at = now(),
         updated_at = now()
   WHERE id = v_order.id;

  RETURN QUERY SELECT 'completed'::TEXT, v_balance;
END;
$$;

REVOKE ALL ON FUNCTION public.credit_coin_order(UUID, TEXT, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.credit_coin_order(UUID, TEXT, INTEGER) TO service_role;