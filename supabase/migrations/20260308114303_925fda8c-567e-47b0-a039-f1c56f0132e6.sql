-- Function to send low reserve push notification via edge function
CREATE OR REPLACE FUNCTION public.trigger_low_reserve_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_last_notif TIMESTAMPTZ;
  v_threshold NUMERIC := 1; -- Alert when reserve < 1π
BEGIN
  -- Only trigger if reserve just dropped below threshold
  IF OLD.reserve_balance >= v_threshold AND NEW.reserve_balance < v_threshold THEN
    -- Check rate limit (once per 24h)
    SELECT last_low_reserve_notif INTO v_last_notif FROM profiles WHERE id = NEW.user_id;
    
    IF v_last_notif IS NULL OR v_last_notif < now() - interval '24 hours' THEN
      -- Update rate limit timestamp
      UPDATE profiles SET last_low_reserve_notif = now() WHERE id = NEW.user_id;
      
      -- Create in-app notification
      INSERT INTO notifications (user_id, title, message, type)
      VALUES (
        NEW.user_id, 
        '⚠️ Réserve presque vide !', 
        'Il ne reste que ' || ROUND(NEW.reserve_balance::numeric, 2) || ' π dans votre réserve. Parrainez un ami pour la recharger !',
        'warning'
      );
      
      -- Note: Push notification will be sent via application-level trigger
      -- as we cannot make HTTP calls from PL/pgSQL directly
    END IF;
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Create trigger for low reserve alerts
DROP TRIGGER IF EXISTS trigger_low_reserve_notification ON mining_sessions;
CREATE TRIGGER trigger_low_reserve_notification
  AFTER UPDATE OF reserve_balance ON mining_sessions
  FOR EACH ROW
  WHEN (OLD.reserve_balance IS DISTINCT FROM NEW.reserve_balance)
  EXECUTE FUNCTION trigger_low_reserve_push();