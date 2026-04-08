
-- Create notifications table
CREATE TABLE public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'info', -- info, success, warning, referral, withdrawal
  read BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own notifications"
  ON public.notifications FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own notifications"
  ON public.notifications FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own notifications"
  ON public.notifications FOR DELETE
  USING (auth.uid() = user_id);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Update handle_new_user to also notify referrer
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

      UPDATE public.profiles SET pi_balance = pi_balance + 1000 WHERE id = referrer_profile.id;

      UPDATE public.referrals SET bonus_paid = true 
      WHERE referrer_id = referrer_profile.id AND referred_id = NEW.id;

      INSERT INTO public.transactions (user_id, type, amount_pi, status, description)
      VALUES (referrer_profile.id, 'referral_bonus', 1000, 'validated', 
              'Bonus de parrainage - Nouveau filleul inscrit');

      -- Notify the referrer
      INSERT INTO public.notifications (user_id, title, message, type)
      VALUES (referrer_profile.id, 'Nouveau filleul !', 
              'Un nouveau filleul vient de s''inscrire avec votre code. Vous avez reçu 1 000 π !', 'referral');
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- Function to notify user when withdrawal status changes
CREATE OR REPLACE FUNCTION public.notify_withdrawal_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.status <> NEW.status THEN
    IF NEW.status = 'completed' THEN
      INSERT INTO public.notifications (user_id, title, message, type)
      VALUES (NEW.user_id, 'Retrait traité ✅', 
              'Votre retrait de ' || NEW.amount_fcfa || ' FCFA a été envoyé avec succès.', 'withdrawal');
    ELSIF NEW.status = 'failed' THEN
      INSERT INTO public.notifications (user_id, title, message, type)
      VALUES (NEW.user_id, 'Retrait échoué ❌', 
              'Votre retrait de ' || NEW.amount_fcfa || ' FCFA a échoué. ' || COALESCE(NEW.error_message, ''), 'warning');
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_withdrawal_status_change
  AFTER UPDATE ON public.withdrawal_requests
  FOR EACH ROW EXECUTE FUNCTION public.notify_withdrawal_status();
