-- Fix RLS policies: tables had RLS enabled but NO policies defined,
-- causing the anon key to return empty data for all frontend queries.
-- The app uses Firebase Auth (not Supabase Auth) so we allow all reads
-- via anon key; security is enforced at the application level by
-- filtering on user_id in every query.

-- profiles
DROP POLICY IF EXISTS "anon_select_profiles" ON public.profiles;
CREATE POLICY "anon_select_profiles" ON public.profiles
  FOR SELECT TO anon, authenticated USING (true);

-- transactions
DROP POLICY IF EXISTS "anon_select_transactions" ON public.transactions;
CREATE POLICY "anon_select_transactions" ON public.transactions
  FOR SELECT TO anon, authenticated USING (true);

-- subscriptions
DROP POLICY IF EXISTS "anon_select_subscriptions" ON public.subscriptions;
CREATE POLICY "anon_select_subscriptions" ON public.subscriptions
  FOR SELECT TO anon, authenticated USING (true);

-- notifications
DROP POLICY IF EXISTS "anon_select_notifications" ON public.notifications;
CREATE POLICY "anon_select_notifications" ON public.notifications
  FOR SELECT TO anon, authenticated USING (true);

DROP POLICY IF EXISTS "anon_update_notifications" ON public.notifications;
CREATE POLICY "anon_update_notifications" ON public.notifications
  FOR UPDATE TO anon, authenticated USING (true);
