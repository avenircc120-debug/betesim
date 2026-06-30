-- Migration: lv_product_comments — commentaires sur les publications produit
-- Date: 2026-06-29

CREATE TABLE IF NOT EXISTS lv_product_comments (
  id                  UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  reseller_product_id UUID        NOT NULL REFERENCES lv_reseller_products(id) ON DELETE CASCADE,
  buyer_chat_id       BIGINT,
  buyer_name          TEXT        NOT NULL DEFAULT 'Anonyme',
  content             TEXT        NOT NULL CHECK (length(content) > 0 AND length(content) <= 500),
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS lv_product_comments_product_idx
  ON lv_product_comments(reseller_product_id, created_at);

ALTER TABLE lv_product_comments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read comments"
  ON lv_product_comments FOR SELECT USING (true);

CREATE POLICY "Public insert comments"
  ON lv_product_comments FOR INSERT WITH CHECK (
    content IS NOT NULL AND length(trim(content)) > 0
  );
