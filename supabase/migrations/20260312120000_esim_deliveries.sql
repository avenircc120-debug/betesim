-- Table pour stocker les livraisons eSIM (numéros virtuels 5sim.net)
CREATE TABLE public.esim_deliveries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  machine_type TEXT NOT NULL CHECK (machine_type IN ('pro', 'elite')),
  service TEXT NOT NULL,              -- 'whatsapp', 'telegram'
  order_id BIGINT,                    -- ID retourné par 5sim.net
  phone TEXT,                         -- Numéro virtuel livré ex: +14155552671
  country TEXT,                       -- Pays du numéro
  operator TEXT,                      -- Opérateur chez 5sim
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'delivered', 'failed', 'canceled')),
  sms_code TEXT,                      -- Code SMS reçu (si applicable)
  error_message TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  delivered_at TIMESTAMP WITH TIME ZONE
);

ALTER TABLE public.esim_deliveries ENABLE ROW LEVEL SECURITY;

-- Les utilisateurs ne voient que leurs propres livraisons
CREATE POLICY "Users can view own esim deliveries"
  ON public.esim_deliveries FOR SELECT
  USING (auth.uid() = user_id);

CREATE INDEX idx_esim_deliveries_user ON public.esim_deliveries(user_id);
CREATE INDEX idx_esim_deliveries_status ON public.esim_deliveries(status);
