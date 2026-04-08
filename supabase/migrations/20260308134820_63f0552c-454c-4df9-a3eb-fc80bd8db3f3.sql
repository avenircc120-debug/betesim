
CREATE OR REPLACE FUNCTION public.process_late_referral(p_user_id uuid, p_referral_code text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  referrer_profile RECORD;
  existing_referral RECORD;
  v_session RECORD;
  v_reserve_deficit numeric;
  v_bonus numeric := 1000;
  v_to_reserve numeric;
  v_to_wallet numeric;
BEGIN
  -- Check if this user already has a referral
  SELECT id INTO existing_referral
  FROM public.referrals
  WHERE referred_id = p_user_id
  LIMIT 1;

  IF existing_referral.id IS NOT NULL THEN
    RETURN;
  END IF;

  -- Find referrer by referral code
  SELECT id INTO referrer_profile
  FROM public.profiles
  WHERE referral_code = p_referral_code
  LIMIT 1;

  IF referrer_profile.id IS NULL OR referrer_profile.id = p_user_id THEN
    RETURN;
  END IF;

  -- Update referred_by on profile
  UPDATE public.profiles SET referred_by = referrer_profile.id WHERE id = p_user_id;

  -- Create referral record
  INSERT INTO public.referrals (referrer_id, referred_id, activated, bonus_paid)
  VALUES (referrer_profile.id, p_user_id, true, false);

  -- Mark bonus as paid
  UPDATE public.referrals SET bonus_paid = true 
  WHERE referrer_id = referrer_profile.id AND referred_id = p_user_id;

  -- Find the referrer's active main machine session
  SELECT id, reserve_balance INTO v_session
  FROM mining_sessions
  WHERE user_id = referrer_profile.id AND status = 'active' AND machine_type != 'referral_bonus'
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

    -- Priority 2: Excess goes to a 24h turbo session
    IF v_to_wallet > 0 THEN
      UPDATE mining_sessions SET status = 'completed' 
      WHERE user_id = referrer_profile.id AND status = 'active' AND machine_type = 'referral_bonus';

      INSERT INTO mining_sessions (user_id, boost_type, ends_at, machine_type, rate_per_hour, max_earnings)
      VALUES (
        referrer_profile.id, 'initial', 
        now() + interval '24 hours', 
        'referral_bonus',
        v_to_wallet / 24.0,
        v_to_wallet
      );
    END IF;
  ELSE
    -- No active machine: credit directly as fallback
    UPDATE profiles SET pi_balance = pi_balance + v_bonus WHERE id = referrer_profile.id;
  END IF;

  -- Record transaction (pending, will be validated when credited)
  INSERT INTO public.transactions (user_id, type, amount_pi, status, description)
  VALUES (referrer_profile.id, 'referral_bonus', v_bonus, 'pending', 
          'Bonus de parrainage - Nouveau filleul inscrit via Google');

  -- Notify referrer
  INSERT INTO public.notifications (user_id, title, message, type)
  VALUES (referrer_profile.id, 'Nouveau filleul !', 
          'Un nouveau filleul vient de s''inscrire avec votre code. Votre vitesse de minage augmente !', 'referral');
END;
$$;
