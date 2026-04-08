
-- Update handle_new_user to process referral codes at signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  ref_code TEXT;
  referrer_profile RECORD;
BEGIN
  -- Create the profile
  INSERT INTO public.profiles (id, email, username)
  VALUES (NEW.id, NEW.email, split_part(NEW.email, '@', 1));

  -- Check for referral code in user metadata
  ref_code := NEW.raw_user_meta_data ->> 'referral_code';
  
  IF ref_code IS NOT NULL AND ref_code <> '' THEN
    -- Find the referrer by their referral_code
    SELECT id INTO referrer_profile
    FROM public.profiles
    WHERE referral_code = ref_code
    LIMIT 1;

    IF referrer_profile.id IS NOT NULL AND referrer_profile.id <> NEW.id THEN
      -- Update referred_by on the new user's profile
      UPDATE public.profiles SET referred_by = referrer_profile.id WHERE id = NEW.id;

      -- Create the referral record
      INSERT INTO public.referrals (referrer_id, referred_id, activated, bonus_paid)
      VALUES (referrer_profile.id, NEW.id, true, false);

      -- Credit the referrer with 1000 π bonus
      UPDATE public.profiles SET pi_balance = pi_balance + 1000 WHERE id = referrer_profile.id;

      -- Mark bonus as paid
      UPDATE public.referrals SET bonus_paid = true 
      WHERE referrer_id = referrer_profile.id AND referred_id = NEW.id;

      -- Record the bonus transaction for the referrer
      INSERT INTO public.transactions (user_id, type, amount_pi, status, description)
      VALUES (referrer_profile.id, 'referral_bonus', 1000, 'validated', 
              'Bonus de parrainage - Nouveau filleul inscrit');
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Ensure trigger exists (drop and recreate to be safe)
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
