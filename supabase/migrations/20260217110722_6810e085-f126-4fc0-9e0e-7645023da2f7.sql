
-- Function to notify when referral bonus completes (fixed)
CREATE OR REPLACE FUNCTION public.notify_referral_bonus_complete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tx_id UUID;
BEGIN
  IF OLD.status = 'active' AND NEW.status = 'completed' AND NEW.machine_type = 'referral_bonus' THEN
    INSERT INTO public.notifications (user_id, title, message, type)
    VALUES (NEW.user_id, 'Bonus terminé ✅', 
            'Votre bonus de parrainage de 1 000 π est terminé. Parrainez plus d''amis pour gagner davantage !', 'referral');
    
    -- Mark most recent pending referral transaction as validated
    SELECT id INTO v_tx_id FROM public.transactions 
    WHERE user_id = NEW.user_id 
      AND type = 'referral_bonus' 
      AND status = 'pending'
    ORDER BY created_at DESC
    LIMIT 1;

    IF v_tx_id IS NOT NULL THEN
      UPDATE public.transactions SET status = 'validated' WHERE id = v_tx_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$function$;

-- Create trigger for referral bonus completion notification
CREATE TRIGGER on_referral_bonus_complete
  AFTER UPDATE ON public.mining_sessions
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_referral_bonus_complete();
