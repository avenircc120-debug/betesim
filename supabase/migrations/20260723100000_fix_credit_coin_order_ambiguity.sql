-- Fix: coin_balance ambiguity between profiles column and RETURNS TABLE output variable
-- Use table alias "p" in UPDATE to disambiguate the column reference.

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

  -- Use alias "p" to avoid ambiguity with the RETURNS TABLE column "coin_balance"
  UPDATE public.profiles p
     SET coin_balance = p.coin_balance + v_order.pack_coins,
         updated_at = now()
   WHERE p.id = v_order.user_id
   RETURNING p.coin_balance INTO v_balance;

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
