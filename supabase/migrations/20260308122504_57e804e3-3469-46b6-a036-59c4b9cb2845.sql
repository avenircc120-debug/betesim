
CREATE OR REPLACE FUNCTION public.trigger_low_reserve_push()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  current_speed numeric;
BEGIN
  IF FLOOR(OLD.reserve_balance) > FLOOR(NEW.reserve_balance) AND NEW.reserve_balance >= 0 THEN
    current_speed := ROUND((NEW.reserve_balance / 720.0)::numeric, 4);
    
    INSERT INTO notifications (user_id, title, message, type)
    VALUES (
      NEW.user_id, 
      '⚠️ Vitesse en baisse : ' || current_speed || ' π/h', 
      'Votre vitesse de minage diminue à ' || current_speed || ' π/h. Parrainez un ami pour la booster !',
      'warning'
    );
  END IF;
  
  RETURN NEW;
END;
$function$;
