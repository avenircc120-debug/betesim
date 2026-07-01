-- ══════════════════════════════════════════════════════════════════════════════
-- Migration: Multi-Grossiste — Split Payment & Revendeur Catalog v2
-- Date: 2026-07-01
-- Description:
--   1. Ajoute grossiste_id + retail_description à lv_reseller_products
--   2. Ajoute wholesaler_amount à lv_orders pour le split payment explicite
--   3. Index sur grossiste_id pour les requêtes RBAC
--   4. Vue matérialisée helper : revendeur_catalog (lv_reseller_products enrichi)
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. lv_reseller_products : ajouter grossiste_id + retail_description ───────
ALTER TABLE lv_reseller_products
  ADD COLUMN IF NOT EXISTS grossiste_id UUID REFERENCES lv_wholesalers(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS retail_description TEXT;

-- Remplir grossiste_id pour les entrées existantes via lv_products
UPDATE lv_reseller_products rp
SET grossiste_id = p.wholesaler_id
FROM lv_products p
WHERE rp.product_id = p.id
  AND rp.grossiste_id IS NULL;

-- Index pour les requêtes par grossiste_id
CREATE INDEX IF NOT EXISTS lv_reseller_products_grossiste_idx
  ON lv_reseller_products(grossiste_id)
  WHERE grossiste_id IS NOT NULL;

-- ── 2. lv_orders : ajouter wholesaler_amount pour split payment explicite ──────
ALTER TABLE lv_orders
  ADD COLUMN IF NOT EXISTS wholesaler_amount NUMERIC(12,2) DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reseller_amount   NUMERIC(12,2) DEFAULT 0;

COMMENT ON COLUMN lv_orders.wholesaler_amount IS
  'Montant dû au grossiste = sum(base_price * qty). Calculé côté serveur.';
COMMENT ON COLUMN lv_orders.reseller_amount IS
  'Gain net du revendeur = total - platform_fee - wholesaler_amount. Calculé côté serveur.';

-- ── 3. Vue revendeur_catalog : enrichissement RBAC ───────────────────────────
-- Remplace lv_feed_revendeur avec grossiste_id explicite
CREATE OR REPLACE VIEW revendeur_catalog AS
SELECT
  rp.id,
  rp.reseller_id,
  rp.product_id,
  rp.grossiste_id,
  rp.retail_price,
  rp.retail_description,
  rp.is_active,
  rp.author_role,
  rp.created_at,
  p.name          AS product_name,
  p.description   AS product_description,
  p.base_price,
  p.stock,
  p.photo_url,
  p.wholesaler_id,
  w.shop_name     AS grossiste_shop_name,
  w.full_name     AS grossiste_full_name,
  r.full_name     AS revendeur_full_name,
  r.personal_link AS revendeur_link
FROM lv_reseller_products rp
LEFT JOIN lv_products     p ON p.id = rp.product_id
LEFT JOIN lv_wholesalers  w ON w.id = rp.grossiste_id
LEFT JOIN lv_resellers    r ON r.id = rp.reseller_id;

COMMENT ON VIEW revendeur_catalog IS
  'Vue enrichie du catalogue revendeur. Inclut grossiste_id, prix de revente,
   description personnalisée et informations du produit maître.
   Filtrage RBAC : is_active=true + author_role pour sécuriser l''accès.';

-- ── 4. Fonction RPC : update_reseller_product_web ────────────────────────────
-- Appelée par la page web /revendeur/produit pour mettre à jour prix/description
-- Server-authoritative : toute modification passe par cette fonction
CREATE OR REPLACE FUNCTION update_reseller_product_web(
  p_reseller_chat_id BIGINT,
  p_product_id       UUID,
  p_retail_price     NUMERIC DEFAULT NULL,
  p_retail_desc      TEXT    DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_reseller lv_resellers%ROWTYPE;
  v_product  lv_products%ROWTYPE;
  v_rp       lv_reseller_products%ROWTYPE;
BEGIN
  -- Vérifier que le revendeur existe
  SELECT * INTO v_reseller
  FROM lv_resellers
  WHERE telegram_chat_id = p_reseller_chat_id AND is_active = TRUE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Revendeur introuvable');
  END IF;

  -- Vérifier que le produit existe et est actif
  SELECT * INTO v_product
  FROM lv_products
  WHERE id = p_product_id AND is_active = TRUE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Produit introuvable');
  END IF;

  -- Valider que le prix de revente est supérieur au prix de base
  IF p_retail_price IS NOT NULL AND p_retail_price <= v_product.base_price THEN
    RETURN jsonb_build_object(
      'ok', false,
      'error', format('Prix doit être > %s FCFA (prix grossiste)', v_product.base_price)
    );
  END IF;

  -- Upsert dans lv_reseller_products
  INSERT INTO lv_reseller_products (
    reseller_id, product_id, grossiste_id,
    retail_price, retail_description, is_active, author_role
  )
  VALUES (
    v_reseller.id, p_product_id, v_product.wholesaler_id,
    COALESCE(p_retail_price, v_product.base_price * 1.2),
    p_retail_desc,
    TRUE, 'revendeur'
  )
  ON CONFLICT (reseller_id, product_id)
  DO UPDATE SET
    retail_price       = COALESCE(EXCLUDED.retail_price, lv_reseller_products.retail_price),
    retail_description = COALESCE(EXCLUDED.retail_description, lv_reseller_products.retail_description),
    grossiste_id       = EXCLUDED.grossiste_id,
    is_active          = TRUE,
    updated_at         = NOW();

  SELECT * INTO v_rp
  FROM lv_reseller_products
  WHERE reseller_id = v_reseller.id AND product_id = p_product_id;

  RETURN jsonb_build_object(
    'ok', true,
    'reseller_product_id', v_rp.id,
    'retail_price', v_rp.retail_price,
    'retail_description', v_rp.retail_description,
    'product_name', v_product.name,
    'revendeur_name', v_reseller.full_name
  );
END;
$$;

COMMENT ON FUNCTION update_reseller_product_web IS
  'API server-authoritative pour la page web /revendeur/produit.
   Valide le revendeur, valide le produit, impose prix > base_price.
   Retourne JSON avec les données mises à jour pour notification bot.';

-- ── 5. RLS : la fonction update_reseller_product_web est SECURITY DEFINER ─────
-- Seul le service_role peut la déclencher directement.
-- Le bot (service_role) l'appelle via RPC après notification webhook.
REVOKE ALL ON FUNCTION update_reseller_product_web FROM PUBLIC;
GRANT EXECUTE ON FUNCTION update_reseller_product_web TO service_role;
