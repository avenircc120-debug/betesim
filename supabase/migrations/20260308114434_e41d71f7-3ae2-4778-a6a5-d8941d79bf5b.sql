-- Update trigger to allow multiple notifications (no 24h rate limit)
CREATE OR REPLACE FUNCTION public.trigger_low_reserve_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_threshold NUMERIC := 1; -- Alert when reserve < 1π
BEGIN
  -- Trigger when reserve drops below threshold
  IF OLD.reserve_balance >= v_threshold AND NEW.reserve_balance < v_threshold THEN
    -- Create in-app notification (no rate limit)
    INSERT INTO notifications (user_id, title, message, type)
    VALUES (
      NEW.user_id, 
      '⚠️ Réserve presque vide !', 
      'Il ne reste que ' || ROUND(NEW.reserve_balance::numeric, 2) || ' π dans votre réserve. Parrainez un ami pour la recharger !',
      'warning'
    );
  END IF;
  
  RETURN NEW;
END;
$function$;