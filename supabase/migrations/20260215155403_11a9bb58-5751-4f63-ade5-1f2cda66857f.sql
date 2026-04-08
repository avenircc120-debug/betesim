
-- Add machine_type column to mining_sessions to support 3 different machines
ALTER TABLE public.mining_sessions ADD COLUMN IF NOT EXISTS machine_type text NOT NULL DEFAULT 'basic';

-- Add rate_per_hour to track earning speed per machine
ALTER TABLE public.mining_sessions ADD COLUMN IF NOT EXISTS rate_per_hour numeric NOT NULL DEFAULT 5.95;

-- Add max_earnings for each session
ALTER TABLE public.mining_sessions ADD COLUMN IF NOT EXISTS max_earnings numeric NOT NULL DEFAULT 1000;

-- Create a function to calculate and credit progressive earnings
CREATE OR REPLACE FUNCTION public.credit_mining_earnings()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  session RECORD;
  elapsed_hours numeric;
  new_earned numeric;
  delta numeric;
BEGIN
  FOR session IN
    SELECT ms.id, ms.user_id, ms.started_at, ms.ends_at, ms.pi_earned, ms.rate_per_hour, ms.max_earnings
    FROM mining_sessions ms
    WHERE ms.status = 'active'
  LOOP
    -- Calculate hours elapsed since start
    elapsed_hours := EXTRACT(EPOCH FROM (LEAST(now(), session.ends_at) - session.started_at)) / 3600.0;
    
    -- Calculate total earned based on rate
    new_earned := LEAST(elapsed_hours * session.rate_per_hour, session.max_earnings);
    
    -- Calculate delta to add
    delta := new_earned - session.pi_earned;
    
    IF delta > 0.001 THEN
      -- Update session earnings
      UPDATE mining_sessions SET pi_earned = new_earned WHERE id = session.id;
      
      -- Credit user's pi_balance
      UPDATE profiles SET pi_balance = pi_balance + delta WHERE id = session.user_id;
    END IF;
    
    -- Mark completed if time is up
    IF now() >= session.ends_at THEN
      UPDATE mining_sessions SET status = 'completed', pi_earned = session.max_earnings WHERE id = session.id;
      -- Credit any remaining
      UPDATE profiles SET pi_balance = pi_balance + (session.max_earnings - new_earned) WHERE id = session.user_id AND (session.max_earnings - new_earned) > 0;
    END IF;
  END LOOP;
END;
$$;

-- Create a cron-like trigger: we'll use pg_cron via a wrapper
-- Since we can't use pg_cron directly, we'll call this from an edge function
-- The function is ready to be called periodically
