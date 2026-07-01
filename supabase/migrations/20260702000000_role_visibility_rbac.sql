-- ══════════════════════════════════════════════════════════════════════════════
-- Migration: RBAC — Visibilité par rôle (Acheteur · Grossiste · Revendeur · Vendeur · Livreur)
-- Date: 2026-07-02
--
-- Règles métier :
--   • Publications Grossiste  → visibles uniquement par les Revendeurs
--   • Publications Revendeur  → visibles par les Acheteurs
--   • Publications Vendeur    → visibles par les Acheteurs
--   • Grossiste peut affecter ses produits directement au profil d'un Vendeur
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. author_role sur lv_reseller_products ──────────────────────────────────
--    Trace QUI a publié chaque entrée dans le catalogue "vitrine"
ALTER TABLE lv_reseller_products
  ADD COLUMN IF NOT EXISTS author_role TEXT NOT NULL DEFAULT 'revendeur'
  CONSTRAINT lv_rp_author_role_check
    CHECK (author_role IN ('grossiste', 'revendeur', 'vendeur'));

-- Backfill : toutes les lignes existantes viennent de revendeurs
UPDATE lv_reseller_products
  SET author_role = 'revendeur'
  WHERE author_role IS NULL;

COMMENT ON COLUMN lv_reseller_products.author_role IS
  'Rôle de l''auteur de la publication : grossiste | revendeur | vendeur.
   Contrôle la visibilité : grossiste → revendeurs seulement, revendeur|vendeur → acheteurs.';

-- ── 2. author_role sur lv_products (catalogue brut Grossiste) ────────────────
ALTER TABLE lv_products
  ADD COLUMN IF NOT EXISTS author_role TEXT NOT NULL DEFAULT 'grossiste'
  CONSTRAINT lv_products_author_role_check
    CHECK (author_role = 'grossiste');

COMMENT ON COLUMN lv_products.author_role IS
  'Toujours grossiste. Sert de balise sémantique pour les queries RBAC.';

-- ── 3. Fonction helper : get_lv_role(telegram_chat_id) ───────────────────────
--    Renvoie le rôle Livrauto d'un utilisateur à partir de son chat_id Telegram
CREATE OR REPLACE FUNCTION get_lv_role(p_chat_id BIGINT)
RETURNS TEXT
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM lv_wholesalers      WHERE telegram_chat_id = p_chat_id) THEN RETURN 'grossiste'; END IF;
  IF EXISTS (SELECT 1 FROM lv_resellers        WHERE telegram_chat_id = p_chat_id) THEN RETURN 'revendeur'; END IF;
  IF EXISTS (SELECT 1 FROM lv_vendors          WHERE telegram_chat_id = p_chat_id) THEN RETURN 'vendeur';   END IF;
  IF EXISTS (SELECT 1 FROM lv_delivery_persons WHERE telegram_chat_id = p_chat_id) THEN RETURN 'livreur';   END IF;
  RETURN 'acheteur';
END;
$$;

COMMENT ON FUNCTION get_lv_role IS
  'Renvoie le rôle Livrauto (grossiste|revendeur|vendeur|livreur|acheteur)
   pour un telegram_chat_id donné. Ordre de priorité : grossiste > revendeur > vendeur > livreur > acheteur.';

-- ── 4. Table lv_vendor_products : association Grossiste → Vendeur ─────────────
--    Permission exclusive Grossiste : affecter ses produits au profil d'un Vendeur
CREATE TABLE IF NOT EXISTS lv_vendor_products (
  id             UUID          DEFAULT gen_random_uuid() PRIMARY KEY,
  wholesaler_id  UUID          NOT NULL REFERENCES lv_wholesalers(id)  ON DELETE CASCADE,
  vendor_id      UUID          NOT NULL REFERENCES lv_vendors(id)       ON DELETE CASCADE,
  product_id     UUID          NOT NULL REFERENCES lv_products(id)      ON DELETE CASCADE,
  retail_price   NUMERIC(12,2) NOT NULL CHECK (retail_price > 0),
  is_active      BOOLEAN       NOT NULL DEFAULT TRUE,
  note           TEXT,                    -- message optionnel du Grossiste au Vendeur
  created_at     TIMESTAMPTZ   DEFAULT NOW(),
  updated_at     TIMESTAMPTZ   DEFAULT NOW(),

  -- Un Vendeur ne peut avoir le même produit qu'une seule fois (même source)
  UNIQUE (vendor_id, product_id)
);

CREATE INDEX IF NOT EXISTS lv_vp_vendor_active_idx     ON lv_vendor_products(vendor_id)     WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS lv_vp_wholesaler_idx        ON lv_vendor_products(wholesaler_id);
CREATE INDEX IF NOT EXISTS lv_vp_product_idx           ON lv_vendor_products(product_id);

-- Trigger updated_at
CREATE OR REPLACE FUNCTION lv_vendor_products_updated_at_fn()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS lv_vendor_products_updated_at ON lv_vendor_products;
CREATE TRIGGER lv_vendor_products_updated_at
  BEFORE UPDATE ON lv_vendor_products
  FOR EACH ROW EXECUTE FUNCTION lv_vendor_products_updated_at_fn();

-- RLS : lecture publique des affectations actives ; écriture réservée au service_role (bot)
ALTER TABLE lv_vendor_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lv_vp_select_active"  ON lv_vendor_products;
CREATE POLICY "lv_vp_select_active"
  ON lv_vendor_products FOR SELECT
  USING (is_active = TRUE);

DROP POLICY IF EXISTS "lv_vp_service_all" ON lv_vendor_products;
CREATE POLICY "lv_vp_service_all"
  ON lv_vendor_products FOR ALL TO service_role
  USING (true) WITH CHECK (true);

COMMENT ON TABLE lv_vendor_products IS
  'Produits affectés par un Grossiste directement au profil d''un Vendeur.
   Permission exclusive Grossiste. Le Vendeur voit ces produits dans son dashboard.';

-- ── 5. RLS sur lv_reseller_products ──────────────────────────────────────────
--    Accès direct anon/authenticated : seules les publications Revendeur/Vendeur
--    sont visibles. Les publications Grossiste sont masquées côté client.
--    Le bot (service_role) contourne cette RLS et applique son propre filtrage.

ALTER TABLE lv_reseller_products ENABLE ROW LEVEL SECURITY;

-- Politique lecture client : masquer les publications Grossiste pour les Acheteurs
DROP POLICY IF EXISTS "lv_rp_acheteur_visibility" ON lv_reseller_products;
CREATE POLICY "lv_rp_acheteur_visibility"
  ON lv_reseller_products FOR SELECT
  USING (
    author_role IN ('revendeur', 'vendeur')
    AND is_active = TRUE
  );

-- Service role : accès total (bot gère le filtrage lui-même)
DROP POLICY IF EXISTS "lv_rp_service_all" ON lv_reseller_products;
CREATE POLICY "lv_rp_service_all"
  ON lv_reseller_products FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ── 6. RLS sur lv_products (catalogue brut Grossiste) ────────────────────────
--    Ce catalogue ne doit JAMAIS être lisible par des clients anon/authenticated.
--    Seul le bot (service_role) y accède pour construire la vue Revendeur.

ALTER TABLE lv_products ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lv_products_no_anon" ON lv_products;
CREATE POLICY "lv_products_no_anon"
  ON lv_products FOR SELECT
  USING (FALSE);   -- accès anon/authenticated : interdit

DROP POLICY IF EXISTS "lv_products_service_all" ON lv_products;
CREATE POLICY "lv_products_service_all"
  ON lv_products FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- ── 7. Index de performance pour les queries filtrées par rôle ───────────────
CREATE INDEX IF NOT EXISTS lv_rp_author_role_active_idx
  ON lv_reseller_products(author_role, is_active)
  WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS lv_rp_reseller_role_idx
  ON lv_reseller_products(reseller_id, author_role);

CREATE INDEX IF NOT EXISTS lv_products_wholesaler_active_idx
  ON lv_products(wholesaler_id, is_active)
  WHERE is_active = TRUE;

-- ── 8. Vue lv_feed_acheteur : feed consolidé pour les Acheteurs ──────────────
--    Sources : lv_reseller_products (author_role IN revendeur|vendeur)
--              + lv_vendor_products affectés aux Vendeurs (via Grossiste)
CREATE OR REPLACE VIEW lv_feed_acheteur AS
-- Publications directes Revendeur / Vendeur
SELECT
  rp.id                         AS feed_id,
  'reseller_product'            AS feed_type,
  rp.author_role,
  rp.retail_price               AS price,
  rp.is_active,
  rp.created_at,
  p.name                        AS product_name,
  p.description                 AS product_description,
  p.image_url                   AS product_image,
  p.stock                       AS product_stock,
  r.shop_name                   AS seller_name,
  r.full_name                   AS seller_full_name,
  NULL::UUID                    AS wholesaler_id,
  rp.reseller_id                AS reseller_id,
  NULL::UUID                    AS vendor_id
FROM lv_reseller_products rp
JOIN lv_products  p ON p.id  = rp.product_id
JOIN lv_resellers r ON r.id  = rp.reseller_id
WHERE rp.author_role IN ('revendeur', 'vendeur')
  AND rp.is_active = TRUE
  AND p.stock > 0

UNION ALL

-- Produits affectés par un Grossiste à un Vendeur (visibles par les Acheteurs)
SELECT
  vp.id                         AS feed_id,
  'vendor_product'              AS feed_type,
  'vendeur'                     AS author_role,   -- présenté comme offre Vendeur côté acheteur
  vp.retail_price               AS price,
  vp.is_active,
  vp.created_at,
  p.name                        AS product_name,
  p.description                 AS product_description,
  p.image_url                   AS product_image,
  p.stock                       AS product_stock,
  v.full_name                   AS seller_name,
  v.full_name                   AS seller_full_name,
  vp.wholesaler_id,
  NULL::UUID                    AS reseller_id,
  vp.vendor_id
FROM lv_vendor_products vp
JOIN lv_products p ON p.id = vp.product_id
JOIN lv_vendors  v ON v.id = vp.vendor_id
WHERE vp.is_active = TRUE
  AND p.stock > 0;

-- Vue pour le Revendeur : voit TOUT le catalogue Grossiste (pas seulement son propre)
CREATE OR REPLACE VIEW lv_feed_revendeur AS
SELECT
  p.id                          AS product_id,
  p.name,
  p.description,
  p.image_url,
  p.base_price,
  p.stock,
  p.is_active,
  p.author_role,
  w.id                          AS wholesaler_id,
  w.shop_name                   AS wholesaler_name,
  w.full_name                   AS wholesaler_full_name
FROM lv_products p
JOIN lv_wholesalers w ON w.id = p.wholesaler_id
WHERE p.is_active = TRUE
  AND p.stock > 0;

GRANT SELECT ON lv_feed_acheteur  TO service_role;
GRANT SELECT ON lv_feed_revendeur TO service_role;

COMMENT ON VIEW lv_feed_acheteur IS
  'Feed consolidé visible par les Acheteurs : publications Revendeur + Vendeur + produits Vendeur affectés par Grossiste. Exclut tout contenu Grossiste direct.';
COMMENT ON VIEW lv_feed_revendeur IS
  'Catalogue complet des produits Grossiste, visible uniquement par les Revendeurs (via bot service_role).';
