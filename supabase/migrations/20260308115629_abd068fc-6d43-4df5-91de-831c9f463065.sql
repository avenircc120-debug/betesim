CREATE OR REPLACE FUNCTION public.trigger_low_reserve_push()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Notify every time reserve crosses a whole number (e.g. 908→907, 907→906, etc.)
  IF FLOOR(OLD.reserve_balance) > FLOOR(NEW.reserve_balance) AND NEW.reserve_balance >= 0 THEN
    INSERT INTO notifications (user_id, title, message, type)
    VALUES (
      NEW.user_id, 
      '⚠️ Réserve : ' || FLOOR(NEW.reserve_balance)::int || ' π restants', 
      'Votre réserve a diminué. Il reste ' || FLOOR(NEW.reserve_balance)::int || ' π sur 1000. Parrainez un ami pour la recharger !',
      'warning'
    );
  END IF;
  
  RETURN NEW;
END;
$function$;