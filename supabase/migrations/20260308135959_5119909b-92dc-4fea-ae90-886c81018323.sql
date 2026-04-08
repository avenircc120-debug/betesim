
-- activate_referral_bonus: always 24h turbo, never fill reserve
CREATE OR REPLACE FUNCTION public.activate_referral_bonus(p_referred_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_referrer_id uuid;
  v_bonus numeric := 1000;
BEGIN
  SELECT referrer_id INTO v_referrer_id
  FROM public.referrals
  WHERE referred_id = p_referred_id AND bonus_paid = false
  LIMIT 1;

  IF v_referrer_id IS NULL THEN RETURN; END IF;

  UPDATE public.referrals 
  SET activated = true, bonus_paid = true 
  WHERE referrer_id = v_referrer_id AND referred_id = p_referred_id;

  -- Cancel any existing referral_bonus session
  UPDATE mining_sessions SET status = 'completed' 
  WHERE user_id = v_referrer_id AND status = 'active' AND machine_type = 'referral_bonus';

  -- Always create a 24h turbo session
  INSERT INTO mining_sessions (user_id, boost_type, ends_at, machine_type, rate_per_hour, max_earnings)
  VALUES (
    v_referrer_id, 'initial', 
    now() + interval '24 hours', 
    'referral_bonus',
    v_bonus / 24.0,
    v_bonus
  );

  INSERT INTO public.transactions (user_id, type, amount_pi, status, description)
  VALUES (v_referrer_id, 'referral_bonus', v_bonus, 'pending', 'Bonus de parrainage - Filleul activé');

  INSERT INTO public.notifications (user_id, title, message, type)
  VALUES (v_referrer_id, 'Bonus parrainage 🎉', 
          'Un filleul a activé sa machine ! +1 000 π distribués sur 24h.', 'referral');
END;
$$;

-- handle_new_user: same, always 24h turbo
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  ref_code TEXT;
  referrer_profile RECORD;
  v_bonus numeric := 1000;
BEGIN
  INSERT INTO public.profiles (id, email, username)
  VALUES (NEW.id, NEW.email, split_part(NEW.email, '@', 1));

  ref_code := NEW.raw_user_meta_data ->> 'referral_code';
  
  IF ref_code IS NOT NULL AND ref_code <> '' THEN
    SELECT id INTO referrer_profile
    FROM public.profiles
    WHERE referral_code = ref_code
    LIMIT 1;

    IF referrer_profile.id IS NOT NULL AND referrer_profile.id <> NEW.id THEN
      UPDATE public.profiles SET referred_by = referrer_profile.id WHERE id = NEW.id;

      INSERT INTO public.referrals (referrer_id, referred_id, activated, bonus_paid)
      VALUES (referrer_profile.id, NEW.id, true, true);

      -- Cancel any existing referral_bonus session
      UPDATE mining_sessions SET status = 'completed' 
      WHERE user_id = referrer_profile.id AND status = 'active' AND machine_type = 'referral_bonus';

      -- Always 24h turbo session
      INSERT INTO mining_sessions (user_id, boost_type, ends_at, machine_type, rate_per_hour, max_earnings)
      VALUES (referrer_profile.id, 'initial', now() + interval '24 hours', 'referral_bonus', v_bonus / 24.0, v_bonus);

      INSERT INTO public.transactions (user_id, type, amount_pi, status, description)
      VALUES (referrer_profile.id, 'referral_bonus', v_bonus, 'pending', 'Bonus de parrainage - Nouveau filleul inscrit');

      INSERT INTO public.notifications (user_id, title, message, type)
      VALUES (referrer_profile.id, 'Nouveau filleul !', 
              'Un nouveau filleul vient de s''inscrire. +1 000 π distribués sur 24h !', 'referral');
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- process_late_referral: same, always 24h turbo
CREATE OR REPLACE FUNCTION public.process_late_referral(p_user_id uuid, p_referral_code text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  referrer_profile RECORD;
  existing_referral RECORD;
  v_bonus numeric := 1000;
BEGIN
  SELECT id INTO existing_referral
  FROM public.referrals
  WHERE referred_id = p_user_id
  LIMIT 1;

  IF existing_referral.id IS NOT NULL THEN RETURN; END IF;

  SELECT id INTO referrer_profile
  FROM public.profiles
  WHERE referral_code = p_referral_code
  LIMIT 1;

  IF referrer_profile.id IS NULL OR referrer_profile.id = p_user_id THEN RETURN; END IF;

  UPDATE public.profiles SET referred_by = referrer_profile.id WHERE id = p_user_id;

  INSERT INTO public.referrals (referrer_id, referred_id, activated, bonus_paid)
  VALUES (referrer_profile.id, p_user_id, true, true);

  -- Cancel any existing referral_bonus session
  UPDATE mining_sessions SET status = 'completed' 
  WHERE user_id = referrer_profile.id AND status = 'active' AND machine_type = 'referral_bonus';

  -- Always 24h turbo session
  INSERT INTO mining_sessions (user_id, boost_type, ends_at, machine_type, rate_per_hour, max_earnings)
  VALUES (referrer_profile.id, 'initial', now() + interval '24 hours', 'referral_bonus', v_bonus / 24.0, v_bonus);

  INSERT INTO public.transactions (user_id, type, amount_pi, status, description)
  VALUES (referrer_profile.id, 'referral_bonus', v_bonus, 'pending', 'Bonus de parrainage - Filleul inscrit via Google');

  INSERT INTO public.notifications (user_id, title, message, type)
  VALUES (referrer_profile.id, 'Nouveau filleul !', 
          'Un nouveau filleul vient de s''inscrire. +1 000 π distribués sur 24h !', 'referral');
END;
$$;
