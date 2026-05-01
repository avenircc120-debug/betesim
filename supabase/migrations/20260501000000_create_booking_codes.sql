-- Table des codes de booking générés par l'admin
CREATE TABLE IF NOT EXISTS booking_codes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code        text NOT NULL UNIQUE,
  selections  jsonb NOT NULL DEFAULT '[]',
  note        text,
  created_by  text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active','expired','used'))
);

ALTER TABLE booking_codes ENABLE ROW LEVEL SECURITY;

-- Seul le service_role peut écrire (Edge Function)
CREATE POLICY "service_role_all" ON booking_codes
  FOR ALL USING (auth.role() = 'service_role');

-- Tout le monde peut lire un code actif (lookup public)
CREATE POLICY "public_read_active" ON booking_codes
  FOR SELECT USING (status = 'active' AND expires_at > now());
