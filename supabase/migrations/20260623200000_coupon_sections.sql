-- ══════════════════════════════════════════════════════════════════════════════
-- Migration: Section de publication pour revendeurs
-- Date: 2026-06-23
--
-- Ajoute une colonne section_number aux coupons pour permettre aux revendeurs
-- d'organiser leurs publications en sections numérotées (1, 2, 3).
-- Un seul coupon actif par section par revendeur.
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE coupons ADD COLUMN IF NOT EXISTS section_number INT DEFAULT NULL;

-- Index pour retrouver rapidement les coupons d'une section
CREATE INDEX IF NOT EXISTS coupons_section_idx
  ON coupons (creator_id, section_number)
  WHERE section_number IS NOT NULL AND status = 'active';

-- Commentaire
COMMENT ON COLUMN coupons.section_number IS 'Slot de publication du revendeur (1, 2 ou 3). NULL = sans section.';
