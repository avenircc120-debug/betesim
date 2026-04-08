-- ============================================================
-- CORRECTION : activate_referral_bonus & handle_new_user
--
-- Règle métier :
--   1. Les 1000π du bonus remplissent la réserve en PRIORITÉ
--      (jusqu'à 1000π, même s'il ne manque qu'1π)
--   2. Le reste va en session turbo de 24h
--   3. Si une session turbo existe déjà, on ACCUMULE (les Pi
--      non encore gagnés sont préservés) au lieu de les perdre
--   4. Si le parrain n'a pas de machine, les 1000π vont
--      directement dans son wallet
-- ============================================================

CREATE OR REPLACE FUNCTION public.activate_referral_bonus(p_referred_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_referrer_id          uuid;
  v_session              RECORD;
  v_bonus                numeric := 1000;
  v_reserve_deficit      numeric;
  v_to_reserve           numeric;
  v_to_turbo             numeric;
  v_existing_turbo_left  numeric := 0;
  v_total_turbo          numeric;
BEGIN
  -- 1. Trouver le parrain (bonus non encore payé)
  SELECT referrer_id INTO v_referrer_id
  FROM public.referrals
  WHERE referred_id = p_referred_id AND bonus_paid = false
  LIMIT 1;

  IF v_referrer_id IS NULL THEN RETURN; END IF;

  -- 2. Marquer le parrainage comme payé (anti-double)
  UPDATE public.referrals
  SET activated = true, bonus_paid = true
  WHERE referrer_id = v_referrer_id AND referred_id = p_referred_id;

  -- 3. Trouver la machine principale active du parrain
  SELECT id, reserve_balance INTO v_session
  FROM mining_sessions
  WHERE user_id = v_referrer_id
    AND status = 'active'
    AND machine_type != 'referral_bonus'
  LIMIT 1;

  IF v_session.id IS NOT NULL THEN

    -- PRIORITÉ 1 : Remplir la réserve jusqu'à 1000π
    v_reserve_deficit := GREATEST(1000 - v_session.reserve_balance, 0);
    v_to_reserve      := LEAST(v_bonus, v_reserve_deficit);
    v_to_turbo        := v_bonus - v_to_reserve;

    IF v_to_reserve > 0 THEN
      UPDATE mining_sessions
      SET reserve_balance = reserve_balance + v_to_reserve
      WHERE id = v_session.id;
    END IF;

    -- PRIORITÉ 2 : Le reste en turbo 24h
    IF v_to_turbo > 0 THEN

      -- Récupérer les Pi non encore gagnés dans l'ancienne session turbo
      SELECT GREATEST(COALESCE(max_earnings, 0) - COALESCE(pi_earned, 0), 0)
      INTO v_existing_turbo_left
      FROM mining_sessions
      WHERE user_id = v_referrer_id
        AND status = 'active'
        AND machine_type = 'referral_bonus'
      LIMIT 1;

      -- Fermer l'ancienne session turbo sans perdre ses Pi
      UPDATE mining_sessions
      SET status = 'completed'
      WHERE user_id = v_referrer_id
        AND status = 'active'
        AND machine_type = 'referral_bonus';

      -- Nouvelle session = nouveau bonus + Pi restants de l'ancienne
      v_total_turbo := v_to_turbo + COALESCE(v_existing_turbo_left, 0);

      INSERT INTO mining_sessions (user_id, boost_type, ends_at, machine_type, rate_per_hour, max_earnings)
      VALUES (
        v_referrer_id,
        'referral',
        now() + interval '24 hours',
        'referral_bonus',
        v_total_turbo / 24.0,
        v_total_turbo
      );
    END IF;

  ELSE
    -- Pas de machine active : créditer directement dans le wallet
    UPDATE profiles
    SET pi_balance = pi_balance + v_bonus
    WHERE id = v_referrer_id;
  END IF;

  -- 4. Transaction
  INSERT INTO public.transactions (user_id, type, amount_pi, status, description)
  VALUES (v_referrer_id, 'referral_bonus', v_bonus, 'validated',
          'Bonus parrainage — filleul activé (+' || v_bonus::text || ' π)');

  -- 5. Notification
  INSERT INTO public.notifications (user_id, title, message, type)
  VALUES (v_referrer_id, 'Bonus parrainage 🎉',
          'Un filleul a activé sa machine ! +1 000 π injectés (réserve complétée en priorité).', 'referral');
END;
$$;


-- ============================================================
-- Même logique pour handle_new_user (inscription avec code)
-- ============================================================

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  ref_code               TEXT;
  referrer_profile       RECORD;
  v_session              RECORD;
  v_bonus                numeric := 1000;
  v_reserve_deficit      numeric;
  v_to_reserve           numeric;
  v_to_turbo             numeric;
  v_existing_turbo_left  numeric := 0;
  v_total_turbo          numeric;
BEGIN
  -- Créer le profil
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

      -- Machine principale du parrain
      SELECT ms.id, ms.reserve_balance INTO v_session
      FROM mining_sessions ms
      WHERE ms.user_id = referrer_profile.id
        AND ms.status = 'active'
        AND ms.machine_type != 'referral_bonus'
      LIMIT 1;

      IF v_session.id IS NOT NULL THEN

        -- PRIORITÉ 1 : Remplir la réserve
        v_reserve_deficit := GREATEST(1000 - v_session.reserve_balance, 0);
        v_to_reserve      := LEAST(v_bonus, v_reserve_deficit);
        v_to_turbo        := v_bonus - v_to_reserve;

        IF v_to_reserve > 0 THEN
          UPDATE mining_sessions
          SET reserve_balance = reserve_balance + v_to_reserve
          WHERE id = v_session.id;
        END IF;

        -- PRIORITÉ 2 : Turbo avec accumulation
        IF v_to_turbo > 0 THEN
          SELECT GREATEST(COALESCE(max_earnings, 0) - COALESCE(pi_earned, 0), 0)
          INTO v_existing_turbo_left
          FROM mining_sessions
          WHERE user_id = referrer_profile.id
            AND status = 'active'
            AND machine_type = 'referral_bonus'
          LIMIT 1;

          UPDATE mining_sessions SET status = 'completed'
          WHERE user_id = referrer_profile.id
            AND status = 'active'
            AND machine_type = 'referral_bonus';

          v_total_turbo := v_to_turbo + COALESCE(v_existing_turbo_left, 0);

          INSERT INTO mining_sessions (user_id, boost_type, ends_at, machine_type, rate_per_hour, max_earnings)
          VALUES (
            referrer_profile.id,
            'referral',
            now() + interval '24 hours',
            'referral_bonus',
            v_total_turbo / 24.0,
            v_total_turbo
          );
        END IF;

      ELSE
        -- Pas de machine : wallet direct
        UPDATE profiles SET pi_balance = pi_balance + v_bonus WHERE id = referrer_profile.id;
      END IF;

      INSERT INTO public.transactions (user_id, type, amount_pi, status, description)
      VALUES (referrer_profile.id, 'referral_bonus', v_bonus, 'validated',
              'Bonus parrainage — nouveau filleul inscrit');

      INSERT INTO public.notifications (user_id, title, message, type)
      VALUES (referrer_profile.id, 'Nouveau filleul !',
              'Un filleul vient de s''inscrire. +1 000 π injectés dans votre cycle.', 'referral');
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
