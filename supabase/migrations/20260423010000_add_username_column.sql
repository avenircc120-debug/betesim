-- Migration: ajout colonne username (alignée sur display_name) + trigger de sync
-- Date: 2026-04-23
ALTER TABLE profiles ADD COLUMN IF NOT EXISTS username TEXT;
UPDATE profiles SET username = display_name WHERE username IS NULL AND display_name IS NOT NULL;

CREATE OR REPLACE FUNCTION sync_username_from_display_name()
RETURNS TRIGGER AS $$
BEGIN
  IF (NEW.username IS NULL OR NEW.username = '') AND NEW.display_name IS NOT NULL AND NEW.display_name != '' THEN
    NEW.username := NEW.display_name;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_username ON profiles;
CREATE TRIGGER trg_sync_username
  BEFORE INSERT OR UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION sync_username_from_display_name();
