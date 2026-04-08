
CREATE OR REPLACE FUNCTION public.process_late_referral(p_user_id uuid, p_referral_code text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  referrer_profile RECORD;
  existing_referral RECORD;
BEGIN
  -- Check if this user already has a referral
  SELECT id INTO existing_referral
  FROM public.referrals
  WHERE referred_id = p_user_id
  LIMIT 1;

  IF existing_referral.id IS NOT NULL THEN
    RETURN; -- Already has a referral, skip
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

  -- Credit referrer
  UPDATE public.profiles SET pi_balance = pi_balance + 1000 WHERE id = referrer_profile.id;

  -- Mark bonus as paid
  UPDATE public.referrals SET bonus_paid = true 
  WHERE referrer_id = referrer_profile.id AND referred_id = p_user_id;

  -- Record transaction
  INSERT INTO public.transactions (user_id, type, amount_pi, status, description)
  VALUES (referrer_profile.id, 'referral_bonus', 1000, 'validated', 
          'Bonus de parrainage - Nouveau filleul inscrit via Google');

  -- Notify referrer
  INSERT INTO public.notifications (user_id, title, message, type)
  VALUES (referrer_profile.id, 'Nouveau filleul !', 
          'Un nouveau filleul vient de s''inscrire avec votre code. Vous avez reçu 1 000 π !', 'referral');
END;
$$;
