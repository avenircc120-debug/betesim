
-- Add reserve_balance column to mining_sessions (invisible to user)
ALTER TABLE public.mining_sessions ADD COLUMN reserve_balance numeric NOT NULL DEFAULT 0;

-- Update credit_mining_earnings to handle the new drip/turbo logic
CREATE OR REPLACE FUNCTION public.credit_mining_earnings()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  session RECORD;
  elapsed_hours numeric;
  new_earned numeric;
  delta numeric;
  drip_rate numeric;
BEGIN
  FOR session IN
    SELECT ms.id, ms.user_id, ms.started_at, ms.ends_at, ms.pi_earned, 
           ms.rate_per_hour, ms.max_earnings, ms.reserve_balance, ms.machine_type
    FROM mining_sessions ms
    WHERE ms.status = 'active'
  LOOP
    IF session.machine_type = 'referral_bonus' THEN
      -- Referral bonus sessions: credit progressively over 24h as before
      elapsed_hours := EXTRACT(EPOCH FROM (LEAST(now(), session.ends_at) - session.started_at)) / 3600.0;
      new_earned := LEAST(elapsed_hours * session.rate_per_hour, session.max_earnings);
      delta := new_earned - session.pi_earned;
      
      IF delta > 0.001 THEN
        UPDATE mining_sessions SET pi_earned = new_earned WHERE id = session.id;
        UPDATE profiles SET pi_balance = pi_balance + delta WHERE id = session.user_id;
      END IF;
      
      IF now() >= session.ends_at THEN
        UPDATE mining_sessions SET status = 'completed', pi_earned = session.max_earnings WHERE id = session.id;
        UPDATE profiles SET pi_balance = pi_balance + GREATEST(session.max_earnings - new_earned, 0) WHERE id = session.user_id;
      END IF;
    ELSE
      -- Main machine: drip from reserve_balance over 30 days (720 hours)
      -- rate_per_hour = reserve_balance / 720 (recalculated each tick)
      IF session.reserve_balance > 0.001 THEN
        drip_rate := session.reserve_balance / 720.0; -- 30 days in hours
        -- Credit 1 minute worth (drip_rate / 60)
        delta := LEAST(drip_rate / 60.0, session.reserve_balance);
        
        IF delta > 0.001 THEN
          UPDATE mining_sessions 
          SET reserve_balance = reserve_balance - delta,
              pi_earned = pi_earned + delta
          WHERE id = session.id;
          
          UPDATE profiles SET pi_balance = pi_balance + delta WHERE id = session.user_id;
        END IF;
      END IF;
      
      -- Check if machine duration ended
      IF now() >= session.ends_at THEN
        -- Credit any remaining reserve
        IF session.reserve_balance > 0.001 THEN
          UPDATE profiles SET pi_balance = pi_balance + session.reserve_balance WHERE id = session.user_id;
          UPDATE mining_sessions SET pi_earned = pi_earned + session.reserve_balance, reserve_balance = 0 WHERE id = session.id;
        END IF;
        UPDATE mining_sessions SET status = 'completed' WHERE id = session.id;
      END IF;
    END IF;
  END LOOP;
END;
$function$;

-- Update activate_referral_bonus: when a referral happens, inject 1000π 
-- Priority: fill reserve to 1000, then create a 24h turbo session for the rest
CREATE OR REPLACE FUNCTION public.activate_referral_bonus(p_referred_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_referrer_id uuid;
  v_session RECORD;
  v_reserve_deficit numeric;
  v_bonus numeric := 1000;
  v_to_reserve numeric;
  v_to_wallet numeric;
BEGIN
  -- Find the referrer
  SELECT referrer_id INTO v_referrer_id
  FROM public.referrals
  WHERE referred_id = p_referred_id AND bonus_paid = false
  LIMIT 1;

  IF v_referrer_id IS NULL THEN
    RETURN;
  END IF;

  -- Mark referral as activated and paid
  UPDATE public.referrals 
  SET activated = true, bonus_paid = true 
  WHERE referrer_id = v_referrer_id AND referred_id = p_referred_id;

  -- Find the referrer's active main machine session
  SELECT id, reserve_balance INTO v_session
  FROM mining_sessions
  WHERE user_id = v_referrer_id AND status = 'active' AND machine_type != 'referral_bonus'
  LIMIT 1;

  IF v_session.id IS NOT NULL THEN
    -- Priority 1: Fill reserve to 1000
    v_reserve_deficit := GREATEST(1000 - v_session.reserve_balance, 0);
    v_to_reserve := LEAST(v_bonus, v_reserve_deficit);
    v_to_wallet := v_bonus - v_to_reserve;

    -- Top up reserve
    IF v_to_reserve > 0 THEN
      UPDATE mining_sessions 
      SET reserve_balance = reserve_balance + v_to_reserve
      WHERE id = v_session.id;
    END IF;

    -- Priority 2: Excess goes to a 24h turbo session (progressive)
    IF v_to_wallet > 0 THEN
      -- Cancel any existing referral_bonus session
      UPDATE mining_sessions SET status = 'completed' 
      WHERE user_id = v_referrer_id AND status = 'active' AND machine_type = 'referral_bonus';

      INSERT INTO mining_sessions (user_id, boost_type, ends_at, machine_type, rate_per_hour, max_earnings)
      VALUES (
        v_referrer_id, 'initial', 
        now() + interval '24 hours', 
        'referral_bonus',
        v_to_wallet / 24.0,
        v_to_wallet
      );
    END IF;
  ELSE
    -- No active machine: just credit directly
    UPDATE profiles SET pi_balance = pi_balance + v_bonus WHERE id = v_referrer_id;
  END IF;

  -- Record transaction
  INSERT INTO public.transactions (user_id, type, amount_pi, status, description)
  VALUES (v_referrer_id, 'referral_bonus', v_bonus, 'pending', 
          'Bonus de parrainage - Filleul activé');

  -- Notify
  INSERT INTO public.notifications (user_id, title, message, type)
  VALUES (v_referrer_id, 'Bonus parrainage 🎉', 
          'Un filleul a activé sa machine ! +1 000 π injectés dans votre cycle.', 'referral');
END;
$function$;
