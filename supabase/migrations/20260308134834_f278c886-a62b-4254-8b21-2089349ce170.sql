
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  ref_code TEXT;
  referrer_profile RECORD;
  v_session RECORD;
  v_reserve_deficit numeric;
  v_bonus numeric := 1000;
  v_to_reserve numeric;
  v_to_wallet numeric;
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
      VALUES (referrer_profile.id, NEW.id, true, false);

      UPDATE public.referrals SET bonus_paid = true 
      WHERE referrer_id = referrer_profile.id AND referred_id = NEW.id;

      -- Find the referrer's active main machine session
      SELECT ms.id, ms.reserve_balance INTO v_session
      FROM mining_sessions ms
      WHERE ms.user_id = referrer_profile.id AND ms.status = 'active' AND ms.machine_type != 'referral_bonus'
      LIMIT 1;

      IF v_session.id IS NOT NULL THEN
        v_reserve_deficit := GREATEST(1000 - v_session.reserve_balance, 0);
        v_to_reserve := LEAST(v_bonus, v_reserve_deficit);
        v_to_wallet := v_bonus - v_to_reserve;

        IF v_to_reserve > 0 THEN
          UPDATE mining_sessions SET reserve_balance = reserve_balance + v_to_reserve WHERE id = v_session.id;
        END IF;

        IF v_to_wallet > 0 THEN
          UPDATE mining_sessions SET status = 'completed' 
          WHERE user_id = referrer_profile.id AND status = 'active' AND machine_type = 'referral_bonus';

          INSERT INTO mining_sessions (user_id, boost_type, ends_at, machine_type, rate_per_hour, max_earnings)
          VALUES (referrer_profile.id, 'initial', now() + interval '24 hours', 'referral_bonus', v_to_wallet / 24.0, v_to_wallet);
        END IF;
      ELSE
        -- No active machine: credit directly as fallback
        UPDATE profiles SET pi_balance = pi_balance + v_bonus WHERE id = referrer_profile.id;
      END IF;

      INSERT INTO public.transactions (user_id, type, amount_pi, status, description)
      VALUES (referrer_profile.id, 'referral_bonus', v_bonus, 'pending', 'Bonus de parrainage - Nouveau filleul inscrit');

      INSERT INTO public.notifications (user_id, title, message, type)
      VALUES (referrer_profile.id, 'Nouveau filleul !', 
              'Un nouveau filleul vient de s''inscrire avec votre code. Votre vitesse de minage augmente !', 'referral');
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
