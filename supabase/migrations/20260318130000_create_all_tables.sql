-- Ajouter les colonnes manquantes à profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS username TEXT,
  ADD COLUMN IF NOT EXISTS referral_code TEXT UNIQUE DEFAULT substr(md5(random()::text), 1, 8),
  ADD COLUMN IF NOT EXISTS referred_by UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS pi_balance NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS fcfa_balance NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS level INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS total_earned NUMERIC DEFAULT 0;

-- Table mining_sessions
CREATE TABLE IF NOT EXISTS public.mining_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  machine_type TEXT NOT NULL DEFAULT 'starter',
  boost_type TEXT,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'completed', 'expired')),
  rate_per_hour NUMERIC DEFAULT 0.05,
  pi_earned NUMERIC DEFAULT 0,
  reserve_balance NUMERIC DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ends_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Table transactions
CREATE TABLE IF NOT EXISTS public.transactions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  amount_pi NUMERIC DEFAULT 0,
  amount_fcfa INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'validated', 'rejected', 'failed')),
  description TEXT,
  fedapay_transaction_id TEXT UNIQUE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Table notifications
CREATE TABLE IF NOT EXISTS public.notifications (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL DEFAULT 'info',
  title TEXT NOT NULL,
  message TEXT,
  read BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Table referrals
CREATE TABLE IF NOT EXISTS public.referrals (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  referrer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  referred_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  activated BOOLEAN DEFAULT false,
  bonus_paid BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(referrer_id, referred_id)
);

-- Table machine_payments
CREATE TABLE IF NOT EXISTS public.machine_payments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  machine_type TEXT NOT NULL,
  amount_fcfa INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  fedapay_transaction_id TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Table withdrawal_requests
CREATE TABLE IF NOT EXISTS public.withdrawal_requests (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount_fcfa INTEGER NOT NULL,
  phone TEXT,
  operator TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'failed')),
  fedapay_transaction_id TEXT,
  error_message TEXT,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Table esim_deliveries
CREATE TABLE IF NOT EXISTS public.esim_deliveries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  machine_type TEXT NOT NULL CHECK (machine_type IN ('pro', 'elite')),
  phone_number TEXT,
  provider TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'failed')),
  delivered_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Activer Row Level Security
ALTER TABLE public.mining_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.referrals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.machine_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.withdrawal_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.esim_deliveries ENABLE ROW LEVEL SECURITY;

-- Politiques RLS : chaque utilisateur voit seulement ses données
CREATE POLICY IF NOT EXISTS "Users see own mining sessions" ON public.mining_sessions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY IF NOT EXISTS "Users see own transactions" ON public.transactions FOR ALL USING (auth.uid() = user_id);
CREATE POLICY IF NOT EXISTS "Users see own notifications" ON public.notifications FOR ALL USING (auth.uid() = user_id);
CREATE POLICY IF NOT EXISTS "Users see own referrals" ON public.referrals FOR SELECT USING (auth.uid() = referrer_id OR auth.uid() = referred_id);
CREATE POLICY IF NOT EXISTS "Users see own payments" ON public.machine_payments FOR ALL USING (auth.uid() = user_id);
CREATE POLICY IF NOT EXISTS "Users see own withdrawals" ON public.withdrawal_requests FOR ALL USING (auth.uid() = user_id);
CREATE POLICY IF NOT EXISTS "Users see own esim" ON public.esim_deliveries FOR SELECT USING (auth.uid() = user_id);
